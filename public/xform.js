/* Blender-style transforms of furniture: modal G / R / S with axis lock, numeric input, snapping and precision; TransformControls gizmo;
   the item panel (position, rotation, scale, size); box / multi selection helpers; floor drop. Exposes window.Xform.create(api).
   Axes: the UI uses Blender's (X right, Y forward, Z up). three.js has y up, so UI X = x, UI Y = -z, UI Z = y. Stored item fields stay in three's frame:
   x,y,z (m), rx,ry,rz (rad, Euler order YXZ so ry is the old yaw `r`), sx,sy,sz (sy is the height). */
(() => {
"use strict";
const T = THREE, DEG = Math.PI / 180;
const AX = { x: new T.Vector3(1, 0, 0), y: new T.Vector3(0, 0, -1), z: new T.Vector3(0, 1, 0) };   // UI axes in three's coordinates
const COL = { x: 0xe5483a, y: 0x6ab04c, z: 0x3b7dd8 };
const IDX = { x: 0, y: 2, z: 1 };                                                                  // UI axis -> index of x,y,z in three's frame
const NAME = { G: "Перемещение", R: "Вращение", S: "Масштаб" };
const clampS = v => { const a = Math.min(100, Math.max(0.01, Math.abs(v))); return v < 0 ? -a : a; };
const rnd = (v, k = 1e6) => Math.round(v * k) / k;
const fmt = (v, d = 1) => String(Math.round(v * 10 ** d) / 10 ** d);

const KEYS = [
  ["Обзор, предмет выбран", ""],
  ["G · R · S", "переместить · вращать · масштабировать (как в Blender)"],
  ["X · Y · Z", "во время операции: ось; повтор — локальная ось, ещё раз — снять"],
  ["Shift+X/Y/Z", "исключить ось (плоскость)"],
  ["число, Enter", "точное значение: G Z 500 — на 500 мм вверх, R Z 45, S 1.2; «−» и Backspace работают"],
  ["Ctrl · Shift", "привязка (10 мм, 15°, 0,1) · точный режим (в 10 раз медленнее)"],
  ["ЛКМ / Enter · ПКМ / Esc", "применить · отменить"],
  ["Alt+G · Alt+R · Alt+S", "сбросить высоту на пол · поворот · масштаб"],
  ["Shift+D", "дублировать и сразу перемещать копию"],
  ["End", "положить на ближайшую поверхность под предметом"],
  ["PageUp · PageDown", "поднять · опустить на 50 мм (Shift — 10 мм), в обоих режимах"],
  ["Shift+клик · B", "добавить в выделение · рамка выделения"],
  ["Ctrl+A · Alt+A", "выделить все · снять выделение"],
  ["X · Delete", "удалить выделенное"],
  ["Ctrl+Z", "отменить (одна операция — один шаг)"],
  ["Прогулка", ""],
  ["G · R", "взять в руки · повернуть на 90°"],
  ["Tab", "фокус на выбранном предмете (Обзор), повторно — назад в прогулку"],
];

function create(api) {
  const { scene, camera, renderer, orbit, items, selIds } = api, dom = renderer.domElement;
  const el = api.el;
  let op = null, gz = null, box = null, ret = null, snapOn = false, lockProp = true, suppressCtx = 0;
  const ptr = { x: innerWidth / 2, y: innerHeight / 2 }, ndc = new T.Vector2(), mods = { shift: false, ctrl: false };
  const ray = new T.Raycaster();
  let gizMode = "translate", gizSpace = "world";
  try { const g = localStorage.getItem(Env.ls("villa.gizmo")); if (["off", "translate", "rotate", "scale"].includes(g)) gizMode = g; const sp = localStorage.getItem(Env.ls("villa.gizspace")); if (sp === "local") gizSpace = "local"; } catch {}

  /* ---------------- helpers ---------------- */
  function setNdc(x, y) { const r = dom.getBoundingClientRect(); ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1); return ndc; }
  function aimRay() { setNdc(ptr.x, ptr.y); ray.setFromCamera(ndc, camera); return ray.ray; }
  function snapshot(ids) {
    const list = [];
    for (const id of ids) { const it = items.get(id); if (!it) continue; const o = it.obj; list.push({ id, it, doc0: it.doc, p0: o.position.clone(), q0: o.quaternion.clone(), s0: o.scale.clone() }); }
    const pivot = new T.Vector3(); list.forEach(e => pivot.add(e.p0)); if (list.length) pivot.multiplyScalar(1 / list.length);
    return { list, pivot };
  }
  /* d: {t: world translation, q: world rotation about the pivot, fl: scale factors in the item's own axes, fw: factors for the offsets of a group} */
  function apply(sess, d) {
    const tmp = new T.Vector3();
    for (const e of sess.list) {
      const o = e.it.obj;
      tmp.copy(e.p0).sub(sess.pivot);
      if (d.fw) tmp.multiply(d.fw);
      if (d.q) tmp.applyQuaternion(d.q);
      o.position.copy(sess.pivot).add(tmp); if (d.t) o.position.add(d.t);
      if (d.q) o.quaternion.copy(d.q).multiply(e.q0); else o.quaternion.copy(e.q0);
      if (d.fl) o.scale.set(clampS(e.s0.x * d.fl.x), clampS(e.s0.y * d.fl.y), clampS(e.s0.z * d.fl.z)); else o.scale.copy(e.s0);
    }
  }
  function restore(sess) { for (const e of sess.list) { const o = e.it.obj; o.position.copy(e.p0); o.quaternion.copy(e.q0); o.scale.copy(e.s0); } }
  function docNow(e) {
    const o = e.it.obj, r = o.rotation;
    return Object.assign({}, e.it.doc, { x: rnd(o.position.x), y: rnd(o.position.y), z: rnd(o.position.z), rx: rnd(r.x, 1e5), ry: rnd(r.y, 1e5), rz: rnd(r.z, 1e5), sx: rnd(o.scale.x, 1e5), sy: rnd(o.scale.y, 1e5), sz: rnd(o.scale.z, 1e5) });
  }
  const changed = sess => sess.list.some(e => { const o = e.it.obj; return o.position.distanceToSquared(e.p0) > 1e-10 || Math.abs(o.quaternion.dot(e.q0)) < 1 - 1e-10 || o.scale.distanceToSquared(e.s0) > 1e-10; });
  /* the one place a finished gesture is saved: every item's new document, one undo step, one batch to the server */
  function commitSession(sess, noUndo) {
    if (!changed(sess)) return false;
    const list = sess.list.map(e => [e.id, Object.assign(docNow(e), { at: Date.now(), by: api.me() })]);
    if (!noUndo) api.pushUndo({ t: "multi", ops: sess.list.map(e => ({ id: e.id, prev: e.doc0 })) });
    for (const [id, doc] of list) api.syncItem(id, doc);
    api.sendOk(api.commitMany(list));
    return true;
  }
  /* documents computed elsewhere (panel, reset, floor drop, mirror): same undo / sync / send path */
  function commitDocs(list, key) {
    list = list.filter(([id]) => items.has(id)); if (!list.length) return;
    api.pushUndo({ t: "multi", ops: list.map(([id]) => ({ id, prev: items.get(id).doc })) }, key);
    const out = list.map(([id, doc]) => [id, Object.assign({}, doc, { at: Date.now(), by: api.me() })]);
    for (const [id, doc] of out) api.syncItem(id, doc);
    api.sendOk(api.commitMany(out));
  }
  const ids = () => [...selIds].filter(i => items.has(i));
  const worldBox = list => { const b = new T.Box3(); for (const id of list) { const it = items.get(id); if (it) b.expandByObject(it.obj); } return b; };

  /* ---------------- axis lines ---------------- */
  const lines = new T.Group(); scene.add(lines);
  function axisDir(k, local) { const v = AX[k].clone(); if (local && op && op.sess.list.length === 1) v.applyQuaternion(op.sess.list[0].q0); return v; }
  function drawAxes() {
    for (const c of [...lines.children]) { lines.remove(c); c.geometry.dispose(); c.material.dispose(); }
    if (!op) return;
    const a = op.axis, keys = !a ? (op.kind === "R" ? ["z"] : []) : a.excl && op.kind !== "R" ? ["x", "y", "z"].filter(k => k !== a.a) : [a.a];
    for (const k of keys) {
      const d = axisDir(k, a && a.local), p = op.sess.pivot;
      const g = new T.BufferGeometry().setFromPoints([p.clone().addScaledVector(d, -80), p.clone().addScaledVector(d, 80)]);
      const l = new T.Line(g, new T.LineBasicMaterial({ color: COL[k], depthTest: false, transparent: true, opacity: 0.9 })); l.renderOrder = 999; lines.add(l);
    }
  }

  /* ---------------- operation bar ---------------- */
  const bar = el("div", { id: "opBar", class: "panel", hidden: "", role: "status" }), barStat = el("b", { class: "mono" }), barHelp = el("span", { class: "meta" });
  bar.append(barStat, barHelp); document.body.append(bar);
  const tag = el("div", { id: "opTag", class: "mono", hidden: "" }); document.body.append(tag);
  const HELP = "X/Y/Z — ось · Shift+X/Y/Z — без оси · Ctrl — привязка · Shift — точно · Enter — применить · Esc — отмена";
  function showBar(on) { bar.hidden = !on; $hint().hidden = on; tag.hidden = !on; }
  const $hint = () => document.getElementById("hint");

  /* ---------------- modal operations ---------------- */
  const parseNum = s => { if (!s || s === "-" || s === "." || s === "-.") return null; const v = parseFloat(s.replace(",", ".")); return Number.isFinite(v) ? v : null; };
  const snapping = () => snapOn || mods.ctrl;
  function pivotScreen() {
    const v = op.sess.pivot.clone().project(camera), r = dom.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }
  function begin(kind, opts = {}) {
    if (op || gz || box || !api.canWrite() || api.mode() !== "orbit") return false;
    const list = opts.ids || ids(); if (!list.length) return false;
    const sess = snapshot(list); if (!sess.list.length) return false;
    op = { kind, sess, axis: null, num: "", acc: { vec: new T.Vector3(), s: 0, ang: 0, fac: 1 }, lastHit: null, lastHitKind: "", lastT: null, lastAng: null, lastDist: null, source: opts.source || "key", dup: !!opts.dup, pid: opts.pid };
    orbit.enabled = false; showBar(true); drawAxes(); pointerStep(true); refresh(); updateGizmo();
    return true;
  }
  /* accumulate pointer movement since the last step (so Shift can slow it down without a jump) */
  function pointerStep(first) {
    if (!op) return;
    const o = op, a = o.axis, k = mods.shift ? 0.1 : 1, pv = aimRay();
    if (o.kind === "G") {
      if (!a) {
        const h = api.floorHit(ndc.x, ndc.y);
        if (h) { if (o.lastHit && o.lastHitKind === "floor") o.acc.vec.addScaledVector(h.clone().sub(o.lastHit), k); o.lastHit = h; o.lastHitKind = "floor"; }
        else { const p = new T.Vector3(); if (pv.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -(o.sess.pivot.y + o.acc.vec.y)), p)) { if (o.lastHit && o.lastHitKind === "plane") o.acc.vec.addScaledVector(p.clone().sub(o.lastHit), k); o.lastHit = p; o.lastHitKind = "plane"; } }
      } else if (!a.excl) {
        const d = axisDir(a.a, a.local), w0 = o.sess.pivot.clone().sub(pv.origin), b = d.dot(pv.direction), den = 1 - b * b;
        if (den > 1e-4) { const t = (b * pv.direction.dot(w0) - d.dot(w0)) / den; if (o.lastT !== null) o.acc.s += (t - o.lastT) * k; o.lastT = t; }
      } else {
        const n = axisDir(a.a, a.local), p = new T.Vector3();
        if (pv.intersectPlane(new T.Plane().setFromNormalAndCoplanarPoint(n, o.sess.pivot), p)) { if (o.lastHit) o.acc.vec.addScaledVector(p.clone().sub(o.lastHit), k); o.lastHit = p; o.lastHitKind = "ax"; }
      }
    } else {
      const c = pivotScreen();
      if (o.kind === "R") {
        const ang = Math.atan2(-(ptr.y - c.y), ptr.x - c.x);
        if (o.lastAng !== null) { let d = ang - o.lastAng; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; o.acc.ang += d * k * rotSign(); }
        o.lastAng = ang;
      } else {
        const dist = Math.max(Math.hypot(ptr.x - c.x, ptr.y - c.y), 40);
        if (o.lastDist !== null) o.acc.fac *= Math.pow(dist / o.lastDist, k);
        o.lastDist = dist;
      }
    }
  }
  function rotAxis() { const a = op.axis ? op.axis.a : "z"; return axisDir(a, op.axis && op.axis.local); }
  function rotSign() { return rotAxis().dot(camera.position.clone().sub(op.sess.pivot)) >= 0 ? 1 : -1; }
  const toUI = v => [v.x, -v.z, v.y];
  function refresh() {
    if (!op) return;
    const o = op, a = o.axis, sess = o.sess, n = parseNum(o.num), d = {};
    let val = "";
    const lbl = NAME[o.kind] + (a ? (o.kind !== "R" && a.excl ? " ⊥" : " ") + a.a.toUpperCase() + (a.local ? " (локальная)" : "") : (o.kind === "R" ? " Z" : ""));
    if (o.kind === "G") {
      let t = new T.Vector3();
      if (n !== null) { const v = n / 1000; if (!a) t.copy(AX.x).multiplyScalar(v); else if (!a.excl) t.copy(axisDir(a.a, a.local)).multiplyScalar(v); else for (const k of ["x", "y", "z"]) if (k !== a.a) t.addScaledVector(axisDir(k, a.local), v); }
      else if (!a) t.copy(o.acc.vec);
      else if (!a.excl) t.copy(axisDir(a.a, a.local)).multiplyScalar(o.acc.s);
      else { const nn = axisDir(a.a, a.local); t.copy(o.acc.vec).addScaledVector(nn, -o.acc.vec.dot(nn)); }
      if (n === null && snapping()) {
        if (a && !a.excl) t.copy(axisDir(a.a, a.local)).multiplyScalar(Math.round(o.acc.s / 0.01) * 0.01);
        else { const u = toUI(t).map(v => Math.round(v / 0.01) * 0.01); t.set(u[0], u[2], -u[1]); }
      }
      d.t = t; const u = toUI(t).map(v => Math.round(v * 1000));
      val = n !== null ? o.num + " мм" : a && !a.excl ? fmt((a.local ? t.dot(axisDir(a.a, true)) : toUI(t)[["x", "y", "z"].indexOf(a.a)]) * 1000, 0) + " мм" : "ΔX " + u[0] + "  ΔY " + u[1] + "  ΔZ " + u[2] + " мм";
    } else if (o.kind === "R") {
      let ang = n !== null ? n * DEG : o.acc.ang;
      if (n === null && snapping()) ang = Math.round(ang / (15 * DEG)) * 15 * DEG;
      d.q = new T.Quaternion().setFromAxisAngle(rotAxis(), ang);
      val = n !== null ? o.num + "°" : fmt(ang / DEG) + "°";
    } else {
      let f = n !== null ? n : o.acc.fac;
      if (n === null && snapping()) f = Math.max(0.1, Math.round(f / 0.1) * 0.1);
      if (f === 0) f = 0.01;
      const fl = new T.Vector3(1, 1, 1);
      if (!a) fl.set(f, f, f); else if (!a.excl) fl.setComponent(IDX[a.a], f); else for (const k of ["x", "y", "z"]) if (k !== a.a) fl.setComponent(IDX[k], f);
      d.fl = fl; d.fw = fl;
      val = n !== null ? o.num : fmt(f, 3);
    }
    apply(sess, d);
    barStat.textContent = lbl + ": " + val; barHelp.textContent = HELP + (o.kind === "G" && n !== null && !a ? " · число без оси идёт по X" : "");
    tag.textContent = val; tag.style.left = (ptr.x + 16) + "px"; tag.style.top = (ptr.y + 16) + "px";
    api.sendPresence(); api.refreshHl();
  }
  function finish(commit) {
    const o = op; if (!o) return; op = null;
    showBar(false); drawAxes();
    if (!commit) restore(o.sess); else commitSession(o.sess, o.dup);
    orbit.enabled = api.mode() === "orbit";
    api.sendPresence(true); api.updateHint(); api.refreshHl(); api.renderCtx(true);
  }
  function setAxis(k, excl) {
    const o = op, a = o.axis;
    if (a && a.a === k && !!a.excl === !!excl) o.axis = a.local ? null : { a: k, excl, local: true };
    else o.axis = { a: k, excl, local: false };
    if (o.sess.list.length > 1 && o.axis) o.axis.local = false;     // a group has no single local frame
    o.acc = { vec: new T.Vector3(), s: 0, ang: 0, fac: 1 }; o.lastHit = null; o.lastT = null; o.lastAng = null; o.lastDist = null; o.num = "";
    drawAxes(); pointerStep(); refresh();
  }
  function opKey(e) {
    const c = e.code;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat && !/^(Backspace)$/.test(c)) return;
    if (c === "Escape") { finish(false); return; }
    if (c === "Enter" || c === "NumpadEnter") { finish(true); return; }
    if (c === "KeyX" || c === "KeyY" || c === "KeyZ") { setAxis(c.slice(3).toLowerCase(), e.shiftKey); return; }
    if (/^(Digit|Numpad)\d$/.test(c)) { if (op.num.length < 9) op.num += c.slice(-1); refresh(); return; }
    if (c === "Period" || c === "NumpadDecimal" || c === "Comma") { if (!op.num.includes(".")) op.num += op.num && op.num !== "-" ? "." : (op.num === "-" ? "0." : "0."); refresh(); return; }
    if (c === "Minus" || c === "NumpadSubtract") { op.num = op.num.startsWith("-") ? op.num.slice(1) : "-" + op.num; refresh(); return; }
    if (c === "Backspace") { op.num = op.num.slice(0, -1); refresh(); return; }
    if (c === "ShiftLeft" || c === "ShiftRight" || c === "ControlLeft" || c === "ControlRight") { mods.shift = e.shiftKey; mods.ctrl = e.ctrlKey; refresh(); }
  }

  /* ---------------- floor / put down ---------------- */
  /* lowest contact of the selection with whatever is under it: the house (floors, stairs) and, if `all`, the other furniture */
  function dropDistance(list, all) {
    const targets = []; if (api.house()) targets.push(api.house());
    if (all) for (const [id, it] of items) if (!list.includes(id)) targets.push(it.obj);
    let best = Infinity;
    for (const id of list) {
      const it = items.get(id); if (!it) continue;
      const b = new T.Box3().setFromObject(it.obj), pts = [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]];
      for (const [fx, fz] of pts) {
        const x = b.min.x + (b.max.x - b.min.x) * fx, z = b.min.z + (b.max.z - b.min.z) * fz;
        const r = new T.Raycaster(new T.Vector3(x, b.min.y + 0.05, z), new T.Vector3(0, -1, 0), 0, 60);
        const hit = r.intersectObjects(targets, true).find(h => api.isVisible(h.object) && !api.isPass(h.object) && h.face && h.face.normal.y > 0.3);
        if (hit) best = Math.min(best, b.min.y - hit.point.y);
      }
    }
    if (best === Infinity) { const mn = Math.min(...list.map(id => new T.Box3().setFromObject(items.get(id).obj).min.y)); best = mn; }
    return best;
  }
  function putOnFloor(all = true) {
    const list = ids(); if (!list.length) return;
    const dy = dropDistance(list, all);
    if (Math.abs(dy) < 1e-4) { api.toast("Уже стоит на поверхности."); return; }
    commitDocs(list.map(id => { const d = items.get(id).doc; return [id, Object.assign({}, d, { y: rnd(d.y - dy) })]; }), "floor");
    api.toast("Положено на " + (all ? "поверхность" : "пол") + (dy > 0 ? ": ниже на " + Math.round(dy * 1000) + " мм" : ": выше на " + Math.round(-dy * 1000) + " мм"));
  }
  const mapDocs = fn => { const list = ids(); commitDocs(list.map(id => [id, Object.assign({}, items.get(id).doc, fn(items.get(id).doc))])); };
  const resetRot = () => mapDocs(() => ({ rx: 0, ry: 0, rz: 0 }));
  const resetScale = () => mapDocs(() => ({ sx: 1, sy: 1, sz: 1 }));
  const mirror = k => mapDocs(d => k === "x" ? { sx: -d.sx } : { sz: -d.sz });
  function lift(dy, key) { const list = ids(); commitDocs(list.map(id => { const d = items.get(id).doc; return [id, Object.assign({}, d, { y: rnd(d.y + dy) })]; }), key); }

  /* ---------------- duplicate + move ---------------- */
  function duplicateAndMove() {
    const list = ids(); if (!list.length || api.mode() !== "orbit" || !api.canWrite()) return;
    const made = []; const docs = [];
    for (const id of list) { const nid = api.rid(); made.push(nid); docs.push([nid, Object.assign({}, items.get(id).doc, { at: Date.now(), by: api.me() })]); }
    for (const [nid, doc] of docs) api.syncItem(nid, doc);
    api.sendOk(api.commitMany(docs));
    api.pushUndo({ t: "multi", ops: made.map(id => ({ id, prev: null })) });
    api.selectItems(made);
    begin("G", { ids: made, dup: true });
  }

  /* ---------------- selection helpers ---------------- */
  function selectAll() { const all = [...items.keys()]; if (!all.length) { api.toast("В сцене нет предметов."); return; } api.selectItems(all); api.toast("Выбрано предметов: " + all.length); }
  function deleteSelection() {
    const list = ids(); if (!list.length) return false;
    api.pushUndo({ t: "multi", ops: list.map(id => ({ id, prev: items.get(id).doc })) });
    api.removeMany(list); api.toast("Удалено" + (list.length > 1 ? ": " + list.length : "") + ". Ctrl+Z — вернуть."); return true;
  }
  function duplicateSelection() {
    const list = ids(); if (!list.length) return;
    const made = [], docs = [];
    for (const id of list) { const d = items.get(id).doc, nid = api.rid(); made.push(nid); docs.push([nid, Object.assign({}, d, { x: rnd(d.x + 0.4), z: rnd(d.z + 0.4), at: Date.now(), by: api.me() })]); }
    for (const [nid, doc] of docs) api.syncItem(nid, doc);
    api.sendOk(api.commitMany(docs)); api.pushUndo({ t: "multi", ops: made.map(id => ({ id, prev: null })) }); api.selectItems(made);
  }
  /* box selection (B) */
  const boxEl = el("div", { id: "boxSel", hidden: "" }); document.body.append(boxEl);
  function startBox() {
    if (api.mode() !== "orbit" || !api.canWrite() || op) return;
    box = { drag: false }; orbit.enabled = false; api.toast("Рамка: протяните мышью по сцене. Shift — добавить к выделению. Esc — отмена.");
  }
  function endBox() { box = null; boxEl.hidden = true; orbit.enabled = api.mode() === "orbit"; }
  function boxPick(x0, y0, x1, y1, add) {
    const r = dom.getBoundingClientRect(), L = Math.min(x0, x1), Rr = Math.max(x0, x1), Tp = Math.min(y0, y1), B = Math.max(y0, y1), hit = [];
    for (const [id, it] of items) {
      const b = new T.Box3().setFromObject(it.obj); if (b.isEmpty()) continue;
      let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity, any = false;
      for (let i = 0; i < 8; i++) {
        const v = new T.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(camera);
        if (v.z > 1) continue; any = true;
        const sx = r.left + (v.x + 1) / 2 * r.width, sy = r.top + (1 - v.y) / 2 * r.height;
        mnx = Math.min(mnx, sx); mxx = Math.max(mxx, sx); mny = Math.min(mny, sy); mxy = Math.max(mxy, sy);
      }
      if (any && mxx >= L && mnx <= Rr && mxy >= Tp && mny <= B) hit.push(id);
    }
    const all = add ? [...new Set([...ids(), ...hit])] : hit;
    api.selectItems(all);
    if (!hit.length && !add) api.toast("В рамку ничего не попало.");
  }

  /* ---------------- gizmo ---------------- */
  const tc = new T.TransformControls(camera, dom), piv = new T.Object3D();
  scene.add(piv); scene.add(tc); tc.attach(piv); tc.setSize(0.85); tc.visible = false; tc.enabled = false;
  { /* Blender's colours: Z (up) is blue, Y (forward = three's z) is green; three.js has them the other way round */
    const seen = new Set();
    tc.traverse(o => { const m = o.material; if (!m || seen.has(m) || !m.color) return; seen.add(m); const h = m.color.getHex(); if (h === 0x00ff00) m.color.setHex(0x0000ff); else if (h === 0x0000ff) m.color.setHex(0x00ff00); });
  }
  const applySnap = () => { const on = snapping(); tc.setTranslationSnap(on ? 0.01 : null); tc.setRotationSnap(on ? 15 * DEG : null); tc.setScaleSnap(on ? 0.1 : null); };
  tc.addEventListener("dragging-changed", e => {
    if (e.value) {
      const list = ids(), sess = snapshot(list); if (!sess.list.length) return;
      gz = { sess, pos0: piv.position.clone(), q0: piv.quaternion.clone() }; orbit.enabled = false;
    } else if (gz) {
      const g = gz; gz = null; commitSession(g.sess); orbit.enabled = api.mode() === "orbit"; api.sendPresence(true); api.refreshHl(); api.renderCtx(true);
    }
  });
  tc.addEventListener("objectChange", () => {
    if (!gz) return; const d = {};
    if (tc.mode === "translate") d.t = piv.position.clone().sub(gz.pos0);
    else if (tc.mode === "rotate") d.q = piv.quaternion.clone().multiply(gz.q0.clone().invert());
    else { d.fl = piv.scale.clone(); d.fw = d.fl; }
    apply(gz.sess, d); api.sendPresence(); api.refreshHl();
  });
  function updateGizmo() {
    const list = ids(), on = gizMode !== "off" && list.length && api.canWrite() && api.mode() === "orbit" && !op && !box && !api.placing() && !api.tool();
    if (!on) { if (!gz) { tc.visible = false; tc.enabled = false; } return; }
    tc.visible = true; tc.enabled = true; applySnap();
    const mode = gizMode;
    if (tc.mode !== mode) tc.setMode(mode);
    const space = mode !== "scale" && gizSpace === "local" ? "local" : "world";
    if (tc.space !== space) tc.setSpace(space);
    if (gz) return;
    piv.position.set(0, 0, 0); for (const id of list) piv.position.add(items.get(id).obj.position); piv.position.multiplyScalar(1 / list.length);   // no clones: this runs every frame
    if ((space === "local" || mode === "scale") && list.length === 1) piv.quaternion.copy(items.get(list[0]).obj.quaternion); else piv.quaternion.identity();
    piv.scale.set(1, 1, 1); piv.updateMatrixWorld(true);
  }
  function gizmoPointer(e) {
    if (!tc.visible || !tc.enabled || op) return false;
    const r = dom.getBoundingClientRect();
    tc.pointerHover({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -(e.clientY - r.top) / r.height * 2 + 1, button: e.button });
    if (tc.axis === null) return false;
    orbit.enabled = false; return true;
  }
  const setGizmo = (m, sp) => {
    if (m) { gizMode = m; try { localStorage.setItem(Env.ls("villa.gizmo"), m); } catch {} }
    if (sp) { gizSpace = sp; try { localStorage.setItem(Env.ls("villa.gizspace"), sp); } catch {} }
    updateGizmo(); api.renderCtx();
  };

  /* ---------------- focus (Tab) ---------------- */
  function focusSelection() {
    const list = ids(); if (!list.length) { api.toast("Выберите предмет, на который навести камеру."); return; }
    const b = worldBox(list), c = b.getCenter(new T.Vector3()), sz = b.getSize(new T.Vector3());
    const dir = camera.position.clone().sub(c); dir.y = Math.max(dir.y, 0.35 * dir.length()); if (dir.lengthSq() < 1e-6) dir.set(1, 1, 1); dir.normalize();
    const dist = Math.max(2.6, sz.length() * 1.8);
    camera.position.copy(c).addScaledVector(dir, dist); orbit.target.copy(c); orbit.update();
  }
  function tab() {
    if (!api.canWrite()) return;
    if (api.mode() === "walk") { if (!ids().length) { api.toast("Выберите предмет (клик), затем Tab."); return; } ret = api.walkState(); api.switching(true); api.setMode("orbit"); api.switching(false); focusSelection(); }
    else if (ret) { const r = ret; ret = null; api.switching(true); api.setMode("walk"); api.switching(false); api.restoreWalk(r); }
    else focusSelection();
  }

  /* ---------------- cheat sheet ---------------- */
  let help = null;
  function toggleHelp(force) {
    if (help && force !== true) { help.remove(); help = null; return; }
    if (help) return;
    const rows = KEYS.map(([k, d]) => d ? el("div", { class: "kh-row" }, el("kbd", { text: k }), el("span", { text: d })) : el("div", { class: "kh-h", text: k }));
    help = el("div", { class: "pv-back", id: "keysHelp" }, el("div", { class: "panel pv-dlg kh", role: "dialog", "aria-modal": "true", "aria-label": "Клавиши" },
      el("div", { class: "pv-head" }, el("h2", { text: "Клавиши" }), el("button", { class: "ghost", text: "✕", "aria-label": "Закрыть", on: { click: () => toggleHelp() } })), ...rows));
    help.addEventListener("pointerdown", e => { if (e.target === help) toggleHelp(); });
    document.body.append(help);
  }

  /* ---------------- global events ---------------- */
  const typing = e => e.target && e.target.closest && e.target.closest("input,select,textarea");
  function onKey(e) {
    mods.shift = e.shiftKey; mods.ctrl = e.ctrlKey;
    if (typing(e)) return;
    if (help) { if (e.key === "Escape" || e.key === "?") { e.preventDefault(); e.stopImmediatePropagation(); toggleHelp(); } return; }
    if (op) { opKey(e); return; }
    if (box) { if (e.code === "Escape" || e.code === "KeyB") { e.preventDefault(); e.stopImmediatePropagation(); endBox(); } return; }
    if (e.key === "?") { e.preventDefault(); toggleHelp(); return; }
    if (e.code === "ControlLeft" || e.code === "ControlRight") { applySnap(); return; }
    if (!api.canWrite() || api.pv()) return;
    const c = e.code, orbitMode = api.mode() === "orbit", has = ids().length > 0, hold = fn => { e.preventDefault(); e.stopImmediatePropagation(); fn(); };
    if (c === "Tab" && !e.ctrlKey && !e.altKey) return hold(tab);
    if (c === "PageUp" || c === "PageDown") {
      const dy = (c === "PageUp" ? 1 : -1) * (e.shiftKey ? 0.01 : 0.05), pl = api.placing();
      if (pl && pl.obj) return hold(() => { pl.lift = (pl.lift || 0) + dy; api.movePlacing(); });
      if (has) return hold(() => lift(dy, "lift"));
      return;
    }
    if (c === "KeyA" && e.ctrlKey && !e.altKey) return hold(selectAll);
    if (c === "KeyA" && e.altKey && !e.ctrlKey) return hold(() => api.select(null));
    if (e.ctrlKey || e.metaKey) return;
    if (!orbitMode || api.tool() || api.placing()) return;
    if (e.altKey) {
      if (!has) return;
      if (c === "KeyG") return hold(() => putOnFloor(false));
      if (c === "KeyR") return hold(resetRot);
      if (c === "KeyS") return hold(resetScale);
      return;
    }
    if (e.repeat) { if (["KeyG", "KeyR", "KeyS", "KeyB", "KeyD", "End", "KeyX", "Delete"].includes(c) && (has || c === "KeyB")) { e.preventDefault(); e.stopImmediatePropagation(); } return; }
    if (c === "KeyB") return hold(startBox);
    if (!has) return;
    if (c === "KeyG" && !e.shiftKey) return hold(() => begin("G"));
    if (c === "KeyR" && !e.shiftKey) return hold(() => begin("R"));
    if (c === "KeyS" && !e.shiftKey) return hold(() => begin("S"));
    if (c === "KeyD" && e.shiftKey) return hold(duplicateAndMove);
    if (c === "End") return hold(() => putOnFloor(true));
    if (c === "KeyX" || c === "Delete") return hold(deleteSelection);
  }
  addEventListener("keydown", onKey, true);
  addEventListener("keyup", e => { mods.shift = e.shiftKey; mods.ctrl = e.ctrlKey; if (e.code === "ControlLeft" || e.code === "ControlRight") applySnap(); if (op && /^(Shift|Control)/.test(e.code)) refresh(); }, true);
  addEventListener("blur", () => { mods.shift = mods.ctrl = false; });
  addEventListener("pointermove", e => {
    ptr.x = e.clientX; ptr.y = e.clientY; mods.shift = e.shiftKey; mods.ctrl = e.ctrlKey;
    if (op) { if (op.source === "drag" && e.pointerId !== op.pid) return; pointerStep(); refresh(); }
    else if (box && box.drag) { const L = Math.min(box.x0, e.clientX), Tp = Math.min(box.y0, e.clientY); Object.assign(boxEl.style, { left: L + "px", top: Tp + "px", width: Math.abs(e.clientX - box.x0) + "px", height: Math.abs(e.clientY - box.y0) + "px" }); boxEl.hidden = false; }
  }, true);
  addEventListener("pointerdown", e => {
    if (help) return;
    if (op) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (op.source === "drag") return;
      if (e.button === 2) { suppressCtx = performance.now() + 600; finish(false); } else if (e.button === 0) finish(true);
      return;
    }
    if (box && e.target === dom) { e.preventDefault(); e.stopImmediatePropagation(); if (e.button !== 0) { endBox(); return; } box.drag = true; box.x0 = e.clientX; box.y0 = e.clientY; box.add = e.shiftKey; box.pid = e.pointerId; }
  }, true);
  addEventListener("pointerup", e => {
    if (op && op.source === "drag" && e.pointerId === op.pid) { e.stopImmediatePropagation(); finish(true); return; }
    if (box && box.drag && e.pointerId === box.pid) {
      const b = box; endBox();
      if (Math.abs(e.clientX - b.x0) < 4 && Math.abs(e.clientY - b.y0) < 4) { if (!b.add) api.select(null); } else boxPick(b.x0, b.y0, e.clientX, e.clientY, b.add);
    }
  }, true);
  addEventListener("pointercancel", e => { if (op && op.source === "drag") finish(false); }, true);
  addEventListener("contextmenu", e => { if (op || performance.now() < suppressCtx) e.preventDefault(); }, true);

  /* ---------------- item panel ---------------- */
  function localSize(o) {
    const p = o.position.clone(), q = o.quaternion.clone(), s = o.scale.clone();
    o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.set(1, 1, 1); o.updateMatrixWorld(true);
    const v = new T.Vector3(); new T.Box3().setFromObject(o).getSize(v);
    o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); o.updateMatrixWorld(true); return v;
  }
  function gizmoControls() {
    const seg = el("div", { class: "seg", role: "group", "aria-label": "Гизмо" });
    for (const [m, l] of [["off", "Нет"], ["translate", "Перемещение"], ["rotate", "Вращение"], ["scale", "Масштаб"]])
      seg.append(el("button", { text: l, "aria-pressed": String(gizMode === m), title: m === "off" ? "Скрыть гизмо" : l, on: { click: () => setGizmo(m) } }));
    const sp = el("div", { class: "seg", role: "group", "aria-label": "Система координат" });
    for (const [m, l] of [["world", "Глобально"], ["local", "Локально"]]) sp.append(el("button", { text: l, "aria-pressed": String(gizSpace === m), on: { click: () => setGizmo(null, m) } }));
    const sn = el("label", { class: "xf-chk" }, el("input", { type: "checkbox", on: { change: e => { snapOn = e.target.checked; applySnap(); } } }), el("span", { text: "Привязка (10 мм · 15° · 0,1)" })); sn.firstChild.checked = snapOn;
    return el("div", { class: "xf-giz" }, el("span", { class: "label", text: "Гизмо" }), seg, sp, sn);
  }
  /* one numeric field; getV() -> value shown, setV(value) saves it; wheel over it changes it (Ctrl — a bigger step) */
  function field(label, step, big, getV, setV, digits = 1) {
    const i = el("input", { type: "number", step: String(step), "aria-label": label, title: label + ": колесо мыши меняет значение, с Ctrl — крупнее" });
    const show = () => { if (document.activeElement !== i) i.value = String(fmt(getV(), digits)); };
    i.addEventListener("change", () => { const v = parseFloat(i.value); if (Number.isFinite(v)) setV(v); else show(); });
    i.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") i.blur(); });
    i.addEventListener("wheel", e => { e.preventDefault(); e.stopPropagation(); const cur = parseFloat(i.value); const v = (Number.isFinite(cur) ? cur : getV()) + (e.deltaY < 0 ? 1 : -1) * (e.ctrlKey ? big : step); i.value = String(fmt(v, digits)); setV(v, "wheel"); }, { passive: false });
    show(); return { el: i, show };
  }
  function panel(id) {
    const it0 = () => items.get(id), fs = [], cur = () => it0().doc;
    const edit = (patch, how) => { const it = it0(); if (!it) return; commitDocs([[id, Object.assign({}, it.doc, patch)]], how === "wheel" ? id + ":xfw" : null); };
    const row = (title, mk) => { const r = el("div", { class: "xf-row" }, el("span", { class: "label", text: title })); const g = el("div", { class: "xf-in" }); mk(g); r.append(g); return r; };
    const add = (g, f) => { fs.push(f); g.append(el("label", { class: "xf-f" }, el("span", { text: f.name }), f.el)); };
    const axes = ["X", "Y", "Z"];
    const posUI = [d => d.x * 1000, d => -d.z * 1000, d => d.y * 1000];
    const posSet = [(d, v) => ({ x: v / 1000 }), (d, v) => ({ z: -v / 1000 }), (d, v) => ({ y: v / 1000 })];
    const rotUI = [d => d.rx / DEG, d => -d.rz / DEG, d => d.ry / DEG];
    const rotSet = [(d, v) => ({ rx: v * DEG }), (d, v) => ({ rz: -v * DEG }), (d, v) => ({ ry: v * DEG })];
    const sKey = ["sx", "sz", "sy"];
    const lockBtn = el("button", { class: "xf-lock", "aria-pressed": String(lockProp), title: "Сохранять пропорции", "aria-label": "Сохранять пропорции", text: "🔒", on: { click: () => { lockProp = !lockProp; lockBtn.setAttribute("aria-pressed", String(lockProp)); lockBtn.textContent = lockProp ? "🔒" : "🔓"; } } });
    lockBtn.textContent = lockProp ? "🔒" : "🔓";
    const scaleTo = (k, v) => { const d = cur(), old = Math.abs(d[k]) || 1, nv = clampS(v) * (d[k] < 0 ? -1 : 1) * (v < 0 ? -1 : 1); if (!lockProp) return { [k]: nv }; const f = Math.abs(nv) / old; return { sx: clampS(d.sx * f), sy: clampS(d.sy * f), sz: clampS(d.sz * f) }; };
    const box = el("div", { class: "xf" });
    box.append(
      row("Позиция, мм (Z — высота)", g => axes.forEach((a, n) => { const f = field("Позиция " + a + ", мм", 10, 100, () => posUI[n](cur()), (v, how) => edit(posSet[n](cur(), v), how)); f.name = a; add(g, f); })),
      row("Поворот, °", g => axes.forEach((a, n) => { const f = field("Поворот " + a + ", °", 5, 15, () => rotUI[n](cur()), (v, how) => edit(rotSet[n](cur(), v), how)); f.name = a; add(g, f); })),
      row("Масштаб", g => { axes.forEach((a, n) => { const f = field("Масштаб " + a, 0.05, 0.25, () => cur()[sKey[n]], (v, how) => edit(scaleTo(sKey[n], v), how), 3); f.name = a; add(g, f); }); g.append(lockBtn); }),
      row("Габариты Ш × Г × В, мм", g => { ["Ш", "Г", "В"].forEach((a, n) => { const k = sKey[n], ax = [0, 2, 1][n];
        const f = field("Габарит " + a + ", мм", 10, 100, () => localSize(it0().obj).getComponent(ax) * Math.abs(cur()[k]) * 1000, (v, how) => { const L = localSize(it0().obj).getComponent(ax); if (L > 1e-6 && v > 0) edit(scaleTo(k, v / 1000 / L), how); else f.show(); }, 0); f.name = a; add(g, f); }); }));
    const btns = el("div", { class: "row xf-btns" },
      el("button", { text: "Положить на пол", title: "End", on: { click: () => putOnFloor(true) } }),
      el("button", { text: "Сбросить поворот", title: "Alt+R", on: { click: resetRot } }),
      el("button", { text: "Сбросить масштаб", title: "Alt+S", on: { click: resetScale } }),
      el("button", { text: "Отразить X", on: { click: () => mirror("x") } }),
      el("button", { text: "Отразить Y", on: { click: () => mirror("z") } }));
    box.append(btns);
    return { el: box, update() { if (!items.has(id)) return; fs.forEach(f => f.show()); } };
  }
  function groupPanel() {
    const n = ids().length, box = el("div", { class: "xf" });
    box.append(el("div", { class: "meta", text: "Операции G / R / S, гизмо и удаление работают для всей группы вокруг общего центра. Shift+клик — добавить или убрать предмет." }),
      el("div", { class: "row xf-btns" }, el("button", { text: "Положить на пол", title: "End", on: { click: () => putOnFloor(true) } }),
        el("button", { text: "Сбросить поворот", on: { click: resetRot } }), el("button", { text: "Сбросить масштаб", on: { click: resetScale } })));
    return { el: box, count: n };
  }

  /* ---------------- per frame / outside hooks ---------------- */
  const api2 = {
    frame() { updateGizmo(); },
    busy: () => !!(op || gz),
    touching: id => !!((op && op.sess.list.some(e => e.id === id)) || (gz && gz.sess.list.some(e => e.id === id))),
    live() { const s = op ? op.sess : gz ? gz.sess : null; if (!s) return null; const r3 = v => rnd(v, 1000); return s.list.slice(0, 60).map(e => { const o = e.it.obj; return { id: e.id, p: [r3(o.position.x), r3(o.position.y), r3(o.position.z)], r: [rnd(o.rotation.x, 1000), rnd(o.rotation.y, 1000), rnd(o.rotation.z, 1000)], s: [rnd(o.scale.x, 1000), rnd(o.scale.y, 1000), rnd(o.scale.z, 1000)] }; }); },
    begin, beginDrag(e) { if (op) return false; ptr.x = e.clientX; ptr.y = e.clientY; return begin("G", { source: "drag", pid: e.pointerId }); },
    gizmoPointer, panel, groupPanel, gizmoControls, putOnFloor, duplicateSelection, deleteSelection,
    hasOp: () => !!op || !!box,
    modeChanged() { if (!api.switchingNow()) ret = null; if (op) finish(false); if (box) endBox(); updateGizmo(); },
    cancel() { if (op) finish(false); if (box) endBox(); },
    toggleHelp,
    /* read-only, for the Playwright test: the gizmo's state and the handles' scale (a negative one points the other way) */
    debug: () => ({ visible: tc.visible, enabled: tc.enabled, axis: tc.axis, mode: tc.mode, space: tc.space, dragging: tc.dragging, pickers: tc._gizmo.picker.translate.children.map(c => [c.name, c.scale.x]) }),
  };
  return api2;
}
window.Xform = { create };
})();
