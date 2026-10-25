"use strict";
/* E2E: house model hot-swap. Starts its own server on a temp data dir with a random key (never printed).
   Run: node tests/house.e2e.js   (needs playwright-core + a chromium in ~/.cache/ms-playwright) */
const path = require("path"), fs = require("fs"), os = require("os"), crypto = require("crypto"), assert = require("assert");
const { spawn } = require("child_process");
const { chromium } = require("playwright-core");
const WebSocket = require("ws");

const ROOT = path.join(__dirname, "..");
const PORT = 3190 + Math.floor(Math.random() * 9), BASE = "http://127.0.0.1:" + PORT;
const KEY = crypto.randomBytes(24).toString("hex");
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "villa-e2e-"));
const SEED = path.join(ROOT, "seed", "villa.glb");
const hash = s => { let h = 5381; for (const c of s) h = ((h * 33) ^ c.codePointAt(0)) >>> 0; return h.toString(16); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* colours go through sRGB<->linear float conversion in three r128, so allow +-2 per channel */
const near = (a, b) => typeof a === "string" && [1, 3, 5].every(i => Math.abs(parseInt(a.substr(i, 2), 16) - parseInt(b.substr(i, 2), 16)) <= 2);
const step = m => console.log("• " + m);

/* copy of the model where the first material is renamed (same byte length) -> its saved colour becomes an orphan */
function variant(buf) {
  const len = buf.readUInt32LE(12), json = JSON.parse(buf.toString("utf8", 20, 20 + len));
  const old = json.materials[0].name, nu = (old[0] === "Ж" ? "З" : "Ж") + old.slice(1);
  const esc = s => '"' + [...s].map(c => c.codePointAt(0) > 126 ? "\\u" + c.codePointAt(0).toString(16).padStart(4, "0") : c).join("") + '"';
  const out = Buffer.from(buf), pos = buf.indexOf(Buffer.from(esc(old)), 20);
  assert(pos > 0, "material name found in GLB json");
  Buffer.from(esc(nu)).copy(out, pos);
  return { buf: out, old, nu };
}
async function post(file, key) {
  const fd = new FormData(); fd.append("file", new Blob([file]), "villa.glb");
  const r = await fetch(BASE + "/api/house", { method: "POST", body: fd, headers: key ? { "x-edit-key": key } : {} });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
function wsEditor() {
  return new Promise((res, rej) => {
    const ws = new WebSocket("ws://127.0.0.1:" + PORT + "/ws");
    ws.on("open", () => ws.send(JSON.stringify({ t: "hello", name: "bot", uid: "botbotbot1", key: KEY })));
    ws.on("message", d => { if (JSON.parse(d).t === "welcome") res(ws); });
    ws.on("error", rej);
  });
}

(async () => {
  const srv = spawn("node", ["server/index.js"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, EDIT_KEY: KEY, HOST: "127.0.0.1" }, stdio: "ignore" });
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {} await sleep(200); }
    assert(fs.existsSync(path.join(DATA, "models", "villa.glb")), "seed copied into the data dir");

    const prof = n => JSON.stringify({ uid: n + "uidxxxxxx", name: n, color: "#2f6f62" });
    const mk = async (name, key) => {
      const ctx = await browser.newContext(); const page = await ctx.newPage();
      page.logs = []; page.reqs = [];
      page.on("console", m => page.logs.push(m.text())); page.on("pageerror", e => page.logs.push("PAGEERROR " + e.message));
      page.on("request", r => { if (r.url().includes("/models/villa.glb")) page.reqs.push(r.url()); });
      page.on("dialog", d => d.accept());
      await page.addInitScript(p => localStorage.setItem("villa.profile", p), prof(name));
      await page.goto(BASE + "/" + (key ? "?k=" + key : ""));
      await page.waitForFunction(() => window.__villa && window.__villa().shownV && !document.getElementById("loading"), null, { timeout: 60000 });
      await page.waitForFunction(() => !document.getElementById("bHouse") || true);
      return page;
    };
    const editor = await mk("editor", KEY), viewer = await mk("viewer", null);
    const st = p => p.evaluate(() => window.__villa());
    step("two tabs loaded; viewer URL: " + viewer.reqs[0].replace(BASE, ""));
    assert.match(viewer.reqs[0], /villa\.glb\?v=1$/);
    assert(await editor.isVisible("#bHouse") && await editor.isVisible("#bHist"), "editor sees buttons");
    assert(!(await viewer.isVisible("#bHouse")), "viewer has no update button");

    const s0 = await st(viewer), names = Object.keys(s0.colors);
    const v = variant(fs.readFileSync(SEED));
    assert(names.includes(v.old));

    /* furniture + paint through a bot editor; both are stored in the DB */
    const bot = await wsEditor();
    bot.send(JSON.stringify({ t: "paint.set", id: "m" + hash(v.old), doc: { name: v.old, color: "#ff0000", finish: null } }));
    bot.send(JSON.stringify({ t: "paint.set", id: "m" + hash(names[1]), doc: { name: names[1], color: "#00aa00", finish: null } }));
    bot.send(JSON.stringify({ t: "item.set", id: "itemaaaa01", doc: { type: "builtin", key: "sofa", x: 7, y: 0, z: 2, r: 0, s: 1 } }));
    await viewer.waitForFunction(n => { const a = window.__villa().colors[n], b = "#ff0000"; return a && [1, 3, 5].every(i => Math.abs(parseInt(a.substr(i, 2), 16) - parseInt(b.substr(i, 2), 16)) <= 2) && window.__villa().items === 1; }, v.old);
    step("paint + furniture visible in viewer");

    /* walk mode in viewer must survive */
    await viewer.click("#mWalk");
    const geoms0 = (await st(viewer)).geoms; let geoms2;

    /* 1. viewer is refused */
    let r = await post(fs.readFileSync(SEED), null); assert.strictEqual(r.status, 403);
    r = await post(fs.readFileSync(SEED), "wrong-key-wrong-key"); assert.strictEqual(r.status, 403);
    r = await fetch(BASE + "/api/house/restore", { method: "POST", headers: { "content-type": "application/json" }, body: '{"name":"x"}' }); assert.strictEqual(r.status, 403);
    r = await post(Buffer.from("not a glb at all, just text"), KEY); assert.strictEqual(r.status, 400);
    assert.strictEqual((await (await fetch(BASE + "/api/house")).json()).history, undefined, "history hidden from viewers");
    step("viewer gets 403 on POST /api/house, restore; garbage gets 400");

    /* 2. editor uploads a plain copy through the UI */
    const tmp = path.join(DATA, "copy.glb"); fs.copyFileSync(SEED, tmp);
    await editor.setInputFiles("#houseIn", tmp);
    await viewer.waitForFunction(() => window.__villa().shownV === 2, null, { timeout: 30000 });
    await viewer.waitForFunction(() => document.getElementById("toast").textContent === "Модель дома обновлена" && !document.getElementById("toast").hidden);
    let s = await st(viewer);
    assert(viewer.reqs.some(u => u.endsWith("villa.glb?v=2")), "viewer fetched ?v=2");
    assert(near(s.colors[v.old], "#ff0000") && near(s.colors[names[1]], "#00aa00"), "colours re-applied"); assert.strictEqual(s.items, 1);
    assert.strictEqual(s.mode, "walk"); assert(Number.isFinite(s.walkY));
    geoms2 = s.geoms;
    step("viewer reloaded (v=2), colours re-applied, furniture kept, walk mode kept, geometries " + s.geoms);

    /* 3. variant with a renamed material: orphan colour is kept in the DB, not applied, listed in console */
    fs.writeFileSync(tmp, v.buf);
    await editor.setInputFiles("#houseIn", tmp);
    await viewer.waitForFunction(() => window.__villa().shownV === 3, null, { timeout: 30000 });
    s = await st(viewer);
    assert(s.geoms <= geoms2 && s.geoms <= geoms0, "geometries do not accumulate across swaps: " + [geoms0, geoms2, s.geoms]);
    assert(!(v.old in s.colors) && v.nu in s.colors && near(s.colors[names[1]], "#00aa00"));
    assert(viewer.logs.some(l => l.includes("Перекраски без материала") && l.includes(v.old)), "orphan list in console");
    const state = await (await fetch(BASE + "/api/state")).json();
    assert.strictEqual(state.paint["m" + hash(v.old)].color, "#ff0000", "orphan paint kept in DB");
    assert.strictEqual(state.house.v, 3);
    step("renamed material: orphan reported in console, DB untouched");

    /* 4. rollback from history via UI */
    await editor.click("#bHist");
    await editor.waitForSelector("#houseHist .hrow button");
    assert.strictEqual(await editor.locator("#houseHist .hrow").count(), 2);
    await editor.locator("#houseHist .hrow button").first().click(); // newest history entry = the plain copy that was current before the variant
    await viewer.waitForFunction(() => window.__villa().shownV === 4, null, { timeout: 30000 });
    s = await st(viewer);
    assert(v.old in s.colors && near(s.colors[v.old], "#ff0000") && s.items === 1);
    step("restore from history works, orphan colour applied again");

    /* 5. headers, history pruning, atomic leftovers */
    const h = await fetch(BASE + "/models/villa.glb?v=4");
    assert.match(h.headers.get("cache-control"), /no-cache/); assert(h.headers.get("etag"), "ETag present");
    const cond = await new Promise(res => require("http").get(BASE + "/models/villa.glb", { headers: { "if-none-match": h.headers.get("etag") } }, r => { r.resume(); res(r.statusCode); }));
    assert.strictEqual(cond, 304, "conditional request gets 304");
    for (let i = 0; i < 12; i++) assert.strictEqual((await post(fs.readFileSync(SEED), KEY)).status, 200);
    const hist = fs.readdirSync(path.join(DATA, "models", "history"));
    assert.strictEqual(hist.length, 10, "history capped at 10");
    assert(!fs.readdirSync(path.join(DATA, "models")).some(n => n.endsWith(".part")), "no temp files left");
    assert((await (await fetch(BASE + "/api/state")).json()).house.v === 16);
    step("ETag/no-cache ok, history capped at 10, no temp leftovers, version 16");

    const errs = [...viewer.logs, ...editor.logs].filter(l => l.startsWith("PAGEERROR"));
    assert.strictEqual(errs.length, 0, errs.join("\n"));
    bot.close();
    console.log("\nALL OK");
  } finally {
    await browser.close(); srv.kill("SIGTERM"); fs.rmSync(DATA, { recursive: true, force: true });
  }
})().catch(e => { console.error("FAIL:", e && e.stack || e); process.exit(1); });
