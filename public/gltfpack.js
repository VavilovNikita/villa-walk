/* Packs a .gltf (JSON + external .bin / images) into one binary .glb. Pure functions on Uint8Array, no DOM and no Node API,
   so the browser (a .gltf picked together with its files) and the server (a .gltf inside a .zip) run the same code.
   GltfPack.refs(jsonBytes)            -> { uris: [external uris] }  (data: uris are not external)
   GltfPack.pack(jsonBytes, files)     -> Uint8Array (.glb); files: Map uri -> Uint8Array, keyed by the uri exactly as written in the .gltf
   Errors carry .code: "bad_gltf" | "gltf_missing" (.uri = the first missing one) | "gltf_unsupported" | "too_large". */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(); else root.GltfPack = factory();
})(typeof self !== "undefined" ? self : this, function () {
"use strict";
const err = (code, msg, extra) => Object.assign(new Error(msg || code), { code }, extra);
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", ktx2: "image/ktx2" };

function parse(jsonBytes) {
  let j;
  try { j = JSON.parse(new TextDecoder("utf-8").decode(jsonBytes)); } catch { throw err("bad_gltf", "not JSON"); }
  if (!j || typeof j !== "object" || !j.asset || !/^2\./.test(String(j.asset.version))) throw err("bad_gltf", "not glTF 2.0");
  return j;
}
const isData = u => /^data:/i.test(u);
const external = u => typeof u === "string" && u && !isData(u);

function refs(jsonBytes) {
  const j = parse(jsonBytes), set = new Set();
  for (const b of j.buffers || []) if (external(b && b.uri)) set.add(b.uri);
  for (const i of j.images || []) if (external(i && i.uri)) set.add(i.uri);
  return { uris: [...set] };
}

function dataUri(u) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/is.exec(u);
  if (!m) throw err("bad_gltf", "bad data uri");
  if (!m[2]) return { mime: m[1], bytes: new TextEncoder().encode(decodeURIComponent(m[3])) };
  const s = atob(m[3].replace(/\s/g, "")), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return { mime: m[1], bytes: out };
}
function bytesOf(uri, files) {
  if (isData(uri)) return dataUri(uri);
  const b = files.get(uri);
  if (!b) throw err("gltf_missing", "missing " + uri, { uri });
  return { mime: "", bytes: b };
}

function pack(jsonBytes, files) {
  const j = parse(jsonBytes);
  if (!Array.isArray(j.buffers) || !j.buffers.length) throw err("bad_gltf", "no buffers");
  const chunks = []; let total = 0;
  const add = bytes => { const at = total; chunks.push(bytes); total += bytes.length; const pad = (4 - total % 4) % 4; if (pad) { chunks.push(new Uint8Array(pad)); total += pad; } return at; };
  const base = j.buffers.map(b => {
    if (!b || !b.uri) throw err("bad_gltf", "buffer without uri");
    const got = bytesOf(b.uri, files);
    return add(got.bytes);
  });
  j.bufferViews = j.bufferViews || [];
  for (const v of j.bufferViews) {
    if (!v || !Number.isInteger(v.buffer) || !(v.buffer in base)) throw err("bad_gltf", "bad bufferView");
    v.byteOffset = (v.byteOffset || 0) + base[v.buffer]; v.buffer = 0;
  }
  for (const im of j.images || []) {
    if (!im || im.uri == null) continue;
    const got = bytesOf(im.uri, files);
    let mime = im.mimeType || got.mime;
    if (!mime) { const m = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(im.uri); mime = m ? MIME[m[1].toLowerCase()] : ""; }
    if (!Object.values(MIME).includes(mime)) throw err("gltf_unsupported", "image type");
    const at = add(got.bytes);
    j.bufferViews.push({ buffer: 0, byteOffset: at, byteLength: got.bytes.length });
    im.bufferView = j.bufferViews.length - 1; im.mimeType = mime; delete im.uri;
  }
  if (total >= 0xffffffff - 4096) throw err("too_large", "too large");
  j.buffers = [{ byteLength: total }];
  let js = new TextEncoder().encode(JSON.stringify(j));
  const jpad = (4 - js.length % 4) % 4;
  if (jpad) { const x = new Uint8Array(js.length + jpad).fill(0x20); x.set(js); js = x; }
  const len = 12 + 8 + js.length + 8 + total;
  if (len >= 0xffffffff) throw err("too_large", "too large");
  const out = new Uint8Array(len), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, len, true);
  dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(js, 20);
  let o = 20 + js.length;
  dv.setUint32(o, total, true); dv.setUint32(o + 4, 0x004e4942, true); o += 8;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

return { refs, pack };
});
