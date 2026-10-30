"use strict";
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { pipeline } = require("stream/promises");
try { process.loadEnvFile(path.join(__dirname, "..", ".env")); } catch {}

const PORT = +process.env.PORT || 3000;
const EDIT_KEY = process.env.EDIT_KEY || "";
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"));
/* BASE_PATH: everything (static files, /api, /ws, /models, /uploads) lives under this prefix, e.g. "/train"; empty = the root */
const BASE = (() => {
  const b = String(process.env.BASE_PATH || "").trim();
  if (!b || b === "/") return "";
  if (!/^\/[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)*\/?$/.test(b)) { console.error("BASE_PATH must look like /train"); process.exit(1); }
  return b.replace(/\/$/, "");
})();
/* SANDBOX: the training environment - its own data, smaller upload limits, "reset everything", a house model copied from the main environment */
const SANDBOX = /^(1|true|yes)$/i.test(process.env.SANDBOX || "");
const SEED_HOUSE = SANDBOX ? (process.env.SANDBOX_SEED_HOUSE || "") : "";
if (EDIT_KEY.length < 16) { console.error("EDIT_KEY is missing or too short (set it in .env)"); process.exit(1); }

const MAX_PEERS = 40, MAX_MODEL_BYTES = (SANDBOX ? 50 : 200) * 1024 * 1024, MAX_TEX_BYTES = (SANDBOX ? 10 : 15) * 1024 * 1024, MAX_ITEMS = 3000, MAX_MODELS = 300, MAX_THUMB_BYTES = 300 * 1024, MAX_THUMB_PX = 1024;
const UPLOADS = path.join(DATA_DIR, "uploads"), MODELS = path.join(DATA_DIR, "models"), TMP = path.join(DATA_DIR, "tmp");
const MAX_UNPACKED = (SANDBOX ? 250 : 1024) * 1024 * 1024;   // all the models of one .zip together, after unpacking
fs.mkdirSync(UPLOADS, { recursive: true }); fs.mkdirSync(MODELS, { recursive: true });
fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });   // leftovers of an unpacking that was killed

/* ---------------- storage ---------------- */
const db = new (require("better-sqlite3"))(path.join(DATA_DIR, "villa.db"));
db.pragma("journal_mode = WAL");
db.exec("CREATE TABLE IF NOT EXISTS docs(coll TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(coll,id))");
const q = {
  all: db.prepare("SELECT id,data FROM docs WHERE coll=?"),
  get: db.prepare("SELECT data FROM docs WHERE coll=? AND id=?"),
  put: db.prepare("INSERT INTO docs(coll,id,data) VALUES(?,?,?) ON CONFLICT(coll,id) DO UPDATE SET data=excluded.data"),
  del: db.prepare("DELETE FROM docs WHERE coll=? AND id=?"),
  count: db.prepare("SELECT COUNT(*) n FROM docs WHERE coll=?"),
};
const getDoc = (c, id) => { const r = q.get.get(c, id); return r ? JSON.parse(r.data) : null; };
const putDoc = (c, id, d) => q.put.run(c, id, JSON.stringify(d));
const collection = c => Object.fromEntries(q.all.all(c).map(r => [r.id, JSON.parse(r.data)]));

const house = require("./house").createHouse({
  modelsDir: MODELS, seedFile: SEED_HOUSE && fs.existsSync(SEED_HOUSE) ? SEED_HOUSE : path.join(__dirname, "..", "seed", "villa.glb"), getDoc, putDoc, broadcast: m => broadcast(m),
});

/* ---------------- validation ---------------- */
const HEX = /^#[0-9a-f]{6}$/;
const FINISH = new Set(["matte", "satin", "gloss", "metal"]);
const BUILTIN = new Set(["sofa", "armchair", "bed160", "bed90", "nightstand", "wardrobe", "dining", "chair", "coffee", "tv", "desk", "rug", "plant", "lamp", "lounger"]);
const isObj = v => v && typeof v === "object" && !Array.isArray(v);
const clean = (v, max = 60) => typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "";
const fin = v => v == null ? null : (FINISH.has(v) ? v : undefined);
const num = (v, lim = 200) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= lim;
const vec3 = v => Array.isArray(v) && v.length === 3 && v.every(x => num(x, 1000));
const bad = () => { throw new Error("invalid"); };
let textures = null; // set once the app exists (server/textures.js)
const texDoc = v => textures.texDoc(v);

const ID = /^[a-z0-9]{6,20}$/;
const POS_LIM = 200, SCALE_MIN = 0.01, SCALE_MAX = 100;
function itemDoc(d, by) {
  if (!isObj(d)) bad();
  const out = {};
  if (d.type === "builtin") { if (!BUILTIN.has(d.key)) bad(); out.type = "builtin"; out.key = d.key; }
  else if (d.type === "model") { if (typeof d.model !== "string" || !ID.test(d.model) || !getDoc("models", d.model)) bad(); out.type = "model"; out.model = d.model; }
  else bad();
  for (const k of ["x", "y", "z"]) { if (!num(d[k], POS_LIM)) bad(); out[k] = d[k]; }
  /* rotation (rad, three.js frame: y is up) and scale per axis; the pre-transform fields r (= ry) and s (uniform) are still accepted */
  const rot = (v, dflt) => v == null ? dflt : (num(v, 1000) ? v : bad());
  /* a negative scale is a mirror image; its size must still be within 0.01..100 */
  const scl = (v, dflt) => v == null ? dflt : (num(v, SCALE_MAX) && Math.abs(v) >= SCALE_MIN ? v : bad());
  out.rx = rot(d.rx, 0); out.ry = rot(d.ry, rot(d.r, 0)); out.rz = rot(d.rz, 0);
  const s0 = scl(d.s, 1);
  out.sx = scl(d.sx, s0); out.sy = scl(d.sy, s0); out.sz = scl(d.sz, s0);
  /* kept for older clients and a rollback: r is the yaw, s the height scale */
  out.r = out.ry; out.s = Math.abs(out.sy);
  if (d.color != null) { if (typeof d.color !== "string" || !HEX.test(d.color)) bad(); out.color = d.color; }
  const f = fin(d.finish); if (f === undefined) bad(); out.finish = f;
  const tex = texDoc(d.tex); if (tex) out.tex = tex;
  out.by = by; out.at = Date.now();
  return out;
}
/* items saved before the transforms existed have r (yaw) and s (uniform scale) only: read them as the new fields, the stored row is left alone */
function itemOut(d) {
  const s = d.s == null ? 1 : d.s;
  return { ...d, rx: d.rx == null ? 0 : d.rx, ry: d.ry == null ? (d.r || 0) : d.ry, rz: d.rz == null ? 0 : d.rz,
    sx: d.sx == null ? s : d.sx, sy: d.sy == null ? s : d.sy, sz: d.sz == null ? s : d.sz };
}
function paintDoc(d, by) {
  if (!isObj(d) || typeof d.color !== "string" || !HEX.test(d.color)) bad();
  const name = clean(d.name); if (!name) bad();
  const f = fin(d.finish); if (f === undefined) bad();
  const tex = texDoc(d.tex);
  return { name, color: d.color, finish: f, ...(tex ? { tex } : {}), by, at: Date.now() };
}
function partDoc(d, by) {
  if (!isObj(d) || typeof d.color !== "string" || !HEX.test(d.color)) bad();
  const key = clean(d.key, 70); if (!/^(group|piece):.{1,60}$/.test(key)) bad();
  const f = fin(d.finish); if (f === undefined) bad();
  const tex = texDoc(d.tex);
  return { key, color: d.color, finish: f, ...(tex ? { tex } : {}), by, at: Date.now() };
}

/* ---------------- mutations (shared by ws handlers) ---------------- */
const idOk = (id, re) => typeof id === "string" && re.test(id);
const MUT = {
  "paint.set": (m, p) => { if (!idOk(m.id, /^m[0-9a-f]{1,8}$/)) bad(); const doc = paintDoc(m.doc, p.uid); putDoc("paint", m.id, doc); return { t: "paint.set", id: m.id, doc }; },
  "paint.reset": m => { if (!idOk(m.id, /^m[0-9a-f]{1,8}$/)) bad(); q.del.run("paint", m.id); return { t: "paint.reset", id: m.id }; },
  "part.set": (m, p) => { if (!idOk(m.id, /^p[0-9a-f]{1,8}$/)) bad(); const doc = partDoc(m.doc, p.uid); putDoc("parts", m.id, doc); return { t: "part.set", id: m.id, doc }; },
  "part.reset": m => { if (!idOk(m.id, /^p[0-9a-f]{1,8}$/)) bad(); q.del.run("parts", m.id); return { t: "part.reset", id: m.id }; },
  "item.set": (m, p) => {
    if (!idOk(m.id, ID)) bad();
    if (!getDoc("items", m.id) && q.count.get("items").n >= MAX_ITEMS) bad();
    const doc = itemDoc(m.doc, p.uid); putDoc("items", m.id, doc); return { t: "item.set", id: m.id, doc };
  },
  /* a group moved / scaled / deleted in one gesture: all or nothing, one broadcast (the ws frame limit allows about 40 items) */
  "items.set": (m, p) => {
    if (!Array.isArray(m.items) || !m.items.length || m.items.length > 40) bad();
    const ids = m.items.map(e => isObj(e) && e.id); if (!ids.every(i => idOk(i, ID)) || new Set(ids).size !== ids.length) bad();
    const fresh = ids.filter(i => !getDoc("items", i)).length;
    if (fresh && q.count.get("items").n + fresh > MAX_ITEMS) bad();
    const docs = m.items.map(e => [e.id, itemDoc(e.doc, p.uid)]);
    for (const [id, doc] of docs) putDoc("items", id, doc);
    return { t: "items.set", items: docs.map(([id, doc]) => ({ id, doc })) };
  },
  "items.delete": m => {
    if (!Array.isArray(m.ids) || !m.ids.length || m.ids.length > 100 || !m.ids.every(i => idOk(i, ID))) bad();
    for (const i of m.ids) q.del.run("items", i);
    return { t: "items.delete", ids: m.ids };
  },
  "item.delete": m => { if (!idOk(m.id, ID)) bad(); q.del.run("items", m.id); return { t: "item.delete", id: m.id }; },
  "swatches.set": (m, p) => {
    if (!Array.isArray(m.colors) || m.colors.length > 40 || !m.colors.every(c => typeof c === "string" && HEX.test(c))) bad();
    const doc = { colors: [...new Set(m.colors)], by: p.uid, at: Date.now() }; putDoc("swatches", "project", doc); return { t: "swatches.set", doc };
  },
};

/* ---------------- http ---------------- */
const root = require("fastify")({ logger: { level: "warn" }, trustProxy: true, bodyLimit: 64 * 1024 });
const sha = s => crypto.createHash("sha256").update(String(s)).digest();
const keyOk = k => typeof k === "string" && k.length < 200 && crypto.timingSafeEqual(sha(k), sha(EDIT_KEY));

/* all routes are registered inside one plugin that carries the BASE_PATH prefix (the body is not re-indented on purpose: the plugin ends before the websocket section) */
root.register(async function routes(app) {
app.addHook("onSend", async (req, reply) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("Referrer-Policy", "same-origin");
  if (req.url.startsWith(BASE + "/models/")) reply.header("Cache-Control", "no-cache");
  if ((reply.getHeader("content-type") || "").startsWith("text/html"))
    reply.header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' ws: wss: data: blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
});

/* index.html is rendered per request: absolute paths get the prefix, <meta> tells the client where it lives and which environment it is */
const INDEX_FILE = path.join(__dirname, "..", "public", "index.html");
function renderIndex() {
  let h = fs.readFileSync(INDEX_FILE, "utf8");
  h = h.replace(/(\s(?:src|href)=")\/(?!\/)/g, "$1" + BASE + "/");
  const meta = `<meta name="base-path" content="${BASE}">` + (SANDBOX ? `<meta name="sandbox" content="1">` : "") +
    `<meta name="max-model-mb" content="${MAX_MODEL_BYTES / 1048576}"><meta name="max-texture-mb" content="${MAX_TEX_BYTES / 1048576}">`;
  h = h.replace(/(<meta charset="utf-8">)/, "$1\n" + meta);
  if (SANDBOX) h = h.replace(/<title>[^<]*<\/title>/, "<title>Тренировка — Вилла Sunset Beach</title>");
  return h;
}
const sendIndex = async (req, reply) => reply.header("Content-Type", "text/html; charset=utf-8").header("Cache-Control", "no-cache").send(renderIndex());
app.get("/", { prefixTrailingSlash: "slash" }, sendIndex);
app.get("/index.html", sendIndex);
app.register(require("@fastify/static"), { root: path.join(__dirname, "..", "public"), maxAge: 0, index: false });
app.register(require("@fastify/static"), { root: UPLOADS, prefix: "/uploads/", decorateReply: false, maxAge: "365d", immutable: true, index: false, dotfiles: "deny" });
app.register(require("@fastify/static"), { root: MODELS, prefix: "/models/", decorateReply: false, cacheControl: false, index: false, dotfiles: "deny" });
app.register(require("@fastify/multipart"), { limits: { fileSize: MAX_MODEL_BYTES, files: 1, fields: 6, fieldSize: 1024 } });

/* models saved before thumbnails existed have no thumb fields: expose them as null without touching the stored rows */
const modelOut = d => ({ thumb: null, thumbAt: null, folder: null, ...d });
/* light copies of the models (server/compress.js); COMPRESS=off switches the whole feature off */
const compress = require("./compress").createCompressor({
  UPLOADS, getDoc, putDoc, collection, broadcast: m => broadcast(m), modelOut, enabled: !/^(0|off|false|no)$/i.test(process.env.COMPRESS || "on"),
});
/* models stored before compression existed (or whose compression never ran) are packed one by one, a few seconds after start-up */
app.addHook("onReady", async () => { setTimeout(() => compress.backfill(), process.env.COMPRESS_START_DELAY_MS != null ? +process.env.COMPRESS_START_DELAY_MS : 4000).unref(); });
const models = () => Object.fromEntries(Object.entries(collection("models")).map(([id, d]) => [id, modelOut(d)]));
const snapshot = () => ({ house: house.meta, paint: collection("paint"), parts: collection("parts"), items: Object.fromEntries(Object.entries(collection("items")).map(([id, d]) => [id, itemOut(d)])), models: models(), compress: compress.status(), folders: folders.all(), textures: textures.list(), swatches: getDoc("swatches", "project") || { colors: [] } });
app.get("/api/state", async (req, reply) => { reply.header("Cache-Control", "no-store"); return snapshot(); });
app.get("/api/health", async () => ({ ok: true, peers: peers.size, sandbox: SANDBOX }));

/* ---- house model (villa.glb) ---- */
const forbidden = (req, reply) => { if (keyOk(req.headers["x-edit-key"])) return false; reply.code(403).send({ error: "forbidden" }); return true; };
app.get("/api/house", async (req, reply) => {
  reply.header("Cache-Control", "no-store");
  const out = { v: house.meta.v, at: house.meta.at };
  if (keyOk(req.headers["x-edit-key"])) out.history = house.history();
  return out;
});
app.post("/api/house", async (req, reply) => {
  if (forbidden(req, reply)) return;
  const part = await req.file();
  if (!part) return reply.code(400).send({ error: "no_file" });
  const tmp = house.tmpName();
  try {
    await pipeline(part.file, fs.createWriteStream(tmp));
    if (part.file.truncated) { fs.rmSync(tmp, { force: true }); return reply.code(413).send({ error: "too_large" }); }
    if (!house.validate(tmp)) { fs.rmSync(tmp, { force: true }); return reply.code(400).send({ error: "not_glb" }); }
    /* lossless only (unused data dropped, meshopt): no mesh simplification, no renames - the paint documents hang on mesh and material names. The upload is kept as villa.orig.glb. */
    let lite = null;
    if (compress.enabled) {
      const out = house.tmpName();
      try {
        await compress.runWorker(tmp, out, "house");
        if (house.validate(out) && fs.statSync(out).size < fs.statSync(tmp).size) lite = out; else fs.rmSync(out, { force: true });
      } catch (e) { fs.rmSync(out, { force: true }); console.warn("house compression failed, the original is used: " + (e && e.message)); }
    }
    const sizeOrig = fs.statSync(tmp).size, sizeLite = lite ? fs.statSync(lite).size : sizeOrig;
    const m = lite ? house.install(lite, tmp) : house.install(tmp);
    return { ok: true, v: m.v, at: m.at, sizeOrig, sizeLite, compressed: !!lite };
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    req.log.warn(e);
    return reply.code(e.code === "FST_REQ_FILE_TOO_LARGE" ? 413 : 400).send({ error: "upload_failed" });
  }
});
app.post("/api/house/restore", async (req, reply) => {
  if (forbidden(req, reply)) return;
  const m = house.restore(req.body && req.body.name);
  if (!m) return reply.code(404).send({ error: "not_found" });
  return { ok: true, v: m.v, at: m.at };
});
/* used by scripts/house-reload.js: announce a villa.glb that was put into the volume by hand */
app.post("/api/house/reload", async (req, reply) => {
  if (forbidden(req, reply)) return;
  const r = house.reload(req.body && req.body.from);
  if (r.error) return reply.code(400).send({ error: r.error });
  return { ok: true, v: r.meta.v, at: r.meta.at };
});

/* at most 2 uploads at a time per editor (the browser's queue sends 2); a third gets 429 + Retry-After and the client repeats it by itself */
const MAX_UPLOADS_PER_EDITOR = 2, uploadSlots = new Map();
const uidOf = req => clean(req.headers["x-uid"], 32).replace(/[^A-Za-z0-9]/g, "") || "editor";
function takeSlot(uid) {
  const n = uploadSlots.get(uid) || 0; if (n >= MAX_UPLOADS_PER_EDITOR) return null;
  uploadSlots.set(uid, n + 1); let freed = false;
  return () => { if (freed) return; freed = true; const k = (uploadSlots.get(uid) || 1) - 1; if (k) uploadSlots.set(uid, k); else uploadSlots.delete(uid); };
}
/* a big body that nobody will read is not worth draining: the connection is closed (the client sees a dropped upload and tries again), a small one is simply discarded */
const busy = (reply, req) => { reply.code(429).header("Retry-After", "2"); if (!(+req.headers["content-length"] <= 1048576)) reply.header("Connection", "close"); return reply.send({ error: "busy" }); };

/* a complete .glb in a temp file -> a model of the library. {error} or {skipped, id} or {id, doc, replaced}.
   replaceId: the model whose file is replaced (same id, so the scene keeps its items); dup "skip" / "replace": what to do with a model of the same name and size in the same folder. */
function storeModel(tmp, { name, folder, by, replaceId, dup, thumbBy }) {
  const refuse = error => { fs.rmSync(tmp, { force: true }); return { error }; };
  const fd = fs.openSync(tmp, "r"), head = Buffer.alloc(12); fs.readSync(fd, head, 0, 12, 0); fs.closeSync(fd);
  const size = fs.statSync(tmp).size;
  if (head.toString("latin1", 0, 4) !== "glTF" || head.readUInt32LE(4) !== 2 || head.readUInt32LE(8) !== size) return refuse("not_glb");
  let old = null;
  if (replaceId) { old = idOk(replaceId, ID) && getDoc("models", replaceId); if (!old) return refuse("not_found"); }
  else if (dup === "skip" || dup === "replace") {
    const hit = Object.entries(collection("models")).find(([, d]) => (d.folder || null) === (folder || null) && d.name === name && d.sizeBytes === size);
    if (hit) { if (dup === "skip") { fs.rmSync(tmp, { force: true }); return { skipped: true, id: hit[0] }; } replaceId = hit[0]; old = hit[1]; }
  }
  if (!old && q.count.get("models").n >= MAX_MODELS) return refuse("too_many_models");
  const id = old ? replaceId : crypto.randomBytes(8).toString("hex"), file = crypto.randomBytes(8).toString("hex") + ".orig.glb";
  fs.renameSync(tmp, path.join(UPLOADS, file));
  const orig = { origFile: file, sizeOrig: size };   // `file` is what participants download: the upload itself until the light copy is ready
  const pend = thumbBy ? { thumbBy: by, thumbPendingAt: Date.now() } : {};
  if (old) {   // the id stays; the new file gets a new name (files are served immutable), the old file and thumbnail go
    const { dims, thumbBy: _a, thumbPendingAt: _b, ...rest } = old;
    for (const k of ["liteFile", "sizeLite", "trisOrig", "trisLite", "compressedAt", "compressError", "useOrig"]) delete rest[k];
    const doc = { ...rest, file, ...orig, sizeBytes: size, thumb: null, thumbAt: null, ...pend };
    putDoc("models", id, doc);
    for (const f of compress.filesOf(old)) fs.rmSync(path.join(UPLOADS, path.basename(f)), { force: true }); rmThumbs(id);
    broadcast({ t: "model.updated", id, doc: modelOut(doc) });
    compress.enqueue(id);
    return { id, doc: modelOut(doc), replaced: true };
  }
  const doc = { name, file, ...orig, sizeBytes: size, by, at: Date.now(), thumb: null, thumbAt: null, folder: folder && folders.exists(folder) ? folder : null, ...pend };
  putDoc("models", id, doc);
  broadcast({ t: "model.added", id, doc });
  compress.enqueue(id);
  return { id, doc };
}
const STORE_STATUS = { not_glb: 400, not_found: 404, too_many_models: 409 };

/* ?replace=<id> replaces that model's file; ?preview=1 says the uploader will send the thumbnail itself (the other editors wait for it) */
app.post("/api/models", async (req, reply) => {
  if (!keyOk(req.headers["x-edit-key"])) return reply.code(403).send({ error: "forbidden" });
  const replace = typeof req.query.replace === "string" ? req.query.replace : "";
  if (!replace && q.count.get("models").n >= MAX_MODELS) return reply.code(409).send({ error: "too_many_models" });
  const by = uidOf(req), release = takeSlot(by);
  if (!release) return busy(reply, req);
  const tmp = path.join(UPLOADS, crypto.randomBytes(8).toString("hex") + ".part");
  try {
    const part = await req.file();
    if (!part) return reply.code(400).send({ error: "no_file" });
    await pipeline(part.file, fs.createWriteStream(tmp));
    if (part.file.truncated) { fs.rmSync(tmp, { force: true }); return reply.code(413).send({ error: "too_large" }); }
    const f = part.fields.name;
    const name = clean(f && f.value) || clean(String(part.filename || "").replace(/\.glb$/i, "")) || "Модель";
    const ff = part.fields.folder, folder = ff && typeof ff.value === "string" && folders.exists(ff.value) ? ff.value : null;
    const r = storeModel(tmp, { name, folder, by, replaceId: replace, thumbBy: req.query.preview === "1" });
    if (r.error) return reply.code(STORE_STATUS[r.error] || 400).send({ error: r.error });
    return { id: r.id, doc: r.doc };
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    req.log.warn(e);
    return reply.code(e.code === "FST_REQ_FILE_TOO_LARGE" ? 413 : 400).send({ error: "upload_failed" });
  } finally { release(); }
});

/* ---- a .zip of models: unpacked in the background, one job on the server at a time. ?folder=<id>&dup=skip|copy|replace ---- */
const bulk = require("./bulk").createBulk({
  TMP, maxModelBytes: MAX_MODEL_BYTES, maxUnpacked: MAX_UNPACKED, maxModels: MAX_MODELS, count: () => q.count.get("models").n,
  folders: { ensurePath: (...a) => folders.ensurePath(...a) }, storeModel, broadcast: m => broadcast(m), clean,
});
const ZIP_ERR = { bad_zip: 400, zip64: 400, zip_unsafe: 400, too_many_files: 400, too_large: 413, encrypted: 400, method: 400 };
app.post("/api/models/zip", async (req, reply) => {
  if (!keyOk(req.headers["x-edit-key"])) return reply.code(403).send({ error: "forbidden" });
  const by = uidOf(req);
  if (bulk.busy()) return busy(reply, req);
  const release = takeSlot(by);
  if (!release) return busy(reply, req);
  const tmp = path.join(TMP, crypto.randomBytes(8).toString("hex") + ".zip");
  try {
    const part = await req.file();
    if (!part) return reply.code(400).send({ error: "no_file" });
    await pipeline(part.file, fs.createWriteStream(tmp));
    if (part.file.truncated) { fs.rmSync(tmp, { force: true }); return reply.code(413).send({ error: "too_large" }); }
    if (bulk.busy()) { fs.rmSync(tmp, { force: true }); return busy(reply, req); }   // another one started while this one was uploading
    const folder = typeof req.query.folder === "string" && folders.exists(req.query.folder) ? req.query.folder : null;
    const dup = ["skip", "copy", "replace"].includes(req.query.dup) ? req.query.dup : "skip";
    try { return reply.code(202).send(bulk.start(tmp, { folder, by, dup })); }
    catch (e) { if (e.code && ZIP_ERR[e.code]) return reply.code(ZIP_ERR[e.code]).send({ error: e.code }); throw e; }
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    req.log.warn(e);
    return reply.code(e.code === "FST_REQ_FILE_TOO_LARGE" ? 413 : 400).send({ error: "upload_failed" });
  } finally { release(); }
});
app.get("/api/jobs/:id", async (req, reply) => {
  if (!keyOk(req.headers["x-edit-key"])) return reply.code(403).send({ error: "forbidden" });
  const j = bulk.get(req.params.id); if (!j) return reply.code(404).send({ error: "not_found" });
  reply.header("Cache-Control", "no-store"); return j;
});

/* ---- thumbnails: raw image body (PNG / WebP) -> uploads/<id>.thumb.<ext> ---- */
app.addContentTypeParser(["image/webp", "image/png"], { parseAs: "buffer", bodyLimit: MAX_THUMB_BYTES }, (req, body, done) => done(null, body));
/* returns {ext,w,h} for a well-formed PNG or WebP, otherwise null */
function sniffImage(b) {
  if (b.length < 30) return null;
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && b.toString("latin1", 12, 16) === "IHDR")
    return { ext: "png", w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP" && b.readUInt32LE(4) === b.length - 8) {
    const t = b.toString("latin1", 12, 16);
    if (t === "VP8X") return { ext: "webp", w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (t === "VP8L" && b[20] === 0x2f) { const v = b.readUInt32LE(21); return { ext: "webp", w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff) }; }
    if (t === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return { ext: "webp", w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  }
  return null;
}
const THUMB_EXT = ["webp", "png"];
const rmThumbs = id => { for (const e of THUMB_EXT) fs.rmSync(path.join(UPLOADS, id + ".thumb." + e), { force: true }); };
const dimMm = v => { const n = Number(v); return Number.isFinite(n) && n > 0 && n <= 100000 ? Math.round(n) : null; };
app.post("/api/models/:id/thumb", { bodyLimit: MAX_THUMB_BYTES }, async (req, reply) => {
  if (!keyOk(req.headers["x-edit-key"])) return reply.code(403).send({ error: "forbidden" });
  const { id } = req.params; const doc = idOk(id, ID) && getDoc("models", id);
  if (!doc) return reply.code(404).send({ error: "not_found" });
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || !buf.length) return reply.code(400).send({ error: "no_image" });
  if (buf.length > MAX_THUMB_BYTES) return reply.code(413).send({ error: "too_large" });
  const img = sniffImage(buf);
  if (!img || !img.w || !img.h || img.w > MAX_THUMB_PX || img.h > MAX_THUMB_PX) return reply.code(400).send({ error: "bad_image" });
  const file = id + ".thumb." + img.ext, tmp = path.join(UPLOADS, id + ".thumb.part");
  fs.writeFileSync(tmp, buf); fs.renameSync(tmp, path.join(UPLOADS, file));
  for (const e of THUMB_EXT) if (e !== img.ext) fs.rmSync(path.join(UPLOADS, id + ".thumb." + e), { force: true });
  const w = dimMm(req.query.w), d = dimMm(req.query.d), h = dimMm(req.query.h);
  const next = { ...doc, thumb: file, thumbAt: Date.now() };
  delete next.thumbBy; delete next.thumbPendingAt;
  if (w && d && h) next.dims = [w, d, h];
  putDoc("models", id, next);
  broadcast({ t: "model.updated", id, doc: modelOut(next) });
  return { ok: true, doc: modelOut(next) };
});
app.patch("/api/models/:id", async (req, reply) => {
  if (!keyOk(req.headers["x-edit-key"])) return reply.code(403).send({ error: "forbidden" });
  const { id } = req.params; const doc = idOk(id, ID) && getDoc("models", id);
  if (!doc) return reply.code(404).send({ error: "not_found" });
  const b = isObj(req.body) ? req.body : {}, next = { ...doc };
  if (b.name !== undefined) { const name = clean(b.name); if (!name) return reply.code(400).send({ error: "invalid" }); next.name = name; }
  if (b.folder !== undefined) {
    if (b.folder !== null && !(typeof b.folder === "string" && folders.exists(b.folder))) return reply.code(404).send({ error: "not_found" });
    next.folder = b.folder;
  }
  /* which copy the participants download: the original instead of the compressed one (in case compression spoiled the model) */
  if (b.useOrig !== undefined) {
    if (typeof b.useOrig !== "boolean") return reply.code(400).send({ error: "invalid" });
    if (!doc.liteFile) return reply.code(409).send({ error: "not_compressed" });
    next.useOrig = b.useOrig; next.file = b.useOrig ? doc.origFile : doc.liteFile;
  }
  if (b.name === undefined && b.folder === undefined && b.useOrig === undefined) return reply.code(400).send({ error: "invalid" });
  putDoc("models", id, next);
  broadcast({ t: "model.updated", id, doc: modelOut(next) });
  return { ok: true, doc: modelOut(next) };
});

/* compress again from the original (also after an error) */
app.post("/api/models/:id/recompress", async (req, reply) => {
  if (!keyOk(req.headers["x-edit-key"])) return reply.code(403).send({ error: "forbidden" });
  const { id } = req.params; const doc = idOk(id, ID) && getDoc("models", id);
  if (!doc) return reply.code(404).send({ error: "not_found" });
  if (!compress.enabled) return reply.code(409).send({ error: "compression_off" });
  if (doc.compressError) { const next = { ...doc }; delete next.compressError; putDoc("models", id, next); broadcast({ t: "model.updated", id, doc: modelOut(next) }); }
  compress.enqueue(id, { force: true });
  return reply.code(202).send({ ok: true });
});

app.delete("/api/models/:id", async (req, reply) => {
  if (!keyOk(req.headers["x-edit-key"])) return reply.code(403).send({ error: "forbidden" });
  const { id } = req.params; const doc = idOk(id, ID) && getDoc("models", id);
  if (!doc) return reply.code(404).send({ error: "not_found" });
  deleteModel(id, doc);
  return { ok: true };
});
function deleteModel(id, doc) {
  for (const [iid, it] of Object.entries(collection("items"))) if (it.model === id) { q.del.run("items", iid); broadcast({ t: "item.delete", id: iid }); }
  q.del.run("models", id);
  for (const f of compress.filesOf(doc)) fs.rmSync(path.join(UPLOADS, path.basename(f)), { force: true });
  rmThumbs(id);
  broadcast({ t: "model.deleted", id });
}

/* ---- folders of the model library ---- */
const folders = require("./folders").createFolders({
  app, getDoc, putDoc, del: (c, id) => q.del.run(c, id), collection, broadcast: m => broadcast(m), keyOk, idOk, ID, clean, isObj, modelOut, deleteModel,
});

/* ---- texture library ---- */
textures = require("./textures").createTextures({
  app, UPLOADS, getDoc, putDoc, del: (c, id) => q.del.run(c, id), collection, count: c => q.count.get(c).n, broadcast: m => broadcast(m),
  keyOk, idOk, ID, clean, isObj, num, HEX, maxBytes: MAX_TEX_BYTES,
});

/* ---- training environment only: these routes do not exist elsewhere (404) ---- */
if (SANDBOX) {
  app.post("/api/sandbox/reset", async (req, reply) => {
    if (forbidden(req, reply)) return;
    resetSandbox(!!(isObj(req.body) && req.body.library === true));
    return { ok: true };
  });
  /* only reads the main environment's file (SANDBOX_SEED_HOUSE, mounted read-only) */
  app.post("/api/sandbox/pull-house", async (req, reply) => {
    if (forbidden(req, reply)) return;
    if (!SEED_HOUSE || !fs.existsSync(SEED_HOUSE)) return reply.code(404).send({ error: "no_source" });
    const tmp = house.tmpName();
    try {
      fs.copyFileSync(SEED_HOUSE, tmp);
      if (!house.validate(tmp)) { fs.rmSync(tmp, { force: true }); return reply.code(400).send({ error: "not_glb" }); }
      const m = house.install(tmp);
      return { ok: true, v: m.v, at: m.at };
    } catch (e) { fs.rmSync(tmp, { force: true }); req.log.warn(e); return reply.code(500).send({ error: "copy_failed" }); }
  });
}
}, { prefix: BASE });
if (BASE) root.get(BASE, (req, reply) => reply.redirect(BASE + "/" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""), 301));

/* ---------------- training environment: reset and schedule ---------------- */
function resetSandbox(library) {
  db.transaction(() => {
    for (const c of ["paint", "parts", "items", "swatches"]) db.prepare("DELETE FROM docs WHERE coll=?").run(c);
    if (library) for (const c of ["models", "folders", "textures"]) db.prepare("DELETE FROM docs WHERE coll=?").run(c);
  })();
  if (library) for (const n of fs.readdirSync(UPLOADS)) fs.rmSync(path.join(UPLOADS, n), { recursive: true, force: true });
  broadcast({ t: "sandbox.reset", library });
}
/* five-field cron (minute hour day-of-month month day-of-week; *, lists, ranges, steps) in the container's time zone */
function cronMatcher(expr) {
  const f = String(expr).trim().split(/\s+/);
  if (f.length !== 5) throw new Error("SANDBOX_RESET_CRON needs 5 fields");
  const lims = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
  const sets = f.map((part, i) => {
    const [lo, hi] = lims[i], set = new Set();
    for (const item of part.split(",")) {
      const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(item); if (!m) throw new Error("bad cron field " + part);
      let a = lo, b = hi;
      if (m[1] !== "*") { const r = m[1].split("-").map(Number); a = r[0]; b = r.length > 1 ? r[1] : (m[2] ? hi : r[0]); }
      const step = m[2] ? +m[2] : 1;
      if (!step || a < lo || b > hi || a > b) throw new Error("bad cron field " + part);
      for (let v = a; v <= b; v += step) set.add(v);
    }
    return set;
  });
  if (sets[4].has(7)) sets[4].add(0);
  return d => sets[0].has(d.getMinutes()) && sets[1].has(d.getHours()) && sets[2].has(d.getDate()) && sets[3].has(d.getMonth() + 1) && sets[4].has(d.getDay());
}
if (SANDBOX && process.env.SANDBOX_RESET_CRON) {
  let due; try { due = cronMatcher(process.env.SANDBOX_RESET_CRON); } catch (e) { console.error(e.message); process.exit(1); }
  const withLibrary = /^(1|true|yes)$/i.test(process.env.SANDBOX_RESET_LIBRARY || "");
  let lastMinute = -1;
  setInterval(() => {
    const now = new Date(), minute = Math.floor(now.getTime() / 60000);
    if (minute === lastMinute || !due(now)) return;
    lastMinute = minute;
    try { resetSandbox(withLibrary); console.log("sandbox reset on schedule" + (withLibrary ? " (library too)" : "")); } catch (e) { console.error("sandbox reset failed", e); }
  }, 15000).unref();
}

/* ---------------- websocket ---------------- */
const { WebSocketServer } = require("ws");
const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
const peers = new Map(); // peerId -> peer
const send = (ws, m) => { if (ws.readyState === 1) ws.send(typeof m === "string" ? m : JSON.stringify(m)); };
function broadcast(m, except) { const s = JSON.stringify(m); for (const p of peers.values()) if (p !== except && p.hello) send(p.ws, s); }
const peerList = () => [...peers.values()].filter(p => p.hello).map(p => ({ peerId: p.id, uid: p.uid, name: p.name, color: p.color, presence: p.presence }));
const sendPeers = () => broadcast({ t: "peers", list: peerList() });

function cleanPresence(d, canEdit) {
  if (!isObj(d)) return null;
  const o = { mode: d.mode === "walk" ? "walk" : "orbit" };
  if (vec3(d.p)) o.p = d.p;
  if (vec3(d.t)) o.t = d.t;
  if (num(d.yaw, 1000)) o.yaw = d.yaw;
  o.sel = typeof d.sel === "string" ? d.sel.slice(0, 80) : null;
  o.drag = canEdit && isObj(d.drag) && idOk(d.drag.id, ID) && vec3(d.drag.p) ? { id: d.drag.id, p: d.drag.p } : null;
  /* live transform of one or several items: [{id, p, r:[rx,ry,rz], s:[sx,sy,sz]}]; nothing is stored, the final state comes as item.set */
  o.xf = null;
  if (canEdit && Array.isArray(d.xf) && d.xf.length <= 60) {
    const list = d.xf.filter(e => isObj(e) && idOk(e.id, ID) && vec3(e.p) && vec3(e.r) && vec3(e.s)).map(e => ({ id: e.id, p: e.p, r: e.r, s: e.s }));
    if (list.length) o.xf = list;
  }
  return o;
}

wss.on("connection", (ws, req) => {
  const peer = { ws, id: crypto.randomBytes(6).toString("hex"), hello: false, canEdit: false, alive: true, tokens: 100, tAt: Date.now(), strikes: 0, lastPres: 0, presence: null };
  peers.set(peer.id, peer);
  const helloTimer = setTimeout(() => { if (!peer.hello) ws.close(4000, "no hello"); }, 5000);
  ws.on("pong", () => { peer.alive = true; });
  ws.on("message", (raw, isBin) => {
    if (isBin) return;
    const now = Date.now();
    peer.tokens = Math.min(100, peer.tokens + (now - peer.tAt) * 0.06); peer.tAt = now;
    if (peer.tokens < 1) { if (++peer.strikes > 200) ws.terminate(); return; }
    peer.tokens -= 1;
    let m; try { m = JSON.parse(raw.toString()); } catch { return; }
    if (!isObj(m) || typeof m.t !== "string") return;
    if (m.t === "hello") {
      const first = !peer.hello;
      peer.name = clean(m.name) || "Гость";
      peer.color = typeof m.color === "string" && HEX.test(m.color) ? m.color : "#2f6f62";
      peer.uid = typeof m.uid === "string" && /^[A-Za-z0-9]{8,32}$/.test(m.uid) ? m.uid : crypto.randomBytes(8).toString("hex");
      if (first) { peer.canEdit = typeof m.key === "string" && keyOk(m.key); peer.hello = true; clearTimeout(helloTimer); send(ws, { t: "welcome", peerId: peer.id, uid: peer.uid, canEdit: peer.canEdit }); }
      sendPeers(); return;
    }
    if (!peer.hello) return;
    if (m.t === "presence") {
      if (now - peer.lastPres < 60) return;
      peer.lastPres = now;
      const d = cleanPresence(m.d, peer.canEdit); if (!d) return;
      peer.presence = d; broadcast({ t: "presence", peerId: peer.id, d }, peer); return;
    }
    const fn = MUT[m.t]; if (!fn) return;
    if (!peer.canEdit) return send(ws, { t: "error", code: "forbidden", ref: m.t });
    try { broadcast(fn(m, peer)); } catch (e) { if (e.message !== "invalid") root.log.error(e); send(ws, { t: "error", code: "invalid", ref: m.t }); }
  });
  ws.on("close", () => { clearTimeout(helloTimer); peers.delete(peer.id); sendPeers(); });
  ws.on("error", () => ws.terminate());
});

setInterval(() => {
  for (const p of peers.values()) { if (!p.alive) { p.ws.terminate(); continue; } p.alive = false; try { p.ws.ping(); } catch {} }
}, 25000).unref();

root.server.on("upgrade", (req, socket, head) => {
  const reject = c => { socket.write(`HTTP/1.1 ${c}\r\nConnection: close\r\n\r\n`); socket.destroy(); };
  let url; try { url = new URL(req.url, "http://x"); } catch { return reject("400 Bad Request"); }
  if (url.pathname !== BASE + "/ws") return reject("404 Not Found");
  const origin = req.headers.origin;
  if (origin) { let ok = false; try { ok = new URL(origin).host === req.headers.host; } catch {} if (!ok) return reject("403 Forbidden"); }
  if (peers.size >= MAX_PEERS) return reject("503 Service Unavailable");
  wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req));
});

root.listen({ port: PORT, host: process.env.HOST || "0.0.0.0" }).then(() => console.log("villa-walk listening on " + PORT)).catch(e => { console.error(e); process.exit(1); });
const stop = () => { wss.clients.forEach(c => c.close(1001)); root.close().finally(() => { db.close(); process.exit(0); }); };
process.on("SIGTERM", stop); process.on("SIGINT", stop);
