"use strict";
/* Reads a .glb (also meshopt-compressed) and reports what the compression tests check: mesh / material / node names, texture sizes + mime types, extensions, triangle count. */
async function inspectGlb(file) {
  const { NodeIO } = require("@gltf-transform/core"), { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
  const { MeshoptDecoder } = await import("meshoptimizer"); await MeshoptDecoder.ready;
  const { countTris } = require("../../server/compress-core");
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder }).read(file), root = doc.getRoot();
  return {
    tris: countTris(doc), extensions: root.listExtensionsUsed().map(e => e.extensionName),
    meshes: root.listMeshes().map(m => m.getName()), materials: root.listMaterials().map(m => m.getName()), nodes: root.listNodes().map(n => n.getName()),
    textures: root.listTextures().map(t => ({ size: t.getSize(), mime: t.getMimeType() })),
  };
}
module.exports = { inspectGlb };
if (require.main === module) inspectGlb(process.argv[2]).then(r => console.log(JSON.stringify(r)));
