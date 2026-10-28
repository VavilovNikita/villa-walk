/* Where the app lives and which environment it is. Loaded first; the server puts the values into <meta> tags of index.html.
   window.Env: base ("" or "/train"), sandbox, limits, url(path) and ls(key) - every URL and every localStorage key goes through them. */
(() => {
"use strict";
const meta = n => { const m = document.querySelector('meta[name="' + n + '"]'); return m ? m.content : ""; };
const base = meta("base-path").replace(/\/+$/, "");
const lsPrefix = base ? base.slice(1).replace(/\W+/g, "_") + ":" : "";
const Env = {
  base, sandbox: meta("sandbox") === "1",
  maxModelMb: +meta("max-model-mb") || 200, maxTextureMb: +meta("max-texture-mb") || 15,
  url: p => base + p,
  ls: k => lsPrefix + k,
  wsUrl: () => (location.protocol === "https:" ? "wss://" : "ws://") + location.host + base + "/ws",
};
window.Env = Env;
if (Env.sandbox) {
  document.documentElement.classList.add("sandbox");
  const bar = document.createElement("div");
  bar.id = "sandboxBar"; bar.setAttribute("role", "note");
  const txt = document.createElement("span"); txt.textContent = "Тренировочная среда — изменения не влияют на основную модель"; bar.append(txt);
  /* editor-only actions (shown by app.js applyRole) */
  for (const [id, label, tip] of [["bPull", "Взять модель дома из основной", "Скопировать актуальную модель дома из основной среды (там ничего не меняется)"], ["bReset", "Сбросить всё", "Очистить цвета, детали, текстуры и мебель"]]) {
    const b = document.createElement("button"); b.id = id; b.hidden = true; b.textContent = label; b.title = tip; bar.append(b);
  }
  document.body.prepend(bar);
}
})();
