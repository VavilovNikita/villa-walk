"use strict";
/* Folders of the uploaded-model library. Collection `folders` in the same docs table: {name, parent (id | null = root), order, by, at}.
   A model points to its folder with `folder` (id | null); models saved before folders have no such field and read as null (the root).
   Nesting is at most MAX_DEPTH levels. Everything that changes anything needs the edit key (403 otherwise). */
const crypto = require("crypto");
const MAX_DEPTH = 3, MAX_FOLDERS = 200;
const STARTER = ["Санузел", "Спальня", "Гостиная", "Терраса и сад", "Декор"];

function createFolders({ app, getDoc, putDoc, del, collection, broadcast, keyOk, idOk, ID, clean, isObj, modelOut, deleteModel }) {
  const out = d => ({ parent: null, order: 0, ...d });
  const all = () => Object.fromEntries(Object.entries(collection("folders")).map(([id, d]) => [id, out(d)]));
  const newId = () => crypto.randomBytes(8).toString("hex");

  /* the starting set is made once: a marker keeps it from coming back after the folders were deleted on purpose */
  if (!getDoc("meta", "folders-seeded")) {
    if (!Object.keys(collection("folders")).length) STARTER.forEach((name, i) => putDoc("folders", newId(), { name, parent: null, order: i, by: "system", at: Date.now() }));
    putDoc("meta", "folders-seeded", { at: Date.now() });
  }

  const depthOf = (id, map) => { let n = 0; for (let f = id; f && map[f] && n < 10; f = map[f].parent) n++; return n; };
  const childrenOf = (id, map) => Object.keys(map).filter(k => map[k].parent === id);
  const subtree = (id, map) => { const list = [id]; for (let i = 0; i < list.length; i++) list.push(...childrenOf(list[i], map)); return list; };
  const height = (id, map) => 1 + Math.max(0, ...childrenOf(id, map).map(c => height(c, map)));
  const parentOk = v => v === null || v === undefined || (typeof v === "string" && idOk(v, ID));
  const forbid = (req, reply) => { if (keyOk(req.headers["x-edit-key"])) return false; reply.code(403).send({ error: "forbidden" }); return true; };
  const nextOrder = (parent, map) => 1 + Math.max(-1, ...Object.values(map).filter(f => f.parent === parent).map(f => f.order || 0));

  app.post("/api/folders", async (req, reply) => {
    if (forbid(req, reply)) return;
    const b = isObj(req.body) ? req.body : {}, map = all();
    const name = clean(b.name); if (!name) return reply.code(400).send({ error: "invalid" });
    const parent = b.parent == null ? null : b.parent;
    if (!parentOk(parent) || (parent && !map[parent])) return reply.code(400).send({ error: "invalid" });
    if (Object.keys(map).length >= MAX_FOLDERS) return reply.code(409).send({ error: "too_many_folders" });
    if (depthOf(parent, map) >= MAX_DEPTH) return reply.code(409).send({ error: "too_deep" });
    const id = newId(), doc = { name, parent, order: nextOrder(parent, map), by: clean(req.headers["x-uid"], 32).replace(/[^A-Za-z0-9]/g, "") || "editor", at: Date.now() };
    putDoc("folders", id, doc); broadcast({ t: "folder.added", id, doc: out(doc) });
    return { id, doc: out(doc) };
  });

  /* the chain of folders `names` under `parent`, created where missing and reused where a folder of that name (ignoring case and extra spaces) is already there.
     Deeper than MAX_DEPTH: the names beyond the limit are dropped, so what belongs there lands in the last level. Returns {id, created} (id = the deepest folder, or parent). */
  const norm = s => String(s).replace(/\s+/g, " ").trim().toLowerCase();
  function ensurePath(parent, names, by) {
    const map = all(); let cur = parent || null, created = 0;
    if (cur && !map[cur]) throw Object.assign(new Error("not_found"), { code: "not_found" });
    const room = Math.max(0, MAX_DEPTH - depthOf(cur, map));
    for (const raw of names.map(n => clean(n)).filter(Boolean).slice(0, room)) {
      const hit = Object.keys(map).filter(k => (map[k].parent || null) === cur && norm(map[k].name) === norm(raw)).sort((a, b) => (map[a].at || 0) - (map[b].at || 0))[0];
      if (hit) { cur = hit; continue; }
      if (Object.keys(map).length >= MAX_FOLDERS) throw Object.assign(new Error("too_many_folders"), { code: "too_many_folders" });
      const id = newId(), doc = { name: raw, parent: cur, order: nextOrder(cur, map), by, at: Date.now() };
      putDoc("folders", id, doc); map[id] = out(doc); broadcast({ t: "folder.added", id, doc: out(doc) }); cur = id; created++;
    }
    return { id: cur, created };
  }
  app.post("/api/folders/ensure", async (req, reply) => {
    if (forbid(req, reply)) return;
    const b = isObj(req.body) ? req.body : {};
    const parent = b.parent == null ? null : b.parent;
    if (!parentOk(parent) || !Array.isArray(b.path) || b.path.length > 10 || !b.path.every(n => typeof n === "string")) return reply.code(400).send({ error: "invalid" });
    try { return ensurePath(parent, b.path, clean(req.headers["x-uid"], 32).replace(/[^A-Za-z0-9]/g, "") || "editor"); }
    catch (e) { if (e.code === "not_found") return reply.code(404).send({ error: "not_found" }); if (e.code === "too_many_folders") return reply.code(409).send({ error: "too_many_folders" }); throw e; }
  });

  app.patch("/api/folders/:id", async (req, reply) => {
    if (forbid(req, reply)) return;
    const { id } = req.params, map = all();
    if (!idOk(id, ID) || !map[id]) return reply.code(404).send({ error: "not_found" });
    const b = isObj(req.body) ? req.body : {}, next = { ...collection("folders")[id] };
    if (b.name !== undefined) { const n = clean(b.name); if (!n) return reply.code(400).send({ error: "invalid" }); next.name = n; }
    if (b.order !== undefined) { if (!Number.isInteger(b.order) || Math.abs(b.order) > 1e6) return reply.code(400).send({ error: "invalid" }); next.order = b.order; }
    if (b.parent !== undefined) {
      const parent = b.parent;
      if (!parentOk(parent) || (parent && !map[parent])) return reply.code(400).send({ error: "invalid" });
      if (parent && subtree(id, map).includes(parent)) return reply.code(409).send({ error: "cycle" });
      if (depthOf(parent, map) + height(id, map) > MAX_DEPTH) return reply.code(409).send({ error: "too_deep" });
      if (parent !== (map[id].parent || null)) { next.parent = parent; if (b.order === undefined) next.order = nextOrder(parent, map); }
    }
    next.at = Date.now(); putDoc("folders", id, next); broadcast({ t: "folder.updated", id, doc: out(next) });
    return { ok: true, doc: out(next) };
  });

  /* ?mode=move (default): models and sub-folders go one level up. ?mode=models: the folder, its sub-folders and every model in them are deleted,
     but only if no model among them is in the scene; otherwise nothing is deleted and the counts come back in a 409 */
  app.delete("/api/folders/:id", async (req, reply) => {
    if (forbid(req, reply)) return;
    const { id } = req.params, map = all();
    if (!idOk(id, ID) || !map[id]) return reply.code(404).send({ error: "not_found" });
    const mode = req.query.mode === "models" ? "models" : "move", parent = map[id].parent || null;
    const models = collection("models");
    if (mode === "models") {
      const ids = new Set(subtree(id, map)), inside = Object.keys(models).filter(m => ids.has(models[m].folder || null));
      const used = Object.values(collection("items")).filter(it => it.model && inside.includes(it.model)).length;
      if (used) return reply.code(409).send({ error: "in_use", models: inside.length, items: used });
      for (const m of inside) deleteModel(m, models[m]);
      for (const f of [...ids].reverse()) { del("folders", f); broadcast({ t: "folder.deleted", id: f }); }
      return { ok: true, deleted: inside.length };
    }
    for (const c of childrenOf(id, map)) { const d = { ...collection("folders")[c], parent, at: Date.now() }; putDoc("folders", c, d); broadcast({ t: "folder.updated", id: c, doc: out(d) }); }
    let moved = 0;
    for (const [m, d] of Object.entries(models)) if ((d.folder || null) === id) { const next = { ...d, folder: parent }; putDoc("models", m, next); broadcast({ t: "model.updated", id: m, doc: modelOut(next) }); moved++; }
    del("folders", id); broadcast({ t: "folder.deleted", id });
    return { ok: true, moved };
  });

  /* moves models into a folder (null = root); one model.updated each */
  app.post("/api/models/move", async (req, reply) => {
    if (forbid(req, reply)) return;
    const b = isObj(req.body) ? req.body : {};
    if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 300 || !b.ids.every(i => idOk(i, ID)) || !(b.folder === null || idOk(b.folder, ID))) return reply.code(400).send({ error: "invalid" });
    if (b.folder !== null && !getDoc("folders", b.folder)) return reply.code(404).send({ error: "not_found" });
    let n = 0;
    for (const m of b.ids) {
      const d = getDoc("models", m); if (!d || (d.folder || null) === b.folder) continue;
      const next = { ...d, folder: b.folder }; putDoc("models", m, next); broadcast({ t: "model.updated", id: m, doc: modelOut(next) }); n++;
    }
    return { ok: true, moved: n };
  });

  return { all, ensurePath, exists: id => !!id && !!getDoc("folders", id) };
}

module.exports = { createFolders, MAX_DEPTH };
