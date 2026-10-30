"use strict";
/* Builds a heavy test model: a smooth bumpy sphere with `tris` triangles, 4096x4096 base colour + normal textures (PNG), plus named nodes / materials. Dev dependency only (uses the server's gltf-transform + sharp). */
const fs = require("fs");

async function buildGlb(outPath, { tris = 1200000, tex = 4096, name = "TestModel" } = {}) {
  const { Document, NodeIO } = require("@gltf-transform/core");
  const sharp = require("sharp");
  const doc = new Document(), buf = doc.createBuffer();
  const n = Math.round(Math.sqrt(tris / 2));            // n x n quads -> 2n^2 triangles
  const pos = new Float32Array((n + 1) * (n + 1) * 3), uv = new Float32Array((n + 1) * (n + 1) * 2), nor = new Float32Array((n + 1) * (n + 1) * 3);
  for (let i = 0, k = 0; i <= n; i++) for (let j = 0; j <= n; j++, k++) {
    const th = Math.PI * i / n, ph = 2 * Math.PI * j / n, r = 0.5 + 0.01 * Math.sin(3 * th) * Math.cos(4 * ph);
    const x = r * Math.sin(th) * Math.cos(ph), y = r * Math.cos(th) + 0.5, z = r * Math.sin(th) * Math.sin(ph);
    pos.set([x, y, z], k * 3); uv.set([j / n, i / n], k * 2);
    const l = Math.hypot(x, y - 0.5, z) || 1; nor.set([x / l, (y - 0.5) / l, z / l], k * 3);
  }
  const idx = new Uint32Array(n * n * 6);
  for (let i = 0, t = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const a = i * (n + 1) + j, b = a + 1, c = a + n + 1, d = c + 1;
    idx.set([a, c, b, b, c, d], t); t += 6;
  }
  const noise = (seed) => { const raw = Buffer.alloc(tex * tex * 3); for (let i = 0; i < raw.length; i++) raw[i] = ((i * 2654435761 + seed) >>> 13) & 255; return raw; };
  const png = async seed => sharp(noise(seed), { raw: { width: tex, height: tex, channels: 3 } }).png({ compressionLevel: 1 }).toBuffer();
  const tBase = doc.createTexture("base").setImage(new Uint8Array(await png(1))).setMimeType("image/png");
  const tNorm = doc.createTexture("normal").setImage(new Uint8Array(await png(7))).setMimeType("image/png");
  const mat = doc.createMaterial(name + "Mat").setBaseColorTexture(tBase).setNormalTexture(tNorm).setRoughnessFactor(0.7).setMetallicFactor(0);
  const prim = doc.createPrimitive().setMaterial(mat)
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(pos).setBuffer(buf))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(nor).setBuffer(buf))
    .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(uv).setBuffer(buf))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(idx).setBuffer(buf));
  const mesh = doc.createMesh(name + "Mesh").addPrimitive(prim), node = doc.createNode(name).setMesh(mesh);
  doc.createScene("s").addChild(node);
  await new NodeIO().write(outPath, doc);
  return outPath;
}
module.exports = { buildGlb };
if (require.main === module) buildGlb(process.argv[2], { tris: +process.argv[3] || 1200000 }).then(() => console.log("ok", fs.statSync(process.argv[2]).size));
