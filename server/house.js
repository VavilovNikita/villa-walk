"use strict";
/* House model (villa.glb): storage in the data volume, version in SQLite, history of replaced files. */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const KEEP = 10;
const HIST_RE = /^villa-(\d{8})-(\d{6})(?:-\d+)?\.glb$/;
const pad = n => String(n).padStart(2, "0");
const stamp = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;

function createHouse({ modelsDir, seedFile, getDoc, putDoc, broadcast }) {
  const file = path.join(modelsDir, "villa.glb");
  const histDir = path.join(modelsDir, "history");
  fs.mkdirSync(histDir, { recursive: true });
  if (!fs.existsSync(file) && seedFile && fs.existsSync(seedFile)) fs.copyFileSync(seedFile, file);

  let meta = getDoc("house", "meta");
  if (!meta || !Number.isInteger(meta.v)) {
    meta = { v: 1, at: fs.existsSync(file) ? Math.round(fs.statSync(file).mtimeMs) : Date.now() };
    putDoc("house", "meta", meta);
  }

  /* checks the GLB header: "glTF", version 2, declared length equals the file size */
  function validate(p) {
    let fd;
    try {
      fd = fs.openSync(p, "r");
      const head = Buffer.alloc(12), n = fs.readSync(fd, head, 0, 12, 0), size = fs.fstatSync(fd).size;
      return n === 12 && head.toString("latin1", 0, 4) === "glTF" && head.readUInt32LE(4) === 2 && head.readUInt32LE(8) === size;
    } catch { return false; } finally { if (fd !== undefined) fs.closeSync(fd); }
  }

  function history() {
    let names = [];
    try { names = fs.readdirSync(histDir).filter(n => HIST_RE.test(n)); } catch {}
    return names.sort().reverse().map(name => {
      const [, d, t] = HIST_RE.exec(name);
      const at = Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +t.slice(0, 2), +t.slice(2, 4), +t.slice(4, 6));
      let size = 0; try { size = fs.statSync(path.join(histDir, name)).size; } catch {}
      return { name, at, size };
    });
  }

  function archiveCurrent() {
    if (!fs.existsSync(file)) return;
    const base = "villa-" + stamp(new Date());
    let name = base + ".glb", i = 1;
    while (fs.existsSync(path.join(histDir, name))) name = `${base}-${i++}.glb`;
    const dst = path.join(histDir, name);
    try { fs.linkSync(file, dst); } catch { fs.copyFileSync(file, dst); } // hard link: villa.glb stays in place until the atomic rename
    // only old history files are pruned, nothing else in the volume is touched
    for (const h of history().slice(KEEP)) fs.rmSync(path.join(histDir, h.name), { force: true });
  }

  function bump() {
    meta = { v: meta.v + 1, at: Date.now() };
    putDoc("house", "meta", meta);
    broadcast({ t: "house.updated", type: "house.updated", v: meta.v, at: meta.at });
    return meta;
  }

  /* tmp must be a validated file inside modelsDir (same filesystem => rename is atomic) */
  function install(tmp) {
    archiveCurrent();
    fs.renameSync(tmp, file);
    try { fs.chmodSync(file, 0o644); } catch {}
    return bump();
  }

  function tmpName() { return path.join(modelsDir, ".villa-" + crypto.randomBytes(6).toString("hex") + ".part"); }

  function restore(name) {
    if (typeof name !== "string" || !HIST_RE.test(name)) return null;
    const src = path.join(histDir, name);
    if (!fs.existsSync(src) || !validate(src)) return null;
    const tmp = tmpName();
    try { fs.copyFileSync(src, tmp); return install(tmp); } catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
  }

  /* file placed by hand (scp): validate and announce; incoming = optional other file inside modelsDir to swap in */
  function reload(incoming) {
    if (incoming) {
      const src = path.resolve(modelsDir, incoming);
      if (path.dirname(src) !== path.resolve(modelsDir) || src === file) return { error: "bad_path" };
      if (!fs.existsSync(src)) return { error: "no_file" };
      if (!validate(src)) return { error: "not_glb" };
      const tmp = tmpName();
      fs.copyFileSync(src, tmp); fs.rmSync(src, { force: true });
      return { meta: install(tmp) };
    }
    if (!fs.existsSync(file)) return { error: "no_file" };
    if (!validate(file)) return { error: "not_glb" };
    return { meta: bump() };
  }

  return { get meta() { return meta; }, validate, history, install, restore, reload, tmpName, KEEP };
}

module.exports = { createHouse };
