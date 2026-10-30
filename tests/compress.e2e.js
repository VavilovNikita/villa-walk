"use strict";
/* E2E: light copies of models (@gltf-transform + meshopt + sharp), the house model's lossless packing, the removal of the built-in furniture.
   Starts the main server and a training one (SANDBOX, /train) on temp data dirs with random keys (never printed).
   Run: node tests/compress.e2e.js   (needs playwright-core + a chromium) */
const path = require("path"), fs = require("fs"), os = require("os"), crypto = require("crypto"), assert = require("assert");
const { spawn } = require("child_process");
const { chromium } = require("playwright-core");
const WebSocket = require("ws");
const { buildGlb } = require("./helpers/bigglb");
const { inspectGlb } = require("./helpers/inspect");

const ROOT = path.join(__dirname, "..");
const PA = 3700 + Math.floor(Math.random() * 40) * 2, PB = PA + 1;
const A = "http://127.0.0.1:" + PA, B = "http://127.0.0.1:" + PB + "/train";
const KEY_A = crypto.randomBytes(24).toString("hex"), KEY_B = crypto.randomBytes(24).toString("hex");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "villa-comp-"));
const DATA_A = path.join(TMP, "main"), DATA_B = path.join(TMP, "train"), FILES = path.join(TMP, "files");
fs.mkdirSync(FILES);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const step = m => console.log("• " + m);
const hash = s => { let h = 5381; for (const c of s) h = ((h * 33) ^ c.codePointAt(0)) >>> 0; return h.toString(16); };
let procs = [];
const start = (port, key, data, extra) => {
  const p = spawn("node", ["server/index.js"], { cwd: ROOT, env: { ...process.env, PORT: String(port), DATA_DIR: data, EDIT_KEY: key, HOST: "127.0.0.1", COMPRESS_START_DELAY_MS: "300", ...extra }, stdio: "ignore" });
  procs.push(p); return p;
};
const stop = p => new Promise(res => { if (p.exitCode !== null) return res(); p.once("exit", res); p.kill("SIGTERM"); setTimeout(() => { p.kill("SIGKILL"); }, 5000).unref(); });
const waitUp = async base => { for (let i = 0; i < 80; i++) { try { if ((await fetch(base + "/api/health")).ok) return; } catch {} await sleep(200); } throw new Error("server did not start"); };
const state = async base => (await fetch(base + "/api/state")).json();
async function until(fn, what, ms = 150000) { const t0 = Date.now(); for (;;) { const r = await fn(); if (r) return r; if (Date.now() - t0 > ms) throw new Error("timeout: " + what); await sleep(300); } }
async function upload(base, key, file, name) {
  const fd = new FormData(); fd.append("name", name || "m"); fd.append("file", new Blob([fs.readFileSync(file)]), path.basename(file));
  const r = await fetch(base + "/api/models", { method: "POST", body: fd, headers: { "x-edit-key": key } });
  const j = await r.json(); assert.strictEqual(r.status, 200, JSON.stringify(j)); return j.id;
}
const done = (base, id) => async () => { const m = (await state(base)).models[id]; return m && (m.compressedAt || m.compressError) ? m : null; };
const uploadsOf = data => path.join(data, "uploads");

/* a tiny valid glb: a box (12 triangles) */
function boxGlb(name) {
  const P = [], I = [];
  [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].forEach((n, f) => {
    const u = n[0] ? [0, 1, 0] : [1, 0, 0], v = n[2] ? [0, 1, 0] : [0, 0, 1];
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) P.push(...[0, 1, 2].map(k => (n[k] + u[k] * a + v[k] * b) * 0.25 + (k === 1 ? 0.25 : 0)));
    I.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
  });
  const pos = Buffer.from(new Float32Array(P).buffer), idx = Buffer.from(new Uint16Array(I).buffer), bin = Buffer.concat([pos, idx]);
  const json = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name }], materials: [{ name: name + "Mat", pbrMetallicRoughness: { baseColorFactor: [0.2, 0.5, 0.8, 1] } }],
    meshes: [{ name: name + "Mesh", primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }], buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.length }, { buffer: 0, byteOffset: pos.length, byteLength: idx.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 24, type: "VEC3", min: [-.25, 0, -.25], max: [.25, .5, .25] }, { bufferView: 1, componentType: 5123, count: 36, type: "SCALAR" }] };
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const head = Buffer.alloc(12); head.write("glTF"); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.write(type, 4, "latin1"); return b; };
  return Buffer.concat([head, ch(js.length, "JSON"), js, ch(bin.length, "BIN\0"), bin]);
}
/* a file with a valid header that no tool can read */
function brokenGlb() {
  let js = Buffer.from("{ this is not json"); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const head = Buffer.alloc(12); head.write("glTF"); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length, 8);
  const ch = Buffer.alloc(8); ch.writeUInt32LE(js.length, 0); ch.write("JSON", 4, "latin1");
  return Buffer.concat([head, ch, js]);
}
const write = (name, buf) => { const f = path.join(FILES, name); fs.writeFileSync(f, buf); return f; };

(async () => {
  const srvA = start(PA, KEY_A, DATA_A), srvB = start(PB, KEY_B, DATA_B, { BASE_PATH: "/train", SANDBOX: "1" });
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const pages = [];
  try {
    await waitUp(A); await waitUp(B);

    /* ---- 1. a heavy model: 1.2M triangles, two 4096 px PNG textures ---- */
    const bigFile = path.join(FILES, "big.glb"); await buildGlb(bigFile, { tris: 1200000, tex: 4096 });
    const bigId = await upload(A, KEY_A, bigFile, "Большая");
    let m = await until(done(A, bigId), "big model compressed");
    assert(!m.compressError, "compression error: " + m.compressError);
    assert(m.trisOrig > 1100000 && m.trisLite <= 300000 && m.trisLite > 200000, `triangles ${m.trisOrig} -> ${m.trisLite}`);
    assert(m.sizeLite < m.sizeOrig / 4, `size ${m.sizeOrig} -> ${m.sizeLite}`);
    assert.strictEqual(m.sizeOrig, fs.statSync(bigFile).size);
    assert.strictEqual(m.file, m.liteFile); assert(/^[a-f0-9]{16}\.glb$/.test(m.file) && /^[a-f0-9]{16}\.orig\.glb$/.test(m.origFile), m.file + " / " + m.origFile);
    assert(fs.readFileSync(path.join(uploadsOf(DATA_A), m.origFile)).equals(fs.readFileSync(bigFile)), "the original is kept byte for byte");
    const info = await inspectGlb(path.join(uploadsOf(DATA_A), m.liteFile));
    assert(info.textures.length === 2 && info.textures.every(t => t.size[0] === 2048 && t.size[1] === 2048 && t.mime === "image/webp"), JSON.stringify(info.textures));
    assert(info.extensions.includes("EXT_meshopt_compression"));
    assert.strictEqual(info.tris, m.trisLite);
    const hd = await fetch(A + "/uploads/" + m.file, { method: "HEAD" });
    assert.strictEqual(hd.headers.get("cache-control"), "public, max-age=31536000, immutable");
    step(`heavy model: ${(m.sizeOrig / 1048576).toFixed(1)} MB / ${m.trisOrig} tris -> ${(m.sizeLite / 1048576).toFixed(1)} MB / ${m.trisLite} tris (x${(m.sizeOrig / m.sizeLite).toFixed(1)}), textures 2048 WebP, original kept`);

    /* ---- 2. a small model is packed, not simplified; a broken file keeps its original, the queue goes on ---- */
    const brokenId = await upload(A, KEY_A, write("broken.glb", brokenGlb()), "Сломанная");
    const smallId = await upload(A, KEY_A, write("box.glb", boxGlb("Box")), "Коробка");
    const small = await until(done(A, smallId), "small model compressed");
    assert.strictEqual(small.trisOrig, 12); assert.strictEqual(small.trisLite, 12, "no simplification below 300k");
    const bad = await until(done(A, brokenId), "broken model handled");
    assert(bad.compressError && !bad.compressedAt && bad.file === bad.origFile && !bad.liteFile, JSON.stringify(bad));
    assert(fs.existsSync(path.join(uploadsOf(DATA_A), bad.file)));
    step("small model: 12 -> 12 triangles; broken file: original kept, error marked, next model still compressed");

    /* ---- 3. two participants: both open the compressed model; the editor's info window, the original switch, recompress ---- */
    const mk = async (name, base, key) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage(); pages.push(page);
      page.logs = []; page.reqs = [];
      page.on("console", x => page.logs.push(x.text())); page.on("pageerror", e => page.logs.push("PAGEERROR " + e.message));
      page.on("request", r => page.reqs.push(r.url()));
      page.on("dialog", d => { page.logs.push("PAGEERROR native dialog"); d.dismiss(); });
      const pre = new URL(base).pathname.replace(/\/$/, "");
      await page.addInitScript(p => localStorage.setItem("villa.profile", p), JSON.stringify({ uid: name + "uidxxxxxx", name, color: "#2f6f62" }));
      await page.goto(base + "/" + (key ? "?k=" + key : ""));
      await page.waitForFunction(() => window.__villa && window.__villa().shownV && !document.getElementById("loading"), null, { timeout: 90000 });
      return page;
    };
    const editor = await mk("editor", A, KEY_A), viewer = await mk("viewer", A, null);
    assert(!editor.reqs.some(u => /builtin\.js/.test(u)) && !viewer.reqs.some(u => /builtin\.js/.test(u)), "a scene without built-in furniture never loads its code");
    await editor.evaluate(id => Sync.commitItem("bigitem0001", { type: "model", model: id, x: 3, y: 0, z: 2, r: 0, s: 1, by: "editor", at: Date.now() }), bigId);
    for (const p of [editor, viewer]) {
      await p.waitForFunction(() => window.__villaItem("bigitem0001"), null, { timeout: 20000 });
      const tris = await p.evaluate(id => window.__villaModelTris(id), bigId);
      assert(tris > 200000 && tris <= 300000, "the compressed model is in the scene for both: " + tris + " tris");
    }
    step("both participants load the compressed model through the meshopt decoder");

    await editor.click("#tUp");
    await editor.locator("#libList .card:not(.fcard)", { hasText: "Большая" }).locator(".card-i").click();
    await editor.waitForSelector("#pv .pv-comp");
    await until(async () => /Было .* → стало /.test(await editor.locator("#pv .pv-comp").textContent()), "text 'was -> now'", 20000);
    const txt = await editor.locator("#pv .pv-comp").textContent();
    assert(/Было \d+(,\d)? МБ \/ 1,2 млн треугольников → стало \d+(,\d)? МБ \/ 29\d тыс\. треугольников/.test(txt), txt);
    step("info window: «" + txt + "»");

    /* the switch: the original instead of the compressed copy */
    const before = (await state(A)).models[bigId];
    await editor.check("#pvUseOrig");
    m = await until(async () => { const x = (await state(A)).models[bigId]; return x.useOrig && x; }, "useOrig on");
    assert.strictEqual(m.file, before.origFile);
    await viewer.waitForFunction(id => window.__villaModelTris(id).then(t => t > 1100000), bigId, { timeout: 90000 });
    await editor.uncheck("#pvUseOrig");
    m = await until(async () => { const x = (await state(A)).models[bigId]; return !x.useOrig && x; }, "useOrig off");
    assert.strictEqual(m.file, before.liteFile);
    await viewer.waitForFunction(id => window.__villaModelTris(id).then(t => t <= 300000), bigId, { timeout: 90000 });
    step("«give the original» switch works for both participants, and back");

    /* recompress */
    await editor.click("#pvRecomp");
    m = await until(async () => { const x = (await state(A)).models[bigId]; return x.compressedAt > before.compressedAt && x; }, "recompressed");
    assert(m.liteFile !== before.liteFile && m.file === m.liteFile && m.trisLite <= 300000);
    assert(!fs.existsSync(path.join(uploadsOf(DATA_A), before.liteFile)), "the previous light copy is gone");
    assert(fs.existsSync(path.join(uploadsOf(DATA_A), m.origFile)));
    step("«Пережать заново» makes a new light copy (new file name), the old one is removed");
    await editor.keyboard.press("Escape");

    /* a viewer cannot use the new endpoints */
    assert.strictEqual((await fetch(`${A}/api/models/${bigId}/recompress`, { method: "POST" })).status, 403);
    assert.strictEqual((await fetch(`${A}/api/models/${bigId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: '{"useOrig":true}' })).status, 403);

    /* ---- 4. a model stored before this feature: compressed after a restart; a second restart leaves it alone ---- */
    const legacyId = await upload(A, KEY_A, write("legacy.glb", boxGlb("Legacy")), "Старая");
    await until(done(A, legacyId), "legacy source compressed once");
    await stop(srvA);
    const Database = require("better-sqlite3"); const db = new Database(path.join(DATA_A, "villa.db"));
    const row = db.prepare("SELECT data FROM docs WHERE coll='models' AND id=?").get(legacyId), doc = JSON.parse(row.data), up = uploadsOf(DATA_A);
    const legacyFile = crypto.randomBytes(8).toString("hex") + ".glb";
    fs.renameSync(path.join(up, doc.origFile), path.join(up, legacyFile)); fs.rmSync(path.join(up, doc.liteFile), { force: true });
    for (const k of ["origFile", "liteFile", "sizeOrig", "sizeLite", "trisOrig", "trisLite", "compressedAt", "compressError", "useOrig"]) delete doc[k];
    doc.file = legacyFile; db.prepare("UPDATE docs SET data=? WHERE coll='models' AND id=?").run(JSON.stringify(doc), legacyId); db.close();
    const legacyBytes = fs.readFileSync(path.join(up, legacyFile));
    const srvA2 = start(PA, KEY_A, DATA_A); await waitUp(A);
    m = await until(done(A, legacyId), "legacy model compressed after restart");
    assert(m.compressedAt && m.origFile === legacyFile && m.file === m.liteFile && m.liteFile !== legacyFile, JSON.stringify(m));
    assert(fs.readFileSync(path.join(up, legacyFile)).equals(legacyBytes), "legacy original untouched, kept under its old name");
    await until(async () => (await state(A)).compress.total === 0, "queue idle");
    const stamp = JSON.stringify(Object.fromEntries(Object.entries((await state(A)).models).map(([k, v]) => [k, [v.compressedAt, v.liteFile, v.file]])));
    const lites = fs.readdirSync(up).sort().join();
    await stop(srvA2);
    const srvA3 = start(PA, KEY_A, DATA_A); await waitUp(A); await sleep(4000);
    const st3 = await state(A);
    assert.strictEqual(JSON.stringify(Object.fromEntries(Object.entries(st3.models).map(([k, v]) => [k, [v.compressedAt, v.liteFile, v.file]]))), stamp, "a second start touches nothing that is already compressed");
    assert.strictEqual(fs.readdirSync(up).sort().join(), lites); assert.strictEqual(st3.compress.total, 0);
    step("old model without compressedAt compressed after a restart (original kept under its old name); the next restart skips everything");
    procs.push(srvA3);
    for (const p of pages) await p.close().catch(() => {});

    /* ---- 5. the house model: lossless, names kept, the upload kept, colours and textures apply ---- */
    const houseFile = path.join(FILES, "house.glb"); await buildGlb(houseFile, { tris: 350000, tex: 512, name: "Hall" });
    const houseBefore = await inspectGlb(houseFile);
    const e2 = await mk("editor", A, KEY_A), v2 = await mk("viewer", A, null);
    const fd = new FormData(); fd.append("file", new Blob([fs.readFileSync(houseFile)]), "house.glb");
    const hr = await fetch(A + "/api/house", { method: "POST", body: fd, headers: { "x-edit-key": KEY_A } }); const hj = await hr.json();
    assert.strictEqual(hr.status, 200, JSON.stringify(hj)); assert(hj.compressed && hj.sizeLite < hj.sizeOrig, JSON.stringify(hj));
    const mdl = path.join(DATA_A, "models");
    const houseAfter = await inspectGlb(path.join(mdl, "villa.glb"));
    assert.deepStrictEqual(houseAfter.meshes, houseBefore.meshes); assert.deepStrictEqual(houseAfter.materials, houseBefore.materials); assert.deepStrictEqual(houseAfter.nodes, houseBefore.nodes);
    assert.strictEqual(houseAfter.tris, houseBefore.tris, "no simplification of the house");
    assert(houseAfter.extensions.includes("EXT_meshopt_compression") && !houseAfter.extensions.includes("KHR_mesh_quantization"), JSON.stringify(houseAfter.extensions));
    assert(fs.readFileSync(path.join(mdl, "villa.orig.glb")).equals(fs.readFileSync(houseFile)), "the upload is kept as villa.orig.glb");
    step(`house: ${(hj.sizeOrig / 1048576).toFixed(1)} MB -> ${(hj.sizeLite / 1048576).toFixed(1)} MB, ${houseAfter.tris} triangles unchanged, mesh / material / node names identical`);
    for (const p of [e2, v2]) await p.waitForFunction(v => window.__villa().shownV === v && !document.getElementById("loading"), hj.v, { timeout: 90000 });
    const hexName = houseBefore.materials[0];
    await e2.evaluate(([id, name]) => { Sync.setPaint(id, { name, color: "#ff0000", finish: null }); }, ["m" + hash(hexName), hexName]);
    await v2.waitForFunction(n => { const h = window.__villa().colors[n]; return !!h && parseInt(h.slice(1, 3), 16) > 250 && parseInt(h.slice(3, 5), 16) < 6 && parseInt(h.slice(5, 7), 16) < 6; }, hexName, { timeout: 20000 });
    await e2.evaluate(([id, name]) => { Sync.setPaint(id, { name, color: "#ff0000", finish: null, tex: { builtin: "tile600", rot: 0, offMm: [0, 0], tint: null } }); }, ["m" + hash(hexName), hexName]);
    await v2.waitForFunction(() => window.__villaTex().meshes.some(x => x.tex), null, { timeout: 20000 });
    const tm = await v2.evaluate(() => window.__villaTex().meshes.map(x => x.name + "|" + x.mat));
    assert(tm.some(x => x.includes(houseBefore.materials[0])), JSON.stringify(tm));
    step("on the compressed house the colour and the texture of a material apply for the other participant");
    /* restore from history keeps working with the original next to it */
    const hist = (await (await fetch(A + "/api/house", { headers: { "x-edit-key": KEY_A } })).json()).history;
    assert(hist.length >= 1);

    /* ---- 6. no built-in furniture offered; standing ones are drawn, removed by one button, Ctrl+Z brings them back ---- */
    assert.strictEqual(await e2.locator("#tBase").count(), 0, "no 'Базовая' tab");
    const addList = await e2.evaluate(() => window.__villaAddList()), nModels = Object.keys((await state(A)).models).length;
    assert(addList.length === nModels && addList.every(t => t === "model"), "the E tool offers uploaded models only: " + addList.join());
    assert.strictEqual(await e2.locator("#bDelBuiltin").count(), 0);
    assert(!e2.reqs.some(u => /builtin\.js/.test(u)));
    const bot = await new Promise((res, rej) => { const ws = new WebSocket("ws://127.0.0.1:" + PA + "/ws"); ws.on("open", () => ws.send(JSON.stringify({ t: "hello", name: "bot", uid: "botuidxxxxx", key: KEY_A }))); ws.on("message", d => { if (JSON.parse(d).t === "welcome") res(ws); }); ws.on("error", rej); });
    const mkItem = (key, x) => ({ type: "builtin", key, x, y: 0, z: 1, r: 0, s: 1 });
    bot.send(JSON.stringify({ t: "item.set", id: "builtinaa01", doc: mkItem("sofa", 1) }));
    bot.send(JSON.stringify({ t: "item.set", id: "builtinaa02", doc: mkItem("bed160", 2) }));
    bot.send(JSON.stringify({ t: "item.set", id: "builtinaa03", doc: mkItem("lamp", 3) }));
    await e2.waitForFunction(() => window.__villaBuiltinLoaded() && window.__villaItem("builtinaa03"), null, { timeout: 20000 });
    await v2.waitForFunction(() => window.__villaBuiltinLoaded() && window.__villaItem("builtinaa03"), null, { timeout: 20000 });
    assert(e2.reqs.some(u => /\/builtin\.js/.test(u)), "the code is fetched once such an item exists");
    await e2.waitForSelector("#bDelBuiltin");
    assert.match(await e2.locator("#bDelBuiltin").textContent(), /Удалить базовые предметы из сцены \(3 шт\.\)/);
    assert.strictEqual(await v2.locator("#bDelBuiltin").count(), 0, "the viewer has no button");
    const modelsInScene = (await e2.evaluate(() => window.__villa().items)) - 3;
    await e2.click("#bDelBuiltin");
    await e2.waitForSelector(".pv-dlg");
    await e2.click(".pv-dlg >> text=Отмена"); assert.strictEqual(await e2.evaluate(() => window.__villa().items), modelsInScene + 3, "cancel removes nothing");
    await e2.click("#bDelBuiltin"); await e2.click(".pv-dlg button.danger");
    await e2.waitForFunction(n => window.__villa().items === n, modelsInScene, { timeout: 10000 });
    await v2.waitForFunction(n => window.__villa().items === n, modelsInScene, { timeout: 10000 });
    assert.strictEqual(await e2.locator("#bDelBuiltin").count(), 0);
    assert.strictEqual(Object.keys((await state(A)).items).length, modelsInScene, "only the built-in ones were removed");
    await e2.locator("#stage canvas").focus(); await e2.keyboard.press("Control+z");
    await e2.waitForFunction(n => window.__villa().items === n + 3, modelsInScene, { timeout: 10000 });
    await v2.waitForFunction(n => window.__villa().items === n + 3, modelsInScene, { timeout: 10000 });
    step("no base tab / E-tool entries; standing built-in items are drawn; the button removes only them in one step; Ctrl+Z brings them back");
    bot.close();

    /* ---- 7. the training environment is separate ---- */
    const trainId = await upload(B, KEY_B, write("train.glb", boxGlb("Train")), "Тренировочная");
    const tm2 = await until(done(B, trainId), "train model compressed");
    assert(tm2.compressedAt && fs.existsSync(path.join(uploadsOf(DATA_B), tm2.origFile)) && fs.existsSync(path.join(uploadsOf(DATA_B), tm2.liteFile)));
    const mainState = await state(A), trainState = await state(B);
    assert(!(trainId in mainState.models) && !(bigId in trainState.models) && Object.keys(trainState.models).length === 1);
    assert(!fs.existsSync(path.join(uploadsOf(DATA_A), tm2.origFile)) && !fs.existsSync(path.join(uploadsOf(DATA_B), m.origFile)));
    step("/train compresses its own models in its own files; the main environment is untouched");

    for (const p of [e2, v2]) { const bad = p.logs.filter(l => /PAGEERROR/.test(l)); assert.deepStrictEqual(bad, [], "page errors: " + bad.join(" | ")); }
    console.log("ALL OK");
  } catch (e) {
    console.error("FAIL:", e);
    for (const p of pages) if (p.logs && p.logs.length) console.error("page log:", p.logs.slice(-8).join(" || ").slice(0, 600));
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    for (const p of procs) p.kill("SIGKILL");
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
    process.exit(process.exitCode || 0);
  }
})();
