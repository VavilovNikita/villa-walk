"use strict";
/* E2E: the main environment (/) and the training environment (/train, SANDBOX=1) side by side behind one origin, like nginx does it.
   Starts both servers on temp data dirs with random keys (never printed) and a tiny proxy that splits /train/ from the rest.
   Run: node tests/sandbox.e2e.js */
const path = require("path"), fs = require("fs"), os = require("os"), crypto = require("crypto"), assert = require("assert"), http = require("http"), net = require("net");
const { spawn } = require("child_process");
const { chromium } = require("playwright-core");
const WebSocket = require("ws");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const N = 3200 + Math.floor(Math.random() * 40) * 3, PA = N, PB = N + 1, PP = N + 2, BASE = "http://127.0.0.1:" + PP;
const KEY_A = crypto.randomBytes(24).toString("hex"), KEY_B = crypto.randomBytes(24).toString("hex");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "villa-sbx-"));
const DATA_A = path.join(TMP, "main"), DATA_B = path.join(TMP, "train"), MAIN_MODELS = path.join(TMP, "main-models");
const SEED = path.join(ROOT, "seed", "villa.glb");
fs.mkdirSync(MAIN_MODELS); fs.copyFileSync(SEED, path.join(MAIN_MODELS, "villa.glb"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const step = m => console.log("• " + m);
const MAT_A = "ma000001", MAT_B = "mb000002";

const servers = [];
function start(port, key, data, extra) {
  const p = spawn("node", ["server/index.js"], { cwd: ROOT, env: { ...process.env, PORT: String(port), DATA_DIR: data, EDIT_KEY: key, HOST: "127.0.0.1", ...extra }, stdio: "ignore" });
  servers.push(p); return p;
}
/* nginx stand-in: /train and /train/... -> the training server, everything else -> the main one (HTTP and WebSocket) */
const target = url => (url === "/train" || url.startsWith("/train/") || url.startsWith("/train?")) ? PB : PA;
const proxy = http.createServer((req, res) => {
  const up = http.request({ host: "127.0.0.1", port: target(req.url), path: req.url, method: req.method, headers: req.headers }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  up.on("error", () => res.destroy()); req.pipe(up);
});
proxy.on("upgrade", (req, sock, head) => {
  const up = net.connect(target(req.url), "127.0.0.1", () => {
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n` + Object.entries(req.headers).map(([k, v]) => k + ": " + v).join("\r\n") + "\r\n\r\n"); up.write(head); sock.pipe(up); up.pipe(sock);
  });
  up.on("error", () => sock.destroy()); sock.on("error", () => up.destroy());
});

const api = async (base, method, p, key, body, headers) => {
  const r = await fetch(BASE + base + p, { method, body, headers: { ...(key ? { "x-edit-key": key } : {}), ...headers } });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const json = (o) => ({ body: JSON.stringify(o), headers: { "content-type": "application/json" } });
const state = async base => (await fetch(BASE + base + "/api/state")).json();
function wsOpen(base, key, name) {
  return new Promise((res, rej) => {
    const ws = new WebSocket("ws://127.0.0.1:" + PP + base + "/ws"); ws.msgs = [];
    ws.on("open", () => ws.send(JSON.stringify({ t: "hello", name, uid: name + "uidxxxxxx", key })));
    ws.on("message", d => { const m = JSON.parse(d); ws.msgs.push(m); if (m.t === "welcome") { ws.canEdit = m.canEdit; res(ws); } });
    ws.on("error", rej);
  });
}
const lastPeers = ws => [...ws.msgs].reverse().find(m => m.t === "peers");
async function modelUpload(base, key, buf) {
  const fd = new FormData(); fd.append("name", "m"); fd.append("file", new Blob([buf]), "m.glb");
  const r = await fetch(BASE + base + "/api/models", { method: "POST", body: fd, headers: { "x-edit-key": key } });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

(async () => {
  start(PA, KEY_A, DATA_A, {});
  start(PB, KEY_B, DATA_B, { BASE_PATH: "/train", SANDBOX: "1", SANDBOX_SEED_HOUSE: path.join(MAIN_MODELS, "villa.glb") });
  await new Promise(r => proxy.listen(PP, "127.0.0.1", r));
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + "/api/health")).ok && (await fetch(BASE + "/train/api/health")).ok) break; } catch {} await sleep(200); }
    assert.strictEqual((await (await fetch(BASE + "/api/health")).json()).sandbox, false);
    assert.strictEqual((await (await fetch(BASE + "/train/api/health")).json()).sandbox, true);
    assert.strictEqual((await fetch(BASE + "/train", { redirect: "manual" })).status, 301);
    assert.strictEqual((await fetch("http://127.0.0.1:" + PB + "/api/health")).status, 404, "training server serves nothing outside /train");
    assert(fs.existsSync(path.join(DATA_B, "models", "villa.glb")), "house copied from the main environment on first start");
    assert.strictEqual(fs.readFileSync(path.join(DATA_B, "models", "villa.glb")).equals(fs.readFileSync(SEED)), true);
    step("both environments up behind one origin; /train redirects; house seeded from the main one");

    /* index.html: prefixed paths, meta, sandbox title; the main one is unchanged */
    const hm = await (await fetch(BASE + "/")).text(), ht = await (await fetch(BASE + "/train/")).text();
    assert(hm.includes('src="/app.js"') && hm.includes('name="base-path" content=""') && !hm.includes('name="sandbox"') && hm.includes("<title>Вилла Sunset Beach</title>"));
    assert(ht.includes('src="/train/app.js"') && ht.includes('name="sandbox" content="1"') && ht.includes("<title>Тренировка — Вилла Sunset Beach</title>") && !/(src|href)="\/(?!train\/)/.test(ht));
    step("index.html: main untouched, training gets /train/ paths, meta and its own title");

    /* keys do not cross */
    assert.strictEqual((await api("/train", "POST", "/api/folders", KEY_A, ...Object.values(json({ name: "x" })))).status, 403);
    assert.strictEqual((await api("", "POST", "/api/folders", KEY_B, ...Object.values(json({ name: "x" })))).status, 403);
    assert.strictEqual((await api("", "POST", "/api/sandbox/reset", KEY_A, ...Object.values(json({})))).status, 404, "no reset route in the main environment");
    assert.strictEqual((await api("/train", "POST", "/api/sandbox/reset", KEY_A, ...Object.values(json({})))).status, 403);
    const wsAk = await wsOpen("", KEY_A, "ak"), wsBk = await wsOpen("/train", KEY_B, "bk");
    const wsAx = await wsOpen("", KEY_B, "ax"), wsBx = await wsOpen("/train", KEY_A, "bx");
    assert(wsAk.canEdit && wsBk.canEdit && !wsAx.canEdit && !wsBx.canEdit);
    step("each key is 403 / viewer in the other environment; the main one has no reset route");

    /* peers are per environment */
    await sleep(300);
    assert.deepStrictEqual(lastPeers(wsAk).list.map(p => p.name).sort(), ["ak", "ax"]);
    assert.deepStrictEqual(lastPeers(wsBk).list.map(p => p.name).sort(), ["bk", "bx"]);
    step("WebSocket /train/ws works; participants of one environment are not seen in the other");

    /* data is separate: paint, parts, furniture, folders, models, textures */
    wsAk.send(JSON.stringify({ t: "paint.set", id: MAT_A, doc: { name: "A", color: "#00aa00", finish: null } }));
    wsBk.send(JSON.stringify({ t: "paint.set", id: MAT_B, doc: { name: "B", color: "#ff0000", finish: null } }));
    wsAk.send(JSON.stringify({ t: "item.set", id: "itemmain01", doc: { type: "builtin", key: "sofa", x: 1, y: 0, z: 1, r: 0, s: 1 } }));
    wsBk.send(JSON.stringify({ t: "item.set", id: "itemtrain1", doc: { type: "builtin", key: "bed160", x: 2, y: 0, z: 2, r: 0, s: 1 } }));
    wsBk.send(JSON.stringify({ t: "part.set", id: "p0001", doc: { key: "group:x", color: "#112233", finish: null } }));
    wsBk.send(JSON.stringify({ t: "swatches.set", colors: ["#abcdef"] }));
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#884422" } }).png().toBuffer();
    const texFd = () => { const fd = new FormData(); fd.append("name", "t"); fd.append("w", "300"); fd.append("h", "300"); fd.append("file", new Blob([png]), "t.png"); return fd; };
    const fA = (await api("", "POST", "/api/folders", KEY_A, ...Object.values(json({ name: "A-folder" })))).body.id;
    const fB = (await api("/train", "POST", "/api/folders", KEY_B, ...Object.values(json({ name: "B-folder" })))).body.id;
    const mA = (await modelUpload("", KEY_A, fs.readFileSync(SEED))).body.id, mB = (await modelUpload("/train", KEY_B, fs.readFileSync(SEED))).body.id;
    const tA = (await api("", "POST", "/api/textures", KEY_A, texFd())).body.id, tB = (await api("/train", "POST", "/api/textures", KEY_B, texFd())).body.id;
    assert(fA && fB && mA && mB && tA && tB);
    await sleep(500);
    const sa = await state(""), sb = await state("/train");
    assert(sa.paint[MAT_A] && !sa.paint[MAT_B] && sb.paint[MAT_B] && !sb.paint[MAT_A], "paint");
    assert(sa.items.itemmain01 && !sa.items.itemtrain1 && sb.items.itemtrain1 && !sb.items.itemmain01, "furniture");
    assert(!sa.parts.p0001 && sb.parts.p0001 && !sa.swatches.colors.length && sb.swatches.colors.length === 1, "parts, palette");
    assert(sa.folders[fA] && !sa.folders[fB] && sb.folders[fB] && !sb.folders[fA], "folders");
    assert(sa.models[mA] && !sa.models[mB] && sb.models[mB] && !sb.models[mA], "models");
    assert(sa.textures[tA] && !sa.textures[tB] && sb.textures[tB] && !sb.textures[tA], "textures");
    assert.strictEqual((await fetch(BASE + "/uploads/" + sb.models[mB].file)).status, 404, "training upload is not served by the main one");
    assert.strictEqual((await fetch(BASE + "/train/uploads/" + sb.models[mB].file)).status, 200);
    assert.strictEqual((await fetch(BASE + "/train/uploads/" + sa.models[mA].file)).status, 404);
    assert.strictEqual((await fetch(BASE + "/uploads/textures/" + sa.textures[tA].thumb)).status, 200);
    assert.strictEqual((await fetch(BASE + "/train/uploads/textures/" + sa.textures[tA].thumb)).status, 404);
    step("paint, parts, palette, furniture, folders, models, textures and uploaded files are separate");

    /* sandbox limits: 50 MB models */
    const big = Buffer.alloc(51 * 1024 * 1024); big.write("glTF", 0, "latin1"); big.writeUInt32LE(2, 4); big.writeUInt32LE(big.length, 8);
    assert.strictEqual((await modelUpload("/train", KEY_B, big)).status, 413, "51 MB refused in the sandbox");
    step("sandbox model limit: 51 MB refused (413)");

    /* UI: banner, title, prefixed localStorage, no key leak between environments */
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    const prof = JSON.stringify({ uid: "sbxuidxxxx", name: "tester", color: "#2f6f62" });
    await page.addInitScript(p => { localStorage.setItem(location.pathname.startsWith("/train") ? "train:villa.profile" : "villa.profile", p); }, prof);
    const logs = []; page.on("pageerror", e => logs.push(e.message)); page.on("console", m => { if (m.type() === "error") logs.push(m.text()); });
    const bad = []; page.on("response", r => { if (r.status() >= 400 && !r.url().includes("fonts.g")) bad.push(r.status() + " " + r.url()); });
    const ready = () => page.waitForFunction(() => window.__villa && window.__villa().shownV && !document.getElementById("loading"), null, { timeout: 60000 });
    await page.goto(BASE + "/train/?k=" + KEY_B); await ready();
    assert.strictEqual(await page.title(), "Тренировка — Вилла Sunset Beach");
    assert.match(await page.textContent("#sandboxBar"), /Тренировочная среда — изменения не влияют на основную модель/);
    await page.waitForSelector("#bReset", { state: "visible" }); assert(await page.isVisible("#bPull"), "editor sees reset and pull-house");
    const keys = await page.evaluate(() => Object.keys(localStorage));
    assert(keys.includes("train:villa.key") && keys.includes("train:villa.profile") && !keys.includes("villa.key") && !keys.some(k => k === "villa.profile"), "storage keys: " + keys);
    assert.strictEqual(new URL(page.url()).search, "", "?k= removed from the address bar");
    await page.waitForFunction(() => window.__villa().items === 1);
    assert.strictEqual(await page.evaluate(() => window.__villa().items), 1, "the training scene shows only its own furniture");
    /* a bar at the top does not cover the panels or squeeze the canvas */
    const geo = await page.evaluate(() => ({ bar: document.getElementById("sandboxBar").getBoundingClientRect().bottom, top: document.getElementById("top").getBoundingClientRect().top, cv: document.querySelector("#stage canvas").getBoundingClientRect().bottom, vh: innerHeight }));
    assert(geo.top >= geo.bar && geo.cv <= geo.vh + 1, JSON.stringify(geo));
    step("training page: banner, title, own localStorage keys, own scene, layout below the banner");

    await page.goto(BASE + "/"); await ready();
    assert.strictEqual(await page.title(), "Вилла Sunset Beach");
    assert(!(await page.isVisible("#sandboxBar")) && !(await page.isVisible("#bReset")));
    assert(!(await page.isVisible("#bHouse")), "the training key is not used in the main environment: viewer only");
    assert.strictEqual(await page.evaluate(() => window.__villa().items), 1);
    assert(!(await page.evaluate(() => Object.keys(localStorage).includes("villa.key"))));
    step("main page: no banner, no editor rights from the training key, its own scene");

    /* UI reset: scene only, then with the library */
    const sbefore = await state("");
    await page.goto(BASE + "/train/"); await ready();
    await page.waitForSelector("#bReset", { state: "visible" });
    await page.click("#bReset");
    assert(await page.isVisible("#sandboxDlg"), "confirmation is a page dialog");
    await Promise.all([page.waitForNavigation({ timeout: 30000 }), page.click("#sandboxDlg .bigwarn-btns button:last-child")]);
    await ready();
    let s2 = await state("/train");
    assert(!Object.keys(s2.paint).length && !Object.keys(s2.items).length && !Object.keys(s2.parts).length && !s2.swatches.colors.length, "scene cleared");
    assert(s2.models[mB] && s2.textures[tB] && s2.folders[fB], "library kept without the tick");
    assert(wsBk.msgs.some(m => m.t === "sandbox.reset"), "everybody got the reset message");
    assert.deepStrictEqual(await state(""), sbefore, "the main environment did not change");
    step("«Сбросить всё»: scene cleared in /train, library kept, main untouched");

    await page.click("#bReset"); await page.check("#sbCheck");
    await Promise.all([page.waitForNavigation({ timeout: 30000 }), page.click("#sandboxDlg .bigwarn-btns button:last-child")]);
    await ready();
    s2 = await state("/train");
    assert(!Object.keys(s2.models).length && !Object.keys(s2.textures).length && !Object.keys(s2.folders).length, "library cleared with the tick");
    assert.deepStrictEqual(fs.readdirSync(path.join(DATA_B, "uploads")), [], "uploaded files removed");
    assert(fs.existsSync(path.join(DATA_B, "models", "villa.glb")), "house model stays");
    assert.deepStrictEqual(await state(""), sbefore, "the main environment still did not change");
    assert((await fetch(BASE + "/uploads/" + sbefore.models[mA].file)).ok, "main files intact");
    step("reset with «и библиотеку тоже»: models, textures, folders and files gone, house stays, main untouched");

    /* take the house from the main environment: read only there */
    const hashMain = crypto.createHash("sha256").update(fs.readFileSync(path.join(MAIN_MODELS, "villa.glb"))).digest("hex");
    const mainV = (await state("")).house.v, trainV = (await state("/train")).house.v;
    await page.click("#bPull");
    await page.click("#sandboxDlg .bigwarn-btns button:last-child");
    await page.waitForFunction(v => window.__villa().shownV > v, trainV, { timeout: 30000 });
    assert.strictEqual((await state("/train")).house.v, trainV + 1);
    assert.strictEqual((await state("")).house.v, mainV, "main house version unchanged");
    assert.strictEqual(crypto.createHash("sha256").update(fs.readFileSync(path.join(MAIN_MODELS, "villa.glb"))).digest("hex"), hashMain, "source file untouched");
    assert.strictEqual((await api("/train", "POST", "/api/sandbox/pull-house", null, "{}", { "content-type": "application/json" })).status, 403);
    step("«Взять модель дома из основной»: copied, new version in /train, main unchanged");

    assert(!bad.length, "failed requests: " + bad.join("; "));
    assert(!logs.length, "page errors: " + logs.join("; "));
    console.log("ALL OK");
  } catch (e) {
    console.error("FAIL:", e); process.exitCode = 1;
  } finally {
    await browser.close(); proxy.close(); servers.forEach(p => p.kill());
    await sleep(300); fs.rmSync(TMP, { recursive: true, force: true });
  }
})();
