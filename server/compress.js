"use strict";
/* Light copies of the library's models. The work is done by server/compress-worker.js (a child process at a low priority, one model at a time),
   this file keeps the queue, the bookkeeping in the model's row and the progress.

   A model row has: file (what the participants download), origFile (what was uploaded, never changed), liteFile (the compressed copy),
   useOrig (an editor chose the original), sizeOrig / sizeLite / trisOrig / trisLite / compressedAt, compressError.
   Models stored before this feature have only `file`: that file is their original and stays where it is. */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { fork } = require("child_process");

const WORKER = path.join(__dirname, "compress-worker.js");
const TIMEOUT_MS = 20 * 60 * 1000;

function createCompressor({ UPLOADS, getDoc, collection, putDoc, broadcast, modelOut, enabled = true, log = console }) {
  /* runs the worker; resolves with its JSON line, rejects with a short message of ours (never the child's raw output) */
  function runWorker(inp, out, mode) {
    return new Promise((resolve, reject) => {
      const child = fork(WORKER, [inp, out, mode], { stdio: ["ignore", "pipe", "pipe", "ipc"], execArgv: ["--max-old-space-size=3072"] });
      let so = "", se = "", done = false;
      const end = (fn, v) => { if (done) return; done = true; clearTimeout(timer); fn(v); };
      const timer = setTimeout(() => { child.kill("SIGKILL"); end(reject, new Error("timeout")); }, TIMEOUT_MS);
      child.stdout.on("data", d => { so += d; if (so.length > 100000) so = so.slice(-1000); });
      child.stderr.on("data", d => { se += d; if (se.length > 2000) se = se.slice(0, 2000); });
      child.on("error", e => end(reject, e));
      child.on("close", code => {
        if (code !== 0) return end(reject, new Error("worker exit " + code + (se ? ": " + se.trim().split("\n").pop().slice(0, 200) : "")));
        try { end(resolve, JSON.parse(so.trim().split("\n").pop())); } catch { end(reject, new Error("worker gave no result")); }
      });
    });
  }

  const mb = n => (n / 1048576).toFixed(n >= 10485760 ? 0 : 1) + " MB";
  const kt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : Math.round(n / 1000) + "k";
  const rm = f => { try { fs.rmSync(f, { force: true }); } catch {} };
  const inUploads = f => path.join(UPLOADS, path.basename(f));

  /* every file a model row owns */
  const filesOf = d => [...new Set([d.file, d.origFile, d.liteFile].filter(Boolean))];

  /* ---- queue ---- */
  const queue = [], force = new Set();
  let running = null, total = 0, done = 0;
  const status = () => ({ total, done });
  const announce = () => broadcast({ t: "compress.progress", total, done });

  function enqueue(id, opts = {}) {
    if (!enabled) return false;
    if (id === running || queue.includes(id)) { if (opts.force) force.add(id); return true; }
    if (opts.force) force.add(id);
    queue.push(id); total++; announce();
    setImmediate(pump);
    return true;
  }

  let pumping = false;
  async function pump() {
    if (pumping) return; pumping = true;
    try {
      while (queue.length) {
        running = queue.shift();
        try { await job(running); } catch (e) { log.warn("compress: " + running + " failed: " + (e && e.message)); }
        done++; running = null; announce();
        await new Promise(r => setTimeout(r, 50));   // a breath between two models
      }
      if (total) log.log("compress: finished, " + done + " model(s) handled");
      total = 0; done = 0; announce();
    } finally { pumping = false; }
  }

  async function job(id) {
    const doc = getDoc("models", id); if (!doc) return;
    const forced = force.delete(id);
    if (doc.compressedAt && !forced) return;
    const orig = doc.origFile || doc.file;
    const inPath = inUploads(orig);
    const lite = crypto.randomBytes(8).toString("hex") + ".glb", out = path.join(UPLOADS, lite);
    const t0 = Date.now();
    const fail = msg => {
      rm(out);
      const cur = getDoc("models", id); if (!cur) return;
      const next = { ...cur, compressError: msg };
      putDoc("models", id, next); broadcast({ t: "model.updated", id, doc: modelOut(next) });
      log.warn("compress: [" + (done + 1) + "/" + total + "] " + (cur.name || id).slice(0, 40) + " - " + msg + " (the original stays)");
    };
    let res, sizeOrig;
    try { sizeOrig = fs.statSync(inPath).size; } catch { return fail("original file missing"); }
    try { res = await runWorker(inPath, out, "model"); }
    catch (e) { return fail(String(e.message || "failed").slice(0, 120)); }
    let sizeLite; try { sizeLite = fs.statSync(out).size; } catch { return fail("no output"); }
    const cur = getDoc("models", id);
    if (!cur || (cur.origFile || cur.file) !== orig) { rm(out); return; }   // deleted or replaced while we worked
    const next = { ...cur, origFile: orig, liteFile: lite, file: cur.useOrig ? orig : lite, sizeOrig, sizeLite, trisOrig: res.trisOrig, trisLite: res.trisLite, compressedAt: Date.now() };
    delete next.compressError;
    putDoc("models", id, next);
    if (cur.liteFile && cur.liteFile !== lite && cur.liteFile !== next.file) rm(inUploads(cur.liteFile));
    broadcast({ t: "model.updated", id, doc: modelOut(next) });
    log.log("compress: [" + (done + 1) + "/" + total + "] " + (cur.name || id).slice(0, 40) + ": " + mb(sizeOrig) + " / " + kt(res.trisOrig) + " tris -> " + mb(sizeLite) + " / " + kt(res.trisLite) + " tris, " + ((Date.now() - t0) / 1000).toFixed(1) + " s");
  }

  /* models that were never compressed (and did not fail): oldest first. Run once after start-up. */
  function backfill() {
    if (!enabled) return 0;
    const todo = Object.entries(collection("models")).filter(([, d]) => !d.compressedAt && !d.compressError).sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
    if (todo.length) log.log("compress: " + todo.length + " model(s) to compress");
    for (const [id] of todo) enqueue(id);
    return todo.length;
  }

  return { enabled, enqueue, backfill, status, runWorker, filesOf, idle: () => !running && !queue.length };
}

module.exports = { createCompressor };
