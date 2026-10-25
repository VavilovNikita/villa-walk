#!/usr/bin/env node
"use strict";
/* Announces a new house model to everyone online (no page reload needed).
   Usage (inside the container):
     node scripts/house-reload.js                  villa.glb was already replaced by hand in <DATA_DIR>/models/
     node scripts/house-reload.js villa-new.glb    swap in <DATA_DIR>/models/villa-new.glb (old one goes to history) */
const path = require("path");
try { process.loadEnvFile(path.join(__dirname, "..", ".env")); } catch {}

const key = process.env.EDIT_KEY || "";
const base = "http://127.0.0.1:" + (process.env.PORT || 3000);
const from = process.argv[2] ? path.basename(process.argv[2]) : undefined;
const MSG = {
  no_file: "Файл не найден в папке models.",
  not_glb: "Это не корректный .glb (ожидается glTF версии 2, файл не обрезан).",
  bad_path: "Файл должен лежать прямо в <DATA_DIR>/models/ и не быть villa.glb.",
  forbidden: "Сервер не принял ключ редактора (EDIT_KEY).",
};

(async () => {
  if (!key) { console.error("EDIT_KEY не задан в окружении."); process.exit(1); }
  const r = await fetch(base + "/api/house/reload", { method: "POST", headers: { "x-edit-key": key, "content-type": "application/json" }, body: JSON.stringify({ from }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error("Ошибка: " + (MSG[j.error] || j.error || "http " + r.status)); process.exit(1); }
  console.log("Модель дома обновлена: версия " + j.v + ", " + new Date(j.at).toISOString());
})().catch(e => { console.error("Сервер недоступен: " + e.message); process.exit(1); });
