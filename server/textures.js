"use strict";
/* Texture library: photos of tile / wood / stone / fabric that can be poured over a surface like a colour.
   Files live in DATA_DIR/uploads/textures/, one document per texture in coll "textures". */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const sharp = require("sharp");

const MAX_TEXTURES = 300, MAX_PIXELS = 120e6;
const FULL_PX = 2048, MID_PX = 1024, THUMB_PX = 256, MIN_CROP_PX = 16;
const MM_MIN = 5, MM_MAX = 20000;

/* keys of the procedural textures the client draws itself (public/tex.js); a surface may reference them */
const BUILTIN_TEX = ["parquet", "herringbone", "tile600", "tile300x600", "mosaic50", "concrete", "bark", "travertine", "rattan", "linen", "brick"];

/* magic bytes -> kind; the extension and Content-Type the client sends are never trusted */
function sniff(b) {
  if (b.length < 16) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (b.toString("latin1", 4, 8) === "ftyp" && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|avif)$/.test(b.toString("latin1", 8, 12))) return "heic";
  return null;
}

const mmPair = (w, h) => {
  const a = Number(w), b = Number(h);
  if (![a, b].every(n => Number.isFinite(n) && n >= MM_MIN && n <= MM_MAX)) return null;
  return [Math.round(a), Math.round(b)];
};

function createTextures({ app, UPLOADS, getDoc, putDoc, del, collection, count, broadcast, keyOk, idOk, ID, clean, isObj, num, HEX, maxBytes: MAX_BYTES = 15 * 1024 * 1024 }) {
  const DIR = path.join(UPLOADS, "textures");   // created with the first upload: an install without textures leaves uploads/ as it was
  sharp.cache(false);

  /* ---- tex field of paint / parts / items: {id | builtin, sizeMm?, rot, offMm, tint} or nothing ---- */
  function texDoc(v) {
    if (v == null) return null;
    if (!isObj(v)) throw new Error("invalid");
    const bad = () => { throw new Error("invalid"); };
    const o = {};
    if (v.id != null) { if (typeof v.id !== "string" || !ID.test(v.id) || !getDoc("textures", v.id)) bad(); o.id = v.id; }
    else if (typeof v.builtin === "string" && BUILTIN_TEX.includes(v.builtin)) o.builtin = v.builtin;
    else bad();
    if (v.sizeMm != null) { const s = Array.isArray(v.sizeMm) && v.sizeMm.length === 2 && v.sizeMm.every(n => typeof n === "number" && Number.isFinite(n)) ? mmPair(v.sizeMm[0], v.sizeMm[1]) : null; if (!s) bad(); o.sizeMm = s; }
    const rot = v.rot == null ? 0 : v.rot; if (![0, 90, 180, 270].includes(rot)) bad(); o.rot = rot;
    const off = v.offMm == null ? [0, 0] : v.offMm;
    if (!Array.isArray(off) || off.length !== 2 || !off.every(n => num(n, 100000))) bad(); o.offMm = [Math.round(off[0]), Math.round(off[1])];
    if (v.tint != null) { if (typeof v.tint !== "string" || !HEX.test(v.tint)) bad(); o.tint = v.tint; } else o.tint = null;
    return o;
  }

  const out = d => ({ ...d });
  const list = () => Object.fromEntries(Object.entries(collection("textures")).map(([id, d]) => [id, out(d)]));
  /* a file another process still holds open (Windows) must not fail the request: the row is already gone */
  const rmFiles = d => { for (const k of ["file", "file1024", "thumb"]) if (d[k]) try { fs.rmSync(path.join(DIR, path.basename(d[k])), { force: true }); } catch (e) { app.log.warn(e); } };

  /* crop frame: normalised "x,y,w,h" of the EXIF-rotated picture */
  function parseCrop(s) {
    if (!s) return null;
    const a = String(s).split(",").map(Number);
    if (a.length !== 4 || !a.every(Number.isFinite)) return false;
    const [x, y, w, h] = a;
    if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 1.0001 || y + h > 1.0001) return false;
    return { x, y, w, h };
  }

  app.post("/api/textures", async (req, reply) => {
    if (!keyOk(req.headers["x-edit-key"])) return reply.code(403).send({ error: "forbidden" });
    if (count("textures") >= MAX_TEXTURES) return reply.code(409).send({ error: "too_many_textures" });
    let part;
    try { part = await req.file({ limits: { fileSize: MAX_BYTES, files: 1, fields: 8, fieldSize: 1024 } }); }
    catch (e) { return reply.code(400).send({ error: "upload_failed" }); }
    if (!part) return reply.code(400).send({ error: "no_file" });
    let buf;
    try { buf = await part.toBuffer(); }
    catch (e) { return reply.code(e.code === "FST_REQ_FILE_TOO_LARGE" ? 413 : 400).send({ error: e.code === "FST_REQ_FILE_TOO_LARGE" ? "too_large" : "upload_failed" }); }
    if (part.file.truncated) return reply.code(413).send({ error: "too_large" });
    const f = n => part.fields[n] && part.fields[n].value;
    const kind = sniff(buf);
    if (!kind) return reply.code(400).send({ error: "bad_image" });
    const size = mmPair(f("w"), f("h"));
    if (!size) return reply.code(400).send({ error: "bad_size" });
    const crop = parseCrop(f("crop")); if (crop === false) return reply.code(400).send({ error: "bad_crop" });
    const name = clean(f("name")) || clean(String(part.filename || "").replace(/\.[^.]+$/, "")) || "Текстура";
    const seamless = f("seamless") === "1";
    const by = clean(req.headers["x-uid"], 32).replace(/[^A-Za-z0-9]/g, "") || "editor";
    const id = crypto.randomBytes(8).toString("hex");
    const files = { file: id + ".webp", file1024: id + ".1024.webp", thumb: id + ".t.webp" };
    try {
      /* stage 1: apply the EXIF orientation once, so the crop frame means the same thing the editor saw */
      const oriented = await sharp(buf, { limitInputPixels: MAX_PIXELS, failOn: "error" }).rotate().png({ compressionLevel: 1 }).toBuffer({ resolveWithObject: true });
      const W = oriented.info.width, H = oriented.info.height;
      let rect = { left: 0, top: 0, width: W, height: H };
      if (crop) {
        const left = Math.min(W - MIN_CROP_PX, Math.max(0, Math.round(crop.x * W))), top = Math.min(H - MIN_CROP_PX, Math.max(0, Math.round(crop.y * H)));
        rect = { left, top, width: Math.max(MIN_CROP_PX, Math.min(W - left, Math.round(crop.w * W))), height: Math.max(MIN_CROP_PX, Math.min(H - top, Math.round(crop.h * H))) };
      }
      if (rect.width < MIN_CROP_PX || rect.height < MIN_CROP_PX) return reply.code(400).send({ error: "bad_crop" });
      const cropped = await sharp(oriented.data).extract(rect).png({ compressionLevel: 1 }).toBuffer();
      const fit = px => sharp(cropped).resize({ width: px, height: px, fit: "inside", withoutEnlargement: true }).webp({ quality: 86 }).toBuffer();
      const [full, mid, thumb] = await Promise.all([
        fit(FULL_PX), fit(MID_PX),
        sharp(cropped).resize({ width: THUMB_PX, height: THUMB_PX, fit: "cover" }).webp({ quality: 80 }).toBuffer(),
      ]);
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(path.join(DIR, files.file), full);
      fs.writeFileSync(path.join(DIR, files.file1024), mid);
      fs.writeFileSync(path.join(DIR, files.thumb), thumb);
    } catch (e) {
      rmFiles(files);
      req.log.warn(e);
      /* sharp's prebuilt libvips has no HEVC decoder: HEIC photos are converted by the browser instead (client falls back to a canvas JPEG) */
      return reply.code(kind === "heic" ? 415 : 400).send({ error: kind === "heic" ? "heic_unsupported" : "bad_image" });
    }
    const doc = { name, file: files.file, file1024: files.file1024, thumb: files.thumb, sizeMm: size, seamless, by, at: Date.now() };
    putDoc("textures", id, doc);
    broadcast({ t: "texture.added", id, doc: out(doc) });
    return { id, doc: out(doc) };
  });

  app.patch("/api/textures/:id", async (req, reply) => {
    if (!keyOk(req.headers["x-edit-key"])) return reply.code(403).send({ error: "forbidden" });
    const { id } = req.params; const doc = idOk(id, ID) && getDoc("textures", id);
    if (!doc) return reply.code(404).send({ error: "not_found" });
    const b = isObj(req.body) ? req.body : {}, next = { ...doc };
    if (b.name !== undefined) { const n = clean(b.name); if (!n) return reply.code(400).send({ error: "invalid" }); next.name = n; }
    if (b.sizeMm !== undefined) { const s = Array.isArray(b.sizeMm) ? mmPair(b.sizeMm[0], b.sizeMm[1]) : null; if (!s) return reply.code(400).send({ error: "bad_size" }); next.sizeMm = s; }
    putDoc("textures", id, next);
    broadcast({ t: "texture.updated", id, doc: out(next) });
    return { ok: true, doc: out(next) };
  });

  /* removes the texture from every surface that uses it and tells everybody, then deletes the files */
  function stripFrom(coll, id, evt) {
    for (const [did, d] of Object.entries(collection(coll))) {
      if (!d.tex || d.tex.id !== id) continue;
      const next = { ...d }; delete next.tex; next.at = Date.now();
      putDoc(coll, did, next);
      broadcast({ t: evt, id: did, doc: next });
    }
  }
  app.delete("/api/textures/:id", async (req, reply) => {
    if (!keyOk(req.headers["x-edit-key"])) return reply.code(403).send({ error: "forbidden" });
    const { id } = req.params; const doc = idOk(id, ID) && getDoc("textures", id);
    if (!doc) return reply.code(404).send({ error: "not_found" });
    stripFrom("paint", id, "paint.set"); stripFrom("parts", id, "part.set"); stripFrom("items", id, "item.set");
    del("textures", id);
    rmFiles(doc);
    broadcast({ t: "texture.removed", id });
    return { ok: true };
  });

  return { texDoc, list };
}

module.exports = { createTextures, BUILTIN_TEX };
