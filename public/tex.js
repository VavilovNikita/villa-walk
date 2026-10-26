/* Textures: procedural library, THREE.Texture cache, triplanar material (no UV needed). Exposes window.Tex.
   The house is boxes from Blender without a UV unwrap, so a textured surface samples the picture by position:
   UV = position (m) / real size of the fragment (m), on the plane facing the surface (floor: XZ, walls: XY or ZY).
   Items use the same shader in their own rigid frame (position + rotation, no scale), so the pattern does not swim when
   the item is moved or turned. Uploaded models that do have UV get an ordinary map with repeat / rotation instead. */
(() => {
"use strict";
const T = {};
let renderer = null, aniso = 1, small = false;
T.library = new Map();           // id -> texture doc from the server

/* ---------------- procedural textures ---------------- */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, a = 0, b = 255) => Math.min(b, Math.max(a, v));
const hex2 = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgb = (c, d = 0) => `rgb(${clamp(Math.round(c[0] + d))},${clamp(Math.round(c[1] + d))},${clamp(Math.round(c[2] + d))})`;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/* periodic value noise 0..1: tiles seamlessly because the lattice wraps */
function pnoise(W, H, fx, fy, r) {
  const g = new Float32Array(fx * fy); for (let i = 0; i < g.length; i++) g[i] = r();
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const v = y / H * fy, y0 = Math.floor(v), ty = v - y0, sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < W; x++) {
      const u = x / W * fx, x0 = Math.floor(u), tx = u - x0, sx = tx * tx * (3 - 2 * tx);
      const a = g[(y0 % fy) * fx + (x0 % fx)], b = g[(y0 % fy) * fx + ((x0 + 1) % fx)], c = g[((y0 + 1) % fy) * fx + (x0 % fx)], d = g[((y0 + 1) % fy) * fx + ((x0 + 1) % fx)];
      out[y * W + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    }
  }
  return out;
}
/* fills the canvas with base colour modulated by layered periodic noise (amp in 0..255 colour units) */
function noiseFill(ctx, W, H, base, layers, r) {
  const img = ctx.createImageData(W, H), d = img.data, acc = new Float32Array(W * H);
  for (const [fx, fy, amp] of layers) { const n = pnoise(W, H, fx, fy, r); for (let i = 0; i < acc.length; i++) acc[i] += (n[i] - 0.5) * 2 * amp; }
  for (let i = 0; i < acc.length; i++) { d[i * 4] = clamp(base[0] + acc[i]); d[i * 4 + 1] = clamp(base[1] + acc[i]); d[i * 4 + 2] = clamp(base[2] + acc[i] * 0.95); d[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
}
/* runs fn at every wrap offset so a shape crossing an edge continues on the opposite side */
function wrapped(ctx, W, H, fn) { for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) { ctx.save(); ctx.translate(dx, dy); fn(); ctx.restore(); } }

const GROUT = "#8a857a";
const DEFS = {
  parquet: { name: "Паркетная доска, 3 тона", sizeMm: [360, 900], draw(c, W, H, k) {
    const r = rng(11), tones = [[184, 138, 91], [168, 120, 76], [199, 156, 108]], offs = [0, 300, 600];
    for (let i = 0; i < 3; i++) {
      const col = mix(tones[i], tones[(i + 1) % 3], r() * 0.3), x = i * 120 * k, w = 120 * k;
      c.fillStyle = rgb(col); c.fillRect(x, 0, w, H);
      for (let n = 0; n < 14; n++) { c.fillStyle = `rgba(${r() > 0.5 ? "70,40,20" : "230,200,160"},${0.05 + r() * 0.09})`; c.fillRect(x + r() * w, 0, (0.5 + r() * 1.5) * k, H); }
      const y = offs[i] * k;       // the board of this column ends here (it continues from the other side of the cell)
      c.fillStyle = "rgba(60,38,22,.65)"; c.fillRect(x, y - k, w, 2 * k);
      c.fillStyle = "rgba(60,38,22,.55)"; c.fillRect(x - k, 0, 2 * k, H);
    }
    c.fillRect(W - k, 0, 2 * k, H);
  } },
  herringbone: { name: "Ёлочка", sizeMm: [560, 560], draw(c, W, H, k) {
    const a = 70 * k, r = rng(5), tones = [[176, 130, 84], [160, 116, 74], [190, 146, 98]];
    c.fillStyle = "#3d2a1a"; c.fillRect(0, 0, W, H);
    const plank = (x, y, w, h, tone) => { wrapped(c, W, H, () => {
      c.fillStyle = rgb(tone); c.fillRect(x + 0.6 * k, y + 0.6 * k, w - 1.2 * k, h - 1.2 * k);
      c.fillStyle = "rgba(60,36,20,.12)"; const long = w > h;
      for (let n = 0; n < 3; n++) { const t = (0.2 + n * 0.3) * (long ? h : w); if (long) c.fillRect(x, y + t, w, k * 0.8); else c.fillRect(x + t, y, k * 0.8, h); }
    }); };
    for (let i = 0; i < 8; i++) {
      plank(i * a, i * a, 4 * a, a, mix(tones[Math.floor(r() * 3)], [150, 110, 70], r() * 0.2));
      plank((i + 4) * a, (i - 3) * a, a, 4 * a, mix(tones[Math.floor(r() * 3)], [150, 110, 70], r() * 0.2));
    }
  } },
  tile600: { name: "Плитка 600×600", sizeMm: [600, 600], grout: GROUT, draw(c, W, H, k, r) { tile(c, W, H, k, [214, 208, 197], 4); } },
  tile300x600: { name: "Плитка 300×600", sizeMm: [300, 600], grout: "#8a857a", draw(c, W, H, k) { tile(c, W, H, k, [188, 192, 193], 5); } },
  mosaic50: { name: "Мозаика 50×50", sizeMm: [400, 400], grout: "#dfe3e3", draw(c, W, H, k) {
    const r = rng(23), pal = [[95, 147, 168], [121, 169, 184], [156, 194, 204], [74, 127, 147], [182, 211, 217]], s = 50 * k;
    c.fillStyle = "#dfe3e3"; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const col = pal[Math.floor(r() * pal.length)]; c.fillStyle = rgb(col, (r() - 0.5) * 14);
      c.fillRect(i * s + 1.6 * k, j * s + 1.6 * k, s - 3.2 * k, s - 3.2 * k);
      c.fillStyle = "rgba(255,255,255,.18)"; c.fillRect(i * s + 1.6 * k, j * s + 1.6 * k, s - 3.2 * k, 2 * k);
    }
  } },
  concrete: { name: "Бетон", sizeMm: [1000, 1000], draw(c, W, H, k) {
    const r = rng(31); noiseFill(c, W, H, [150, 150, 146], [[3, 3, 14], [8, 8, 10], [20, 20, 7], [60, 60, 5]], r);
    wrapped(c, W, H, () => { for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(60,60,58,${0.15 + r() * 0.25})`; c.beginPath(); c.arc(r() * W, r() * H, (0.8 + r() * 1.8) * k * 1.5, 0, 6.3); c.fill(); } });
  } },
  bark: { name: "Штукатурка «короед»", sizeMm: [500, 500], draw(c, W, H, k) {
    const r = rng(41); noiseFill(c, W, H, [216, 207, 190], [[4, 4, 8], [16, 16, 8]], r);
    c.lineCap = "round";
    wrapped(c, W, H, () => { for (let i = 0; i < 900; i++) {
      const x = r() * W, y = r() * H, len = (25 + r() * 60) * k, sway = (r() - 0.5) * 8 * k, w = (1.3 + r() * 2) * k;
      c.strokeStyle = `rgba(110,98,80,${0.25 + r() * 0.3})`; c.lineWidth = w; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + sway, y + len / 2, x + sway * 0.4, y + len); c.stroke();
      c.strokeStyle = `rgba(255,252,240,${0.2 + r() * 0.25})`; c.lineWidth = w * 0.5; c.beginPath(); c.moveTo(x + w, y); c.quadraticCurveTo(x + sway + w, y + len / 2, x + sway * 0.4 + w, y + len); c.stroke();
    } });
  } },
  travertine: { name: "Травертин", sizeMm: [800, 800], draw(c, W, H, k) {
    const r = rng(53), n1 = pnoise(W, H, 2, 14, r), n2 = pnoise(W, H, 4, 40, r), img = c.createImageData(W, H), A = [205, 188, 154], B = [231, 220, 190];
    for (let i = 0; i < W * H; i++) { const t = clamp(n1[i] * 0.7 + n2[i] * 0.45 - 0.1, 0, 1), col = mix(A, B, t); img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255; }
    c.putImageData(img, 0, 0);
    wrapped(c, W, H, () => { for (let i = 0; i < 140; i++) { c.fillStyle = `rgba(150,128,92,${0.2 + r() * 0.35})`; c.beginPath(); c.ellipse(r() * W, r() * H, (3 + r() * 14) * k, (0.8 + r() * 1.8) * k, 0, 0, 6.3); c.fill(); } });
  } },
  rattan: { name: "Ротанг", sizeMm: [120, 120], draw(c, W, H, k) {
    const s = 20 * k, bw = 15 * k; c.fillStyle = "#5a3d22"; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      const horiz = (i + j) % 2 === 0, x = i * s, y = j * s, g = horiz ? c.createLinearGradient(0, y, 0, y + s) : c.createLinearGradient(x, 0, x + s, 0);
      g.addColorStop(0, "#d7ab6b"); g.addColorStop(0.5, "#c89a58"); g.addColorStop(1, "#9a7340"); c.fillStyle = g;
      if (horiz) c.fillRect(x - (s - bw) / 2 - 0.5 * k, y + (s - bw) / 2, s + (s - bw) + k, bw); else c.fillRect(x + (s - bw) / 2, y - (s - bw) / 2 - 0.5 * k, bw, s + (s - bw) + k);
    }
  } },
  linen: { name: "Рогожка", sizeMm: [60, 60], draw(c, W, H, k) {
    const n = 12, s = W / n, r = rng(67); c.fillStyle = "#b9ae98"; c.fillRect(0, 0, W, H);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const horiz = (i + j) % 2 === 0, d = (r() - 0.5) * 18, x = i * s, y = j * s; c.fillStyle = rgb([214, 205, 186], d);
      if (horiz) { c.fillRect(x, y + s * 0.12, s, s * 0.76); c.fillStyle = "rgba(255,255,255,.18)"; c.fillRect(x, y + s * 0.12, s, s * 0.18); }
      else { c.fillRect(x + s * 0.12, y, s * 0.76, s); c.fillStyle = "rgba(0,0,0,.08)"; c.fillRect(x + s * 0.7, y, s * 0.18, s); }
    }
  } },
  brick: { name: "Белый кирпич", sizeMm: [500, 130], grout: "#bdb8ae", draw(c, W, H, k) {
    const r = rng(79), bw = 240 * k, bh = 55 * k, tones = [[236, 232, 224], [228, 223, 213], [242, 239, 232]];
    c.fillStyle = "#bdb8ae"; c.fillRect(0, 0, W, H);
    for (let row = 0; row < 2; row++) for (let b = 0; b < 2; b++) {
      const x = (row * 125 + b * 250) * k, y = row * 65 * k + 5 * k, col = mix(tones[Math.floor(r() * 3)], [215, 210, 200], r() * 0.3);
      wrapped(c, W, H, () => { c.fillStyle = rgb(col); c.fillRect(x + 5 * k, y, bw, bh); c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(x + 5 * k, y, bw, 2.5 * k);
        for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(120,115,105,${0.08 + r() * 0.12})`; c.fillRect(x + 5 * k + r() * bw, y + r() * bh, (0.8 + r() * 1.6) * k, (0.8 + r() * 1.6) * k); } });
    }
  } },
};
function tile(c, W, H, k, base, g) {
  const r = rng(W * 7 + H); noiseFill(c, W, H, base, [[3, 3, 5], [24, 24, 4]], r);
  const gc = c.createLinearGradient(0, 0, W, H); gc.addColorStop(0, "rgba(255,255,255,.10)"); gc.addColorStop(1, "rgba(0,0,0,.07)"); c.fillStyle = gc; c.fillRect(0, 0, W, H);
  c.fillStyle = "#8a857a"; const e = g * k / 2;                 // the joint is split between the neighbours: g mm in total
  c.fillRect(0, 0, W, e); c.fillRect(0, H - e, W, e); c.fillRect(0, 0, e, H); c.fillRect(W - e, 0, e, H);
}
T.builtinKeys = Object.keys(DEFS);
T.builtins = Object.fromEntries(Object.entries(DEFS).map(([k, d]) => [k, { key: k, name: d.name, sizeMm: d.sizeMm, grout: d.grout || null }]));

function drawBuiltin(key, res) {
  const d = DEFS[key], k = res / Math.max(d.sizeMm[0], d.sizeMm[1]);
  const cv = document.createElement("canvas"); cv.width = Math.max(8, Math.round(d.sizeMm[0] * k)); cv.height = Math.max(8, Math.round(d.sizeMm[1] * k));
  d.draw(cv.getContext("2d"), cv.width, cv.height, cv.width / d.sizeMm[0]);
  return cv;
}

/* ---------------- source helpers (src = {id} | {builtin}) ---------------- */
const srcKey = s => s ? (s.id ? "u:" + s.id : s.builtin ? "b:" + s.builtin : "") : "";
T.srcKey = srcKey;
T.exists = s => !!s && (s.id ? T.library.has(s.id) : !!DEFS[s.builtin]);
T.nameOf = s => s ? (s.id ? (T.library.get(s.id)?.name || "Текстура") : (DEFS[s.builtin]?.name || "Текстура")) : "";
T.defaultSize = s => s ? (s.id ? (T.library.get(s.id)?.sizeMm || [600, 600]) : (DEFS[s.builtin]?.sizeMm || [600, 600])) : [600, 600];
T.sizeOf = tex => (tex && Array.isArray(tex.sizeMm) ? tex.sizeMm : T.defaultSize(tex));
T.thumbUrl = s => s && s.id ? (T.library.get(s.id)?.thumb ? "/uploads/textures/" + T.library.get(s.id).thumb : null) : null;
const dataThumbs = new Map();
/* a small tile of a procedural texture (2x2 repeats) for cards */
T.builtinThumb = key => {
  if (dataThumbs.has(key)) return dataThumbs.get(key);
  const src = drawBuiltin(key, 128), cv = document.createElement("canvas"); cv.width = cv.height = 96;
  const c = cv.getContext("2d"), d = DEFS[key].sizeMm, span = Math.max(d[0], d[1]);   // show about one unit of the pattern, tiled to the square
  const w = 96 * d[0] / span, h = 96 * d[1] / span;
  for (let x = 0; x < 96; x += w) for (let y = 0; y < 96; y += h) c.drawImage(src, x, y, w, h);
  const url = cv.toDataURL("image/png"); dataThumbs.set(key, url); return url;
};
T.thumbOf = s => s ? (s.id ? T.thumbUrl(s) : T.builtinThumb(s.builtin)) : null;

/* ---------------- texture cache (reference counted by the materials that use it) ---------------- */
const texCache = new Map();      // srcKey -> {tex, n}
T.init = (r, touch) => { renderer = r; small = !!touch; aniso = Math.min(r.capabilities.getMaxAnisotropy(), small ? 4 : 16); };
function makeTexture(s) {
  let t;
  if (s.id) {
    const d = T.library.get(s.id);
    t = new THREE.TextureLoader().load("/uploads/textures/" + ((small ? d?.file1024 : d?.file) || d?.file || "missing.webp"));
  } else t = new THREE.CanvasTexture(drawBuiltin(s.builtin, small ? 512 : 1024));
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding;
  t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}
function retain(s) { const k = srcKey(s); let e = texCache.get(k); if (!e) { e = { tex: makeTexture(s), n: 0 }; texCache.set(k, e); } e.n++; return e.tex; }
function release(k) { const e = texCache.get(k); if (!e) return; if (--e.n <= 0) { e.tex.dispose(); texCache.delete(k); } }
T.cacheSize = () => texCache.size;
/* an uploaded picture was replaced / removed: forget the decoded copy */
T.forget = id => { const e = texCache.get("u:" + id); if (e) { e.tex.dispose(); texCache.delete("u:" + id); } };

/* ---------------- triplanar material ---------------- */
const rotM = deg => { const a = deg * Math.PI / 180, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a)); return new THREE.Matrix3().set(c, -s, 0, s, c, 0, 0, 0, 1); };
function patch(shader) {
  const tp = this.userData.tp;
  Object.assign(shader.uniforms, tp);
  const decl = "\nuniform mat4 tpSpace;\nvarying vec3 vTpP;\nvarying vec3 vTpN;\n";
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>" + decl)
    .replace("#include <project_vertex>", `#include <project_vertex>
  vTpP = (tpSpace * modelMatrix * vec4(transformed, 1.0)).xyz;
  vTpN = normalize(mat3(tpSpace) * (mat3(modelMatrix) * objectNormal));`);
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>${decl}uniform vec2 tpSize;\nuniform vec2 tpOff;\nuniform mat3 tpRot;
vec2 tpUV(vec2 q) { vec3 p = tpRot * vec3(q * 1000.0, 1.0); return (p.xy - tpOff) / tpSize; }`)
    .replace("#include <map_fragment>", `
  vec3 tpF = normalize(cross(dFdx(vTpP), dFdy(vTpP)));
  if (dot(tpF, normalize(vTpN)) < 0.0) tpF = -tpF;
  vec3 tpA = abs(tpF);
  float tpM = max(tpA.x, max(tpA.y, tpA.z));
  vec2 uvX = vec2(vTpP.z * (tpF.x > 0.0 ? -1.0 : 1.0), vTpP.y);
  vec2 uvY = vec2(vTpP.x, vTpP.z * (tpF.y > 0.0 ? -1.0 : 1.0));
  vec2 uvZ = vec2(vTpP.x * (tpF.z > 0.0 ? 1.0 : -1.0), vTpP.y);
  vec3 tpHard = step(vec3(tpM - 1e-4), tpA);
  vec2 tpUh = tpHard.x > 0.5 ? uvX : (tpHard.y > 0.5 ? uvY : uvZ);
  vec4 texelColor = texture2D(map, tpUV(tpUh));
  if (tpM < 0.93) {              // slanted surface (roof, hipped ceiling): blend the three projections
    vec3 tpW = pow(tpA, vec3(4.0)); tpW /= (tpW.x + tpW.y + tpW.z);
    texelColor = tpW.x * texture2D(map, tpUV(uvX)) + tpW.y * texture2D(map, tpUV(uvY)) + tpW.z * texture2D(map, tpUV(uvZ));
  }
  texelColor = mapTexelToLinear(texelColor);
  diffuseColor *= texelColor;`);
}
/* signature of everything that changes the look of a textured material (also the cache key of the house) */
T.sig = (tex, tint) => [srcKey(tex), T.sizeOf(tex).join("x"), tex.rot || 0, (tex.offMm || [0, 0]).join(","), tint || ""].join("|");
/* base: the material to copy (transparency, side, ...). Returns a MeshStandardMaterial that must be given back to T.disposeMat. */
T.makeMat = (base, tex) => {
  const m = base.clone(), s = T.sizeOf(tex), off = tex.offMm || [0, 0];
  m.map = retain(tex); m.color.setStyle(tex.tint || "#ffffff").convertSRGBToLinear();
  m.userData = { texKey: srcKey(tex), texShared: true,
    tp: { tpSize: { value: new THREE.Vector2(s[0], s[1]) }, tpOff: { value: new THREE.Vector2(off[0], off[1]) }, tpRot: { value: rotM(tex.rot || 0) }, tpSpace: { value: new THREE.Matrix4() } } };
  m.onBeforeCompile = patch;
  m.extensions = { derivatives: true };   // dFdx / dFdy for the face normal (WebGL1 needs the extension, WebGL2 has them built in)
  m.needsUpdate = true;
  return m;
};
T.disposeMat = m => { if (!m) return; const k = m.userData && m.userData.texKey; m.dispose(); if (k) release(k); };
/* item frame: rigid (no scale) inverse of the item's matrix, so coordinates are metres in the item's own axes */
const _m = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1);
T.setSpace = (m, obj) => { const sp = m.userData.tp && m.userData.tp.tpSpace; if (!sp) return; sp.value.copy(_m.compose(obj.position, obj.quaternion, _one).invert()); };

/* ---------------- UV mode for uploaded models ---------------- */
/* a copy of the material whose map is the picture with repeat / rotation (its own texture object: the transform lives on the texture,
   and a clone of a still-loading TextureLoader texture would never get its image). Give it back to T.disposeMapMat. */
T.makeMapMat = (base, tex, sizeM) => {
  const s = T.sizeOf(tex), t = makeTexture(tex);
  t.repeat.set(Math.max(0.01, sizeM[0] * 1000 / s[0]), Math.max(0.01, sizeM[1] * 1000 / s[1]));
  t.center.set(0.5, 0.5); t.rotation = -(tex.rot || 0) * Math.PI / 180;
  const off = tex.offMm || [0, 0]; t.offset.set(off[0] / s[0], off[1] / s[1]);
  const m = base.clone(); m.map = t; m.color.setStyle(tex.tint || "#ffffff").convertSRGBToLinear();
  m.userData = { mapClone: t };
  m.needsUpdate = true;
  return m;
};
T.disposeMapMat = m => { if (!m) return; if (m.userData && m.userData.mapClone) m.userData.mapClone.dispose(); m.dispose(); };

window.Tex = T;
})();
