"use strict";
/* Child process: node compress-worker.js <in.glb> <out.glb> <model|house>. Prints one JSON line on stdout. Runs at a low priority so the web server keeps its CPU. */
const os = require("os");
try { os.setPriority(0, 15); } catch {}
const { compress } = require("./compress-core");
const [, , inp, out, mode] = process.argv;
compress(inp, out, mode === "house" ? "house" : "model")
  .then(r => { process.stdout.write(JSON.stringify(r) + "\n"); process.exit(0); })
  .catch(e => { process.stderr.write(String((e && e.message) || e).slice(0, 300) + "\n"); process.exit(1); });
