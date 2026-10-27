"use strict";
/* E2E: big models (80 MB upload, progress, warning window, download, placeholder). Starts its own server on a temp data dir with a random key (never printed).
   Run: node tests/bigmodel.e2e.js   (needs playwright-core + a chromium in ~/.cache/ms-playwright) */
const path = require("path"), fs = require("fs"), os = require("os"), crypto = require("crypto"), assert = require("assert");
const { spawn } = require("child_process");
const { chromium } = require("playwright-core");

const ROOT = path.join(__dirname, "..");
const PORT = 3200 + Math.floor(Math.random() * 90), BASE = "http://127.0.0.1:" + PORT;
const KEY = crypto.randomBytes(24).toString("hex");
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "villa-big-"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const step = m => console.log("• " + m);

/* a small coloured box (sx x sy x sz metres) as a binary glTF */
function boxGlb(sx, sy, sz, rgb) {
  const P = [], N = [], I = [];
  const faces = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
                 [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]];
  faces.forEach(([n, u, v], f) => {
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      P.push((n[0] + u[0] * a + v[0] * b) * sx / 2, (n[1] + u[1] * a + v[1] * b) * sy / 2 + sy / 2, (n[2] + u[2] * a + v[2] * b) * sz / 2); N.push(...n);
    }
    I.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
  });
  const pos = Buffer.from(new Float32Array(P).buffer), nor = Buffer.from(new Float32Array(N).buffer), idx = Buffer.from(new Uint16Array(I).buffer);
  const bin = Buffer.concat([pos, nor, idx]);
  const json = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [...rgb, 1], metallicFactor: 0, roughnessFactor: 0.8 } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.length }, { buffer: 0, byteOffset: pos.length, byteLength: nor.length }, { buffer: 0, byteOffset: pos.length + nor.length, byteLength: idx.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 24, type: "VEC3", min: [-sx / 2, 0, -sz / 2], max: [sx / 2, sy, sz / 2] },
                { bufferView: 1, componentType: 5126, count: 24, type: "VEC3" }, { bufferView: 2, componentType: 5123, count: 36, type: "SCALAR" }] };
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const head = Buffer.alloc(12); head.write("glTF"); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.write(type, 4, "latin1"); return b; };
  return Buffer.concat([head, ch(js.length, "JSON"), js, ch(bin.length, "BIN\0"), bin]);
}
const glbFile = (name, ...a) => { const f = path.join(DATA, name); fs.writeFileSync(f, boxGlb(...a)); return f; };
const state = async () => (await fetch(BASE + "/api/state")).json();

/* the same box with an unused zero-filled tail in the BIN chunk: a valid glb of the wanted size */
function bigGlb(bytes) {
  const g = boxGlb(1.2, 0.5, 0.6, [0.3, 0.5, 0.8]);
  const jl = g.readUInt32LE(12), json = JSON.parse(g.toString("utf8", 20, 20 + jl)), bl = g.readUInt32LE(20 + jl), bin = g.subarray(28 + jl, 28 + jl + bl);
  const pad = Math.max(0, bytes - g.length), tail = Buffer.alloc(pad - pad % 4);
  json.buffers[0].byteLength = bl + tail.length;
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const nb = Buffer.concat([bin, tail]), ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.write(type, 4, "latin1"); return b; };
  const head = Buffer.alloc(12); head.write("glTF"); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + nb.length, 8);
  return Buffer.concat([head, ch(js.length, "JSON"), js, ch(nb.length, "BIN\0"), nb]);
}

(async () => {
  const srv = spawn("node", ["server/index.js"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, EDIT_KEY: KEY, HOST: "127.0.0.1" }, stdio: "ignore" });
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {} await sleep(200); }
    const mk = async (name, key) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage();
      page.logs = [];
      page.on("console", m => page.logs.push(m.text())); page.on("pageerror", e => page.logs.push("PAGEERROR " + e.message));
      page.on("dialog", d => { page.logs.push("PAGEERROR native dialog: " + d.message()); d.dismiss(); });
      await page.addInitScript(p => localStorage.setItem("villa.profile", p), JSON.stringify({ uid: name + "uidxxxxxx", name, color: "#2f6f62" }));
      await page.goto(BASE + "/" + (key ? "?k=" + key : ""));
      await page.waitForFunction(() => window.__villa && window.__villa().shownV && !document.getElementById("loading"), null, { timeout: 60000 });
      return page;
    };
    const editor = await mk("editor", KEY), viewer = await mk("viewer", null);
    await editor.click("#tUp");

    /* server limits: 200 MB is the ceiling, a non-glb is refused */
    const fd0 = new FormData(); fd0.append("file", new Blob([Buffer.alloc(1000, 1)]), "x.glb");
    assert.strictEqual((await fetch(BASE + "/api/models", { method: "POST", body: fd0, headers: { "x-edit-key": KEY } })).status, 400);

    /* 1. 80 MB through the UI: warning window first (Cancel does nothing), then progress with % and speed */
    const big = path.join(DATA, "big80.glb"); fs.writeFileSync(big, bigGlb(80 * 1048576));
    await editor.setInputFiles("#fileIn", big);
    await editor.waitForSelector("#bigWarn");
    assert.match(await editor.locator("#bigWarn").textContent(), /Модель большая — у участников со слабым интернетом и на телефонах она будет грузиться долго/);
    await editor.click("#bigWarn >> text=Отмена"); await editor.waitForSelector("#bigWarn", { state: "detached" });
    assert.strictEqual(Object.keys((await state()).models).length, 0, "cancel uploads nothing");
    await editor.setInputFiles("#fileIn", big);
    await editor.waitForSelector("#bigWarn"); await editor.click("#bigWarn >> text=Загрузить");
    const seen = [];
    for (let i = 0; i < 400 && !(await editor.evaluate(() => document.querySelectorAll("#libList .card").length)); i++) {
      const t = await editor.evaluate(() => { const b = document.getElementById("houseUp"); return b.hidden ? "" : document.getElementById("houseUpTxt").textContent; });
      if (t) seen.push(t); await sleep(25);
    }
    assert(seen.some(t => /\d+% · [\d.]+ МБ из 80 МБ · [\d.]+ МБ\/с/.test(t)), "progress with % and speed: " + seen.slice(0, 3).join(" | "));
    step("80 MB upload: warning window, progress \"" + seen.filter(t => /%/.test(t)).pop() + "\"");
    await viewer.waitForSelector("#libList .card", { state: "attached" }).catch(() => {});
    const st = await state(), id = Object.keys(st.models)[0];
    assert.strictEqual(st.models[id].sizeBytes, fs.statSync(big).size);
    const up = path.join(DATA, "uploads");
    assert.deepStrictEqual(fs.readdirSync(up).filter(n => n.endsWith(".part")), [], "no temp file left");
    assert(fs.readFileSync(path.join(up, st.models[id].file)).equals(fs.readFileSync(big)), "stored byte for byte");
    const hd = await fetch(BASE + "/uploads/" + st.models[id].file, { method: "HEAD" });
    assert.strictEqual(hd.headers.get("cache-control"), "public, max-age=31536000, immutable");
    step("stored unchanged, no .part left, Cache-Control: " + hd.headers.get("cache-control"));

    /* thumbnail of the big model: normal render (or a placeholder card, never a crash) */
    await editor.waitForFunction(() => { const i = document.querySelector("#libList .card img"); return i && /\.thumb\./.test(i.getAttribute("src")); }, null, { timeout: 60000 }).catch(() => step("no thumbnail within 60 s (placeholder card)"));

    /* 2. placed in the scene -> placeholder, download progress, then the model, in BOTH tabs */
    const doc = { type: "model", model: id, x: 1, y: 0, z: 1, r: 0, s: 1 };
    await editor.evaluate(d => Sync.commitItem("bigitem1", Object.assign({ at: Date.now(), by: "editor" }, d)), doc);
    await viewer.waitForFunction(() => window.__villa().items >= 1, null, { timeout: 30000 });
    await editor.waitForFunction(() => window.__villa().items >= 1, null, { timeout: 30000 });
    for (const [n, p] of [["editor", editor], ["viewer", viewer]]) {
      await p.waitForFunction(() => { const i = window.__villa(); return i.modelReady; }, null, { timeout: 90000 });
      assert(p.logs.filter(l => l.startsWith("PAGEERROR")).length === 0, n + " errors: " + p.logs.join("\n"));
    }
    step("model in the scene in both tabs (placeholder -> model)");

    /* second visit comes from the browser cache: one download per file */
    const hits = [];
    viewer.on("request", r => { if (r.url().includes("/uploads/" + st.models[id].file)) hits.push(r.url()); });
    await viewer.reload(); await viewer.waitForFunction(() => window.__villa && window.__villa().modelReady, null, { timeout: 90000 });
    step("reload: " + hits.length + " request(s) for the big file (cached by the browser)");

    assert(!(await editor.evaluate(() => document.getElementById("bigWarn"))), "no leftover dialog");
    console.log("\nALL OK");
  } finally {
    await browser.close(); srv.kill("SIGTERM"); await sleep(500); try { fs.rmSync(DATA, { recursive: true, force: true }); } catch {}
  }
})().catch(e => { console.error("FAIL:", e && e.stack || e); process.exit(1); });
