"use strict";
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { pipeline } = require("stream/promises");
try { process.loadEnvFile(path.join(__dirname, "..", ".env")); } catch {}

const PORT = +process.env.PORT || 3000;
const EDIT_KEY = process.env.EDIT_KEY || "";
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"));
if (EDIT_KEY.length < 16) { console.error("EDIT_KEY is missing or too short (set it in .env)"); process.exit(1); }

const MAX_PEERS = 40, MAX_MODEL_BYTES = 30 * 1024 * 1024, MAX_ITEMS = 3000, MAX_MODELS = 300;
const UPLOADS = path.join(DATA_DIR, "uploads"), MODELS = path.join(DATA_DIR, "models");
fs.mkdirSync(UPLOADS, { recursive: true }); fs.mkdirSync(MODELS, { recursive: true });

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
  modelsDir: MODELS, seedFile: path.join(__dirname, "..", "seed", "villa.glb"), getDoc, putDoc, broadcast: m => broadcast(m),
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

const ID = /^[a-z0-9]{6,20}$/;
function itemDoc(d, by) {
  if (!isObj(d)) bad();
  const out = {};
  if (d.type === "builtin") { if (!BUILTIN.has(d.key)) bad(); out.type = "builtin"; out.key = d.key; }
  else if (d.type === "model") { if (typeof d.model !== "string" || !ID.test(d.model) || !getDoc("models", d.model)) bad(); out.type = "model"; out.model = d.model; }
  else bad();
  for (const k of ["x", "y", "z"]) { if (!num(d[k])) bad(); out[k] = d[k]; }
  out.r = d.r == null ? 0 : (num(d.r, 1000) ? d.r : bad());
  out.s = d.s == null ? 1 : (num(d.s, 100) && d.s > 0.01 ? d.s : bad());
  if (d.color != null) { if (typeof d.color !== "string" || !HEX.test(d.color)) bad(); out.color = d.color; }
  const f = fin(d.finish); if (f === undefined) bad(); out.finish = f;
  out.by = by; out.at = Date.now();
  return out;
}
function paintDoc(d, by) {
  if (!isObj(d) || typeof d.color !== "string" || !HEX.test(d.color)) bad();
  const name = clean(d.name); if (!name) bad();
  const f = fin(d.finish); if (f === undefined) bad();
  return { name, color: d.color, finish: f, by, at: Date.now() };
}
function partDoc(d, by) {
  if (!isObj(d) || typeof d.color !== "string" || !HEX.test(d.color)) bad();
  const key = clean(d.key, 70); if (!/^(group|piece):.{1,60}$/.test(key)) bad();
  const f = fin(d.finish); if (f === undefined) bad();
  return { key, color: d.color, finish: f, by, at: Date.now() };
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
  "item.delete": m => { if (!idOk(m.id, ID)) bad(); q.del.run("items", m.id); return { t: "item.delete", id: m.id }; },
  "swatches.set": (m, p) => {
    if (!Array.isArray(m.colors) || m.colors.length > 40 || !m.colors.every(c => typeof c === "string" && HEX.test(c))) bad();
    const doc = { colors: [...new Set(m.colors)], by: p.uid, at: Date.now() }; putDoc("swatches", "project", doc); return { t: "swatches.set", doc };
  },
};

/* ---------------- http ---------------- */
const app = require("fastify")({ logger: { level: "warn" }, trustProxy: true, bodyLimit: 64 * 1024 });
const sha = s => crypto.createHash("sha256").update(String(s)).digest();
const keyOk = k => typeof k === "string" && k.length < 200 && crypto.timingSafeEqual(sha(k), sha(EDIT_KEY));

app.addHook("onSend", async (req, reply) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("Referrer-Policy", "same-origin");
  if (req.url.startsWith("/models/")) reply.header("Cache-Control", "no-cache");
  if ((reply.getHeader("content-type") || "").startsWith("text/html"))
    reply.header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' ws: wss: data: blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
});

app.register(require("@fastify/static"), { root: path.join(__dirname, "..", "public"), maxAge: 0 });
app.register(require("@fastify/static"), { root: UPLOADS, prefix: "/uploads/", decorateReply: false, maxAge: "365d", immutable: true, index: false, dotfiles: "deny" });
app.register(require("@fastify/static"), { root: MODELS, prefix: "/models/", decorateReply: false, cacheControl: false, index: false, dotfiles: "deny" });
app.register(require("@fastify/multipart"), { limits: { fileSize: MAX_MODEL_BYTES, files: 1, fields: 4, fieldSize: 1024 } });

const snapshot = () => ({ house: house.meta, paint: collection("paint"), parts: collection("parts"), items: collection("items"), models: collection("models"), swatches: getDoc("swatches", "project") || { colors: [] } });
app.get("/api/state", async (req, reply) => { reply.header("Cache-Control", "no-store"); return snapshot(); });
app.get("/api/health", async () => ({ ok: true, peers: peers.size }));

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
    const m = house.install(tmp);
    return { ok: true, v: m.v, at: m.at };
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

app.post("/api/models", async (req, reply) => {
  if (!keyOk(req.headers["x-edit-key"])) return reply.code(403).send({ error: "forbidden" });
  if (q.count.get("models").n >= MAX_MODELS) return reply.code(409).send({ error: "too_many_models" });
  const part = await req.file();
  if (!part) return reply.code(400).send({ error: "no_file" });
  const id = crypto.randomBytes(8).toString("hex"), file = id + ".glb", tmp = path.join(UPLOADS, id + ".part");
  try {
    await pipeline(part.file, fs.createWriteStream(tmp));
    if (part.file.truncated) { fs.rmSync(tmp, { force: true }); return reply.code(413).send({ error: "too_large" }); }
    const fd = fs.openSync(tmp, "r"), head = Buffer.alloc(12); fs.readSync(fd, head, 0, 12, 0); fs.closeSync(fd);
    const size = fs.statSync(tmp).size;
    if (head.toString("latin1", 0, 4) !== "glTF" || head.readUInt32LE(4) !== 2 || head.readUInt32LE(8) !== size) { fs.rmSync(tmp, { force: true }); return reply.code(400).send({ error: "not_glb" }); }
    fs.renameSync(tmp, path.join(UPLOADS, file));
    const f = part.fields.name;
    const name = clean(f && f.value) || clean(String(part.filename || "").replace(/\.glb$/i, "")) || "Модель";
    const by = clean(req.headers["x-uid"], 32).replace(/[^A-Za-z0-9]/g, "") || "editor";
    const doc = { name, file, sizeBytes: size, by, at: Date.now() };
    putDoc("models", id, doc);
    broadcast({ t: "model.added", id, doc });
    return { id, doc };
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    req.log.warn(e);
    return reply.code(e.code === "FST_REQ_FILE_TOO_LARGE" ? 413 : 400).send({ error: "upload_failed" });
  }
});

app.delete("/api/models/:id", async (req, reply) => {
  if (!keyOk(req.headers["x-edit-key"])) return reply.code(403).send({ error: "forbidden" });
  const { id } = req.params; const doc = idOk(id, ID) && getDoc("models", id);
  if (!doc) return reply.code(404).send({ error: "not_found" });
  for (const [iid, it] of Object.entries(collection("items"))) if (it.model === id) { q.del.run("items", iid); broadcast({ t: "item.delete", id: iid }); }
  q.del.run("models", id);
  fs.rmSync(path.join(UPLOADS, path.basename(doc.file)), { force: true });
  broadcast({ t: "model.deleted", id });
  return { ok: true };
});

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
    try { broadcast(fn(m, peer)); } catch (e) { if (e.message !== "invalid") app.log.error(e); send(ws, { t: "error", code: "invalid", ref: m.t }); }
  });
  ws.on("close", () => { clearTimeout(helloTimer); peers.delete(peer.id); sendPeers(); });
  ws.on("error", () => ws.terminate());
});

setInterval(() => {
  for (const p of peers.values()) { if (!p.alive) { p.ws.terminate(); continue; } p.alive = false; try { p.ws.ping(); } catch {} }
}, 25000).unref();

app.server.on("upgrade", (req, socket, head) => {
  const reject = c => { socket.write(`HTTP/1.1 ${c}\r\nConnection: close\r\n\r\n`); socket.destroy(); };
  let url; try { url = new URL(req.url, "http://x"); } catch { return reject("400 Bad Request"); }
  if (url.pathname !== "/ws") return reject("404 Not Found");
  const origin = req.headers.origin;
  if (origin) { let ok = false; try { ok = new URL(origin).host === req.headers.host; } catch {} if (!ok) return reject("403 Forbidden"); }
  if (peers.size >= MAX_PEERS) return reject("503 Service Unavailable");
  wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req));
});

app.listen({ port: PORT, host: process.env.HOST || "0.0.0.0" }).then(() => console.log("villa-walk listening on " + PORT)).catch(e => { console.error(e); process.exit(1); });
const stop = () => { wss.clients.forEach(c => c.close(1001)); app.close().finally(() => { db.close(); process.exit(0); }); };
process.on("SIGTERM", stop); process.on("SIGINT", stop);
