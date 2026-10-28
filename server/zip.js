"use strict";
/* A small .zip reader (central directory; stored and deflate; no zip64, no encryption). No dependency on purpose.
   list(file)      -> entries [{name, segs, dir, method, csize, usize, off}]; throws ZipError (bad_zip | zip64 | zip_unsafe | too_many_files)
   readBuffer(file, entry, max) -> Buffer
   extract(file, entry, dest, max) -> writes the uncompressed entry to dest
   Both stop as soon as more than min(max, declared size) bytes come out (zip bomb) and fail if fewer do. */
const fs = require("fs"), zlib = require("zlib");
const { Transform, Readable, Writable } = require("stream");
const { pipeline } = require("stream/promises");

class ZipError extends Error { constructor(code) { super(code); this.code = code; } }
const MAX_ENTRIES = 2000;

/* segments of a safe relative path, or null (absolute, drive letter, "..", NUL) */
function safeSegs(name) {
  if (name.includes("\0")) return null;
  const n = name.replace(/\\/g, "/");
  if (n.startsWith("/") || /^[A-Za-z]:/.test(n)) return null;
  const segs = n.split("/").filter(s => s && s !== ".");
  if (segs.includes("..")) return null;
  return segs;
}
function decodeName(buf, utf8) {
  if (utf8 || !buf.some(b => b > 127)) return buf.toString("utf8");
  try { return new TextDecoder("ibm866").decode(buf); } catch { return buf.toString("latin1"); }
}

function list(file) {
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    if (size < 22) throw new ZipError("bad_zip");
    const tl = Math.min(size, 22 + 65535), tail = Buffer.alloc(tl);
    fs.readSync(fd, tail, 0, tl, size - tl);
    let p = -1;
    for (let i = tl - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { p = i; break; }
    if (p < 0) throw new ZipError("bad_zip");
    const total = tail.readUInt16LE(p + 10), cdSize = tail.readUInt32LE(p + 12), cdOff = tail.readUInt32LE(p + 16);
    if (total === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) throw new ZipError("zip64");
    if (total > MAX_ENTRIES) throw new ZipError("too_many_files");
    if (cdOff + cdSize > size) throw new ZipError("bad_zip");
    const cd = Buffer.alloc(cdSize); fs.readSync(fd, cd, 0, cdSize, cdOff);
    const out = []; let o = 0;
    for (let i = 0; i < total; i++) {
      if (o + 46 > cd.length || cd.readUInt32LE(o) !== 0x02014b50) throw new ZipError("bad_zip");
      const flags = cd.readUInt16LE(o + 8), nlen = cd.readUInt16LE(o + 28), elen = cd.readUInt16LE(o + 30), clen = cd.readUInt16LE(o + 32);
      if (o + 46 + nlen > cd.length) throw new ZipError("bad_zip");
      const name = decodeName(cd.subarray(o + 46, o + 46 + nlen), !!(flags & 0x800));
      const e = { name, enc: !!(flags & 1), method: cd.readUInt16LE(o + 10), csize: cd.readUInt32LE(o + 20), usize: cd.readUInt32LE(o + 24), off: cd.readUInt32LE(o + 42), dir: /[\\/]$/.test(name) };
      if (e.csize === 0xffffffff || e.usize === 0xffffffff || e.off === 0xffffffff) throw new ZipError("zip64");
      e.segs = safeSegs(name);
      if (!e.segs) throw new ZipError("zip_unsafe");
      out.push(e);
      o += 46 + nlen + elen + clen;
    }
    return out;
  } finally { fs.closeSync(fd); }
}

function source(file, e, max) {
  if (e.enc) throw new ZipError("encrypted");
  if (e.method !== 0 && e.method !== 8) throw new ZipError("method");
  const fd = fs.openSync(file, "r");
  let start;
  try {
    const h = Buffer.alloc(30);
    if (fs.readSync(fd, h, 0, 30, e.off) < 30 || h.readUInt32LE(0) !== 0x04034b50) throw new ZipError("bad_zip");
    start = e.off + 30 + h.readUInt16LE(26) + h.readUInt16LE(28);
    if (start + e.csize > fs.fstatSync(fd).size) throw new ZipError("bad_zip");
  } finally { fs.closeSync(fd); }
  const cap = Math.min(max, e.usize);
  let n = 0;
  const guard = new Transform({
    transform(chunk, enc, cb) { n += chunk.length; if (n > cap) return cb(new ZipError(e.usize > max ? "too_large" : "zip_bomb")); cb(null, chunk); },
    flush(cb) { cb(n === e.usize ? null : new ZipError("bad_zip")); },
  });
  const raw = e.csize ? fs.createReadStream(file, { start, end: start + e.csize - 1 }) : Readable.from([]);
  return e.method === 8 ? [raw, zlib.createInflateRaw(), guard] : [raw, guard];
}

async function readBuffer(file, e, max) {
  const parts = [];
  await pipeline(...source(file, e, max), new Writable({ write(c, enc, cb) { parts.push(c); cb(); } }));
  return Buffer.concat(parts);
}
async function extract(file, e, dest, max) {
  try { await pipeline(...source(file, e, max), fs.createWriteStream(dest)); }
  catch (x) { fs.rmSync(dest, { force: true }); throw x; }
}

module.exports = { list, readBuffer, extract, safeSegs, ZipError, MAX_ENTRIES };
