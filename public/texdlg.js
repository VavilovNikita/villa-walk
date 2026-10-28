/* "New texture" window: photo (file or camera) -> perspective -> crop frame -> seamless -> real size in mm -> upload.
   The crop frame always has the aspect ratio of the real fragment (width : height in mm), so a pixel means the same length on both axes.
   Exposes window.TexDlg.open() -> Promise<{id, doc} | null>. */
(() => {
"use strict";
const MAX_SIDE = 2048, MAX_FILE = Env.maxTextureMb * 1024 * 1024;
const $e = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v == null) continue; if (k === "on") for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn); else if (k === "text") e.textContent = v; else e.setAttribute(k, v); } e.append(...kids.filter(Boolean)); return e; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mkCanvas = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const isHeic = f => /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);

/* ---- perspective: homography from the unit square to the quad TL, TR, BR, BL (Heckbert) ---- */
function warpQuad(src, q, outW, outH) {
  const [p0, p1, p2, p3] = q, dx1 = p1[0] - p2[0], dx2 = p3[0] - p2[0], dx3 = p0[0] - p1[0] + p2[0] - p3[0], dy1 = p1[1] - p2[1], dy2 = p3[1] - p2[1], dy3 = p0[1] - p1[1] + p2[1] - p3[1];
  let g = 0, h = 0; const den = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) { g = (dx3 * dy2 - dy3 * dx2) / den; h = (dx1 * dy3 - dy1 * dx3) / den; }
  const a = p1[0] - p0[0] + g * p1[0], b = p3[0] - p0[0] + h * p3[0], c = p0[0], d = p1[1] - p0[1] + g * p1[1], e = p3[1] - p0[1] + h * p3[1], f = p0[1];
  const sw = src.width, sh = src.height, sd = src.getContext("2d").getImageData(0, 0, sw, sh).data, out = mkCanvas(outW, outH), oc = out.getContext("2d"), od = oc.createImageData(outW, outH), o = od.data;
  for (let y = 0; y < outH; y++) {
    const v = (y + 0.5) / outH;
    for (let x = 0; x < outW; x++) {
      const u = (x + 0.5) / outW, w = g * u + h * v + 1, sx = (a * u + b * v + c) / w - 0.5, sy = (d * u + e * v + f) / w - 0.5;
      const x0 = Math.floor(sx), y0 = Math.floor(sy), tx = sx - x0, ty = sy - y0, i = (y * outW + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const px = (xx, yy) => sd[(clamp(yy, 0, sh - 1) * sw + clamp(xx, 0, sw - 1)) * 4 + ch];
        o[i + ch] = (px(x0, y0) * (1 - tx) + px(x0 + 1, y0) * tx) * (1 - ty) + (px(x0, y0 + 1) * (1 - tx) + px(x0 + 1, y0 + 1) * tx) * ty;
      }
      o[i + 3] = 255;
    }
  }
  oc.putImageData(od, 0, 0); return out;
}

/* ---- seamless: shift by half and feather the seam (the middle of the photo is smooth, so it covers the cross where the edges now meet) ---- */
function seamlessBlend(c) {
  const W = c.width, H = c.height, ctx = c.getContext("2d"), src = ctx.getImageData(0, 0, W, H).data, out = ctx.createImageData(W, H), o = out.data, hw = W * 0.2, hh = H * 0.2;
  const fall = (d, half) => { const t = clamp(1 - d / half, 0, 1); return t * t * (3 - 2 * t); };
  for (let y = 0; y < H; y++) {
    const my = fall(Math.abs(y - H / 2), hh), ys = ((y + (H >> 1)) % H) * W;
    for (let x = 0; x < W; x++) {
      const m = Math.max(my, fall(Math.abs(x - W / 2), hw)), i = (y * W + x) * 4, j = (ys + (x + (W >> 1)) % W) * 4;
      for (let ch = 0; ch < 3; ch++) o[i + ch] = src[j + ch] * (1 - m) + src[i + ch] * m;
      o[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0); return c;
}
function seamlessMirror(c) {
  const W = c.width, H = c.height, out = mkCanvas(W * 2, H * 2), x = out.getContext("2d");
  x.drawImage(c, 0, 0);
  x.save(); x.translate(W * 2, 0); x.scale(-1, 1); x.drawImage(c, 0, 0); x.restore();
  x.save(); x.translate(0, H * 2); x.scale(1, -1); x.drawImage(c, 0, 0); x.restore();
  x.save(); x.translate(W * 2, H * 2); x.scale(-1, -1); x.drawImage(c, 0, 0); x.restore();
  return out;
}

function open() {
  return new Promise(resolve => {
    const st = { file: null, orig: null, work: null, modified: false, cx: 0.5, cy: 0.5, s: 0.8, w: 600, h: 600, lock: true, ratio: 1, seam: false, method: "blend", persp: null, busy: false };
    const body = $e("div", { class: "td-body" });
    const msg = $e("div", { class: "meta", role: "status" });
    const dlg = $e("div", { class: "panel pv-dlg td", role: "dialog", "aria-modal": "true", "aria-labelledby": "tdTitle" },
      $e("div", { class: "pv-head" }, $e("h2", { id: "tdTitle", text: "Новая текстура" }), $e("button", { class: "ghost", text: "✕", "aria-label": "Закрыть", on: { click: () => done(null) } })), body, msg);
    const root = $e("div", { class: "pv-back", id: "texDlg" }, dlg); document.body.append(root);
    const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); done(null); } else if (e.key !== "Tab" && !(e.target.closest && e.target.closest("input,select,textarea"))) e.stopPropagation(); };
    document.addEventListener("keydown", onKey, true);
    root.addEventListener("pointerdown", e => { if (e.target === root && !st.file) done(null); });
    const opener = document.activeElement;
    function done(v) { document.removeEventListener("keydown", onKey, true); root.remove(); opener && opener.focus && opener.focus(); resolve(v); }
    const say = (t, bad) => { msg.textContent = t || ""; msg.style.color = bad ? "var(--danger)" : ""; };

    /* ---------- step 1: choose a picture ---------- */
    function stepPick() {
      body.textContent = "";
      const file = $e("input", { type: "file", accept: "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif", hidden: "" });
      const cam = $e("input", { type: "file", accept: "image/*", capture: "environment", hidden: "" });
      file.onchange = () => take(file.files[0]); cam.onchange = () => take(cam.files[0]);
      body.append($e("div", { class: "meta", text: "Снимайте прямо, при ровном свете, без бликов. Измерьте рулеткой, сколько мм по ширине попало в рамку." }),
        $e("div", { class: "row" }, $e("button", { class: "primary", text: "Выбрать файл", on: { click: () => file.click() } }), $e("button", { text: "Снять на камеру", on: { click: () => cam.click() } }), file, cam),
        $e("div", { class: "meta", text: "JPG, PNG, WebP или HEIC, до " + Env.maxTextureMb + " МБ." }));
    }
    async function take(f) {
      if (!f) return;
      if (f.size > MAX_FILE) { say("Файл больше " + Env.maxTextureMb + " МБ.", true); return; }
      say("Открываю фото…");
      try {
        const bmp = await createImageBitmap(f, { imageOrientation: "from-image" });
        const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height)), c = mkCanvas(bmp.width * k, bmp.height * k);
        c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height); bmp.close && bmp.close();
        st.file = f; st.orig = st.work = c; st.modified = false; st.persp = null; say(""); stepEdit();
      } catch (e) {
        console.warn(e);
        say(isHeic(f) ? "Этот браузер не открывает HEIC. Сохраните фото как JPEG или снимите через «Снять на камеру»." : "Не удалось открыть изображение: файл повреждён или это не картинка.", true);
      }
    }

    /* ---------- step 2: edit ---------- */
    let stage, cv, frame, handles = [], slider, prevCv, wIn, hIn, nameIn, saveBtn, perspBar, lockCb, mirrorNote;
    const D = { w: 0, h: 0, k: 1 };               // display size of the picture on the stage and display px per picture px
    function cropRect() {
      const W = st.work.width, H = st.work.height, maxw = Math.min(W, H * st.ratio), cw = Math.max(16, st.s * maxw), ch = cw / st.ratio;
      st.cx = clamp(st.cx, (cw / 2) / W, 1 - (cw / 2) / W); st.cy = clamp(st.cy, (ch / 2) / H, 1 - (ch / 2) / H);
      return { x: st.cx * W - cw / 2, y: st.cy * H - ch / 2, w: cw, h: ch };
    }
    function layoutStage() {
      const W = st.work.width, H = st.work.height, k = Math.min(Math.min(stage.parentElement.clientWidth || 480, 520) / W, 290 / H);
      D.k = k; D.w = Math.round(W * k); D.h = Math.round(H * k);
      stage.style.width = D.w + "px"; stage.style.height = D.h + "px"; cv.width = D.w; cv.height = D.h;
      cv.getContext("2d").drawImage(st.work, 0, 0, D.w, D.h);
      drawOverlay();
    }
    function drawOverlay() {
      const persp = !!st.perspMode;
      quadSvg.style.display = persp ? "" : "none";
      frame.hidden = persp; handles.forEach(h => h.hidden = !persp); perspBar.hidden = !persp;
      if (persp) { st.q.forEach((p, i) => { handles[i].style.left = p[0] * D.k + "px"; handles[i].style.top = p[1] * D.k + "px"; }); drawQuad(); return; }
      const r = cropRect(); Object.assign(frame.style, { left: r.x * D.k + "px", top: r.y * D.k + "px", width: r.w * D.k + "px", height: r.h * D.k + "px" });
      slider.value = String(Math.round(st.s * 100));
    }
    let quadSvg;
    function drawQuad() { const pts = st.q.map(p => (p[0] * D.k) + "," + (p[1] * D.k)).join(" "); quadSvg.setAttribute("width", D.w); quadSvg.setAttribute("height", D.h); quadSvg.firstChild.setAttribute("points", pts); }
    let previewT = 0;
    function schedulePreview() { clearTimeout(previewT); previewT = setTimeout(renderPreview, 120); }
    /* the picture that will be saved: crop -> optional seamless; `limit` shrinks it for the preview */
    function result(limit) {
      const r = cropRect(), k = limit ? Math.min(1, limit / Math.max(r.w, r.h)) : 1, c = mkCanvas(r.w * k, r.h * k);
      c.getContext("2d").drawImage(st.work, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
      if (!st.seam) return c;
      return st.method === "mirror" ? seamlessMirror(c) : seamlessBlend(c);
    }
    function renderPreview() {
      if (!st.work || st.perspMode) return;
      const t = result(256), S = 270, c = prevCv.getContext("2d"); c.clearRect(0, 0, S, S);
      const tw = S / 3 * (t.width >= t.height ? 1 : t.width / t.height), th = S / 3 * (t.height > t.width ? 1 : t.height / t.width);
      for (let i = 0; i * tw < S; i++) for (let j = 0; j * th < S; j++) c.drawImage(t, i * tw, j * th, tw, th);
    }
    function setRatioFromMm() { st.ratio = clamp(st.w / st.h, 0.05, 20); }
    function syncMm(from) {
      if (from === "w" && st.lock) st.h = Math.max(5, Math.round(st.w / st.ratio)); else if (from === "h" && st.lock) st.w = Math.max(5, Math.round(st.h * st.ratio)); else setRatioFromMm();
      wIn.value = String(st.w); hIn.value = String(st.h);
      drawOverlay(); schedulePreview(); mirrorNote.hidden = !(st.seam && st.method === "mirror");
    }

    function stepEdit() {
      body.textContent = "";
      stage = $e("div", { class: "td-stage" }); cv = $e("canvas", { "aria-label": "Фото" }); stage.append(cv);
      frame = $e("div", { class: "td-frame", title: "Тащите рамку; колесо или ползунок — размер" }); stage.append(frame);
      quadSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); quadSvg.setAttribute("class", "td-quad"); quadSvg.append(document.createElementNS("http://www.w3.org/2000/svg", "polygon")); stage.append(quadSvg);
      handles = [0, 1, 2, 3].map(i => { const h = $e("div", { class: "td-h", hidden: "", title: ["Левый верхний", "Правый верхний", "Правый нижний", "Левый нижний"][i] + " угол" }); stage.append(h); return h; });
      perspBar = $e("div", { class: "row", hidden: "" },
        $e("span", { class: "meta", text: "Совместите углы с краями плитки или доски на фото." }),
        $e("button", { class: "primary", text: "Выровнять", on: { click: applyPersp } }), $e("button", { class: "ghost", text: "Отмена", on: { click: () => { st.perspMode = false; drawOverlay(); schedulePreview(); } } }));
      slider = $e("input", { type: "range", min: "10", max: "100", step: "1", "aria-label": "Размер рамки", class: "td-range", on: { input: () => { st.s = +slider.value / 100; drawOverlay(); schedulePreview(); } } });
      /* the frame: drag to move */
      frame.onpointerdown = e => { e.preventDefault(); frame.setPointerCapture(e.pointerId); const sx = e.clientX, sy = e.clientY, c0 = [st.cx, st.cy];
        const mv = ev => { st.cx = c0[0] + (ev.clientX - sx) / D.k / st.work.width; st.cy = c0[1] + (ev.clientY - sy) / D.k / st.work.height; drawOverlay(); schedulePreview(); };
        const up = () => { frame.removeEventListener("pointermove", mv); frame.removeEventListener("pointerup", up); frame.removeEventListener("pointercancel", up); };
        frame.addEventListener("pointermove", mv); frame.addEventListener("pointerup", up); frame.addEventListener("pointercancel", up); };
      stage.addEventListener("wheel", e => { if (st.perspMode) return; e.preventDefault(); st.s = clamp(st.s * (e.deltaY > 0 ? 0.95 : 1.05), 0.1, 1); drawOverlay(); schedulePreview(); }, { passive: false });
      handles.forEach((h, i) => { h.onpointerdown = e => { e.preventDefault(); h.setPointerCapture(e.pointerId); const sx = e.clientX, sy = e.clientY, p0 = st.q[i].slice();
        const mv = ev => { st.q[i] = [clamp(p0[0] + (ev.clientX - sx) / D.k, 0, st.work.width), clamp(p0[1] + (ev.clientY - sy) / D.k, 0, st.work.height)]; drawOverlay(); };
        const up = () => { h.removeEventListener("pointermove", mv); h.removeEventListener("pointerup", up); h.removeEventListener("pointercancel", up); };
        h.addEventListener("pointermove", mv); h.addEventListener("pointerup", up); h.addEventListener("pointercancel", up); }; });

      wIn = $e("input", { type: "number", min: "5", max: "20000", step: "1", value: String(st.w), "aria-label": "Ширина фрагмента, мм", class: "td-num", on: { input: () => { const v = +wIn.value; if (v >= 5) { st.w = Math.round(v); syncMm("w"); } } } });
      hIn = $e("input", { type: "number", min: "5", max: "20000", step: "1", value: String(st.h), "aria-label": "Высота фрагмента, мм", class: "td-num", on: { input: () => { const v = +hIn.value; if (v >= 5) { st.h = Math.round(v); syncMm("h"); } } } });
      lockCb = $e("input", { type: "checkbox", checked: "", "aria-label": "Сохранять пропорции", on: { change: () => { st.lock = lockCb.checked; } } });
      nameIn = $e("input", { type: "text", maxlength: "60", placeholder: "Название, например «Плитка у бассейна»", "aria-label": "Название", class: "td-name", value: (st.file.name || "").replace(/\.[^.]+$/, "").slice(0, 60) });
      prevCv = $e("canvas", { width: 270, height: 270, class: "td-prev", "aria-label": "Предпросмотр плиткой 3×3" });
      const seamCb = $e("input", { type: "checkbox", "aria-label": "Сделать бесшовной", on: { change: () => { st.seam = seamCb.checked; methodSel.disabled = !st.seam; mirrorNote.hidden = !(st.seam && st.method === "mirror"); schedulePreview(); } } });
      const methodSel = $e("select", { "aria-label": "Способ", disabled: "", on: { change: () => { st.method = methodSel.value; mirrorNote.hidden = !(st.seam && st.method === "mirror"); schedulePreview(); } } },
        $e("option", { value: "blend", text: "растушёвка шва" }), $e("option", { value: "mirror", text: "зеркальная склейка" }));
      mirrorNote = $e("div", { class: "meta", hidden: "", text: "Зеркальная склейка удваивает картинку, поэтому размер в библиотеке будет в 2 раза больше." });
      const perspBtn = $e("button", { text: "Выровнять перспективу…", on: { click: () => { if (st.perspMode) return; const W = st.work.width, H = st.work.height; st.q = [[W * .1, H * .1], [W * .9, H * .1], [W * .9, H * .9], [W * .1, H * .9]]; st.perspMode = true; drawOverlay(); } } });
      const resetBtn = $e("button", { class: "ghost", text: "Вернуть исходное фото", on: { click: () => { st.work = st.orig; st.modified = false; st.cx = st.cy = 0.5; st.s = 0.8; layoutStage(); schedulePreview(); } } });
      saveBtn = $e("button", { class: "primary", text: "Сохранить в библиотеку", on: { click: save } });
      body.append($e("div", { class: "meta", text: "Рамка — это тот кусок, размер которого вы знаете. Тащите её по фото, колесо мыши или ползунок меняют размер." }),
        stage, perspBar, $e("div", { class: "row" }, $e("span", { class: "meta", text: "Рамка" }), slider), $e("div", { class: "row" }, perspBtn, resetBtn),
        $e("div", { class: "row" }, $e("label", { class: "meta" }, "Ширина, мм ", wIn), $e("span", { class: "meta", text: "×" }), $e("label", { class: "meta" }, "Высота, мм ", hIn), $e("label", { class: "meta" }, lockCb, " пропорции")),
        $e("div", { class: "row" }, $e("label", { class: "meta" }, seamCb, " Сделать бесшовной: "), methodSel), mirrorNote,
        $e("div", { class: "meta", text: "Предпросмотр плиткой 3×3 (так будет выглядеть на стене):" }), prevCv,
        nameIn, $e("div", { class: "row" }, saveBtn, $e("button", { class: "ghost", text: "Отмена", on: { click: () => done(null) } })));
      st.perspMode = false; setRatioFromMm(); layoutStage(); renderPreview(); nameIn.focus();
    }
    function applyPersp() {
      const q = st.q, dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
      let ow = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, oh = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
      if (ow < 16 || oh < 16) { say("Углы слишком близко друг к другу.", true); return; }
      const k = Math.min(1, MAX_SIDE / Math.max(ow, oh)); ow = Math.round(ow * k); oh = Math.round(oh * k);
      say("Выравниваю…");
      setTimeout(() => {
        try { st.work = warpQuad(st.work, q, ow, oh); st.modified = true; st.perspMode = false; st.cx = st.cy = 0.5; st.s = 1; say(""); layoutStage(); schedulePreview(); }
        catch (e) { console.warn(e); say("Не удалось выровнять перспективу.", true); }
      }, 20);
    }

    /* ---------- save ---------- */
    const ERR = { forbidden: "Загружать текстуры может только редактор.", too_large: "Файл больше " + Env.maxTextureMb + " МБ.", too_many_textures: "Слишком много текстур. Удалите ненужные.", bad_image: "Сервер не смог прочитать это изображение.", bad_size: "Проверьте размер фрагмента в мм (от 5 до 20000).", network: "Нет связи с сервером." };
    async function save() {
      if (st.busy) return; st.busy = true; saveBtn.disabled = true; say("Загружаю…");
      try {
        const mirrored = st.seam && st.method === "mirror", mm = [st.w * (mirrored ? 2 : 1), st.h * (mirrored ? 2 : 1)];
        const name = nameIn.value.trim().slice(0, 60) || "Текстура";
        const mk = (file, crop) => { const fd = new FormData(); fd.append("name", name); fd.append("w", String(mm[0])); fd.append("h", String(mm[1])); fd.append("seamless", st.seam ? "1" : "0"); if (crop) fd.append("crop", crop); fd.append("file", file, file.name || "photo.jpg"); return fd; };
        const fromCanvas = async () => { const c = result(0), blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.93)); return mk(new File([blob], "texture.jpg", { type: "image/jpeg" })); };
        let r;
        if (!st.modified && !st.seam && !isHeic(st.file)) {
          const c = cropRect(), W = st.work.width, H = st.work.height;
          try { r = await Sync.uploadTexture(mk(st.file, [c.x / W, c.y / H, c.w / W, c.h / H].map(v => +v.toFixed(5)).join(","))); }
          catch (e) { if (e.code === "bad_image" || e.code === "heic_unsupported") r = await Sync.uploadTexture(await fromCanvas()); else throw e; }
        } else r = await Sync.uploadTexture(await fromCanvas());
        done(r);
      } catch (e) { console.warn(e); say(ERR[e && e.code] || "Не получилось загрузить текстуру.", true); st.busy = false; saveBtn.disabled = false; }
    }
    stepPick();
  });
}
window.TexDlg = { open };
})();
