"use strict";
/* E2E: Blender-style transforms (G / R / S, axes, numbers, snapping, gizmo, panel, groups, live presence, legacy items) and model folders.
   Starts its own server on a temp data dir with a random key (never printed).
   Run: node tests/xform.e2e.js   (needs playwright-core + a chromium in ~/.cache/ms-playwright) */
const path = require("path"), fs = require("fs"), os = require("os"), crypto = require("crypto"), assert = require("assert");
const { spawn } = require("child_process");
const { chromium } = require("playwright-core");
const WebSocket = require("ws");

const ROOT = path.join(__dirname, "..");
const PORT = 3300 + Math.floor(Math.random() * 90), BASE = "http://127.0.0.1:" + PORT;
const KEY = crypto.randomBytes(24).toString("hex");
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "villa-xform-"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const step = m => console.log("• " + m);
const near = (a, b, e = 1e-4) => Math.abs(a - b) <= e;

function boxGlb(sx, sy, sz, rgb) {
  const P = [], N = [], I = [];
  const faces = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
                 [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]];
  faces.forEach(([n, u, v], f) => {
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      P.push((n[0] + u[0] * a + v[0] * b) * sx / 2, (n[1] + u[1] * a + v[1] * b) * sy / 2 + sy / 2, (n[2] + u[2] * a + v[2] * b) * sz / 2); N.push(...n);
    }
    I.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
  });
  const pos = Buffer.from(new Float32Array(P).buffer), nor = Buffer.from(new Float32Array(N).buffer), idx = Buffer.from(new Uint16Array(I).buffer);
  const bin = Buffer.concat([pos, nor, idx]);
  const json = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [...rgb, 1], metallicFactor: 0, roughnessFactor: 0.8 } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.length }, { buffer: 0, byteOffset: pos.length, byteLength: nor.length }, { buffer: 0, byteOffset: pos.length + nor.length, byteLength: idx.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 24, type: "VEC3", min: [-sx / 2, 0, -sz / 2], max: [sx / 2, sy, sz / 2] },
                { bufferView: 1, componentType: 5126, count: 24, type: "VEC3" }, { bufferView: 2, componentType: 5123, count: 36, type: "SCALAR" }] };
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const head = Buffer.alloc(12); head.write("glTF"); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.write(type, 4, "latin1"); return b; };
  return Buffer.concat([head, ch(js.length, "JSON"), js, ch(bin.length, "BIN\0"), bin]);
}
const glbFile = (name, ...a) => { const f = path.join(DATA, name); fs.writeFileSync(f, boxGlb(...a)); return f; };
const state = async () => (await fetch(BASE + "/api/state")).json();
const H = { "x-edit-key": KEY, "content-type": "application/json" };
const api = (method, url, body, key = KEY) => fetch(BASE + url, { method, headers: { ...(key ? { "x-edit-key": key } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
async function upload(file, name, folder) {
  const fd = new FormData(); fd.append("name", name); if (folder) fd.append("folder", folder); fd.append("file", new Blob([fs.readFileSync(file)]), path.basename(file));
  const r = await fetch(BASE + "/api/models", { method: "POST", body: fd, headers: { "x-edit-key": KEY } }); return (await r.json()).id;
}
function wsEditor() {
  return new Promise((res, rej) => {
    const ws = new WebSocket("ws://127.0.0.1:" + PORT + "/ws"); ws.msgs = [];
    ws.on("open", () => ws.send(JSON.stringify({ t: "hello", name: "bot", uid: "botbotbot1", key: KEY })));
    ws.on("message", d => { const m = JSON.parse(d); ws.msgs.push(m); if (m.t === "welcome") res(ws); });
    ws.on("error", rej);
  });
}

(async () => {
  const srv = spawn("node", ["server/index.js"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, EDIT_KEY: KEY, HOST: "127.0.0.1" }, stdio: "ignore" });
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const pages = [];
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {} await sleep(200); }

    /* a row written by the previous version of the app (r, s only), straight into the database */
    const Database = require("better-sqlite3");
    const legacy = { type: "builtin", key: "sofa", x: 3, y: 0, z: 2, r: 0.5, s: 2, by: "old", at: 1 };
    { const db = new Database(path.join(DATA, "villa.db")); db.prepare("INSERT INTO docs(coll,id,data) VALUES('items','legacy01x',?)").run(JSON.stringify(legacy)); db.close(); }

    const mk = async (name, key) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage(); pages.push(page);
      page.logs = [];
      page.on("console", m => { if (m.type() === "error") page.logs.push(m.text()); }); page.on("pageerror", e => page.logs.push("PAGEERROR " + e.message));
      page.on("dialog", d => { page.logs.push("PAGEERROR native dialog: " + d.message()); d.dismiss(); });
      await page.addInitScript(p => localStorage.setItem("villa.profile", p), JSON.stringify({ uid: name + "uidxxxxxx", name, color: "#2f6f62" }));
      await page.goto(BASE + "/" + (key ? "?k=" + key : ""));
      await page.waitForFunction(() => window.__villa && window.__villa().shownV && !document.getElementById("loading"), null, { timeout: 60000 });
      return page;
    };
    const editor = await mk("editor", KEY), viewer = await mk("viewer", null);
    const item = (p, id) => p.evaluate(i => window.__villaItem(i), id);
    const waitItems = (p, n) => p.waitForFunction(k => window.__villa().items >= k, n, { timeout: 20000 });
    const put = (id, doc) => editor.evaluate(([i, d]) => Sync.commitItem(i, Object.assign({ type: "builtin", key: "sofa", by: "editor", at: Date.now() }, d)), [id, doc]);
    const select = (p, ids) => p.evaluate(i => window.__villaSelectItems(i), ids);
    const key = (p, k) => p.keyboard.press(k);
    const centre = async () => { await editor.mouse.move(640, 400); };
    const op = async (keys, apply = "Enter") => { for (const k of keys) await key(editor, k); if (apply) await key(editor, apply); };
    const bar = () => editor.locator("#opBar").textContent();
    const serverItem = async id => (await state()).items[id];

    /* ---- legacy items: read as the new fields, the stored row is untouched ---- */
    let st = await state(), L = st.items.legacy01x;
    assert(L.ry === 0.5 && L.rx === 0 && L.rz === 0 && L.sx === 2 && L.sy === 2 && L.sz === 2, "legacy item migrated on read: " + JSON.stringify(L));
    await waitItems(editor, 1); await waitItems(viewer, 1);
    let li = await item(viewer, "legacy01x");
    assert(near(li.r[1], 0.5) && near(li.s[0], 2) && near(li.s[1], 2) && near(li.p[0], 3), "old item renders with its r and s: " + JSON.stringify(li));
    { const db = new Database(path.join(DATA, "villa.db"), { readonly: true }); const raw = JSON.parse(db.prepare("SELECT data FROM docs WHERE id='legacy01x'").get().data); db.close();
      assert(raw.ry === undefined && raw.sx === undefined, "database row not rewritten by reading"); }
    step("old items (r, s) open as before: migrated on read, database row not rewritten");

    /* ---- server validation ---- */
    const bot = await wsEditor();
    const bad = async (id, doc) => { const n = bot.msgs.length; bot.send(JSON.stringify({ t: "item.set", id, doc: { type: "builtin", key: "sofa", x: 1, y: 0, z: 1, ...doc } })); await sleep(250); return bot.msgs.slice(n).some(m => m.t === "error") && !(await state()).items[id]; };
    assert(await bad("badaaaaa01", { x: 201 }), "x beyond 200 m refused");
    assert(await bad("badaaaaa02", { sx: 100.5 }), "scale 100.5 refused");
    assert(await bad("badaaaaa03", { sy: 0.005 }), "scale 0.005 refused");
    assert(await bad("badaaaaa04", { rx: "1" }), "text rotation refused");
    assert(await bad("badaaaaa05", { sz: "2" }), "text scale refused");
    bot.send(JSON.stringify({ t: "item.set", id: "goodaaaa01", doc: { type: "builtin", key: "sofa", x: 200, y: -3, z: -200, sx: 100, sy: 0.01, sz: -1, rx: 1, ry: 2, rz: 3 } })); await sleep(250);
    const g = (await state()).items.goodaaaa01; assert(g && g.x === 200 && g.sx === 100 && g.sy === 0.01 && g.sz === -1 && g.rz === 3, "limits themselves accepted");
    bot.send(JSON.stringify({ t: "item.delete", id: "goodaaaa01" })); await sleep(150);
    step("server: finite numbers, position within 200 m, scale 0.01..100 (a negative sign mirrors)");

    /* ---- items for the transform tests ---- */
    await put("itema00001", { x: 4, y: 0, z: 0 }); await put("itemb00001", { x: 6, y: 0, z: 1 });
    await waitItems(editor, 3); await waitItems(viewer, 3);
    await select(editor, ["itema00001"]); await centre();
    assert.strictEqual(await editor.locator("#ctx").isVisible(), true);

    /* G Z 500 Enter -> exactly 0.5 m up */
    await key(editor, "g"); await key(editor, "z"); await editor.keyboard.type("500");
    assert.match(await bar(), /Перемещение Z: 500 мм/);
    assert.strictEqual((await editor.locator("#opTag").textContent()).trim(), "500 мм");
    assert(await editor.locator("#opBar").textContent().then(t => /Enter — применить/.test(t) && /Esc — отмена/.test(t)), "hint line shows the keys");
    /* a second browser sees the movement before it is applied, and the database does not */
    await viewer.waitForFunction(() => { const i = window.__villaItem("itema00001"); return i && Math.abs(i.p[1] - 0.5) < 1e-3; }, null, { timeout: 5000 });
    assert.strictEqual((await serverItem("itema00001")).y, 0, "nothing stored while the operation runs");
    assert.strictEqual((await item(viewer, "itema00001")).doc.y, 0, "viewer's document unchanged during the operation");
    await key(editor, "Enter");
    await editor.waitForFunction(() => window.__villaItem("itema00001").doc.y === 0.5);
    await viewer.waitForFunction(() => window.__villaItem("itema00001").doc.y === 0.5, null, { timeout: 5000 });
    assert.strictEqual((await serverItem("itema00001")).y, 0.5);
    let ia = await item(viewer, "itema00001"); assert(near(ia.p[1], 0.5, 1e-9) && ia.p[0] === 4, "final position seen in the second tab");
    assert(await editor.locator("#opBar").isHidden(), "operation bar gone");
    step("G Z 500 Enter: exactly 0.5 m up; second tab saw the move live and the saved result");

    /* Esc and right click cancel; the second tab goes back too */
    await key(editor, "g"); await key(editor, "x"); await editor.keyboard.type("300");
    await viewer.waitForFunction(() => Math.abs(window.__villaItem("itema00001").p[0] - 4.3) < 1e-3, null, { timeout: 5000 });
    await key(editor, "Escape");
    ia = await item(editor, "itema00001"); assert(ia.p[0] === 4 && ia.doc.x === 4, "Esc restores");
    await viewer.waitForFunction(() => Math.abs(window.__villaItem("itema00001").p[0] - 4) < 1e-6, null, { timeout: 5000 });
    await key(editor, "g"); await key(editor, "y"); await editor.keyboard.type("250"); await editor.mouse.click(640, 400, { button: "right" });
    ia = await item(editor, "itema00001"); assert(ia.p[2] === 0 && (await serverItem("itema00001")).z === 0, "right click cancels");
    step("Esc and right click cancel; the other tab returns to the saved position");

    /* axis semantics: UI Y is forward = -z; minus and Backspace; number without axis goes along X */
    await op(["g", "y", "2", "0", "0"]); ia = await item(editor, "itema00001"); assert(near(ia.doc.z, -0.2), "G Y 200 -> z = -0.2: " + ia.doc.z);
    await key(editor, "g"); await key(editor, "x"); await key(editor, "Minus"); await editor.keyboard.type("15"); assert.match(await bar(), /X: -15 мм/, "minus then digits: " + await bar());
    await key(editor, "Backspace"); assert.match(await bar(), /X: -1 мм/, "Backspace: " + await bar()); await key(editor, "Enter");
    ia = await item(editor, "itema00001"); assert(near(ia.doc.x, 3.999, 1e-9), "minus + Backspace -> -1 mm: " + ia.doc.x);
    await op(["g", "x", "x"]); // x, x -> local axis: status says so
    await key(editor, "g"); await key(editor, "x"); await key(editor, "x"); assert.match(await bar(), /X \(локальная\)/); await key(editor, "x"); assert.doesNotMatch(await bar(), /локальная/); await key(editor, "Escape");
    step("axes: X/Y/Z (Y is forward), repeat = local, third = free; minus and Backspace in the number");

    /* R X 90 -> rotation about X; ry and rz untouched */
    await select(editor, ["itema00001"]);
    await op(["r", "x", "9", "0"]); ia = await item(editor, "itema00001");
    assert(near(ia.doc.rx, Math.PI / 2) && near(ia.doc.ry, 0) && near(ia.doc.rz, 0), "R X 90: " + JSON.stringify([ia.doc.rx, ia.doc.ry, ia.doc.rz]));
    assert(near(ia.r[0], Math.PI / 2), "object rotated");
    await editor.keyboard.press("Alt+r"); ia = await item(editor, "itema00001"); assert(ia.doc.rx === 0 && ia.doc.ry === 0, "Alt+R resets rotation");
    await op(["r", "z", "4", "5"]); ia = await item(editor, "itema00001"); assert(near(ia.doc.ry, Math.PI / 4), "R Z 45 -> yaw 45 deg (= old r)");
    assert(near((await serverItem("itema00001")).r, Math.PI / 4), "old field r follows the yaw for older clients");
    await editor.keyboard.press("Alt+r");
    step("R X 90 rotates about X, R Z 45 is the yaw; Alt+R resets");

    /* S Shift+Z 2 -> X and Y (UI) doubled, height unchanged; S 1.2 uniform */
    await key(editor, "s"); await editor.keyboard.down("Shift"); await key(editor, "z"); await editor.keyboard.up("Shift"); await key(editor, "2"); assert.match(await bar(), /Масштаб ⊥Z: 2/); await key(editor, "Enter");
    ia = await item(editor, "itema00001"); assert(near(ia.doc.sx, 2) && near(ia.doc.sz, 2) && near(ia.doc.sy, 1), "S Shift+Z 2: " + JSON.stringify([ia.doc.sx, ia.doc.sy, ia.doc.sz]));
    await editor.keyboard.press("Alt+s"); ia = await item(editor, "itema00001"); assert(ia.doc.sx === 1 && ia.doc.sy === 1 && ia.doc.sz === 1, "Alt+S resets");
    await op(["s", "1", "Period", "2"]); ia = await item(editor, "itema00001"); assert(near(ia.doc.sx, 1.2) && near(ia.doc.sy, 1.2) && near(ia.doc.sz, 1.2), "S 1.2 uniform");
    await editor.keyboard.press("Alt+s");
    step("S Shift+Z 2 scales X and Y; S 1.2 is uniform; Alt+S resets");

    /* Ctrl snaps to 10 mm / 15 deg / 0.1; Shift slows down tenfold */
    const frac = (v, u) => Math.abs(v / u - Math.round(v / u));
    const x0 = (await item(editor, "itema00001")).doc.x;
    await key(editor, "g"); await key(editor, "x"); await editor.keyboard.down("Control"); await editor.mouse.move(660, 405, { steps: 3 }); await editor.mouse.move(770, 410, { steps: 7 });
    let live = await item(editor, "itema00001"); const dx = live.p[0] - x0;
    assert(Math.abs(dx) > 0.05 && frac(dx, 0.01) < 1e-6, "Ctrl: 10 mm steps: " + dx);
    await editor.keyboard.up("Control"); await key(editor, "Escape");
    const pivotScr = await editor.evaluate(([x, y, z]) => window.__villaScreen(x, y, z), [x0, 0, -0.2]);
    await key(editor, "r"); await editor.keyboard.down("Control"); await editor.mouse.move(pivotScr[0] + 100, pivotScr[1]); await editor.mouse.move(pivotScr[0] + 70, pivotScr[1] - 70, { steps: 6 });
    live = await item(editor, "itema00001"); const ang = live.r[1];
    assert(Math.abs(ang) > 0.1 && frac(ang, Math.PI / 12) < 1e-6, "Ctrl: 15 deg steps: " + ang * 180 / Math.PI);
    await editor.keyboard.up("Control"); await key(editor, "Escape");
    await key(editor, "s"); await editor.keyboard.down("Control"); await editor.mouse.move(pivotScr[0] + 100, pivotScr[1] + 10); await editor.mouse.move(pivotScr[0] + 230, pivotScr[1] + 10, { steps: 6 });
    live = await item(editor, "itema00001"); assert(live.s[0] > 1.2 && frac(live.s[0], 0.1) < 1e-6, "Ctrl: scale steps of 0.1: " + live.s[0]);
    await editor.keyboard.up("Control"); await key(editor, "Escape");
    await editor.mouse.move(640, 400); await key(editor, "g"); await key(editor, "x"); await editor.mouse.move(700, 400, { steps: 6 }); const fast = (await item(editor, "itema00001")).p[0] - x0; await key(editor, "Escape");
    await editor.mouse.move(640, 400); await key(editor, "g"); await key(editor, "x"); await editor.keyboard.down("Shift"); await editor.mouse.move(700, 400, { steps: 6 }); const slow = (await item(editor, "itema00001")).p[0] - x0; await editor.keyboard.up("Shift"); await key(editor, "Escape");
    assert(fast !== 0 && Math.abs(slow / fast - 0.1) < 0.03, "Shift is ten times slower: " + slow + " vs " + fast);
    step("Ctrl snaps 10 mm / 15 deg / 0.1, Shift moves ten times slower");

    /* ---- panel: position, rotation, scale with lock, size ---- */
    await select(editor, ["itema00001"]);
    const field = l => editor.locator('#ctx input[aria-label="' + l + '"]');
    await field("Позиция Z, мм").fill("1200"); await key(editor, "Enter");
    await editor.waitForFunction(() => window.__villaItem("itema00001").doc.y === 1.2);
    await field("Позиция X, мм").fill("5000"); await field("Позиция X, мм").blur();
    await editor.waitForFunction(() => window.__villaItem("itema00001").doc.x === 5);
    await field("Поворот Z, °").fill("90"); await key(editor, "Enter");
    await editor.waitForFunction(() => Math.abs(window.__villaItem("itema00001").doc.ry - Math.PI / 2) < 1e-4);
    const w0 = parseFloat(await field("Габарит Ш, мм").inputValue()); assert(w0 > 2000 && w0 < 2400, "sofa is about 2200 wide: " + w0);
    await field("Габарит Ш, мм").fill("1100"); await key(editor, "Enter");
    await editor.waitForFunction(() => Math.abs(window.__villaItem("itema00001").doc.sx - 0.5) < 0.01);
    ia = await item(editor, "itema00001"); assert(near(ia.doc.sx, ia.doc.sy, 1e-3) && near(ia.doc.sy, ia.doc.sz, 1e-3), "proportions locked: " + JSON.stringify([ia.doc.sx, ia.doc.sy, ia.doc.sz]));
    await editor.click(".xf-lock"); await field("Масштаб X").fill("2"); await key(editor, "Enter");
    await editor.waitForFunction(() => window.__villaItem("itema00001").doc.sx === 2);
    ia = await item(editor, "itema00001"); assert(near(ia.doc.sy, 0.5, 0.02), "unlocked: only X changed");
    await field("Позиция Z, мм").hover(); await editor.mouse.wheel(0, -100);
    await editor.waitForFunction(() => Math.abs(window.__villaItem("itema00001").doc.y - 1.21) < 1e-6);
    await editor.keyboard.down("Control"); await editor.mouse.wheel(0, -100); await editor.keyboard.up("Control");
    await editor.waitForFunction(() => Math.abs(window.__villaItem("itema00001").doc.y - 1.31) < 1e-6);
    await editor.click('#ctx button:has-text("Сбросить масштаб")'); await editor.click('#ctx button:has-text("Сбросить поворот")');
    ia = await item(editor, "itema00001"); assert(ia.doc.sx === 1 && ia.doc.ry === 0, "reset buttons");
    await editor.click('#ctx button:has-text("Отразить X")'); ia = await item(editor, "itema00001"); assert(ia.doc.sx === -1 && (await serverItem("itema00001")).sx === -1, "mirror X = negative scale");
    await editor.click('#ctx button:has-text("Положить на пол")'); await editor.waitForFunction(() => window.__villaItem("itema00001").doc.y < 0.2);
    ia = await item(editor, "itema00001"); assert(Math.abs(ia.doc.y) < 0.2, "End / the button put it on the surface below: y=" + ia.doc.y);
    step("panel: position / rotation / scale (lock) / size fields, wheel and Ctrl+wheel, reset, mirror, put on floor");

    /* undo: each of these was one step */
    await key(editor, "Control+z"); ia = await item(editor, "itema00001"); assert(ia.doc.y > 1, "undo of put-on-floor");
    await key(editor, "Control+z"); ia = await item(editor, "itema00001"); assert(ia.doc.sx === 1, "undo of mirror");

    /* ---- gizmo: drag the X handle ---- */
    await editor.evaluate(() => window.__villaSelectItems(["itemb00001"]));
    await put("itema00001", { x: 4, y: 0, z: 0 });
    await sleep(300);
    const piv = [6, 0, 1];
    /* the gizmo's X handle may point either way (it flips toward the camera); ask where it is */
    const xs = (await editor.evaluate(() => window.__villaGizmo())).pickers.find(p => p[0] === "X")[1], dir = Math.sign(xs);
    const hx = await editor.evaluate(([x, y, z]) => window.__villaScreen(x, y, z), [piv[0] + 0.3 * xs, piv[1], piv[2]]), hx2 = await editor.evaluate(([x, y, z]) => window.__villaScreen(x, y, z), [piv[0] + 1.3 * xs, piv[1], piv[2]]);
    await editor.mouse.move(hx[0], hx[1]); await sleep(100);
    assert.strictEqual((await editor.evaluate(() => window.__villaGizmo())).axis, "X", "hovering the X handle");
    await editor.mouse.down(); await editor.mouse.move(hx2[0], hx2[1], { steps: 10 });
    const mid = await item(editor, "itemb00001"); assert(dir * (mid.p[0] - 6) > 0.3 && near(mid.p[2], 1, 1e-6) && near(mid.p[1], 0, 1e-6), "gizmo moves along X while dragging: " + mid.p);
    assert.strictEqual((await serverItem("itemb00001")).x, 6, "not saved until released");
    await editor.mouse.up();
    await editor.waitForFunction(() => Math.abs(window.__villaItem("itemb00001").doc.x - 6) > 0.3);
    await viewer.waitForFunction(() => Math.abs(window.__villaItem("itemb00001").doc.x - 6) > 0.3, null, { timeout: 5000 });
    assert(Math.abs((await serverItem("itemb00001")).x - 6) > 0.3, "saved on release");
    await key(editor, "Control+z"); await editor.waitForFunction(() => window.__villaItem("itemb00001").doc.x === 6);
    await editor.click('#ctx .xf-giz button:has-text("Вращение")'); await editor.click('#ctx .xf-giz button:has-text("Масштаб")'); await editor.click('#ctx .xf-giz button:has-text("Перемещение")');
    await editor.click('#ctx .xf-giz button:has-text("Локально")'); await editor.click('#ctx .xf-giz button:has-text("Глобально")');
    step("gizmo: dragging the X handle moves the item, saved once on release, one undo step; mode and space buttons work");

    /* ---- group: rotate about the common centre, one undo step ---- */
    await put("itema00001", { x: 4, y: 0, z: 0 }); await put("itemb00001", { x: 6, y: 0, z: 2 }); await sleep(300);
    await select(editor, ["itema00001", "itemb00001"]); await centre();
    assert.match(await editor.locator("#ctx h2").textContent(), /Предметов: 2/);
    await op(["r", "z", "9", "0"]);
    const ga = await item(editor, "itema00001"), gb = await item(editor, "itemb00001"), c = [5, 1];   // centre of (4,0) and (6,2) is (5,1)
    const rot = (x, z) => [c[0] + (z - c[1]), c[1] - (x - c[0])];  // rotation about three's y by +90 deg: x' = z, z' = -x
    const ea = rot(4, 0), eb = rot(6, 2);
    assert(near(ga.doc.x, ea[0], 1e-3) && near(ga.doc.z, ea[1], 1e-3) && near(gb.doc.x, eb[0], 1e-3) && near(gb.doc.z, eb[1], 1e-3), "group turned about its centre: " + [ga.doc.x, ga.doc.z, gb.doc.x, gb.doc.z]);
    assert(near(ga.doc.ry, Math.PI / 2) && near(gb.doc.ry, Math.PI / 2), "each item turned too");
    await key(editor, "Control+z");
    const ua = await item(editor, "itema00001"), ub = await item(editor, "itemb00001");
    assert(ua.doc.x === 4 && ua.doc.z === 0 && ub.doc.x === 6 && ub.doc.z === 2 && ua.doc.ry === 0, "ONE Ctrl+Z undoes the whole group operation");
    assert((await serverItem("itemb00001")).x === 6 && (await serverItem("itema00001")).ry === 0, "undo reached the database");
    await op(["s", "2"]); const sa = await item(editor, "itema00001"), sb = await item(editor, "itemb00001");
    assert(near(sa.doc.x, 3, 1e-3) && near(sb.doc.x, 7, 1e-3) && near(sa.doc.sx, 2), "group scale: offsets and sizes");
    await key(editor, "Control+z");
    step("group of two turns about its common centre and scales; one Ctrl+Z each");

    /* Shift+click adds / removes, Ctrl+A / Alt+A, box selection, Delete of a group (one undo) */
    await put("legacy01x", { x: 14, y: 0, z: 2, r: 0.5, s: 2 }); await sleep(200);
    await editor.keyboard.press("Alt+a"); assert.strictEqual((await item(editor, "itema00001")).sel.length, 0);
    await editor.keyboard.press("Control+a"); assert((await item(editor, "itema00001")).sel.length >= 3, "Ctrl+A selects all");
    await editor.keyboard.press("Alt+a");
    const pa = await editor.evaluate(() => window.__villaScreen(4, 0.4, 0)), pb = await editor.evaluate(() => window.__villaScreen(6, 0.4, 2));
    await editor.mouse.click(pa[0], pa[1]); assert.deepStrictEqual((await item(editor, "itema00001")).sel, ["itema00001"], "click selects one");
    await editor.keyboard.down("Shift"); await editor.mouse.click(pb[0], pb[1]); await editor.keyboard.up("Shift");
    assert.deepStrictEqual((await item(editor, "itema00001")).sel.sort(), ["itema00001", "itemb00001"], "Shift+click adds");
    await editor.keyboard.down("Shift"); await editor.mouse.click(pb[0], pb[1]); await editor.keyboard.up("Shift");
    assert.deepStrictEqual((await item(editor, "itema00001")).sel, ["itema00001"], "Shift+click removes");
    await editor.keyboard.press("Alt+a"); await key(editor, "b");
    await editor.mouse.move(pa[0] - 60, pa[1] - 120); await editor.mouse.down(); await editor.mouse.move(pb[0] + 60, pb[1] + 80, { steps: 8 }); await editor.mouse.up();
    const bs = (await item(editor, "itema00001")).sel; assert(bs.includes("itema00001") && bs.includes("itemb00001"), "B: box selection: " + bs);
    await key(editor, "x"); await editor.waitForFunction(() => !window.__villaItem("itema00001") && !window.__villaItem("itemb00001"));
    assert(!(await state()).items.itema00001, "group deleted on the server");
    await key(editor, "Control+z"); await editor.waitForFunction(() => window.__villaItem("itema00001") && window.__villaItem("itemb00001"));
    assert((await state()).items.itemb00001, "one Ctrl+Z brings the whole group back");
    step("Shift+click, B box, Ctrl+A / Alt+A, group delete with one undo");

    /* Shift+D duplicates and starts moving the copy */
    await select(editor, ["itema00001"]); await centre(); const before = await editor.evaluate(() => window.__villa().items);
    await editor.keyboard.press("Shift+d"); assert.match(await bar(), /Перемещение/);
    await key(editor, "x"); await editor.keyboard.type("1000"); await key(editor, "Enter");
    assert.strictEqual(await editor.evaluate(() => window.__villa().items), before + 1, "a copy appeared");
    const sel2 = (await item(editor, "itema00001")).sel; assert.strictEqual(sel2.length, 1); const cp = await item(editor, sel2[0]);
    assert(near(cp.doc.x, 5) && sel2[0] !== "itema00001", "copy moved 1 m: " + cp.doc.x);
    await key(editor, "Control+z"); await editor.waitForFunction(n => window.__villa().items === n, before);
    step("Shift+D: copy starts moving at once; one Ctrl+Z removes it");

    /* End puts an item onto the nearest surface below it (another item counts) */
    await put("itemc00001", { x: 4, y: 0, z: 0 }); await put("itema00001", { x: 4, y: 3, z: 0 }); await sleep(300); await select(editor, ["itema00001"]); await centre();
    await key(editor, "End"); await editor.waitForFunction(() => window.__villaItem("itema00001").doc.y < 2.9);
    ia = await item(editor, "itema00001"); assert(ia.doc.y > 0.3 && ia.doc.y < 1.2, "End: lands on the item below, not on the floor: y=" + ia.doc.y);
    await key(editor, "Delete"); await select(editor, ["itemc00001"]); await key(editor, "Delete");
    await put("itema00001", { x: 4, y: 0, z: 0 }); await put("itemb00001", { x: 6, y: 0, z: 2 }); await sleep(200);

    /* Alt+G: back to the house floor (End also counts other furniture) */
    await put("itema00001", { x: 4, y: 2, z: 0 }); await sleep(200); await select(editor, ["itema00001"]); await editor.keyboard.press("Alt+g");
    await editor.waitForFunction(() => window.__villaItem("itema00001").doc.y < 0.5); await put("itema00001", { x: 4, y: 0, z: 0 });
    /* PageUp / PageDown */
    await select(editor, ["itema00001"]); await centre(); await key(editor, "PageUp"); ia = await item(editor, "itema00001"); assert(near(ia.doc.y, 0.05), "PageUp +50 mm");
    await editor.keyboard.press("Shift+PageDown"); ia = await item(editor, "itema00001"); assert(near(ia.doc.y, 0.04), "Shift+PageDown -10 mm");
    await put("itema00001", { x: 4, y: 0, z: 0 });
    step("End lands on the surface below; PageUp / PageDown 50 mm, Shift 10 mm");

    /* ---- Walk mode: R turns by 90 deg as before, Tab goes to Orbit aimed at the item and back ---- */
    await select(editor, ["itema00001"]);
    await editor.click("#mWalk"); await editor.waitForFunction(() => window.__villa().mode === "walk");
    const wy = await editor.evaluate(() => window.__villa().walkY);
    await key(editor, "Tab"); await editor.waitForFunction(() => window.__villa().mode === "orbit");
    const oc = await editor.evaluate(() => window.__villaCam().pos); assert(Math.hypot(oc[0] - 4, oc[2] - 0) < 40, "camera near the item");
    await key(editor, "g"); await key(editor, "x"); await editor.keyboard.type("100"); assert.match(await bar(), /Перемещение X: 100 мм/); await key(editor, "Escape");
    await key(editor, "Tab"); await editor.waitForFunction(() => window.__villa().mode === "walk");
    assert(Math.abs((await editor.evaluate(() => window.__villa().walkY)) - wy) < 0.05, "back in the walk where it was");
    await editor.click("#mOrbit"); await key(editor, "Escape");
    step("Walk: Tab = Orbit aimed at the item with G R S available, Tab again = back to the same walking spot");

    await key(editor, "?"); await editor.waitForSelector("#keysHelp"); assert.match(await editor.locator("#keysHelp").textContent(), /G · R · S/); await key(editor, "Escape"); await editor.waitForSelector("#keysHelp", { state: "detached" });
    /* ---- legacy item can be transformed and keeps its look ---- */
    await select(editor, ["legacy01x"]); await centre(); await op(["g", "z", "1", "0", "0"]);
    const lz = (await state()).items.legacy01x; assert(near(lz.y, 0.1) && lz.ry === 0.5 && lz.sx === 2, "legacy item moved, rotation/scale kept");

    /* ---- folders ---- */
    st = await state();
    const names = Object.values(st.folders).map(f => f.name).sort();
    assert.deepStrictEqual(names, ["Гостиная", "Декор", "Санузел", "Спальня", "Терраса и сад"].sort(), "starter folders created");
    const fid = n => Object.entries((st.folders)).find(([, f]) => f.name === n)[0];
    const bath = fid("Санузел");
    const m0 = await upload(glbFile("old.glb", 0.5, 0.5, 0.5, [0.9, 0.2, 0.2]), "Старая");
    st = await state(); assert.strictEqual(st.models[m0].folder, null, "uploads without a folder stay at the root");
    /* viewer cannot change anything */
    const viewerTry = async () => [
      (await api("POST", "/api/folders", { name: "X" }, null)).status, (await api("PATCH", "/api/folders/" + bath, { name: "X" }, null)).status,
      (await api("DELETE", "/api/folders/" + bath, undefined, null)).status, (await api("POST", "/api/models/move", { ids: [m0], folder: bath }, null)).status,
      (await api("PATCH", "/api/models/" + m0, { folder: bath }, null)).status, (await api("POST", "/api/folders", { name: "X" }, "wrong-key-wrong-key")).status];
    assert.deepStrictEqual(await viewerTry(), [403, 403, 403, 403, 403, 403], "viewer / wrong key: 403 on every change");
    st = await state(); assert(st.folders[bath].name === "Санузел" && st.models[m0].folder === null && Object.keys(st.folders).length === 5, "nothing changed");
    /* nesting up to three levels */
    const mkF = async (name, parent) => { const r = await api("POST", "/api/folders", { name, parent }); return { status: r.status, j: await r.json() }; };
    const sinks = await mkF("Раковины", bath); assert.strictEqual(sinks.status, 200);
    const deep = await mkF("Подвал", sinks.j.id); assert.strictEqual(deep.status, 200, "third level");
    const deeper = await mkF("Ещё", deep.j.id); assert.strictEqual(deeper.status, 409, "fourth level refused"); assert.strictEqual(deeper.j.error, "too_deep");
    assert.strictEqual((await api("PATCH", "/api/folders/" + bath, { parent: deep.j.id })).status, 409, "cannot move a folder into its own subtree");
    const dec = fid("Декор");
    assert.strictEqual((await api("PATCH", "/api/folders/" + dec, { parent: sinks.j.id })).status, 200, "move a folder");
    assert.strictEqual((await api("PATCH", "/api/folders/" + sinks.j.id, { parent: dec })).status, 409, "moving that subtree under a 3-deep branch is too deep");
    await api("PATCH", "/api/folders/" + dec, { parent: null });
    step("folders API: starter set, 3 levels, no cycles, viewer and wrong key get 403");

    /* UI: breadcrumbs, upload into the current folder, drag into a sub-folder, search with path */
    await editor.click("#tUp"); await viewer.click("#tUp");
    await editor.waitForSelector('#libList .fcard[data-folder="' + bath + '"]');
    assert.strictEqual(await editor.locator("#libList .fcard").count(), 5, "five root folders shown as cards above the models");
    assert.match(await editor.locator('#libList .fcard[data-folder="' + bath + '"] .cd').textContent(), /0 моделей/);
    await editor.click('#libList .fcard[data-folder="' + bath + '"] .card-main');
    assert.strictEqual((await editor.locator(".crumb-nav").textContent()).replace(/\s+/g, ""), "Всемодели›Санузел");
    await editor.setInputFiles("#fileIn", glbFile("sink.glb", 0.6, 0.2, 0.5, [0.2, 0.5, 0.9]));
    await editor.waitForSelector("#libList .card:not(.fcard)", { timeout: 30000 });
    st = await state(); const sinkId = Object.keys(st.models).find(k => st.models[k].name === "sink"); assert.strictEqual(st.models[sinkId].folder, bath, "uploaded into the open folder");
    assert.match(await editor.locator('#libList .fcard[data-folder="' + sinks.j.id + '"] .cd').textContent(), /0 моделей/);
    /* drag the model card onto the "Раковины" folder card with the mouse */
    const card = (await editor.locator("#libList .card:not(.fcard) .card-main").first().boundingBox()), target = await editor.locator('#libList .fcard[data-folder="' + sinks.j.id + '"] .card-main').boundingBox();
    await editor.mouse.move(card.x + 30, card.y + 30); await editor.mouse.down(); await editor.mouse.move(card.x + 60, card.y + 40, { steps: 4 }); await editor.mouse.move(target.x + 30, target.y + 30, { steps: 8 });
    assert(await editor.locator('.fcard[data-folder="' + sinks.j.id + '"].drop').count() === 1, "drop target highlighted");
    await editor.mouse.up();
    await editor.waitForFunction(id => !document.querySelector("#libList .card:not(.fcard)") , null, { timeout: 5000 });
    st = await state(); assert.strictEqual(st.models[sinkId].folder, sinks.j.id, "dragged into the folder");
    assert.strictEqual((await editor.evaluate(() => window.__villa().items)) > 0, true);
    /* open it: breadcrumbs three deep, Back works */
    await editor.click('#libList .fcard[data-folder="' + sinks.j.id + '"] .card-main');
    assert.strictEqual((await editor.locator(".crumb-nav").textContent()).replace(/\s+/g, ""), "Всемодели›Санузел›Раковины");
    assert.strictEqual(await editor.locator("#libList .card:not(.fcard)").count(), 1);
    /* search from the root finds it in the sub-folder and shows the path */
    await editor.click(".crumb >> text=Все модели"); await editor.fill("#libSearch", "sink");
    assert.strictEqual(await editor.locator("#libList .card:not(.fcard)").count(), 1);
    assert.strictEqual((await editor.locator("#libList .card .cp").textContent()).replace(/\s+/g, " "), "Санузел › Раковины", "path shown with the search result");
    assert.strictEqual(await editor.locator("#libList .fcard").count(), 0, "search shows models from all folders, not folder cards");
    await editor.fill("#libSearch", "");
    /* the viewer sees the same folders and models, but no editing controls */
    assert(await viewer.locator("#libList .fcard").count() === 5 && !(await viewer.locator("#bNewFolder").count()) && !(await viewer.locator("#libList .fcard .card-i").count()), "viewer: read only");
    await viewer.click('#libList .fcard[data-folder="' + bath + '"] .card-main'); await viewer.click('#libList .fcard[data-folder="' + sinks.j.id + '"] .card-main');
    assert.strictEqual(await viewer.locator("#libList .card:not(.fcard)").count(), 1, "viewer opens folders");
    /* rename with a double click */
    await editor.click('#libList .fcard[data-folder="' + bath + '"] .card-main'); await editor.dblclick('#libList .fcard[data-folder="' + sinks.j.id + '"] .cn');
    await editor.fill(".f-rename", "Умывальники"); await key(editor, "Enter");
    await editor.waitForFunction(() => document.querySelector("#libList .fcard .cn")?.textContent === "Умывальники"); assert.strictEqual((await state()).folders[sinks.j.id].name, "Умывальники");
    await viewer.waitForFunction(() => /Умывальники/.test(document.querySelector(".crumb-nav")?.textContent || ""), null, { timeout: 5000 });
    step("UI: crumbs, upload into the open folder, mouse drag into a folder, search with path, rename by double click, viewer read-only");

    /* delete a folder whose models are in the scene: 'with models' is refused with counts; 'move to parent' keeps the model */
    await editor.evaluate(id => Sync.commitItem("itemd00001", { type: "model", model: id, x: 2, y: 0, z: 2, r: 0, s: 1, by: "editor", at: Date.now() }), sinkId);
    await editor.waitForFunction(() => window.__villaItem("itemd00001"));
    const refuse = await api("DELETE", "/api/folders/" + sinks.j.id + "?mode=models"); const rj = await refuse.json();
    assert(refuse.status === 409 && rj.error === "in_use" && rj.models === 1 && rj.items === 1, "delete with models refused, counts returned: " + JSON.stringify(rj));
    assert((await state()).models[sinkId] && (await state()).folders[sinks.j.id], "nothing deleted");
    await editor.click('#libList .fcard[data-folder="' + sinks.j.id + '"] .card-i'); await editor.click('.fmenu button:has-text("Удалить")');
    const dtxt = await editor.locator(".pv-dlg").last().textContent(); assert(/1 модель/.test(dtxt) && /предметах: 1/.test(dtxt), "dialog shows the counts: " + dtxt);
    assert.strictEqual(await editor.locator('.pv-dlg button:has-text("Удалить вместе с моделями")').count(), 0, "the destructive option is not offered while the models are in the scene");
    await editor.click('.pv-dlg button:has-text("Переместить модели в родительскую папку")');
    await editor.waitForFunction(() => !document.querySelector('.pv-dlg'));
    st = await state(); assert(!st.folders[sinks.j.id] && st.models[sinkId].folder === bath, "folder gone, model moved to the parent");
    assert(st.folders[deep.j.id].parent === bath, "sub-folders moved up too");
    await editor.waitForFunction(id => document.querySelector('#libList .card:not(.fcard)'), null);
    /* empty-of-scene folder: delete together with its models */
    bot.send(JSON.stringify({ t: "item.delete", id: "itemd00001" })); await sleep(250);
    const m2 = await upload(glbFile("tmp.glb", 0.3, 0.3, 0.3, [0.5, 0.5, 0.5]), "Временная", deep.j.id);
    assert.strictEqual((await state()).models[m2].folder, deep.j.id);
    const del = await api("DELETE", "/api/folders/" + deep.j.id + "?mode=models"); assert.strictEqual(del.status, 200);
    st = await state(); assert(!st.folders[deep.j.id] && !st.models[m2], "folder and its model deleted together"); assert(st.models[sinkId], "other models untouched");
    /* a model can also move from its info window (no drag on phones) */
    await editor.locator('#libList .card:not(.fcard) .card-i').first().click(); await editor.waitForSelector("#pv");
    assert.match(await editor.locator("#pv .pv-folder").textContent(), /Папка: Санузел/);
    await editor.click('#pv button:has-text("Переместить в…")'); await editor.click('.fp-row:has-text("Спальня")');
    await editor.waitForFunction(() => /Спальня/.test(document.querySelector("#pv .pv-folder")?.textContent || ""));
    assert.strictEqual((await state()).models[sinkId].folder, fid("Спальня"));
    await key(editor, "Escape");
    /* several models selected with Shift move together */
    const m3 = await upload(glbFile("two.glb", 0.3, 0.3, 0.3, [0.1, 0.5, 0.5]), "Вторая", fid("Спальня")); await editor.waitForFunction(() => true);
    await editor.click(".crumb >> text=Все модели"); await editor.click('#libList .fcard[data-folder="' + fid("Спальня") + '"] .card-main');
    await editor.waitForFunction(() => document.querySelectorAll("#libList .card:not(.fcard)").length === 2);
    await editor.keyboard.down("Shift"); await editor.locator("#libList .card:not(.fcard) .card-main").nth(0).click(); await editor.locator("#libList .card:not(.fcard) .card-main").nth(1).click(); await editor.keyboard.up("Shift");
    assert.match(await editor.locator(".selbar").textContent(), /Выбрано: 2 модели/);
    await editor.click('.selbar button:has-text("Переместить в…")'); await editor.click('.fp-row:has-text("Декор")');
    await editor.waitForFunction(() => document.querySelectorAll("#libList .card:not(.fcard)").length === 0);
    st = await state(); assert(st.models[sinkId].folder === dec && st.models[m3].folder === dec, "both moved at once");
    assert.strictEqual(st.models[m0].folder, null, "older model stays in the root");
    step("folders: delete with move / with models (refused while in the scene, with counts), move from the info window, Shift-select and move several");

    for (const p of pages) { const bad = p.logs.filter(l => /PAGEERROR|TypeError|ReferenceError/.test(l)); assert.strictEqual(bad.length, 0, "no page errors: " + bad.join(" | ")); }
    bot.close();
    console.log("\nALL OK");
  } catch (e) {
    console.error("\nFAILED:", e && e.stack || e);
    for (const [i, p] of pages.entries()) if (p.logs.length) console.error("page " + i + " log:", p.logs.slice(-8).join("\n  "));
    process.exitCode = 1;
  } finally {
    await browser.close(); srv.kill();
    try { fs.rmSync(DATA, { recursive: true, force: true }); } catch {}
  }
})();
