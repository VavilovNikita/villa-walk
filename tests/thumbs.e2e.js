"use strict";
/* E2E: library thumbnails. Starts its own server on a temp data dir with a random key (never printed).
   Run: node tests/thumbs.e2e.js   (needs playwright-core + a chromium in ~/.cache/ms-playwright) */
const path = require("path"), fs = require("fs"), os = require("os"), crypto = require("crypto"), assert = require("assert");
const { spawn } = require("child_process");
const { chromium } = require("playwright-core");

const ROOT = path.join(__dirname, "..");
const PORT = 3200 + Math.floor(Math.random() * 90), BASE = "http://127.0.0.1:" + PORT;
const KEY = crypto.randomBytes(24).toString("hex");
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "villa-thumbs-"));
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

async function rawThumb(id, body, type, key) {
  const r = await fetch(`${BASE}/api/models/${id}/thumb`, { method: "POST", body, headers: { ...(type ? { "content-type": type } : {}), ...(key ? { "x-edit-key": key } : {}) } });
  return r.status;
}
async function apiUpload(file, name) {
  const fd = new FormData(); fd.append("name", name); fd.append("file", new Blob([fs.readFileSync(file)]), path.basename(file));
  const r = await fetch(BASE + "/api/models", { method: "POST", body: fd, headers: { "x-edit-key": KEY } });
  return (await r.json()).id;
}
const state = async () => (await fetch(BASE + "/api/state")).json();

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
    assert(await editor.isVisible("#lib") && await viewer.isVisible("#lib"), "both see the library");
    await viewer.waitForFunction(() => document.querySelectorAll("#libList .thumb img").length === 15, null, { timeout: 90000 });
    step("viewer sees the base library with its own client-rendered thumbnails");

    /* base tab: client-rendered thumbnails, cached in localStorage, never sent to the server */
    await editor.waitForFunction(() => document.querySelectorAll("#libList .thumb img").length === 15, null, { timeout: 90000 });
    const ls = await editor.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("villa.thumb.1.")).length);
    assert.strictEqual(ls, 15);
    assert(await editor.evaluate(() => [...document.querySelectorAll("#libList .thumb img")].every(i => i.src.startsWith("data:image/") && i.loading === "lazy")));
    assert.strictEqual(await editor.locator("#libList .card:not(.fcard)").count(), 15);
    assert.match(await editor.locator("#libList .card:not(.fcard)").first().locator(".cd").textContent(), /^\d+×\d+×\d+ мм$/);
    assert.strictEqual(fs.readdirSync(path.join(DATA, "uploads")).length, 0, "nothing for base furniture on the server");
    step("base tab: 15 cards with lazy <img> thumbnails, cached in localStorage, nothing uploaded");

    /* search */
    await editor.fill("#libSearch", "диван"); assert.strictEqual(await editor.locator("#libList .card:not(.fcard)").count(), 1);
    await editor.fill("#libSearch", ""); assert.strictEqual(await editor.locator("#libList .card:not(.fcard)").count(), 15);

    /* viewer: switch its (hidden) library to the uploaded tab to watch the cards */
    await viewer.evaluate(() => { window.__noReload = 1; });
    await viewer.click("#tUp");
    await viewer.fill("#libSearch", "zzz"); assert.strictEqual(await viewer.locator("#libList .card:not(.fcard)").count(), 0); await viewer.fill("#libSearch", "");
    await editor.click("#tUp");
    assert(await editor.isVisible("#bUpload") && !(await viewer.isVisible("#bUpload")), "only the editor can upload");

    /* 1. editor uploads through the UI -> viewer gets the card with a thumbnail, no reload */
    await editor.setInputFiles("#fileIn", glbFile("tablea.glb", 1.2, 0.5, 0.6, [0.8, 0.3, 0.2]));
    await viewer.waitForSelector("#libList .card:not(.fcard)");
    await viewer.waitForFunction(() => { const i = document.querySelector("#libList .card:not(.fcard) img"); return i && /^\/uploads\/[a-f0-9]{16}\.thumb\.(webp|png)\?t=\d+$/.test(i.getAttribute("src")); }, null, { timeout: 30000 });
    assert.strictEqual(await viewer.evaluate(() => window.__noReload), 1, "viewer was not reloaded");
    let st = await state(); const A = Object.keys(st.models)[0];
    assert(st.models[A].thumb && st.models[A].thumbAt && st.models[A].dims.join() === "1200,600,500", "thumb + dims stored: " + JSON.stringify(st.models[A].dims));
    const src = await viewer.evaluate(() => document.querySelector("#libList .card:not(.fcard) img").getAttribute("src"));
    const r = await fetch(BASE + src), body = Buffer.from(await r.arrayBuffer());
    assert.match(r.headers.get("cache-control"), /public, max-age=31536000/);
    assert(body.length < 300 * 1024 && ((body.toString("latin1", 0, 4) === "RIFF" && body.toString("latin1", 8, 12) === "WEBP") || body[1] === 0x50), "valid image");
    assert.strictEqual(await viewer.locator("#libList .card:not(.fcard) .cd").first().textContent(), "1200×600×500 мм");
    step("editor upload: viewer's card got its thumbnail live (" + st.models[A].thumb.split(".").pop() + ", " + body.length + " B, immutable cache)");

    /* 2. the viewer cannot send a thumbnail; bad images are refused */
    const err = await viewer.evaluate(async id => { try { await Sync.uploadThumb(id, new Blob([new Uint8Array(40)], { type: "image/png" }), [1, 1, 1]); return "accepted"; } catch (e) { return e.code; } }, A);
    assert.strictEqual(err, "forbidden");
    assert.strictEqual(await rawThumb(A, body, r.headers.get("content-type"), null), 403);
    assert.strictEqual(await rawThumb(A, body, r.headers.get("content-type"), "wrong-key-wrong-key"), 403);
    const ct = body[1] === 0x50 ? "image/png" : "image/webp";
    assert.strictEqual(await rawThumb(A, Buffer.from("GIF89a not an image at all, just padding bytes....."), ct, KEY), 400);
    assert.strictEqual(await rawThumb(A, Buffer.concat([Buffer.from("RIFF\x00\x00\x00\x00WEBPVP8 ", "latin1"), Buffer.alloc(40)]), "image/webp", KEY), 400);
    assert.strictEqual(await rawThumb(A, Buffer.alloc(400 * 1024, 1), "image/png", KEY), 413);
    assert([400, 415].includes(await rawThumb(A, body, "text/plain", KEY)));
    assert.strictEqual(await rawThumb(A, body, "application/octet-stream", KEY), 415);
    assert.strictEqual(await rawThumb("ffffffffffffffff", body, ct, KEY), 404);
    assert.strictEqual(await rawThumb(A, body, ct, KEY), 200);
    assert.strictEqual((await state()).models[A].thumb, st.models[A].thumb);
    step("viewer / wrong key -> 403; fake image, 400 KB, wrong type, unknown model all refused");

    /* viewer: preview window works (rotation, size) but offers no editing actions */
    await viewer.locator("#libList .card:not(.fcard) .card-i").click();
    await viewer.waitForFunction(() => window.__villa().preview?.loaded, null, { timeout: 20000 });
    assert.match(await viewer.locator("#pv .meta.mono").first().textContent(), /1200×600×500 мм/);
    assert.strictEqual(await viewer.locator("#pv .pv-actions button").count(), 0, "no action buttons for the viewer");
    const vb = await viewer.locator("#pv .pv-cv").boundingBox(), vz = (await viewer.evaluate(() => window.__villa().preview)).az;
    await viewer.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2); await viewer.mouse.down(); await viewer.mouse.move(vb.x + vb.width / 2 + 120, vb.y + vb.height / 2, { steps: 8 }); await viewer.mouse.up();
    assert(Math.abs((await viewer.evaluate(() => window.__villa().preview)).az - vz) > 0.3, "viewer can rotate");
    await viewer.keyboard.press("Escape"); await viewer.waitForSelector("#pv", { state: "detached" });
    await viewer.locator("#libList .card:not(.fcard) .card-main").first().click(); // clicking a card opens the preview, never places
    await viewer.waitForSelector("#pv"); assert.strictEqual((await viewer.evaluate(() => window.__villa().items)), 0); await viewer.keyboard.press("Escape");
    const nk = { method: "PATCH", headers: { "content-type": "application/json" }, body: '{"name":"x"}' };
    assert.strictEqual((await fetch(`${BASE}/api/models/${A}`, nk)).status, 403);
    assert.strictEqual((await fetch(`${BASE}/api/models/${A}`, { ...nk, headers: { ...nk.headers, "x-edit-key": "wrong-key-wrong-key" } })).status, 403);
    assert.strictEqual((await fetch(`${BASE}/api/models/${A}`, { method: "DELETE" })).status, 403);
    const fd = new FormData(); fd.append("file", new Blob([boxGlb(1, 1, 1, [1, 0, 0])]), "x.glb");
    assert.strictEqual((await fetch(`${BASE}/api/models`, { method: "POST", body: fd })).status, 403);
    assert.strictEqual((await state()).models[A].name, "tablea");
    step("viewer: preview + rotation + size, no action buttons; PATCH/DELETE/upload without key -> 403");

    /* 3. a model that has no thumbnail (uploaded through the API) is filled in when the editor opens the tab */
    await editor.click("#tBase");
    const B = await apiUpload(glbFile("shelf.glb", 0.4, 1.8, 0.3, [0.2, 0.5, 0.7]), "Полка");
    await editor.waitForFunction(() => window.__villa().cards.length >= 15); await sleep(1500);
    assert.strictEqual((await state()).models[B].thumb, null, "not generated while the tab is closed");
    await editor.click("#tUp");
    await viewer.waitForFunction(id => { const c = [...document.querySelectorAll("#libList .card:not(.fcard)")]; return c.length === 2 && c.every(x => x.querySelector("img")); }, B, { timeout: 30000 });
    st = await state(); assert(st.models[B].thumb && st.models[B].dims.join() === "400,300,1800", JSON.stringify(st.models[B]));
    step("old model without a thumbnail got one when the editor opened the tab; viewer updated live");

    /* sorting */
    await editor.selectOption("#libSort", "name");
    assert.deepStrictEqual(await editor.locator("#libList .card:not(.fcard) .cn").allTextContents(), ["Полка", "tablea"].sort((a, b) => a.localeCompare(b, "ru")));

    /* 4. hover spin */
    const card = editor.locator("#libList .card:not(.fcard)").first();
    await card.hover(); await editor.waitForSelector("#libList .thumb canvas.spin", { timeout: 20000 });
    assert.strictEqual(await editor.locator("canvas.spin").count(), 1);
    await editor.mouse.move(5, 5); await editor.waitForSelector("canvas.spin", { state: "detached" });
    step("hover: one live spinning preview, removed on leave");

    /* 5. preview window */
    await editor.selectOption("#libSort", "new");
    const cardA = editor.locator("#libList .card:not(.fcard)", { hasText: "tablea" });
    await cardA.locator(".card-i").click();
    await editor.waitForFunction(() => window.__villa().preview?.loaded, null, { timeout: 20000 });
    const box = await editor.locator("#pv .pv-cv").boundingBox();
    const az0 = (await editor.evaluate(() => window.__villa().preview)).az;
    await editor.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await editor.mouse.down();
    await editor.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 10, { steps: 8 }); await editor.mouse.up();
    const az1 = (await editor.evaluate(() => window.__villa().preview)).az;
    assert(Math.abs(az1 - az0) > 0.3, `orbit drag rotates the model (${az0} -> ${az1})`);
    assert.match(await editor.locator("#pv .meta.mono").first().textContent(), /1200×600×500 мм/);
    step("preview opens, loads the model, drag rotates it");

    const t0 = (await state()).models[A].thumbAt;
    await editor.click("#pv >> text=Обновить превью");
    await editor.waitForFunction(() => document.querySelector("#pv [role=status]").textContent === "Превью обновлено.", null, { timeout: 20000 });
    assert((await state()).models[A].thumbAt > t0, "thumbnail re-rendered");
    await editor.click("#pv >> text=Переименовать"); await editor.fill("#pv .pv-name", "Стол А"); await editor.keyboard.press("Enter");
    await editor.waitForFunction(() => document.getElementById("pvTitle").textContent === "Стол А");
    await viewer.waitForFunction(() => [...document.querySelectorAll("#libList .card:not(.fcard) .cn")].some(n => n.textContent === "Стол А"));
    step("refresh thumbnail + rename work, viewer saw the new name");

    /* delete with in-window confirmation, only this model's files go */
    const files = () => fs.readdirSync(path.join(DATA, "uploads")).sort();
    assert(files().some(f => f.startsWith(A + ".thumb.")) && files().some(f => f.startsWith(B + ".thumb.")));
    await editor.click("#pv >> text=Удалить");
    assert(await editor.isVisible("#pv .pv-confirm"), "confirmation shown inside the window");
    assert.strictEqual((await state()).models[A].name, "Стол А", "nothing deleted before confirming");
    await editor.click("#pv >> text=Да, удалить");
    await editor.waitForSelector("#pv", { state: "detached" });
    await viewer.waitForFunction(() => document.querySelectorAll("#libList .card:not(.fcard)").length === 1);
    assert(!files().some(f => f.startsWith(A)) && files().some(f => f.startsWith(B + ".thumb.")) && files().includes(B + ".glb"), "only model A's files removed: " + files());
    step("delete confirmed in the window; model + its thumbnail gone, the other model's files kept");

    /* "Поставить в сцену" from the window */
    await editor.locator("#libList .card:not(.fcard) .card-i").click(); await editor.waitForFunction(() => window.__villa().preview?.loaded, null, { timeout: 20000 });
    await editor.click("#pv >> text=Поставить в сцену"); await editor.waitForSelector("#pv", { state: "detached" });
    await editor.keyboard.press("Escape");

    const errs = [...viewer.logs, ...editor.logs].filter(l => l.startsWith("PAGEERROR"));
    assert.strictEqual(errs.length, 0, errs.join("\n"));
    console.log("\nALL OK");
  } finally {
    await browser.close(); srv.kill("SIGTERM"); fs.rmSync(DATA, { recursive: true, force: true });
  }
})().catch(e => { console.error("FAIL:", e && e.stack || e); process.exit(1); });
