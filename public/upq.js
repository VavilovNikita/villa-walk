/* Bulk upload of models: files / folders / .zip -> a queue (2 uploads at a time, thumbnails one by one) -> the library.
   Exposes window.Upq.create(api) -> { addFiles(list), addDataTransfer(dt), busy(), pickFiles(), pickFolder() }. app.js owns the library state and hands it in through `api`. */
(() => {
"use strict";
const BIG = 30 * 1048576, PARALLEL = 2, MAX_ROWS = 250, MAX_JSON = 32 * 1048576;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MODEL = /\.(glb|gltf)$/i, ZIP = /\.zip$/i, COMPANION = /\.(bin|png|jpe?g|webp|ktx2)$/i, JUNK = /^(\.|thumbs\.db$|desktop\.ini$)/i;
const TERMINAL = new Set(["done", "error", "skipped", "cancelled"]);
const fmtMb = n => (n / 1048576).toFixed(n >= 10485760 ? 0 : 1).replace(".", ",") + " МБ";
const fmtBig = n => n >= 1073741824 ? (n / 1073741824).toFixed(1).replace(".", ",") + " ГБ" : fmtMb(n);
const normName = s => String(s).replace(/\s+/g, " ").trim().toLowerCase();

/* ---- IndexedDB: names and statuses of the queue (the files themselves cannot be kept: the browser asks for them again) ---- */
const idb = {
  db: null,
  open() {
    if (this.db) return this.db;
    return this.db = new Promise(res => {
      try {
        const r = indexedDB.open(Env.ls("villa.uploadq"), 1);
        r.onupgradeneeded = () => r.result.createObjectStore("q");
        r.onsuccess = () => res(r.result); r.onerror = () => res(null);
      } catch { res(null); }
    });
  },
  async get() { const db = await this.open(); if (!db) return null; return new Promise(res => { try { const q = db.transaction("q").objectStore("q").get("queue"); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch { res(null); } }); },
  async put(v) { const db = await this.open(); if (!db) return; return new Promise(res => { try { const t = db.transaction("q", "readwrite"); if (v) t.objectStore("q").put(v, "queue"); else t.objectStore("q").delete("queue"); t.oncomplete = t.onerror = t.onabort = () => res(); } catch { res(); } }); },
};

function create(api) {
  const { el, Sync, Thumbs, models, folders } = api;
  const MAX_UPLOAD = Env.maxModelMb * 1048576;
  const items = []; let seq = 0;
  let paused = false, netDown = false, policy = null, resume = null, collapsed = false, chain = Promise.resolve();
  let active = 0, previewing = false, t0 = 0, pausedAt = 0, pausedMs = 0;
  const folderJobs = new Map();            // "base/a/b" -> Promise<folder id>
  const jobEvents = new Map();             // job id -> last event (it can arrive before the upload response)

  const live = () => items.filter(i => !TERMINAL.has(i.status));
  const busy = () => items.some(i => (i.kind !== "zip") && (i.status === "uploading" || i.status === "preview" || i.status === "queued"));

  /* ---------------- panel ---------------- */
  const root = el("div", { id: "upq", class: "panel", hidden: "", role: "region", "aria-label": "Загрузка моделей" });
  const head = el("div", { class: "upq-head" });
  const title = el("b", { class: "upq-title", text: "Загрузка" });
  const sum = el("div", { class: "meta mono upq-sum", role: "status" });
  const bar = el("progress", { max: "100", value: "0", class: "upq-bar" });
  const toggle = el("button", { class: "ghost upq-tog", text: "—", title: "Свернуть", "aria-label": "Свернуть панель", "aria-expanded": "true" });
  const notice = el("div", { class: "upq-notice", hidden: "" });
  const ctrls = el("div", { class: "upq-ctrls" });
  const list = el("div", { class: "upq-list" });
  const bPause = el("button", { class: "upq-pause", text: "Пауза" }), bCancel = el("button", { class: "danger", text: "Отменить всё" });
  const bRetry = el("button", { text: "Повторить все ошибки" }), bClear = el("button", { class: "ghost", text: "Очистить готовые" });
  ctrls.append(bPause, bCancel, bRetry, bClear);
  head.append(el("div", { class: "upq-h1" }, title, toggle), sum, bar);
  root.append(head, notice, ctrls, list);
  document.body.append(root);

  toggle.onclick = () => { collapsed = !collapsed; toggle.textContent = collapsed ? "+" : "—"; toggle.title = collapsed ? "Развернуть" : "Свернуть"; toggle.setAttribute("aria-expanded", String(!collapsed)); root.classList.toggle("collapsed", collapsed); };
  bPause.onclick = () => setPaused(!paused);
  bCancel.onclick = cancelAll;
  bRetry.onclick = () => { for (const i of items) if (i.status === "error" && !i.fatal) retry(i); };
  bClear.onclick = () => { for (let k = items.length - 1; k >= 0; k--) if (["done", "skipped", "cancelled"].includes(items[k].status)) items.splice(k, 1); changed(true); };

  const STATUS_ORDER = { uploading: 0, preview: 0, unpacking: 0, queued: 1, error: 2, done: 3, skipped: 4, cancelled: 4 };
  const rows = new Map();
  function statusText(i) {
    switch (i.status) {
      case "queued": return i.waitMsg || "в очереди";
      case "uploading": return i.waitMsg || ("загружается " + Math.round((i.pct || 0) * 100) + "%" + (i.speed ? " · " + (i.speed / 1048576).toFixed(1).replace(".", ",") + " МБ/с" : ""));
      case "preview": return i.previewing ? "готовлю превью…" : "ждёт превью";
      case "unpacking": return "распаковка на сервере" + (i.job ? ": " + i.job.done + " из " + i.job.total : "…");
      case "done": return "готово ✓" + (i.note ? " · " + i.note : "");
      case "error": return "ошибка: " + (i.err || "не получилось");
      case "skipped": return "пропущен: " + (i.err || "");
      case "cancelled": return "отменён";
    }
    return "";
  }
  function paintRow(i) {
    let r = rows.get(i.id);
    if (!r) {
      const nm = el("span", { class: "upq-name" }), st = el("span", { class: "meta upq-st" }), pg = el("progress", { max: "100", value: "0", class: "upq-rowbar" });
      const x = el("button", { class: "ghost upq-x", text: "✕", title: "Отменить", "aria-label": "Отменить" }), again = el("button", { class: "ghost upq-again", text: "↻", title: "Повторить", "aria-label": "Повторить" });
      x.onclick = () => cancel(i); again.onclick = () => retry(i);
      r = { root: el("div", { class: "upq-row" }, el("div", { class: "upq-main" }, nm, st, pg), x, again), nm, st, pg, x, again }; rows.set(i.id, r);
    }
    r.root.dataset.status = i.status; r.root.dataset.name = i.name;
    r.nm.textContent = (i.rel.length > 1 ? i.rel.slice(0, -1).join(" / ") + " / " : "") + i.fileName; r.nm.title = r.nm.textContent;
    r.st.textContent = statusText(i);
    r.pg.hidden = !(i.status === "uploading" || i.status === "unpacking"); r.pg.value = Math.round(((i.status === "unpacking" ? (i.job && i.job.total ? i.job.done / i.job.total : 0) : i.pct) || 0) * 100);
    r.x.hidden = !["queued", "uploading", "preview"].includes(i.status);
    r.again.hidden = !(i.status === "error" && !i.fatal);
    return r.root;
  }
  let raf = 0, listDirty = true;
  function changed(rebuild) { if (rebuild) listDirty = true; if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); persist(); }
  function summary() {
    const counted = items.filter(i => i.status !== "skipped" && i.status !== "cancelled");
    const done = counted.filter(i => i.status === "done").length, total = counted.length;
    const bytes = counted.reduce((a, i) => a + (i.size || 0), 0), got = counted.reduce((a, i) => a + (i.status === "done" || i.status === "preview" || i.status === "unpacking" ? i.size : (i.status === "uploading" ? i.size * (i.pct || 0) : 0)), 0);
    let eta = "";
    const now = performance.now(), el_ = now - t0 - pausedMs - (paused ? now - pausedAt : 0);
    if (live().length && got > 0 && el_ > 1500) { const left = (bytes - got) / (got / el_) / 1000; eta = left < 45 ? " · осталось меньше минуты" : " · осталось ~" + Math.round(left / 60) + " мин"; }
    return { done, total, bytes, got, text: done + " из " + total + " · " + fmtBig(got) + " из " + fmtBig(bytes) + (live().length ? eta : "") };
  }
  function render() {
    const any = items.length || !notice.hidden;
    root.hidden = !any; if (!any) return;
    const s = summary(), errs = items.filter(i => i.status === "error").length, running = live().length > 0;
    title.textContent = running ? (paused ? "Загрузка на паузе" : netDown ? "Нет связи — жду" : "Загрузка моделей") : "Загрузка завершена";
    sum.textContent = items.length ? s.text + (errs ? " · ошибок: " + errs : "") : "";
    bar.hidden = !items.length; bar.value = s.bytes ? Math.round(s.got / s.bytes * 100) : (running ? 0 : 100);
    bPause.textContent = paused ? "Продолжить" : "Пауза"; bPause.hidden = !running; bCancel.hidden = !running;
    bRetry.hidden = !items.some(i => i.status === "error" && !i.fatal); bClear.hidden = !items.some(i => ["done", "skipped", "cancelled"].includes(i.status));
    ctrls.hidden = !items.length;
    if (listDirty) {
      listDirty = false;
      const sorted = items.map((i, k) => [i, k]).sort((a, b) => (STATUS_ORDER[a[0].status] - STATUS_ORDER[b[0].status]) || a[1] - b[1]).map(x => x[0]);
      const shown = sorted.slice(0, MAX_ROWS), keep = new Set(shown.map(i => i.id));
      for (const [id, r] of rows) if (!keep.has(id)) { r.root.remove(); rows.delete(id); }
      list.replaceChildren(...shown.map(paintRow));
      if (sorted.length > MAX_ROWS) list.append(el("div", { class: "meta upq-more", text: "…и ещё " + (sorted.length - MAX_ROWS) }));
    } else for (const i of items) if (rows.has(i.id)) paintRow(i);
  }

  function showNotice(text, buttons) {
    notice.hidden = !text; notice.replaceChildren();
    if (!text) return;
    notice.append(el("div", { text }), el("div", { class: "upq-nbtns" }, ...buttons.map(([label, fn, cls]) => el("button", { class: cls || "", text: label, on: { click: fn } }))));
  }

  /* ---------------- persistence ---------------- */
  let saveT = 0;
  const keyOf = i => i.rel.join("/") + "|" + i.size;
  function persist() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      if (!items.length) return idb.put(null);
      idb.put({ at: Date.now(), items: items.slice(0, 3000).map(i => ({ name: i.fileName, rel: i.rel, size: i.size, status: i.status })) });
    }, 250);
  }
  addEventListener("beforeunload", e => { if (live().some(i => i.kind !== "zip" || i.status !== "unpacking")) { e.preventDefault(); e.returnValue = ""; } });

  async function loadInterrupted() {
    const rec = await idb.get(); if (!rec || !rec.items) return;
    const pending = rec.items.filter(i => !TERMINAL.has(i.status)), done = rec.items.filter(i => i.status === "done");
    if (!pending.length) { idb.put(null); return; }
    resume = { pending, done: new Set(done.map(i => i.rel.join("/") + "|" + i.size)) };
    showNotice("Загрузка была прервана: " + pending.length + " " + plural(pending.length) + " не загружены — выберите их снова, чтобы продолжить (браузер не позволяет открыть файлы без вашего выбора). Уже загруженные пропустятся автоматически.",
      [["Выбрать файлы…", () => pickFiles(), "primary"], ["Выбрать папку…", () => pickFolder()], ["Закрыть", () => { resume = null; showNotice(""); idb.put(null); render(); }, "ghost"]]);
    render();
  }
  const plural = n => { const m = n % 100, k = n % 10; return (m > 10 && m < 20) ? "файлов" : k === 1 ? "файл" : (k >= 2 && k <= 4) ? "файла" : "файлов"; };

  /* ---------------- choosing files ---------------- */
  const inFiles = el("input", { id: "upFiles", type: "file", multiple: "", accept: ".glb,.gltf,.bin,.png,.jpg,.jpeg,.webp,.zip", hidden: "" });
  const inDir = el("input", { id: "upDir", type: "file", multiple: "", hidden: "" }); inDir.setAttribute("webkitdirectory", ""); inDir.setAttribute("directory", "");
  document.body.append(inFiles, inDir);
  const pickFiles = () => inFiles.click(), pickFolder = () => inDir.click();
  inFiles.onchange = () => { const l = [...inFiles.files].map(f => ({ file: f, rel: [f.name] })); inFiles.value = ""; addFiles(l); };
  inDir.onchange = () => { const l = [...inDir.files].map(f => ({ file: f, rel: (f.webkitRelativePath || f.name).split("/").filter(Boolean) })); inDir.value = ""; addFiles(l); };

  async function walk(entry, prefix, out, depth) {
    if (out.length > 20000 || depth > 12) return;
    if (entry.isFile) { const f = await new Promise(r => entry.file(r, () => r(null))); if (f) out.push({ file: f, rel: [...prefix, entry.name] }); return; }
    if (!entry.isDirectory) return;
    const rd = entry.createReader();
    for (;;) {
      const batch = await new Promise(r => rd.readEntries(r, () => r([])));
      if (!batch.length) break;
      for (const e of batch) await walk(e, [...prefix, entry.name], out, depth + 1);
    }
  }
  /* must be called synchronously from the drop event: the entries are taken before the first await */
  async function addDataTransfer(dt) {
    const entries = [], out = [];
    for (const it of dt.items || []) {
      if (it.kind !== "file") continue;
      const en = it.webkitGetAsEntry && it.webkitGetAsEntry();
      if (en) entries.push(en); else { const f = it.getAsFile(); if (f) out.push({ file: f, rel: [f.name] }); }
    }
    if (!entries.length && !out.length) for (const f of dt.files || []) out.push({ file: f, rel: [f.name] });
    for (const e of entries) await walk(e, [], out, 0);
    return addFiles(out);
  }

  /* ---------------- sorting out what was chosen ---------------- */
  const stripExt = s => s.replace(/\.(glb|gltf|zip)$/i, "");
  function resolveRel(rel, uri) {   // path of a file referenced by a .gltf, relative to the .gltf
    let u; try { u = decodeURIComponent(uri); } catch { return null; }
    if (/^[a-z]+:/i.test(u) || u.startsWith("/")) return null;
    const out = rel.slice(0, -1);
    for (const p of u.replace(/\\/g, "/").split("/")) { if (!p || p === ".") continue; if (p === "..") { if (!out.length) return null; out.pop(); } else out.push(p); }
    return out.join("/").toLowerCase();
  }
  async function classify(list, base) {
    const out = [], byPath = new Map(), used = new Set();
    for (const x of list) byPath.set(x.rel.join("/").toLowerCase(), x);
    const mk = (x, kind, extra) => Object.assign({ id: ++seq, file: x.file, rel: x.rel, fileName: x.rel[x.rel.length - 1], name: (stripExt(x.rel[x.rel.length - 1]).trim().slice(0, 60)) || "Модель", size: x.file.size, kind, status: "queued", pct: 0, base, attempts: 0 }, extra);
    for (const x of list) {
      const n = x.rel[x.rel.length - 1];
      if (JUNK.test(n)) continue;
      if (ZIP.test(n)) { out.push(mk(x, "zip")); continue; }
      if (/\.glb$/i.test(n)) { out.push(mk(x, "glb")); continue; }
      if (/\.gltf$/i.test(n)) {
        const it = mk(x, "gltf");
        try {
          if (x.file.size > MAX_JSON) throw Object.assign(new Error("x"), { code: "bad_gltf" });
          const json = new Uint8Array(await x.file.arrayBuffer()), files = new Map(); let total = x.file.size;
          for (const uri of GltfPack.refs(json).uris) {
            const hit = byPath.get(resolveRel(x.rel, uri) || "\0");
            if (!hit) throw Object.assign(new Error("gltf_missing"), { code: "gltf_missing" });
            files.set(uri, hit.file); used.add(hit); total += hit.file.size;
          }
          it.companions = files; it.size = total;
        } catch (e) { it.status = "error"; it.fatal = true; it.err = errText(e); }
        out.push(it); continue;
      }
    }
    for (const x of list) {
      const n = x.rel[x.rel.length - 1];
      if (JUNK.test(n) || MODEL.test(n) || ZIP.test(n) || used.has(x)) continue;
      const it = mk(x, "skip", { status: "skipped", err: COMPANION.test(n) ? "это часть .gltf, а самого .gltf в выборе нет" : "не 3D-модель (нужен .glb, .gltf или .zip)" });
      out.push(it);
    }
    return out;
  }

  /* where in the library a file would go, if that folder already exists (null: it does not, so nothing in it can be a duplicate) */
  function findFolder(base, dirs) {
    let cur = base || null; const room = Math.max(0, api.maxDepth - api.folderDepth(cur));
    for (const d of dirs.slice(0, room)) {
      const hit = [...folders.entries()].find(([, f]) => (f.parent || null) === cur && normName(f.name) === normName(d));
      if (!hit) return undefined; cur = hit[0];
    }
    return cur;
  }
  const existingTwin = i => {
    if (i.kind !== "glb") return null;
    const f = findFolder(i.base, i.rel.slice(0, -1)); if (f === undefined) return null;
    const hit = [...models.entries()].find(([, m]) => api.folderOf(m) === f && m.name === i.name && m.sizeBytes === i.size);
    return hit ? hit[0] : null;
  };

  function ask(titleText, text, buttons) {
    return new Promise(res => api.modal(titleText, [el("div", { text })], buttons.map(b => ({ label: b[0], cls: b[2], run: () => { res(b[1]); } })), { onCancel: () => res(null) }));
  }

  function addFiles(list) {
    chain = chain.then(() => stage(list)).catch(e => { console.warn("upq", e); });
    return chain;
  }
  async function stage(list) {
    if (!list.length) return;
    if (!api.canWrite()) { api.toast("Загружать модели может только редактор."); return; }
    api.focusUploads();
    const base = api.getFolder();
    let fresh = await classify(list, base);
    const models_ = fresh.filter(i => i.kind !== "skip");
    if (!models_.length) { if (fresh.length) { items.push(...fresh); changed(true); } api.toast("В выбранном нет моделей: нужны файлы .glb, .gltf или .zip."); return; }

    /* the interrupted run: what was uploaded then is skipped without asking */
    const resumed = resume; resume = null; if (resumed) showNotice("");
    for (const i of fresh) {
      if (i.status !== "queued") continue;
      if (i.size > MAX_UPLOAD) { i.status = "error"; i.fatal = true; i.err = "больше " + Env.maxModelMb + " МБ — уменьшите модель (например, в Blender)"; continue; }
      if (resumed && resumed.done.has(keyOf(i))) { i.status = "skipped"; i.err = "уже загружен раньше"; }
    }
    /* one warning for the whole queue */
    const big = fresh.filter(i => i.status === "queued" && i.size > BIG);
    if (big.length) {
      const sz = big.reduce((a, i) => a + i.size, 0);
      const v = await ask("Большие модели", "В очереди " + big.length + " " + (big.length === 1 ? "файл" : "файлов") + " больше 30 МБ (" + fmtBig(sz) + "). У участников со слабым интернетом и на телефонах такие модели грузятся долго.",
        [["Отмена", null, "ghost"], ["Без больших", "small"], ["Загрузить всё", "all", "primary"]]);
      if (v === null) return;
      if (v === "small") for (const i of big) { i.status = "skipped"; i.err = "большой файл, не загружен"; }
    }
    /* duplicates: asked once for the whole queue */
    const twins = new Map();
    for (const i of fresh) if (i.status === "queued") { const t = existingTwin(i); if (t) twins.set(i, t); }
    if (twins.size) {
      let p = resumed ? "skip" : policy;
      if (!p) {
        p = await ask("Такие модели уже есть", twins.size + " " + (twins.size === 1 ? "модель" : "моделей") + " из выбранных уже лежит в библиотеке (то же название и размер в той же папке). Что сделать?",
          [["Отмена", null, "ghost"], ["Пропустить дубликаты", "skip"], ["Загрузить копии", "copy"], ["Заменить", "replace", "primary"]]);
        if (p === null) return;
        policy = p;
      }
      for (const [i, id] of twins) {
        if (p === "skip") { i.status = "skipped"; i.err = "уже есть в библиотеке"; }
        else if (p === "replace") i.replaceId = id;
      }
    }
    if (!live().length) { t0 = performance.now(); pausedMs = 0; }
    items.push(...fresh);
    changed(true); pump();
  }

  /* ---------------- running ---------------- */
  function setPaused(v) {
    paused = v; if (v) pausedAt = performance.now(); else { pausedMs += performance.now() - pausedAt; pump(); }
    changed();
  }
  function cancel(i) {
    if (i.status === "uploading") { i.cancelled = true; i.ctl && i.ctl.abort && i.ctl.abort(); }
    else if (i.status === "queued") { i.status = "cancelled"; }
    else if (i.status === "preview" && !i.previewing) { i.status = "done"; i.note = "без превью"; i.blob = null; }
    changed(true);
  }
  function cancelAll() { paused = false; for (const i of items) if (["queued", "uploading", "preview"].includes(i.status)) cancel(i); changed(true); }
  function retry(i) { i.status = "queued"; i.err = ""; i.pct = 0; i.attempts = 0; i.cancelled = false; i.waitMsg = ""; if (!t0) t0 = performance.now(); changed(true); pump(); }

  const errText = e => {
    const c = e && (e.code || e.message);
    switch (c) {
      case "not_glb": return "это не .glb (другой формат или файл обрезан)";
      case "broken": return "файл повреждён: модель не читается";
      case "too_large": return "больше " + Env.maxModelMb + " МБ";
      case "forbidden": return "загружать может только редактор";
      case "too_many_models": return "в библиотеке слишком много моделей — удалите ненужные";
      case "too_many_folders": return "слишком много папок";
      case "gltf_missing": return "модель .gltf без своих файлов — экспортируйте в .glb";
      case "bad_gltf": return "файл .gltf повреждён";
      case "gltf_unsupported": return "в .gltf картинка неподдерживаемого формата — экспортируйте в .glb";
      case "zip_unsafe": return "архив содержит небезопасные пути (../ или абсолютные) — отклонён";
      case "bad_zip": return "архив повреждён или это не .zip";
      case "zip64": return "архив больше 4 ГБ не поддерживается";
      case "too_many_files": return "в архиве слишком много файлов";
      case "encrypted": return "архив защищён паролем";
      case "method": return "способ сжатия в архиве не поддерживается";
      case "zip_bomb": return "файл в архиве распаковывается в больший размер, чем заявлено";
      case "network": return "нет связи с сервером";
      case "not_found": return "модель, которую нужно заменить, уже удалена";
      default: return "не получилось загрузить";
    }
  };

  /* the connection is gone: nothing is started until the server answers again */
  let netWatch = null;
  function goOffline() {
    if (netDown) return; netDown = true; changed();
    netWatch = (async () => {
      for (;;) {
        await sleep(1500);
        try { const r = await fetch(Env.url("/api/health"), { cache: "no-store" }); if (r.ok) break; } catch {}
      }
      netDown = false; netWatch = null; changed(); pump();
    })();
  }
  addEventListener("online", () => { if (netDown) { /* the watcher notices on its next round */ } });

  const serverUp = async () => { try { return (await fetch(Env.url("/api/health"), { cache: "no-store" })).ok; } catch { return false; } };
  function folderFor(i) {
    const dirs = i.rel.slice(0, -1);
    if (!dirs.length) return Promise.resolve(i.base || null);
    const k = (i.base || "") + "/" + dirs.join("/").toLowerCase();
    if (!folderJobs.has(k)) {
      const p = Sync.ensureFolders(i.base, dirs).then(r => r.id || null);
      p.catch(() => folderJobs.delete(k)); folderJobs.set(k, p);
    }
    return folderJobs.get(k);
  }

  /* a quick look inside a .glb before sending it: header, then the JSON chunk must parse */
  async function quickCheck(file) {
    const head = new DataView(await file.slice(0, 20).arrayBuffer());
    if (head.byteLength < 20 || head.getUint32(0, true) !== 0x46546c67 || head.getUint32(4, true) !== 2 || head.getUint32(8, true) !== file.size) throw Object.assign(new Error("not_glb"), { code: "not_glb" });
    const n = head.getUint32(12, true);
    if (head.getUint32(16, true) !== 0x4e4f534a || n > 64 * 1048576 || 20 + n > file.size) throw Object.assign(new Error("broken"), { code: "broken" });
    try { const j = JSON.parse(await file.slice(20, 20 + n).text()); if (!j || !j.asset) throw 0; } catch { throw Object.assign(new Error("broken"), { code: "broken" }); }
  }

  function pump() {
    if (paused) return;
    if (!netDown) while (active < PARALLEL) {
      const i = items.find(x => x.status === "queued" && !(x.kind === "zip" && items.some(z => z.status === "unpacking")));
      if (!i) break;
      start(i);
    }
    if (!previewing && !paused) { const i = items.find(x => x.status === "preview"); if (i) doPreview(i); }
    if (!live().length) { policy = null; folderJobs.clear(); api.renderLib(); }
    changed();
  }

  async function start(i) {
    i.status = "uploading"; i.pct = 0; i.speed = 0; i.waitMsg = ""; i.cancelled = false; i.ctl = {}; active++; changed(true);
    const t = performance.now();
    try {
      let file = i.file, uploadName = i.fileName;
      if (i.kind === "glb") await quickCheck(i.file);
      if (i.kind === "gltf") {
        const files = new Map();
        for (const [uri, f] of i.companions) files.set(uri, new Uint8Array(await f.arrayBuffer()));
        const glb = GltfPack.pack(new Uint8Array(await i.file.arrayBuffer()), files);
        if (glb.length > MAX_UPLOAD) throw Object.assign(new Error("too_large"), { code: "too_large" });
        file = new Blob([glb], { type: "model/gltf-binary" }); uploadName = stripExt(i.fileName) + ".glb"; i.size = glb.length;
      }
      if (i.cancelled) throw Object.assign(new Error("aborted"), { code: "aborted" });
      const folder = i.kind === "zip" ? (i.base || null) : await folderFor(i);
      const cb = (fr, loaded) => { i.pct = fr; i.speed = loaded / Math.max(0.2, (performance.now() - t) / 1000); changed(); };
      let r, wait = 2000, waits = 0;
      for (;;) {
        try {
          i.waitMsg = "";
          r = i.kind === "zip" ? await Sync.uploadZip(i.file, i.base, policy || "skip", cb, i.ctl)
            : await Sync.upload(file, i.name, cb, folder, { replace: i.replaceId, preview: true, ctl: i.ctl, fileName: uploadName });
          break;
        } catch (e) {
          if (e.code === "aborted" || i.cancelled) throw Object.assign(new Error("aborted"), { code: "aborted" });
          /* a 429 is "busy"; when the server cut a big upload short instead, it looks like a dropped connection - if the server answers, it was that */
          const busyNow = e.code === "busy" || e.status === 429 || (e.code === "network" && !i.cancelled && await serverUp());
          if (busyNow && ++waits <= 120) {   // the server is at its limit: wait and send again (about ten minutes at most)
            i.waitMsg = "сервер занят, повторю через несколько секунд"; i.pct = 0; changed();
            await sleep(Math.max(e.retryAfter || 0, 1) * 1000 + wait * 0.3 + Math.random() * 400); wait = Math.min(10000, wait * 1.5);
            if (i.cancelled) throw Object.assign(new Error("aborted"), { code: "aborted" });
            continue;
          }
          throw e;
        }
      }
      i.waitMsg = ""; i.pct = 1;
      if (i.kind === "zip") { i.status = "unpacking"; i.jobId = r.id; i.job = { done: 0, total: r.total || 0 }; if (jobEvents.has(r.id)) onJob(jobEvents.get(r.id)); }
      else {
        i.modelId = r.id; i.blob = file;
        if (r.doc) api.setModel(r.id, r.doc);
        i.status = "preview";
      }
    } catch (e) {
      if (e.code === "aborted") { i.status = "cancelled"; }
      else if (e.code === "network") {
        i.attempts++;
        if (i.attempts > 8) { i.status = "error"; i.err = errText(e); }
        else { i.status = "queued"; i.pct = 0; i.waitMsg = "жду соединения…"; goOffline(); }
      } else { i.status = "error"; i.err = errText(e); i.fatal = ["not_glb", "broken", "too_large", "gltf_missing", "forbidden", "zip_unsafe", "bad_zip", "zip64", "too_many_files", "encrypted", "method", "too_many_models"].includes(e.code); console.warn("upload", i.fileName, e); }
    } finally { active--; i.ctl = null; changed(true); pump(); }
  }

  /* thumbnails: strictly one at a time; the model is parsed from the file we just sent (small ones) or downloaded back (big ones) */
  async function doPreview(i) {
    previewing = true; i.previewing = true; changed();
    let wrap = null;
    try {
      const m = models.get(i.modelId);
      if (!m) { i.status = "done"; i.note = "удалена"; return; }
      let broken = false;
      if (i.blob && i.size <= BIG) {
        try {
          const buf = await i.blob.arrayBuffer();
          const gl = await new Promise((res, rej) => api.loader.parse(buf, "", res, rej));
          wrap = api.normalizeModel(gl.scene);
        } catch (e) { broken = true; console.warn("parse", i.fileName, e); }
      } else wrap = await api.loadFresh(m);
      if (broken) {   // it was a valid header and JSON but the model itself does not read: do not leave it in the library
        try { await Sync.removeModel(i.modelId); } catch {}
        i.status = "error"; i.fatal = true; i.err = errText({ code: "broken" }); return;
      }
      const { blob, size } = await Thumbs.renderThumb(wrap);
      const t = await Sync.uploadThumb(i.modelId, blob, api.mmOf(size));
      if (t && t.doc && models.has(i.modelId)) { api.setModel(i.modelId, t.doc); api.patchCard(i.modelId); }
      i.status = "done"; if (i.replaceId) i.note = "заменена";
    } catch (e) {
      console.warn("preview", i.fileName, e);
      i.status = "done"; i.note = "без превью"; api.thumbFailed(i.modelId);
    } finally {
      if (wrap) Thumbs.disposeObject(wrap);
      i.blob = null; i.previewing = false; previewing = false; changed(true); pump();
    }
  }

  /* ---------------- zip jobs (WebSocket, with a slow poll as a safety net) ---------------- */
  function onJob(m) {
    jobEvents.set(m.id, m);
    const i = items.find(x => x.jobId === m.id); if (!i) return;
    i.job = { done: m.done, total: m.total };
    if (m.t === "job.done" || m.finished) {
      if (m.error) { i.status = "error"; i.err = errText({ code: m.error }); i.fatal = true; }
      else {
        i.status = "done";
        const parts = ["добавлено " + m.added]; if (m.duplicates) parts.push("дубликатов пропущено " + m.duplicates); if (m.skipped) parts.push("не моделей " + m.skipped);
        if (m.failed) parts.push("ошибок " + m.failed);
        i.note = parts.join(" · "); i.failedList = m.failedList || [];
        if (m.failed) i.err = (m.failedList || []).slice(0, 3).map(f => f.path + ": " + errText({ code: f.code })).join("; ");
      }
      pump();
    }
    changed(true);
  }
  Sync.on("job.progress", onJob); Sync.on("job.done", onJob);
  setInterval(async () => {
    for (const i of items) if (i.status === "unpacking" && i.jobId) { try { const j = await Sync.job(i.jobId); onJob(Object.assign({ t: j.finished ? "job.done" : "job.progress" }, j)); } catch (e) { if (e.code === "not_found") { i.status = "done"; i.note = "готово"; changed(true); pump(); } } }
  }, 4000).unref?.();

  setTimeout(loadInterrupted, 0);
  return { addFiles, addDataTransfer, busy, pickFiles, pickFolder, items: () => items, state: () => ({ paused, netDown, policy, active, previewing }) };
}

window.Upq = { create };
})();
