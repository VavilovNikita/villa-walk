"use strict";
/* Unpacking of a .zip of models in the background: POST /api/models/zip answers at once with a job id, the work goes on model by model
   (each one appears through model.added) and the progress goes to everybody as job.progress / job.done. One job at a time on the server. */
const path = require("path"), fs = require("fs"), crypto = require("crypto");
const zip = require("./zip");
const GltfPack = require("../public/gltfpack.js");

const JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)|(^|\/)\._/i;
const MAX_JSON = 32 * 1024 * 1024;

function createBulk({ TMP, maxModelBytes, maxUnpacked, maxModels, count, folders, storeModel, broadcast, clean }) {
  const jobs = new Map();
  let active = null;

  /* what is in the archive: model entries with their companions; throws ZipError for anything that makes the archive unacceptable */
  function plan(file) {
    const entries = zip.list(file).filter(e => !e.dir);
    const byPath = new Map(entries.map(e => [e.segs.join("/"), e]));
    const lower = new Map(entries.map(e => [e.segs.join("/").toLowerCase(), e]));
    const models = [], consumed = new Set(); let skipped = 0;
    for (const e of entries) {
      if (JUNK.test(e.segs.join("/"))) { consumed.add(e); continue; }
      const m = /\.(glb|gltf)$/i.exec(e.segs[e.segs.length - 1]);
      if (m) models.push({ entry: e, kind: m[1].toLowerCase() });
    }
    let unpacked = 0;
    for (const m of models) {
      unpacked += m.entry.usize; consumed.add(m.entry);
      m.companions = null;
      if (m.kind === "gltf") m.dirSegs = m.entry.segs.slice(0, -1);
    }
    if (unpacked > maxUnpacked) throw new zip.ZipError("too_large");
    for (const e of entries) if (!consumed.has(e) && !/\.(bin|png|jpe?g|webp|ktx2)$/i.test(e.name)) skipped++;   // pictures and .bin are the companions of a .gltf, not "skipped"
    const resolve = (m, uri) => {   // uri written in a .gltf -> its entry in the archive
      let rel; try { rel = decodeURIComponent(uri); } catch { return null; }
      const segs = zip.safeSegs(m.dirSegs.join("/") + "/" + rel); if (!segs) return null;
      const k = segs.join("/"); return byPath.get(k) || lower.get(k.toLowerCase()) || null;
    };
    return { models, skipped, resolve };
  }

  const status = job => ({ id: job.id, total: job.total, done: job.done, added: job.added, skipped: job.skipped, duplicates: job.duplicates, failed: job.failed.length, current: job.current || "" });

  async function oneModel(job, file, m, n) {
    const e = m.entry, name = clean(e.segs[e.segs.length - 1].replace(/\.(glb|gltf)$/i, "")) || "Модель";
    const f = folders.ensurePath(job.folder, e.segs.slice(0, -1), job.by).id;
    const tmp = path.join(TMP, job.id + "-" + n + ".glb");
    try {
      if (m.kind === "glb") await zip.extract(file, e, tmp, maxModelBytes);
      else {
        const json = await zip.readBuffer(file, e, MAX_JSON), files = new Map();
        let left = maxModelBytes;
        for (const uri of GltfPack.refs(json).uris) {
          const ce = m.resolve(uri);
          if (!ce) throw Object.assign(new Error("gltf_missing"), { code: "gltf_missing" });
          const b = await zip.readBuffer(file, ce, left); left -= b.length; files.set(uri, b);
        }
        fs.writeFileSync(tmp, GltfPack.pack(json, files));
      }
      const r = storeModel(tmp, { name, folder: f, by: job.by, dup: job.dup });
      if (r.error) throw Object.assign(new Error(r.error), { code: r.error });
      if (r.skipped) job.duplicates++; else job.added++;
    } finally { fs.rmSync(tmp, { force: true }); }
  }

  async function run(job, file, p) {
    try {
      let n = 0;
      for (const m of p.models) {
        job.current = m.entry.segs.join("/");
        if (!job.dup || job.dup === "copy") { if (count() >= maxModels) { job.failed.push({ path: job.current, code: "too_many_models" }); job.done++; broadcast({ t: "job.progress", ...status(job) }); continue; } }
        m.resolve = uri => p.resolve(m, uri);
        try { await oneModel(job, file, m, n++); }
        catch (e) { job.failed.push({ path: job.current, code: e && e.code && /^[a-z_0-9]+$/.test(e.code) ? e.code : "upload_failed" }); }
        job.done++;
        broadcast({ t: "job.progress", ...status(job) });
        await new Promise(r => setImmediate(r));
      }
    } catch (e) { job.error = e && e.code || "upload_failed"; }
    finally {
      job.current = ""; job.finished = true; fs.rmSync(file, { force: true }); active = null;
      broadcast({ t: "job.done", ...status(job), failedList: job.failed.slice(0, 60), error: job.error || null });
      setTimeout(() => jobs.delete(job.id), 30 * 60 * 1000).unref();
    }
  }

  return {
    busy: () => !!active,
    get: id => jobs.get(id) && { ...status(jobs.get(id)), finished: !!jobs.get(id).finished, failedList: jobs.get(id).failed.slice(0, 60), error: jobs.get(id).error || null },
    /* file: the uploaded archive (taken over: deleted when the job ends or is refused). Throws ZipError. Returns the job status. */
    start(file, { folder, by, dup }) {
      let p;
      try { p = plan(file); } catch (e) { fs.rmSync(file, { force: true }); throw e; }
      const job = { id: crypto.randomBytes(6).toString("hex"), folder, by, dup, total: p.models.length, done: 0, added: 0, skipped: p.skipped, duplicates: 0, failed: [], current: "" };
      jobs.set(job.id, job); active = job;
      setImmediate(() => run(job, file, p));
      return status(job);
    },
  };
}

module.exports = { createBulk };
