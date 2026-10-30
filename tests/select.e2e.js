"use strict";
/* E2E: an uploaded (and so compressed) model can be selected by a click - in Orbit and by the crosshair in Walk - also after a move (drag), after a B-box selection,
   after a mass upload and after a page reload. Regression: a compressed model keeps its positions as normalised integers (KHR_mesh_quantization); three r128's
   CPU side read them raw, so the click ray missed the model and nothing could be selected. Starts its own server on a temp data dir with a random key (never printed).
   Run: node tests/select.e2e.js   (needs playwright-core + a chromium) */
const path = require("path"), fs = require("fs"), os = require("os"), crypto = require("crypto"), assert = require("assert");
const { spawn } = require("child_process");
const { chromium } = require("playwright-core");
const { buildGlb } = require("./helpers/bigglb");
const { inspectGlb } = require("./helpers/inspect");

const ROOT = path.join(__dirname, "..");
const PORT = 3900 + Math.floor(Math.random() * 60), BASE = "http://127.0.0.1:" + PORT;
const KEY = crypto.randomBytes(24).toString("hex");
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "villa-sel-"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const step = m => console.log("• " + m);
const state = async () => (await fetch(BASE + "/api/state")).json();
async function until(fn, what, ms = 90000) { const t0 = Date.now(); for (;;) { const r = await fn(); if (r) return r; if (Date.now() - t0 > ms) throw new Error("timeout: " + what); await sleep(250); } }

(async () => {
  const srv = spawn("node", ["server/index.js"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, EDIT_KEY: KEY, HOST: "127.0.0.1", COMPRESS_START_DELAY_MS: "300" }, stdio: "ignore" });
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  let page;
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {} await sleep(200); }
    const mkModel = async (name, tris) => {
      const f = path.join(DATA, name + ".glb"); await buildGlb(f, { tris, tex: 256, name });
      const fd = new FormData(); fd.append("name", name); fd.append("file", new Blob([fs.readFileSync(f)]), name + ".glb");
      const r = await fetch(BASE + "/api/models", { method: "POST", body: fd, headers: { "x-edit-key": KEY } }); return (await r.json()).id;
    };
    const compressed = id => until(async () => { const m = (await state()).models[id]; return m && m.liteFile && m.compressedAt ? m : null; }, "model compressed");
    const id1 = await mkModel("Alpha", 20000), m1 = await compressed(id1);
    const info = await inspectGlb(path.join(DATA, "uploads", m1.liteFile));
    assert(info.extensions.includes("KHR_mesh_quantization"), "the test model must be quantized, or it proves nothing: " + info.extensions);
    step("test model is compressed and quantized (" + info.extensions.join(", ") + ")");

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); page = await ctx.newPage(); page.logs = [];
    page.on("console", m => page.logs.push(m.text())); page.on("pageerror", e => page.logs.push("PAGEERROR " + e.message));
    await page.addInitScript(p => localStorage.setItem("villa.profile", p), JSON.stringify({ uid: "editoruidxx", name: "editor", color: "#2f6f62" }));
    const open = async () => { await page.goto(BASE + "/?k=" + KEY); await page.waitForFunction(() => window.__villa && window.__villa().shownV && !document.getElementById("loading"), null, { timeout: 60000 }); };
    await open();
    const put = (iid, model, x, z) => page.evaluate(([i, m, x, z]) => Sync.commitItem(i, { type: "model", model: m, x, y: 0, z, r: 0, s: 3, by: "editor", at: Date.now() }), [iid, model, x, z]);
    const selOf = iid => page.evaluate(i => window.__villaItem(i).sel, iid);
    const ready = iid => page.waitForFunction(i => { const it = window.__villaItem(i); return it && window.__villa().modelReady; }, iid, { timeout: 30000 }).then(() => sleep(700));
    /* a real mouse click on the item seen from above-aside */
    const view = async iid => { const [x, , z] = (await page.evaluate(i => window.__villaItem(i).p, iid)); await page.evaluate(([x, z]) => window.__villaView([x + 2, 6, z + 4], [x, 1, z]), [x, z]); await sleep(300); return [x, z]; };
    const scr = async iid => { const [x, , z] = (await page.evaluate(i => window.__villaItem(i).p, iid)); return page.evaluate(([x, z]) => window.__villaScreen(x, 1.5, z), [x, z]); };
    const clickItem = async iid => { await view(iid); await page.keyboard.press("Escape"); await page.mouse.click(5, 790); await sleep(200); const [sx, sy] = await scr(iid); await page.mouse.click(sx, sy); await sleep(400); return selOf(iid); };
    const panelOpen = () => page.evaluate(() => !document.getElementById("ctx").hidden);

    /* 1. Orbit */
    await put("itemsel0001", id1, 12, 0); await ready("itemsel0001");
    assert.deepStrictEqual(await clickItem("itemsel0001"), ["itemsel0001"], "orbit click selects the model");
    assert(await panelOpen(), "item panel opened");
    step("Orbit: a click selects the placed model, the item panel opens");

    /* 2. Walk: the crosshair */
    await page.click("#mWalk");
    await page.evaluate(() => window.__villaWalkAim(12, 4, 0)); await sleep(500);
    await page.evaluate(() => window.__villaSelectItems([])); await sleep(100);
    const pick = await page.evaluate(() => { const r = document.querySelector("#stage canvas").getBoundingClientRect(); return window.__villaPick(r.left + r.width / 2, r.top + r.height / 2); });
    assert(pick && pick.item === "itemsel0001", "the crosshair is on the model: " + JSON.stringify(pick));
    await page.evaluate(() => window.__villaCrosshairClick()); await sleep(300);
    assert.deepStrictEqual(await selOf("itemsel0001"), ["itemsel0001"], "the crosshair selects the model in Walk");
    await page.click("#mOrbit"); await sleep(300);
    step("Walk: the crosshair on the model selects it");

    /* 3. after a drag-move the model is still selectable */
    await view("itemsel0001"); await page.keyboard.press("Escape"); await page.mouse.click(5, 790); await sleep(200);
    const [sx, sy] = await scr("itemsel0001");
    await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx + 40, sy + 25, { steps: 6 }); await page.mouse.up(); await sleep(500);
    const moved = await page.evaluate(() => window.__villaItem("itemsel0001").p);
    assert(Math.hypot(moved[0] - 12, moved[2]) > 0.2, "the drag moved it: " + moved);
    assert.deepStrictEqual(await clickItem("itemsel0001"), ["itemsel0001"], "selectable after being moved");
    step("after moving it with the mouse a plain click selects it again");

    /* 4. after the G key */
    await page.keyboard.press("g"); await page.mouse.move(640, 400); await page.keyboard.press("Enter"); await sleep(400);
    assert.deepStrictEqual(await clickItem("itemsel0001"), ["itemsel0001"], "selectable after G");
    step("after G (keyboard move) a plain click selects it");

    /* 5. after the B box */
    await view("itemsel0001"); await page.keyboard.press("Escape"); await page.mouse.click(5, 790); await sleep(200);
    const [bx, by] = await scr("itemsel0001");
    await page.keyboard.press("b"); await page.mouse.move(bx - 120, by - 120); await page.mouse.down(); await page.mouse.move(bx + 120, by + 120, { steps: 5 }); await page.mouse.up(); await sleep(400);
    assert.deepStrictEqual(await selOf("itemsel0001"), ["itemsel0001"], "the B box selects it");
    assert.deepStrictEqual(await clickItem("itemsel0001"), ["itemsel0001"], "selectable by click after the B box");
    step("the B box selects it, and a plain click works afterwards");

    /* 6. after a mass upload */
    const files = [];
    for (const n of ["Beta", "Gamma"]) { const f = path.join(DATA, "up-" + n + ".glb"); await buildGlb(f, { tris: 8000, tex: 128, name: n }); files.push(f); }
    await page.click("#tUp"); await page.setInputFiles("#upFiles", files);
    await until(async () => Object.keys((await state()).models).length === 3, "two uploaded models");
    await until(async () => { const ms = Object.values((await state()).models); return ms.length === 3 && ms.every(m => m.compressedAt || m.compressError) ? true : null; }, "all compressed");
    const idB = Object.entries((await state()).models).find(([, m]) => /Beta/.test(m.name))[0];
    await sleep(1500);
    await put("itemsel0002", idB, -8, 3); await ready("itemsel0002");
    assert.deepStrictEqual(await clickItem("itemsel0002"), ["itemsel0002"], "a model from the mass upload is selectable");
    assert.deepStrictEqual(await clickItem("itemsel0001"), ["itemsel0001"], "the first one still is");
    step("after a mass upload both the new and the old model are selectable");

    /* 7. after a reload */
    await open(); await ready("itemsel0001"); await ready("itemsel0002");
    assert.deepStrictEqual(await clickItem("itemsel0002"), ["itemsel0002"], "selectable after reload");
    assert.deepStrictEqual(await clickItem("itemsel0001"), ["itemsel0001"], "selectable after reload");
    step("after a page reload both are selectable");

    const errs = page.logs.filter(l => l.startsWith("PAGEERROR"));
    assert.deepStrictEqual(errs, [], errs.join("\n"));
    console.log("ALL OK");
  } catch (e) {
    console.error("FAIL:", e);
    if (page) console.error("page log:", page.logs.filter(l => !/GL Driver/.test(l)).slice(-6).join(" || ").slice(0, 500));
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {}); srv.kill("SIGKILL"); await sleep(400);
    try { fs.rmSync(DATA, { recursive: true, force: true }); } catch {}
    process.exit(process.exitCode || 0);
  }
})();
