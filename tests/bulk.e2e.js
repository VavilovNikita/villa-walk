"use strict";
/* E2E: bulk upload of models - a drop of many files, a folder, a .zip, the queue (pause / cancel / retry / duplicates / reload), the server limits.
   Starts the main server and a training one (SANDBOX, /train) on temp data dirs with random keys (never printed).
   Run: node tests/bulk.e2e.js   (needs playwright-core + a chromium) */
const path = require("path"), fs = require("fs"), os = require("os"), crypto = require("crypto"), assert = require("assert"), http = require("http"), zlib = require("zlib");
const { spawn } = require("child_process");
const { chromium } = require("playwright-core");

const ROOT = path.join(__dirname, "..");
const PA = 3400 + Math.floor(Math.random() * 40) * 2, PB = PA + 1;
const KEY_A = crypto.randomBytes(24).toString("hex"), KEY_B = crypto.randomBytes(24).toString("hex");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "villa-bulk-"));
const DATA_A = path.join(TMP, "main"), DATA_B = path.join(TMP, "train"), FILES = path.join(TMP, "files");
fs.mkdirSync(FILES);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const step = m => console.log("• " + m);
const servers = [];
const start = (port, key, data, extra) => { const p = spawn("node", ["server/index.js"], { cwd: ROOT, env: { ...process.env, PORT: String(port), DATA_DIR: data, EDIT_KEY: key, HOST: "127.0.0.1", ...extra }, stdio: "ignore" }); servers.push(p); return p; };

/* a small coloured box as a binary glTF; padTo makes the file that big (a BIN chunk of zeros) */
function boxJson(sx, sy, sz, rgb, uri) {
  return { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [...rgb, 1], metallicFactor: 0, roughnessFactor: 0.8 } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }] };
}
function boxParts(sx, sy, sz, rgb) {
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
  const json = { ...boxJson(sx, sy, sz, rgb),
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.length }, { buffer: 0, byteOffset: pos.length, byteLength: nor.length }, { buffer: 0, byteOffset: pos.length + nor.length, byteLength: idx.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 24, type: "VEC3", min: [-sx / 2, 0, -sz / 2], max: [sx / 2, sy, sz / 2] },
                { bufferView: 1, componentType: 5126, count: 24, type: "VEC3" }, { bufferView: 2, componentType: 5123, count: 36, type: "SCALAR" }] };
  return { json, bin };
}
function boxGlb(sx, sy, sz, rgb, padTo) {
  const { json, bin: bin0 } = boxParts(sx, sy, sz, rgb);
  let bin = bin0;
  if (padTo) bin = Buffer.concat([bin0, Buffer.alloc(Math.max(0, padTo - bin0.length - 400))]);
  json.buffers = [{ byteLength: bin.length }];
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const pad = Buffer.alloc((4 - bin.length % 4) % 4); bin = Buffer.concat([bin, pad]); json.buffers[0].byteLength = bin.length;
  js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const head = Buffer.alloc(12); head.write("glTF"); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.write(type, 4, "latin1"); return b; };
  return Buffer.concat([head, ch(js.length, "JSON"), js, ch(bin.length, "BIN\0"), bin]);
}
/* the same box as .gltf + .bin (external buffer) */
function boxGltf(sx, sy, sz, rgb, binName) {
  const { json, bin } = boxParts(sx, sy, sz, rgb); json.buffers = [{ byteLength: bin.length, uri: binName }];
  return { gltf: Buffer.from(JSON.stringify(json)), bin };
}
/* a .zip writer (stored or deflated) */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function makeZip(entries) {
  const locals = [], central = []; let off = 0;
  for (const [name, data, deflate] of entries) {
    const nm = Buffer.from(name, "utf8"), comp = deflate ? zlib.deflateRawSync(data) : data, crc = crc32(data);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(0x800, 6); l.writeUInt16LE(deflate ? 8 : 0, 8); l.writeUInt32LE(crc, 14); l.writeUInt32LE(comp.length, 18); l.writeUInt32LE(data.length, 22); l.writeUInt16LE(nm.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(deflate ? 8 : 0, 10); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    locals.push(l, nm, comp); central.push(c, nm); off += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(entries.length, 8); e.writeUInt16LE(entries.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, e]);
}
const put = (rel, buf) => { const f = path.join(FILES, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); return f; };
const colors = [[.8, .2, .2], [.2, .7, .3], [.2, .3, .8], [.9, .8, .2], [.7, .3, .7], [.3, .8, .8], [.6, .6, .6], [.9, .5, .2], [.4, .2, .1], [.1, .5, .5]];

const MODELS_URL = /\/api\/models(\?.*)?$/;   // POST /api/models and /api/models?preview=1
const stateOf = async (port, prefix = "") => (await fetch(`http://127.0.0.1:${port}${prefix}/api/state`)).json();
async function raw(port, prefix, method, p, key, body, headers) {
  const r = await fetch(`http://127.0.0.1:${port}${prefix}${p}`, { method, body, headers: { ...(key ? { "x-edit-key": key } : {}), ...headers } });
  return { status: r.status, headers: r.headers, body: await r.json().catch(() => ({})) };
}

(async () => {
  start(PA, KEY_A, DATA_A, {});
  start(PB, KEY_B, DATA_B, { BASE_PATH: "/train", SANDBOX: "1", SANDBOX_SEED_HOUSE: path.join(ROOT, "seed", "villa.glb") });
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  try {
    for (const [p, pre] of [[PA, ""], [PB, "/train"]]) for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${p}${pre}/api/health`)).ok) break; } catch {} await sleep(200); }

    const mk = async (name, port, prefix, key) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage();
      page.logs = []; page.setDefaultTimeout(60000);
      page.on("console", m => page.logs.push(m.text())); page.on("pageerror", e => page.logs.push("PAGEERROR " + e.message));
      page.on("dialog", d => { page.logs.push("DIALOG " + d.type()); d.accept(); });
      await page.addInitScript(([k, p]) => localStorage.setItem(k, p), [prefix ? "train:villa.profile" : "villa.profile", JSON.stringify({ uid: name + "uidxxxxxx", name, color: "#2f6f62" })]);
      await page.goto(`http://127.0.0.1:${port}${prefix}/` + (key ? "?k=" + key : ""));
      await page.waitForFunction(() => window.__villa && window.__villa().shownV && !document.getElementById("loading"), null, { timeout: 90000 });
      return page;
    };
    const rows = page => page.evaluate(() => window.__villaUpq().items);
    const waitIdle = (page, ms = 120000) => page.waitForFunction(() => { const u = window.__villaUpq(); return u.items.length && u.items.every(i => ["done", "error", "skipped", "cancelled"].includes(i.status)); }, null, { timeout: ms });
    const statusOf = async (page, name) => (await rows(page)).find(r => r.name === name);
    const openUp = async page => { await page.click("#tUp"); };

    const editor = await mk("editor", PA, "", KEY_A), viewer = await mk("viewer", PA, "", null);
    await openUp(editor); await openUp(viewer);
    /* the viewer records how the number of cards in the library grows */
    await viewer.evaluate(() => { window.__counts = []; const L = document.getElementById("libList"); new MutationObserver(() => { const n = L.querySelectorAll(".card:not(.fcard)").length; const c = window.__counts; if (c[c.length - 1] !== n) c.push(n); }).observe(L, { childList: true, subtree: true }); });

    /* ---- 1. ten files dropped at once ---- */
    const ten = colors.map((c, i) => put(`ten/Модель ${i + 1}.glb`, boxGlb(0.5 + i * 0.05, 0.6, 0.4, c)));
    await editor.evaluate(async files => {
      const dt = new DataTransfer(); for (const f of files) dt.items.add(new File([new Uint8Array(f.bytes)], f.name));
      window.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true, cancelable: true }));
      window.__zoneShown = !document.getElementById("upDrop").hidden;
      window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, ten.map(f => ({ name: path.basename(f), bytes: [...fs.readFileSync(f)] })));
    assert(await editor.evaluate(() => window.__zoneShown), "drop zone lit up");
    await waitIdle(editor);
    assert.strictEqual((await rows(editor)).filter(r => r.status === "done").length, 10, JSON.stringify(await rows(editor)));
    let st = await stateOf(PA);
    assert.strictEqual(Object.keys(st.models).length, 10);
    assert(Object.values(st.models).every(m => m.thumb && m.dims), "every model has a thumbnail and its size");
    assert(Object.values(st.models).every(m => !m.thumbBy), "nobody waits for a thumbnail any more");
    const counts = await viewer.evaluate(() => window.__counts);
    assert(counts.filter(n => n > 0 && n < 10).length >= 1 && counts[counts.length - 1] === 10, "the second tab saw the models arrive one after another: " + counts);
    assert(await editor.isHidden("#upDrop"));
    step("10 files dropped: all uploaded with thumbnails; the viewer's list grew " + counts.join("→"));

    /* ---- 2. a folder with sub-folders; an existing folder is reused ---- */
    put("tree/Санузел/Раковины/раковина.glb", boxGlb(0.6, 0.2, 0.4, colors[0]));
    put("tree/Санузел/Раковины/Малые/мойка.glb", boxGlb(0.4, 0.2, 0.3, colors[1]));
    put("tree/Санузел/унитаз.glb", boxGlb(0.4, 0.4, 0.6, colors[2]));
    put("tree/Санузел/readme.txt", Buffer.from("x"));
    const foldersBefore = Object.keys((await stateOf(PA)).folders).length;
    await editor.setInputFiles("#upDir", path.join(FILES, "tree", "Санузел"));
    await waitIdle(editor);
    let rs = await rows(editor);
    assert.strictEqual(rs.filter(r => r.status === "done").length, 10 + 3, JSON.stringify(rs));
    assert(rs.some(r => r.name === "readme.txt" && r.status === "skipped"), "a non-model is marked as skipped");
    st = await stateOf(PA);
    const fl = Object.entries(st.folders), byName = n => fl.filter(([, f]) => f.name === n);
    assert.strictEqual(byName("Санузел").length, 1, "the starter folder Санузел is reused, not duplicated");
    assert.strictEqual(byName("Раковины").length, 1); assert.strictEqual(byName("Малые").length, 1);
    assert.strictEqual(byName("Раковины")[0][1].parent, byName("Санузел")[0][0]);
    assert.strictEqual(byName("Малые")[0][1].parent, byName("Раковины")[0][0]);
    assert.strictEqual(Object.keys(st.folders).length, foldersBefore + 2);
    const inFolder = n => Object.values(st.models).filter(m => m.folder === byName(n)[0][0]).map(m => m.name).sort();
    assert.deepStrictEqual(inFolder("Санузел"), ["унитаз"]); assert.deepStrictEqual(inFolder("Раковины"), ["раковина"]); assert.deepStrictEqual(inFolder("Малые"), ["мойка"]);
    step("folder tree reproduced inside the library, the existing 'Санузел' reused");

    /* ---- 3. duplicates: ask once for the whole queue ---- */
    const again = [put("tree/Санузел/Раковины/раковина.glb", boxGlb(0.6, 0.2, 0.4, colors[0])), put("tree/Санузел/унитаз.glb", boxGlb(0.4, 0.4, 0.6, colors[2]))];
    await editor.click("#bUpload"); // just to make sure the button exists; the chooser is not used
    await editor.setInputFiles("#upDir", path.join(FILES, "tree", "Санузел"));
    await editor.waitForSelector(".pv-dlg");
    assert.match(await editor.textContent(".pv-dlg h2"), /уже есть/);
    await editor.click(".pv-dlg >> text=Пропустить дубликаты");
    await waitIdle(editor);
    rs = await rows(editor); st = await stateOf(PA);
    assert.strictEqual(Object.keys(st.models).length, 13, "skip: nothing new");
    assert(rs.filter(r => r.status === "skipped" && /уже есть/.test(r.err)).length >= 3);
    /* copies */
    await editor.setInputFiles("#upFiles", [ten[0]]);
    await editor.waitForSelector(".pv-dlg"); await editor.click(".pv-dlg >> text=Загрузить копии");
    await waitIdle(editor); st = await stateOf(PA);
    assert.strictEqual(Object.keys(st.models).length, 14, "copy: one more");
    /* replace keeps the id */
    const before = Object.entries(st.models).find(([, m]) => m.name === "Модель 2");
    await editor.setInputFiles("#upFiles", [ten[1]]);
    await editor.waitForSelector(".pv-dlg"); await editor.click(".pv-dlg >> text=Заменить");
    await waitIdle(editor); st = await stateOf(PA);
    assert.strictEqual(Object.keys(st.models).length, 14, "replace: same number");
    const after = st.models[before[0]];
    assert(after && after.file !== before[1].file && after.thumb && fs.existsSync(path.join(DATA_A, "uploads", after.file)) && !fs.existsSync(path.join(DATA_A, "uploads", before[1].file)), "replace swapped the file under the same id");
    step("duplicates: asked once; skip / copy / replace work");

    /* ---- 4. .zip with models in sub-folders (and a .gltf with its .bin); an unsafe path is refused ---- */
    const g5 = boxGltf(0.5, 0.5, 0.5, colors[5], "куб%20один.bin");
    const zipBuf = makeZip([["Кухня/a.glb", boxGlb(.3, .3, .3, colors[3]), true], ["Кухня/Стулья/b.glb", boxGlb(.35, .3, .3, colors[4]), false], ["Спальня/c.glb", boxGlb(.4, .3, .3, colors[6]), true],
      ["d.glb", boxGlb(.45, .3, .3, colors[7]), true], ["Кухня/куб.gltf", g5.gltf, true], ["Кухня/куб один.bin", g5.bin, true], ["Кухня/photo.txt", Buffer.from("hi"), true], ["__MACOSX/._a.glb", Buffer.from("x"), false]]);
    const zipFile = put("a.zip", zipBuf);
    const nModels = Object.keys((await stateOf(PA)).models).length;
    await editor.setInputFiles("#upFiles", [zipFile]);
    await editor.waitForFunction(() => window.__villaUpq().items.some(i => i.name === "a.zip" && i.status === "done"), null, { timeout: 60000 });
    const z = await statusOf(editor, "a.zip"); assert.match(z.note, /добавлено 5/, JSON.stringify(z));
    st = await stateOf(PA);
    assert.strictEqual(Object.keys(st.models).length, nModels + 5);
    const folderId = n => Object.entries(st.folders).find(([, f]) => f.name === n)[0];
    const names = f => Object.values(st.models).filter(m => m.folder === f).map(m => m.name).sort();
    assert.deepStrictEqual(names(folderId("Кухня")), ["a", "куб"]); assert.deepStrictEqual(names(folderId("Стулья")), ["b"]); assert.deepStrictEqual(names(folderId("Спальня")), ["c"]);
    assert.strictEqual(st.folders[folderId("Стулья")].parent, folderId("Кухня"));
    assert(Object.values(st.models).some(m => m.name === "d" && !m.folder), "d.glb at the root");
    await openUp(editor); await editor.waitForFunction(() => document.querySelectorAll("#libList .thumb img").length > 0);
    await waitThumbs();
    async function waitThumbs() { for (let i = 0; i < 100; i++) { const s = await stateOf(PA); if (Object.values(s.models).every(m => m.thumb)) return; await sleep(500); } throw new Error("thumbnails of the unpacked models never appeared"); }
    /* the packed .gltf is a real model */
    const cubeDoc = Object.values((await stateOf(PA)).models).find(m => m.name === "куб");
    const head = fs.readFileSync(path.join(DATA_A, "uploads", cubeDoc.file)).subarray(0, 4).toString("latin1"); assert.strictEqual(head, "glTF");
    step("zip: 5 models unpacked into their folders (incl. a .gltf packed with its .bin), thumbnails drawn by the editor");

    const evil = put("evil.zip", makeZip([["ok.glb", boxGlb(.3, .3, .3, colors[0]), false], ["../evil.glb", boxGlb(.3, .3, .3, colors[1]), false]]));
    const n0 = Object.keys((await stateOf(PA)).models).length;
    await editor.setInputFiles("#upFiles", [evil]);
    await editor.waitForFunction(() => window.__villaUpq().items.some(i => i.name === "evil.zip" && i.status === "error"));
    assert.match((await statusOf(editor, "evil.zip")).err, /небезопасные пути/);
    assert.strictEqual(Object.keys((await stateOf(PA)).models).length, n0, "nothing from the unsafe archive");
    assert(!fs.existsSync(path.join(TMP, "evil.glb")) && !fs.existsSync(path.join(DATA_A, "evil.glb")));
    const bomb = put("bomb.zip", (() => { const z = makeZip([["x.glb", Buffer.alloc(1000, 1), true]]); /* lie about the size: claim 10 bytes */ const i = z.indexOf(Buffer.from([0x50, 0x4b, 1, 2])); z.writeUInt32LE(10, i + 24); return z; })());
    await editor.setInputFiles("#upFiles", [bomb]);
    await editor.waitForFunction(() => window.__villaUpq().items.some(i => i.name === "bomb.zip" && ["done", "error"].includes(i.status)));
    assert.strictEqual(Object.keys((await stateOf(PA)).models).length, n0, "an archive that lies about its size adds nothing");
    step("zip with ../ is refused, a lying archive adds nothing");

    /* ---- 5. a broken file does not stop the queue; retry works ---- */
    const bad = Buffer.from(boxGlb(.3, .3, .3, colors[0])); bad.fill(0x7b, 24, 40);   // header fine, JSON chunk garbage
    const fakes = [put("mix/ok1.glb", boxGlb(.31, .3, .3, colors[1])), put("mix/bad.glb", bad), put("mix/png.glb", Buffer.from("\x89PNG\r\n\x1a\n" + "x".repeat(100), "latin1")), put("mix/ok2.glb", boxGlb(.32, .3, .3, colors[2]))];
    let failOnce = true;   // the first upload that reaches the server fails with a 500; "retry" must bring it in
    await editor.route(MODELS_URL, async r => { if (r.request().method() === "POST" && failOnce) { failOnce = false; return r.fulfill({ status: 500, contentType: "application/json", body: '{"error":"upload_failed"}' }); } return r.continue(); });
    await editor.setInputFiles("#upFiles", fakes);
    await waitIdle(editor);
    assert.match((await statusOf(editor, "bad.glb")).err, /повреждён/);
    assert.match((await statusOf(editor, "png.glb")).err, /не .glb/);
    const failed = (await rows(editor)).filter(r => /^ok\d/.test(r.name) && r.status === "error");
    assert.strictEqual(failed.length, 1, JSON.stringify(await rows(editor)));
    assert.strictEqual((await rows(editor)).filter(r => /^ok\d/.test(r.name) && r.status === "done").length, 1, "the other good file went through");
    await editor.click(`.upq-row[data-name="${failed[0].name.replace(/\.glb$/, "")}"] .upq-again`);
    await editor.waitForFunction(n => window.__villaUpq().items.some(i => i.name === n && i.status === "done"), failed[0].name);
    assert.strictEqual((await statusOf(editor, "bad.glb")).status, "error");
    assert(!Object.values((await stateOf(PA)).models).some(m => m.name === "bad" || m.name === "png"), "broken files are not in the library");
    await editor.unroute(MODELS_URL);
    step("a broken file and a non-glb give reasons, the rest uploaded, retry works");

    /* ---- 6. pause / continue, cancel one, cancel all ---- */
    const six = colors.slice(0, 6).map((c, i) => put(`six/p${i}.glb`, boxGlb(.2 + i * .01, .3, .3, c)));
    await editor.click("#upq .upq-pause").catch(() => {});   // nothing running: the button is hidden, ignore
    await editor.evaluate(() => { /* pause before anything is added */ });
    await editor.setInputFiles("#upFiles", [six[0]]);
    await waitIdle(editor);
    // pause while a batch is waiting: slow the uploads down so the batch is still queued when the button is pressed
    await editor.route(MODELS_URL, async r => { if (r.request().method() === "POST") await sleep(800); return r.continue(); });
    await editor.setInputFiles("#upFiles", six.slice(1));
    await editor.waitForSelector("#upq .upq-pause:not([hidden])");
    await editor.click("#upq .upq-pause");
    assert.match(await editor.textContent("#upq .upq-title"), /пауз/i);
    await sleep(2500);   // what was already on the wire may finish; after that nothing new may start
    let q = await rows(editor);
    const queued = q.filter(r => r.status === "queued").length;
    await sleep(2000);
    const q2 = await rows(editor);
    assert(queued >= 1 && q2.filter(r => r.status === "queued").length === queued && !q2.some(r => r.status === "uploading"), "paused: nothing new starts " + JSON.stringify(q2.filter(r => /^pd/.test(r.name))));
    const victim = q.find(r => r.status === "queued"); await editor.click(`.upq-row[data-name="${victim.name.replace(/\.glb$/, "")}"] .upq-x`).catch(async () => { await editor.locator(".upq-row[data-status=queued] .upq-x").first().click(); });
    await sleep(300);
    assert((await rows(editor)).some(r => r.status === "cancelled"), "one file cancelled");
    await editor.click("#upq .upq-pause");
    await waitIdle(editor);
    q = await rows(editor);
    assert(q.filter(r => ["p1.glb", "p2.glb", "p3.glb", "p4.glb", "p5.glb"].includes(r.name) && r.status === "cancelled").length === 1);
    // cancel all
    await editor.click("#upq >> text=Очистить готовые");
    const more = colors.slice(0, 5).map((c, i) => put(`more/q${i}.glb`, boxGlb(.7 + i * .01, .3, .3, c)));
    await editor.setInputFiles("#upFiles", more);
    await editor.waitForSelector("#upq >> text=Отменить всё"); await editor.click("#upq >> text=Отменить всё");
    await waitIdle(editor);
    q = await rows(editor); assert(q.filter(r => /^q\d/.test(r.name)).every(r => ["cancelled", "done"].includes(r.status)) && q.some(r => /^q\d/.test(r.name) && r.status === "cancelled"), JSON.stringify(q));
    await editor.unroute(MODELS_URL);
    step("pause / resume, cancel one, cancel all");

    /* ---- 7. a reload in the middle of the queue ---- */
    await editor.click("#upq >> text=Очистить готовые").catch(() => {});
    await editor.route(MODELS_URL, async r => { if (r.request().method() === "POST") await sleep(1500); return r.continue(); });
    const eight = colors.concat(colors).slice(0, 8).map((c, i) => put(`eight/r${i}.glb`, boxGlb(.8 + i * .013, .3, .3, c)));
    await editor.evaluate(() => window.__villaUpq().items.length);
    await editor.setInputFiles("#upFiles", eight);
    await editor.waitForFunction(() => window.__villaUpq().items.filter(i => /^r\d/.test(i.name) && i.status === "done").length >= 2, null, { timeout: 60000 });
    await sleep(900);
    await editor.reload();
    await editor.waitForFunction(() => window.__villa && window.__villa().shownV && !document.getElementById("loading"), null, { timeout: 90000 });
    await editor.waitForSelector(".upq-notice:not([hidden])");
    const note = await editor.textContent(".upq-notice");
    assert.match(note, /Загрузка была прервана: \d+ файл/); assert.match(note, /выберите их снова/);
    const doneBefore = Object.values((await stateOf(PA)).models).filter(m => /^r\d$/.test(m.name)).length;
    await editor.unroute(MODELS_URL);
    await openUp(editor);
    await editor.setInputFiles("#upFiles", eight);
    await waitIdle(editor);
    q = await rows(editor);
    const skippedAgain = q.filter(r => /^r\d/.test(r.name) && r.status === "skipped").length;
    assert(skippedAgain >= doneBefore && skippedAgain >= 2, "already uploaded files skipped on re-selection: " + JSON.stringify(q.map(r => [r.name, r.status])));
    st = await stateOf(PA);
    assert.strictEqual(Object.values(st.models).filter(m => /^r\d$/.test(m.name)).length, 8, "all eight are there exactly once");
    assert(await editor.isHidden(".upq-notice"));
    step("reload mid-queue: the interrupted message, re-selecting skips what is already uploaded");

    /* ---- 8. a big file: one warning for the queue; ~31 MB uploads and gets its thumbnail by download ---- */
    const bigF = put("big/big.glb", boxGlb(1, 1, 1, colors[0], 31 * 1048576));
    const small = put("big/small.glb", boxGlb(.9, .2, .2, colors[1]));
    await editor.setInputFiles("#upFiles", [bigF, small]);
    await editor.waitForSelector(".pv-dlg");
    assert.match(await editor.textContent(".pv-dlg h2"), /Большие/);
    assert.strictEqual(await editor.locator(".pv-dlg").count(), 1, "one warning for the whole queue");
    await editor.click(".pv-dlg >> text=Загрузить всё");
    await waitIdle(editor, 180000);
    assert.strictEqual((await statusOf(editor, "big.glb")).status, "done");
    await waitThumbs();
    step("big file: a single warning, uploaded, thumbnail drawn");

    /* ---- 9. server limits ---- */
    const sl = await raw(PA, "", "POST", "/api/folders/ensure", null, JSON.stringify({ parent: null, path: ["x"] }), { "content-type": "application/json" });
    assert.strictEqual(sl.status, 403, "folders/ensure is for the editor only");
    const e1 = await raw(PA, "", "POST", "/api/folders/ensure", KEY_A, JSON.stringify({ parent: null, path: ["A1", "B2", "C3", "D4", "E5"] }), { "content-type": "application/json" });
    const e2 = await raw(PA, "", "POST", "/api/folders/ensure", KEY_A, JSON.stringify({ parent: null, path: [" a1 ", "b2", "C3", "d4"] }), { "content-type": "application/json" });
    assert.strictEqual(e1.status, 200); assert.strictEqual(e1.body.created, 3, "three levels at most"); assert.strictEqual(e2.body.id, e1.body.id); assert.strictEqual(e2.body.created, 0, "idempotent");
    /* two uploads in flight -> a third one is told to wait */
    const hold = () => new Promise(res => {
      const b = "----x" + Math.random().toString(16).slice(2);
      const rq = http.request({ host: "127.0.0.1", port: PA, path: "/api/models", method: "POST", headers: { "x-edit-key": KEY_A, "x-uid": "slotholder", "content-type": "multipart/form-data; boundary=" + b, "transfer-encoding": "chunked" } }, () => {});
      rq.on("error", () => {}); rq.write(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="a.glb"\r\nContent-Type: model/gltf-binary\r\n\r\nglTF`);
      setTimeout(() => res(rq), 300);
    });
    const h1 = await hold(), h2 = await hold();
    const fd = new FormData(); fd.append("file", new Blob([boxGlb(.3, .3, .3, colors[2])]), "z.glb");
    const third = await fetch(`http://127.0.0.1:${PA}/api/models`, { method: "POST", body: fd, headers: { "x-edit-key": KEY_A, "x-uid": "slotholder" } });
    assert.strictEqual(third.status, 429); assert(+third.headers.get("retry-after") >= 1);
    const other = new FormData(); other.append("file", new Blob([boxGlb(.3, .3, .3, colors[2])]), "z.glb");
    assert.strictEqual((await fetch(`http://127.0.0.1:${PA}/api/models`, { method: "POST", body: other, headers: { "x-edit-key": KEY_A, "x-uid": "someoneelse" } })).status, 200, "another editor is not blocked");
    h1.destroy(); h2.destroy(); await sleep(500);
    const fd2 = new FormData(); fd2.append("file", new Blob([boxGlb(.3, .3, .3, colors[3])]), "y.glb");
    assert.strictEqual((await fetch(`http://127.0.0.1:${PA}/api/models`, { method: "POST", body: fd2, headers: { "x-edit-key": KEY_A, "x-uid": "slotholder" } })).status, 200, "the slots are free again");
    step("server: folders/ensure idempotent + clamped, 2 uploads per editor (429 + Retry-After for the third)");

    /* ---- 10. the same in the training environment, with its own limits ---- */
    const train = await mk("trainer", PB, "/train", KEY_B);
    await train.click("#tUp");
    const t3 = colors.slice(0, 3).map((c, i) => put(`train/t${i}.glb`, boxGlb(.4 + i * .02, .3, .3, c)));
    put("train/Ванная/Тумбы/t.glb", boxGlb(.5, .5, .5, colors[4]));
    await train.setInputFiles("#upFiles", t3);
    await waitIdle(train);
    await train.setInputFiles("#upDir", path.join(FILES, "train", "Ванная"));
    await train.waitForFunction(() => window.__villaUpq().items.some(i => i.name === "t.glb" && i.status === "done"));
    await train.setInputFiles("#upFiles", [zipFile]);
    await train.waitForFunction(() => window.__villaUpq().items.some(i => i.name === "a.zip" && ["done", "error"].includes(i.status)), null, { timeout: 60000 });
    assert.match((await statusOf(train, "a.zip")).note, /добавлено 5/);
    const over = put("train/over.glb", boxGlb(1, 1, 1, colors[0], 51 * 1048576));
    await train.setInputFiles("#upFiles", [over]);
    await train.waitForFunction(() => window.__villaUpq().items.some(i => i.name === "over.glb" && i.status === "error"));
    assert.match((await statusOf(train, "over.glb")).err, /больше 50 МБ/);
    const ts = await stateOf(PB, "/train");
    assert.strictEqual(Object.keys(ts.models).length, 3 + 1 + 5);
    assert(Object.values(ts.folders).some(f => f.name === "Тумбы"));
    assert(Object.values((await stateOf(PA)).models).every(m => !["t0", "t1", "t2"].includes(m.name)), "the main environment is untouched");
    for (let i = 0; i < 60 && !Object.values((await stateOf(PB, "/train")).models).every(m => m.thumb); i++) await sleep(500);
    assert(Object.values((await stateOf(PB, "/train")).models).every(m => m.thumb), "thumbnails in /train too");
    step("/train: files, folder, zip, its 50 MB limit - and the main environment is untouched");

    for (const [n, p] of [["editor", editor], ["train", train]]) { const bad = p.logs.filter(l => /PAGEERROR/.test(l)); assert.deepStrictEqual(bad, [], n + " page errors: " + bad.join("\n")); }
    for (const d of [DATA_A, DATA_B]) {
      assert.deepStrictEqual(fs.readdirSync(path.join(d, "uploads")).filter(n => n.endsWith(".part")), [], "no half-written uploads left");
      assert.deepStrictEqual(fs.readdirSync(path.join(d, "tmp")), [], "no unpacking leftovers");
    }
    console.log("OK bulk upload");
  } finally {
    await browser.close(); for (const s of servers) s.kill();
    setTimeout(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} process.exit(process.exitCode || 0); }, 500);
  }
})().catch(e => { console.error(e); process.exitCode = 1; for (const s of servers) s.kill(); setTimeout(() => process.exit(1), 800); });
