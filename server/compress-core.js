"use strict";
/* Lightweight copy of a .glb: @gltf-transform + meshoptimizer + sharp. Used by compress-worker.js (a child process, so the web server never stalls).
   mode "model": dedup, prune, weld; textures > 2048 px shrink to 2048 and become WebP; the mesh is simplified only above MAX_TRIS; meshopt + quantization.
   mode "house": nothing that renames, merges or drops named things (the paint docs hang on mesh / material names): prune of unused data and meshopt only. */
const fs = require("fs");

const MAX_TRIS = 300000, TEX_MAX = 2048, SIMPLIFY_ERROR = 0.001;   // error: a fraction of the mesh radius (the task allows 0.001 of the model size, which is twice that)
const Q_TEX = 90, Q_NORMAL = 95;

let libs = null;
async function load() {
  if (libs) return libs;
  const { NodeIO, PropertyType, Logger } = require("@gltf-transform/core");
  const { ALL_EXTENSIONS, EXTMeshoptCompression } = require("@gltf-transform/extensions");
  const fn = require("@gltf-transform/functions");
  const { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } = await import("meshoptimizer");
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
  const sharp = require("sharp");
  const io = new NodeIO().setLogger(new Logger(Logger.Verbosity.SILENT)).registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
  libs = { io, PropertyType, EXTMeshoptCompression, fn, MeshoptEncoder, MeshoptSimplifier, sharp };
  return libs;
}

/* triangles the viewer draws: every node that uses a mesh counts it again (instances) */
function countTris(doc) {
  const perMesh = new Map();
  for (const mesh of doc.getRoot().listMeshes()) {
    let t = 0;
    for (const p of mesh.listPrimitives()) {
      const mode = p.getMode(); if (mode !== 4 && mode !== 5 && mode !== 6) continue;
      const idx = p.getIndices(), pos = p.getAttribute("POSITION");
      const n = idx ? idx.getCount() : (pos ? pos.getCount() : 0);
      t += mode === 4 ? Math.floor(n / 3) : Math.max(0, n - 2);
    }
    perMesh.set(mesh, t);
  }
  let total = 0, used = new Set();
  for (const node of doc.getRoot().listNodes()) { const m = node.getMesh(); if (m) { total += perMesh.get(m) || 0; used.add(m); } }
  for (const [m, t] of perMesh) if (!used.has(m)) total += t;
  return total;
}

/* returns {trisOrig, trisLite, texResized, simplified} */
async function compress(inPath, outPath, mode) {
  const L = await load(), { io, PropertyType: PT, fn } = L;
  const doc = await io.read(inPath);
  const trisOrig = countTris(doc);
  let simplified = false, texResized = 0;

  if (mode === "house") {
    await doc.transform(fn.prune({ keepLeaves: true, keepAttributes: true, keepExtras: true, keepSolidTextures: true, propertyTypes: [PT.ACCESSOR, PT.BUFFER, PT.TEXTURE] }));
    await doc.transform(fn.reorder({ encoder: L.MeshoptEncoder, target: "size" }));
    doc.createExtension(L.EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: L.EXTMeshoptCompression.EncoderMethod.QUANTIZE });   // QUANTIZE with no quantize() before it packs the floats as they are, nothing is lost (FILTER rounds them)
  } else {
    await doc.transform(fn.dedup(), fn.prune(), fn.weld());
    if (trisOrig > MAX_TRIS) {
      /* lockBorder keeps open edges (and so seams between parts) where they are; if the error budget does not allow 300k we keep what we got */
      for (let pass = 0; pass < 2; pass++) {
        const now = countTris(doc); if (now <= MAX_TRIS) break;
        await doc.transform(fn.simplify({ simplifier: L.MeshoptSimplifier, ratio: Math.min(1, (MAX_TRIS * 0.98) / now), error: SIMPLIFY_ERROR, lockBorder: true }));
        simplified = true;
      }
      await doc.transform(fn.prune());
    }
    for (const t of doc.getRoot().listTextures()) { const s = t.getSize(); if (s && Math.max(s[0], s[1]) > TEX_MAX) texResized++; }
    const tex = { encoder: L.sharp, targetFormat: "webp", resize: [TEX_MAX, TEX_MAX] };
    await doc.transform(
      fn.textureCompress({ ...tex, slots: /^normalTexture$/, quality: Q_NORMAL }),
      fn.textureCompress({ ...tex, slots: /^(?!normalTexture$)/, quality: Q_TEX }));
    await doc.transform(fn.meshopt({ encoder: L.MeshoptEncoder, level: "high" }));
  }
  const trisLite = countTris(doc);
  const tmp = outPath + ".part";
  fs.writeFileSync(tmp, await io.writeBinary(doc));
  fs.renameSync(tmp, outPath);
  return { trisOrig, trisLite, texResized, simplified };
}

module.exports = { compress, countTris, MAX_TRIS };
