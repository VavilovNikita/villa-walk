/* Thumbnails: one shared offscreen WebGLRenderer, a tiny studio scene, 256x256 transparent output.
   Exposes window.Thumbs = { renderThumb, stage, frame, spin, disposeObject, fits, SIZE }. */
(() => {
"use strict";
const SIZE = 256, FILL = 0.8, ELEV = 30 * Math.PI / 180, AZ0 = 35 * Math.PI / 180;

let renderer = null;
function getRenderer() {
  if (renderer) return renderer;
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(SIZE, SIZE, false);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.addEventListener("webglcontextlost", e => { e.preventDefault(); renderer = null; });
  return renderer;
}

let blobTex = null;
function shadowTex() {
  if (blobTex) return blobTex;
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d"), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(0,0,0,.42)"); g.addColorStop(.55, "rgba(0,0,0,.22)"); g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  blobTex = new THREE.CanvasTexture(c); return blobTex;
}

/* a scene with lights, the object (must be detached; attached ones are cloned) and a soft circular shadow under it */
function stage(obj) {
  const o = obj.parent ? obj.clone(true) : obj;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 0.95));
  const sun = new THREE.DirectionalLight(0xfff4e6, 1.25); sun.position.set(-3, 6, 4); scene.add(sun);
  scene.add(o); o.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(o), size = new THREE.Vector3(), center = new THREE.Vector3();
  box.getSize(size); box.getCenter(center);
  const r = Math.max(0.5 * Math.hypot(size.x, size.z), 0.05) * 1.05;
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(2 * r, 2 * r), new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.set(center.x, box.min.y + 0.002 * Math.max(size.y, 0.1), center.z); blob.renderOrder = -1; scene.add(blob);
  const corners = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
  return { scene, obj: o, box, size, center, corners, blob,
    remove() { scene.remove(o); scene.remove(blob); blob.geometry.dispose(); blob.material.dispose(); } };
}

/* orthographic camera from the front-side at 30deg elevation; fitted so the model fills ~80% of the frame.
   rotating=true: look at the 3D centre and size for the worst azimuth so the model does not bob while it spins */
function aim(cam, st, az, dist) {
  cam.position.set(st.center.x + dist * Math.cos(ELEV) * Math.sin(az), st.center.y + dist * Math.sin(ELEV), st.center.z + dist * Math.cos(ELEV) * Math.cos(az));
  cam.up.set(0, 1, 0); cam.lookAt(st.center); cam.updateMatrixWorld(true);
}
function extents(st, az, cam, tgt) {
  aim(cam, st, az, 10);
  const inv = cam.matrixWorldInverse.copy(cam.matrixWorld).invert(), v = new THREE.Vector3();
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const c of st.corners) { v.copy(c).applyMatrix4(inv); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
  return { x0, x1, y0, y1 };
}
function fits(st, az, rotating) {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
  const dist = Math.max(st.size.length(), 0.1) * 4;
  let half = 0, ox = 0, oy = 0;
  if (rotating) {
    for (let i = 0; i < 12; i++) { const e = extents(st, i * Math.PI / 6, cam); half = Math.max(half, Math.abs(e.x0), Math.abs(e.x1), Math.abs(e.y0), Math.abs(e.y1)); }
  } else {
    const e = extents(st, az, cam); half = Math.max(e.x1 - e.x0, e.y1 - e.y0) / 2; ox = (e.x0 + e.x1) / 2; oy = (e.y0 + e.y1) / 2;
  }
  half = Math.max(half / FILL, 0.02);
  cam.left = ox - half; cam.right = ox + half; cam.top = oy + half; cam.bottom = oy - half; cam.far = dist * 4; cam.updateProjectionMatrix();
  return { cam, dist };
}
/* draws the stage into the shared canvas */
function frame(st, az, fit) {
  const r = getRenderer(); aim(fit.cam, st, az, fit.dist); r.render(st.scene, fit.cam); return r.domElement;
}

const toBlob = (cv, type, q) => new Promise(res => cv.toBlob(res, type, q));
/* renderThumb(object3D) -> Blob (WebP when the browser can encode it, otherwise PNG), 256x256, transparent */
async function renderThumb(obj) {
  const st = stage(obj);
  try {
    const cv = frame(st, AZ0, fits(st, AZ0, false));
    let b = await toBlob(cv, "image/webp", 0.88);
    if (!b || b.type !== "image/webp") b = await toBlob(cv, "image/png");
    if (!b) throw new Error("toBlob failed");
    return { blob: b, size: st.size.clone() };
  } finally { st.remove(); }
}

/* spins one object into a 2D canvas (the only live thumbnail while hovering); returns {stop()} */
function spin(obj, canvas) {
  const st = stage(obj), fit = fits(st, AZ0, true), ctx = canvas.getContext("2d");
  let raf = 0, last = 0, az = AZ0, dead = false;
  const tick = t => {
    if (dead) return; raf = requestAnimationFrame(tick);
    if (t - last < 33) return;
    az += (last ? Math.min(t - last, 100) : 0) * 0.0009; last = t;
    try { const cv = frame(st, az, fit); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(cv, 0, 0, canvas.width, canvas.height); } catch {}
  };
  raf = requestAnimationFrame(tick);
  return { stop() { dead = true; cancelAnimationFrame(raf); st.remove(); } };
}

function disposeObject(root) {
  root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    for (const m of [].concat(o.material || [])) {
      for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
      m.dispose();
    }
  });
}

window.Thumbs = { SIZE, renderThumb, stage, frame, fits, spin, disposeObject };
})();
