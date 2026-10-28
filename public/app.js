"use strict";
(() => {
const $ = id => document.getElementById(id);
const isTouch = matchMedia("(pointer: coarse)").matches;

/* ---------------- palette ---------------- */
const PALETTE = ["#f4f1ea","#e9e4d8","#d9d2c3","#bfb6a5","#8e8576","#5a544b","#2b2926","#0d0d0d",
                 "#dfe6ea","#b9c7d3","#8193b8","#7d86c7","#5d5aa8","#2f3d63","#9fb9a6","#5f7f6a",
                 "#2f4f3e","#d9b99b","#c28a5a","#a0522d","#7b3f2a","#e0a3a0","#c4625a","#d9c27a"];

/* ---------------- furniture library (metres) ---------------- */
function mat(hex, rough=0.7, metal=0){ const m=new THREE.MeshStandardMaterial({roughness:rough,metalness:metal}); m.color.setStyle(hex).convertSRGBToLinear(); return m; }
function bx(g,w,h,d,x,y,z,m,tint){ const me=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m); me.position.set(x,y,z); me.castShadow=me.receiveShadow=true; if(tint) me.userData.tint=true; g.add(me); return me; }
function cy(g,r,h,x,y,z,m,tint,seg=24){ const me=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,seg),m); me.position.set(x,y,z); me.castShadow=me.receiveShadow=true; if(tint) me.userData.tint=true; g.add(me); return me; }
const LEG = () => mat("#222",0.5,0.4), WOOD = () => mat("#8a6242",0.6);
const LIB = {
  sofa:{name:"Диван трёхместный",size:[2200,900,850],color:"#8193b8",build(t){const g=new THREE.Group(),l=LEG();
    bx(g,2.2,.42,.9,0,.27,0,t,1);bx(g,2.2,.45,.2,0,.62,-.35,t,1);bx(g,.18,.25,.9,-1.01,.6,0,t,1);bx(g,.18,.25,.9,1.01,.6,0,t,1);
    for(const[x,z]of[[-1,-.38],[1,-.38],[-1,.38],[1,.38]])cy(g,.03,.08,x,.04,z,l);return g;}},
  armchair:{name:"Кресло",size:[850,850,850],color:"#c4625a",build(t){const g=new THREE.Group(),l=LEG();
    bx(g,.85,.4,.85,0,.28,0,t,1);bx(g,.85,.42,.18,0,.66,-.33,t,1);bx(g,.14,.22,.85,-.36,.58,0,t,1);bx(g,.14,.22,.85,.36,.58,0,t,1);
    for(const[x,z]of[[-.36,-.36],[.36,-.36],[-.36,.36],[.36,.36]])cy(g,.025,.08,x,.04,z,l);return g;}},
  bed160:{name:"Кровать 160×200",size:[1700,2100,1000],color:"#e9e4d8",build(t){const g=new THREE.Group(),w=WOOD();
    bx(g,1.7,.3,2.1,0,.15,0,w);bx(g,1.6,.25,2.0,0,.42,.03,t,1);bx(g,1.7,1.0,.08,0,.5,-1.03,w);
    bx(g,.6,.12,.35,-.4,.6,-.78,mat("#fafafa",.9));bx(g,.6,.12,.35,.4,.6,-.78,mat("#fafafa",.9));return g;}},
  bed90:{name:"Кровать 90×200",size:[1000,2100,900],color:"#dfe6ea",build(t){const g=new THREE.Group(),w=WOOD();
    bx(g,1.0,.3,2.1,0,.15,0,w);bx(g,.9,.25,2.0,0,.42,.03,t,1);bx(g,1.0,.9,.08,0,.45,-1.03,w);return g;}},
  nightstand:{name:"Тумбочка",size:[500,400,500],color:"#8a6242",build(t){const g=new THREE.Group();bx(g,.5,.5,.4,0,.25,0,t,1);bx(g,.44,.02,.01,0,.33,.205,mat("#222"));return g;}},
  wardrobe:{name:"Шкаф 1200",size:[1200,600,2100],color:"#2b2926",build(t){const g=new THREE.Group();bx(g,1.2,2.1,.6,0,1.05,0,t,1);bx(g,.01,2.0,.01,0,1.05,.305,mat("#777"));return g;}},
  dining:{name:"Обеденный стол",size:[1600,900,750],color:"#a0522d",build(t){const g=new THREE.Group(),l=LEG();
    bx(g,1.6,.04,.9,0,.73,0,t,1);for(const[x,z]of[[-.72,-.38],[.72,-.38],[-.72,.38],[.72,.38]])bx(g,.05,.71,.05,x,.355,z,l);return g;}},
  chair:{name:"Стул",size:[450,500,900],color:"#5f7f6a",build(t){const g=new THREE.Group(),l=LEG();
    bx(g,.45,.05,.45,0,.46,0,t,1);bx(g,.45,.42,.04,0,.69,-.21,t,1);for(const[x,z]of[[-.2,-.2],[.2,-.2],[-.2,.2],[.2,.2]])bx(g,.03,.44,.03,x,.22,z,l);return g;}},
  coffee:{name:"Журнальный столик",size:[900,900,420],color:"#c28a5a",build(t){const g=new THREE.Group(),l=LEG();cy(g,.45,.04,0,.4,0,t,1,40);cy(g,.025,.38,0,.19,0,l);cy(g,.25,.02,0,.01,0,l,0,32);return g;}},
  tv:{name:"ТВ-тумба с телевизором",size:[1600,400,1200],color:"#5a544b",build(t){const g=new THREE.Group();bx(g,1.6,.5,.4,0,.25,0,t,1);bx(g,1.25,.72,.05,0,.9,-.05,mat("#111",.3,.2));return g;}},
  desk:{name:"Письменный стол",size:[1200,600,750],color:"#e9e4d8",build(t){const g=new THREE.Group(),l=LEG();bx(g,1.2,.03,.6,0,.74,0,t,1);
    for(const[x,z]of[[-.57,-.27],[.57,-.27],[-.57,.27],[.57,.27]])bx(g,.03,.73,.03,x,.365,z,l);return g;}},
  rug:{name:"Ковёр 2×3 м",size:[3000,2000,10],color:"#d9d2c3",build(t){const g=new THREE.Group();const m=bx(g,3.0,.01,2.0,0,.006,0,t,1);m.castShadow=false;return g;}},
  plant:{name:"Растение в кашпо",size:[500,500,1400],color:"#bfb6a5",build(t){const g=new THREE.Group();cy(g,.22,.45,0,.225,0,t,1);
    const f=mat("#2f6b3a",.9);for(const[x,y,z,r]of[[0,.85,0,.32],[.12,1.1,.05,.24],[-.1,1.2,-.06,.2]]){const s=new THREE.Mesh(new THREE.IcosahedronGeometry(r,1),f);s.position.set(x,y,z);s.castShadow=true;g.add(s);}return g;}},
  lamp:{name:"Торшер",size:[400,400,1600],color:"#d9c27a",build(t){const g=new THREE.Group(),l=LEG();cy(g,.18,.02,0,.01,0,l);cy(g,.015,1.4,0,.71,0,l,0,8);
    const sh=new THREE.Mesh(new THREE.CylinderGeometry(.14,.2,.25,24,1,true),t);sh.position.y=1.45;sh.userData.tint=true;sh.material.side=THREE.DoubleSide;g.add(sh);return g;}},
  lounger:{name:"Шезлонг",size:[700,2000,900],color:"#bfb6a5",build(t){const g=new THREE.Group(),w=mat("#9b8a6a",.8);bx(g,.7,.3,1.4,0,.15,.3,w);bx(g,.65,.08,1.35,0,.34,.3,t,1);
    const b=bx(g,.65,.08,.65,0,.6,-.55,t,1);b.rotation.x=-.9;bx(g,.7,.3,.4,0,.15,-.6,w);return g;}},
};

/* ---------------- three setup ---------------- */
const stage=$("stage");
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement); renderer.domElement.tabIndex=0;
Tex.init(renderer,isTouch);
const scene=new THREE.Scene();
scene.background=new THREE.Color("#bcd6e8").convertSRGBToLinear();
scene.fog=new THREE.Fog(scene.background, 60, 220);
const camera=new THREE.PerspectiveCamera(60,1,0.05,600);
scene.add(new THREE.HemisphereLight(0xeaf4ff,0x6b5a45,0.75));
const sun=new THREE.DirectionalLight(0xfff1dc,1.6);
sun.position.set(-14,22,16); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-18,right:18,top:18,bottom:-18,near:1,far:70}); sun.shadow.bias=-0.0006;
sun.target.position.set(4.6,0,-1); scene.add(sun,sun.target);
for(const x of [2.3,7.0]){ const l=new THREE.PointLight(0xfff0dd,0.55,8); l.position.set(x,2.0,-3.3); scene.add(l); }

function resize(){ const w=innerWidth,h=innerHeight; renderer.setSize(w,h); camera.aspect=w/h; camera.updateProjectionMatrix(); }
addEventListener("resize",resize); resize();

/* ---------------- state ---------------- */
const PASS=new Set(["Стекло","Стекло — матовая полоса","Двери","Растения","Навес — стекло","Бассейн — вода","Море"]);
const materials=new Map();   // name -> {mat, orig, o:{r,m}}
const meshes=[];             // every mesh of the house
const solids=[], floorsAll=[], roofParts=[];
let house=null;
const itemsRoot=new THREE.Group(); scene.add(itemsRoot);
const items=new Map();       // id -> {doc, obj}
const models=new Map();      // id -> doc
const modelCache=new Map();  // id -> Promise<Group>
const paint=new Map();       // keyOf(name) -> doc
const parts=new Map();       // partDocId(key) -> doc
const texItems=new Set();    // item holders whose textured materials follow the item (triplanar frame is the item's own)
const houseTex=new Map();    // look signature -> textured copy of a house material, shared by every mesh with that look
let libVer=0;                // bumped when the texture library changes: panels that list it re-render
let mode="orbit", roofShown=false, selected=null, placing=null, canWrite=false;
let xf=null;                 // Xform (xform.js): modal G / R / S, gizmo, item panel
const selIds=new Set();      // ids of the selected items (selected.id is the main one)
const folders=new Map();     // id -> {name,parent,order}
let tabSwitch=false;         // the Tab focus switch is changing the mode itself
let myId=null, myColor="#2f6f62";
let libTab="base";
let scope="all";             // what a paint action covers: all | group | piece
const HEXRE=/^#[0-9a-f]{6}$/i;

function hash(s){ let h=5381; for(const c of s) h=((h*33)^c.codePointAt(0))>>>0; return h.toString(16); }
function keyOf(name){ return "m"+hash(name); }
function partDocId(key){ return "p"+hash(key); }
function groupOf(o){ return o.name.replace(/_\d+$/,"")||o.name; }
function hexOf(c){ return "#"+c.clone().convertLinearToSRGB().getHexString(); }
function setHex(c,hex){ c.setStyle(hex).convertSRGBToLinear(); }
function toast(msg){ const t=$("toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast.t); toast.t=setTimeout(()=>t.hidden=true,2600); }
function banner(msg){ const b=$("banner"); b.textContent=msg||""; b.hidden=!msg; }
function rid(){ return Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4); }

/* finishes: roughness / metalness; non-matte ones get a soft studio environment to reflect */
const FIN={matte:[0.95,0],satin:[0.55,0.05],gloss:[0.12,0.05],metal:[0.3,0.9]};
let envCache=null;
function envTex(){
  if(envCache) return envCache;
  const s=new THREE.Scene(), g=new THREE.SphereGeometry(50,32,16), p=g.attributes.position, cols=[];
  const L=h=>new THREE.Color(h).convertSRGBToLinear(), hor=L("#d8d4ca"), sky=L("#86aee0"), gnd=L("#4a4036"), c=new THREE.Color();
  for(let i=0;i<p.count;i++){ const y=p.getY(i)/50; c.copy(hor).lerp(y>0?sky:gnd,Math.abs(y)); cols.push(c.r,c.g,c.b); }
  g.setAttribute("color",new THREE.Float32BufferAttribute(cols,3));
  s.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide})));
  const win=new THREE.Mesh(new THREE.PlaneGeometry(26,16),new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide}));
  win.position.set(-22,16,28); win.lookAt(0,0,0); s.add(win);
  const pm=new THREE.PMREMGenerator(renderer); envCache=pm.fromScene(s,0.02).texture; pm.dispose();
  return envCache;
}
function applyFinish(m,finish,o){
  const f=FIN[finish], had=!!m.envMap;
  if(f){ m.roughness=f[0]; m.metalness=f[1]; m.envMap=finish==="matte"?null:envTex(); m.envMapIntensity=finish==="metal"?1.3:0.7; }
  else { m.roughness=o.r; m.metalness=o.m; m.envMap=null; }
  if(had!==!!m.envMap) m.needsUpdate=true;
}

/* ---------------- load house ---------------- */
const loader=new THREE.GLTFLoader();
let houseV=null;             // version requested last (newest wins)
let houseShown=false;        // first model is on screen
let shownV=null;             // version of the model that is on screen
const loadGltf=url=>new Promise((res,rej)=>loader.load(url,res,undefined,rej));
/* download with progress (fetch + ReadableStream); the file name is unique and served immutable, so the browser cache keeps it after the first time */
async function fetchBuf(url,onProg,total){
  const r=await fetch(url); if(!r.ok) throw new Error("http "+r.status);
  const len=+r.headers.get("content-length")||total||0;
  if(!r.body||!r.body.getReader){ const b=await r.arrayBuffer(); onProg&&onProg(1,b.byteLength,b.byteLength); return b; }
  const rd=r.body.getReader(), parts=[]; let got=0;
  for(;;){ const {done,value}=await rd.read(); if(done) break; parts.push(value); got+=value.length; if(onProg) onProg(len?Math.min(1,got/len):0,got,len); }
  const out=new Uint8Array(got); let o=0; for(const c of parts){ out.set(c,o); o+=c.length; }
  return out.buffer;
}
const parseGltf=buf=>new Promise((res,rej)=>loader.parse(buf,"/uploads/",res,rej));
const loadGltfProgress=(url,onProg,total)=>fetchBuf(url,onProg,total).then(parseGltf);

/* walks a scene and builds everything that depends on the house: materials, collision / floor lists, roof parts */
function indexHouse(root){
  const idx={materials:new Map(),meshes:[],solids:[],floorsAll:[],roofParts:[]};
  root.traverse(o=>{
    if(!o.isMesh) return;
    const m=o.material, name=m.name||"Без названия";
    if(!idx.materials.has(name)) idx.materials.set(name,{mat:m,orig:hexOf(m.color),o:{r:m.roughness,m:m.metalness}});
    if(m.transparent){ m.depthWrite=false; o.renderOrder=2; }
    o.castShadow=!m.transparent; o.receiveShadow=true;
    o.userData.matName=name; o.userData.baseMat=m; idx.meshes.push(o);
    if(!PASS.has(name)) idx.solids.push(o);
    if(!["Стекло","Стекло — матовая полоса","Навес — стекло","Растения"].includes(name)) idx.floorsAll.push(o);
    const bb=new THREE.Box3().setFromObject(o);
    if(bb.min.y>2.12 && !/^Сала/.test(o.name) && name!=="Море") idx.roofParts.push(o);
  });
  return idx;
}
function disposeHouse(root){
  root.traverse(o=>{
    if(!o.isMesh) return;
    o.geometry&&o.geometry.dispose();
    for(const m of new Set([o.material,o.userData.baseMat,o.userData.ownMat])){
      if(!m) continue;
      for(const[k,v]of Object.entries(m)) if(k!=="envMap"&&!(k==="map"&&m.userData&&m.userData.texShared)&&v&&v.isTexture) v.dispose(); // envMap is the shared studio reflection; a texture map is shared via Tex
      m.dispose();
    }
  });
}
/* paint / parts docs stay in the database even if the new model has no such material or piece; they are just not applied */
function reportOrphans(){
  const names=new Set(materials.keys()), pieces=new Set(), groups=new Set();
  for(const o of meshes){ pieces.add(o.name); groups.add(groupOf(o)); }
  const lost=[];
  for(const d of paint.values()) if(!names.has(d.name)) lost.push("материал «"+d.name+"»");
  for(const d of parts.values()){
    const k=String(d.key||""), n=k.slice(k.indexOf(":")+1);
    if(k.startsWith("piece:")?!pieces.has(n):k.startsWith("group:")?!groups.has(n):false) lost.push((k.startsWith("piece:")?"деталь «":"группа «")+n+"»");
  }
  if(lost.length) console.warn("Перекраски без материала или детали в новой модели (в базе сохранены, не применяются): "+lost.length+"\n"+lost.join("\n"));
}
/* floor under the walker after the model changed: lift out of a new wall/slab to the nearest floor at the same x,z */
function rescueWalker(){
  if(mode!=="walk") return;
  const feet=walk.pos.y-EYE;
  ray.set(new THREE.Vector3(walk.pos.x,feet+6,walk.pos.z),new THREE.Vector3(0,-1,0)); ray.far=14;
  const hits=ray.intersectObjects(floorsAll,false).filter(h=>h.face&&h.face.normal.y>0.5);
  if(!hits.length) return;
  const best=hits.reduce((a,b)=>Math.abs(b.point.y-feet)<Math.abs(a.point.y-feet)?b:a);
  if(Math.abs(best.point.y-feet)>0.02) walk.pos.y=best.point.y+EYE;
}
function installHouse(gltf,v,isUpdate){
  const old=house, idx=indexHouse(gltf.scene); shownV=v;
  house=gltf.scene; scene.add(house);
  materials.clear(); for(const[k,m]of idx.materials) materials.set(k,m);
  for(const [arr,src] of [[meshes,idx.meshes],[solids,idx.solids],[floorsAll,idx.floorsAll],[roofParts,idx.roofParts]]){ arr.length=0; arr.push(...src); }
  if(old){ scene.remove(old); disposeHouse(old); }
  applyRoof(); applyAllPaint(); reportOrphans();
  if(selected?.kind==="mat"){
    const mesh=meshes.find(o=>o.name===selected.mesh?.name&&o.userData.matName===selected.name)||meshes.find(o=>o.userData.matName===selected.name);
    if(mesh) selected.mesh=mesh; else select(null);
  }
  renderCtx(true);
  rescueWalker();
  if(!houseShown){ houseShown=true; $("loading")?.remove(); setMode("orbit",true); }
  if(isUpdate) toast("Модель дома обновлена");
}
async function loadHouse(v,isUpdate){
  houseV=v;
  try{
    const gltf=await loadGltf("/models/villa.glb"+(v?"?v="+v:""));
    if(houseV!==v){ disposeHouse(gltf.scene); return; } // a newer version was requested meanwhile
    installHouse(gltf,v,isUpdate);
  }catch(err){
    console.error(err);
    if(!houseShown) $("loading").textContent="Не удалось загрузить модель. Обновите страницу.";
    else toast("Не удалось загрузить новую модель дома. Обновите страницу.");
  }
}
function onHouseVersion(v,isUpdate){ if(canWrite&&!$("houseHist").hidden&&Number.isInteger(v)) setTimeout(renderHist,300); if(Number.isInteger(v)&&v!==houseV&&(houseV===null||v>houseV)) loadHouse(v,isUpdate); }
(async()=>{
  let v=null;
  try{ const r=await fetch("/api/house",{cache:"no-store"}); if(r.ok) v=(await r.json()).v; }catch{}
  if(houseV===null) loadHouse(Number.isInteger(v)?v:0,false);
})();

/* ---------------- controls ---------------- */
const orbit=new THREE.OrbitControls(camera,renderer.domElement);
orbit.enableDamping=true; orbit.maxPolarAngle=Math.PI*0.495; orbit.minDistance=2; orbit.maxDistance=70;
orbit.target.set(4.65,0,0.5); camera.position.set(4.65,15,18);

const walk={yaw:0,pitch:0,pos:new THREE.Vector3(7.0,1.6,2.6),keys:{},vy:0,joy:{x:0,y:0}};
const EYE=1.6, STEP=0.45;
const ray=new THREE.Raycaster();
function floorAt(x,feet,z){
  ray.set(new THREE.Vector3(x,feet+STEP+0.05,z),new THREE.Vector3(0,-1,0)); ray.far=STEP+3;
  const h=ray.intersectObjects(floorsAll,false)[0]; return h?h.point.y:null;
}
function blocked(from,dir,dist){
  for(const hgt of [0.55,1.25]){
    ray.set(new THREE.Vector3(from.x,from.y-EYE+hgt,from.z),dir); ray.far=dist+0.28;
    if(ray.intersectObjects(solids,false).length) return true;
  }
  return false;
}
function setMode(m,initial){
  mode=m; $("mOrbit").setAttribute("aria-pressed",m==="orbit"); $("mWalk").setAttribute("aria-pressed",m==="walk");
  xf&&xf.modeChanged();
  orbit.enabled=(m==="orbit");
  if(m==="walk"){
    setRoof(true,true);
    $("cross").hidden=isTouch; $("joy").hidden=!isTouch;
  } else {
    if(document.pointerLockElement) document.exitPointerLock();
    $("cross").hidden=true; $("joy").hidden=true;
    if(!initial) setRoof(false,true);
  }
  updateHint(); sendPresence(true);
}
let placedFromOrbit=false;
$("mOrbit").onclick=()=>setMode("orbit");
$("mWalk").onclick=()=>setMode("walk");
$("bTop").onclick=()=>{ setMode("orbit"); orbit.target.set(4.65,0,-0.5); camera.position.set(4.65,30,0.6); setRoof(false,true); };
function setRoof(v,auto){ roofShown=v; $("bRoof").setAttribute("aria-pressed",v); applyRoof(); }
function applyRoof(){ for(const o of roofParts) o.visible=roofShown; }
$("bRoof").onclick=()=>setRoof(!roofShown);

addEventListener("keydown",e=>{
  if(e.target.closest&&e.target.closest("input,select,textarea")) return;
  walk.keys[e.code]=true;
  if((e.ctrlKey||e.metaKey)&&e.code==="KeyZ"){ e.preventDefault(); doUndo(); return; }
  if(e.ctrlKey||e.metaKey||e.altKey||e.repeat) return;
  const c=e.code;
  if(c==="Escape"){ if(placing&&tool!=="add") cancelPlacing(); else if(tool) setTool(null); else select(null); return; }
  if(!canWrite) return;
  if(c==="KeyQ") setTool("paint");
  else if(c==="KeyE") setTool("add");
  else if(c==="KeyG") grab();
  else if(c==="KeyT") setTool("tex");
  else if(c==="KeyR"){ if(tool==="tex"&&!placing) rotTexBrush(); else rotateTarget(e.shiftKey?-1:1); }
  else if(c==="KeyX"||c==="Delete"){ e.preventDefault(); deleteTarget(); }
  else if(c==="KeyC") pipette();
  else if(c==="KeyV") cycleScope();
  else if(c==="KeyZ") doUndo();
  else if(/^Digit[1-8]$/.test(c)){ brushIdx=+c.slice(5)-1; if(tool!=="paint") setTool("paint"); else renderTools(); }
  else if(c==="BracketLeft") cycle(-1);
  else if(c==="BracketRight") cycle(1);
});
addEventListener("keyup",e=>{ walk.keys[e.code]=false; });
addEventListener("blur",()=>{ walk.keys={}; });

/* pointer: look (walk), pick, drag items */
const ptr={down:null,drag:null,lookId:null,last:null};
const ndc=new THREE.Vector2();
function setNdc(e){ const r=renderer.domElement.getBoundingClientRect(); ndc.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1); }
function pickAt(useCenter){
  if(useCenter) ndc.set(0,0);
  ray.setFromCamera(ndc,camera); ray.far=200;
  const targets=[itemsRoot]; if(house) targets.push(house);
  const hits=ray.intersectObjects(targets,true).filter(h=>h.object.visible&&isVisible(h.object));
  return hits[0]||null;
}
function isVisible(o){ while(o){ if(!o.visible) return false; o=o.parent; } return true; }
function itemIdOf(o){ while(o){ if(o.userData.itemId) return o.userData.itemId; o=o.parent; } return null; }
function floorHitAt(nx,ny){   // the house floor under a screen point (ndc), or null
  ndc.set(nx,ny); ray.setFromCamera(ndc,camera); ray.far=200;
  const hits=ray.intersectObjects(house?[house]:[],true).filter(h=>isVisible(h.object)&&h.face&&h.face.normal.y>0.6&&!PASS.has(h.object.userData.matName)||(h.object.userData.matName==="Газон"));
  return hits[0]?hits[0].point.clone():null;
}
function floorPoint(useCenter){
  if(useCenter) ndc.set(0,0);
  ray.setFromCamera(ndc,camera); ray.far=200;
  const hits=ray.intersectObjects(house?[house]:[],true).filter(h=>isVisible(h.object)&&h.face&&h.face.normal.y>0.6&&!PASS.has(h.object.userData.matName)||(h.object.userData.matName==="Газон"));
  if(hits[0]) return hits[0].point;
  const p=new THREE.Vector3(); return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),p)?p:null;
}
renderer.domElement.addEventListener("pointerdown",e=>{
  renderer.domElement.focus();
  if(xf&&xf.gizmoPointer(e)) return;                 // a gizmo handle is under the pointer: the gizmo owns this press
  setNdc(e); ptr.down={x:e.clientX,y:e.clientY,t:performance.now(),id:e.pointerId};
  if(placing) return;
  if(mode==="orbit" && canWrite && !tool && !(e.pointerType==="touch"&&!e.isPrimary)){
    const h=pickAt(false); const iid=h&&itemIdOf(h.object);
    if(iid){
      if(e.shiftKey&&e.pointerType==="mouse"){ ptr.down=null; toggleSelect(iid); return; }
      if(selIds.size>1&&selIds.has(iid)&&xf&&xf.beginDrag(e)){ ptr.down=null; return; }   // drag the whole group
      orbit.enabled=false; ptr.drag={id:iid,start:items.get(iid).obj.position.clone(),prev:items.get(iid).doc,moved:false}; select({kind:"item",id:iid});
    }
  }
  if(mode==="walk" && (e.pointerType!=="mouse")) { ptr.lookId=e.pointerId; ptr.last={x:e.clientX,y:e.clientY}; }
},true);
renderer.domElement.addEventListener("pointermove",e=>{
  setNdc(e);
  if(placing && !(mode==="walk"&&document.pointerLockElement)) movePlacing(false);
  if(ptr.drag){
    const p=floorPoint(false); if(p){ const it=items.get(ptr.drag.id); if(it){ it.obj.position.set(p.x,p.y,p.z); ptr.drag.moved=true; sendPresence(true); } }
  }
  if(mode==="walk"){
    if(document.pointerLockElement===renderer.domElement){ look(e.movementX,e.movementY); if(placing) movePlacing(true); }
    else if(ptr.lookId===e.pointerId && ptr.last){ look((e.clientX-ptr.last.x)*1.4,(e.clientY-ptr.last.y)*1.4); ptr.last={x:e.clientX,y:e.clientY}; }
  }
});
renderer.domElement.addEventListener("pointerup",e=>{
  const d=ptr.down; ptr.down=null; if(ptr.lookId===e.pointerId){ ptr.lookId=null; ptr.last=null; }
  if(ptr.drag){ const dr=ptr.drag; ptr.drag=null; orbit.enabled=(mode==="orbit");
    if(dr.moved){ const it=items.get(dr.id); if(it){ pushUndo({t:"item",id:dr.id,prev:dr.prev}); commitItem(dr.id,{x:r2(it.obj.position.x),y:r2(it.obj.position.y),z:r2(it.obj.position.z)}); } sendPresence(true); }
    return; }
  if(!d) return;
  const moved=Math.hypot(e.clientX-d.x,e.clientY-d.y)>6||performance.now()-d.t>500;
  const locked=document.pointerLockElement===renderer.domElement;
  if(placing){ if(!moved||locked){ setNdc(e); movePlacing(locked); dropPlacing(); } return; }
  if(moved) return;
  if(mode==="walk" && !isTouch && !locked){ renderer.domElement.requestPointerLock?.(); return; }
  if(tool){ if(!locked) setNdc(e); useTool(); return; }
  setNdc(e); const h=pickAt(locked);
  if(!h){ select(null); return; }
  const iid=itemIdOf(h.object);
  if(iid) select({kind:"item",id:iid});
  else if(h.object.userData.matName) select({kind:"mat",name:h.object.userData.matName,mesh:h.object});
  if(locked && selected) document.exitPointerLock();
});
document.addEventListener("pointerlockchange",()=>{ updateHint(); });
/* capture phase: Shift+wheel with the texture brush must not also zoom the orbit camera (OrbitControls listens on the same element) */
renderer.domElement.addEventListener("wheel",e=>{
  const dy=e.deltaY||e.deltaX;
  if(tool==="tex"&&e.shiftKey){ e.preventDefault(); e.stopImmediatePropagation(); scaleTex(dy<0?1.1:1/1.1); return; }
  if(mode==="walk"&&(tool==="paint"||tool==="add"||tool==="tex")){ e.preventDefault(); cycle(dy>0?1:-1); }
},{passive:false,capture:true});
function look(dx,dy){ walk.yaw-=dx*0.0025; walk.pitch=Math.max(-1.45,Math.min(1.45,walk.pitch-dy*0.0025)); }
const r2=v=>Math.round(v*1000)/1000;

/* touch joystick */
(()=>{ const j=$("joy"),k=j.querySelector("i"); let id=null;
  j.addEventListener("pointerdown",e=>{id=e.pointerId;j.setPointerCapture(id);mv(e);});
  j.addEventListener("pointermove",e=>{if(e.pointerId===id)mv(e);});
  const end=e=>{if(e.pointerId!==id)return;id=null;walk.joy={x:0,y:0};k.style.transform="";};
  j.addEventListener("pointerup",end);j.addEventListener("pointercancel",end);
  function mv(e){const r=j.getBoundingClientRect();let x=(e.clientX-r.left-55)/45,y=(e.clientY-r.top-55)/45;const l=Math.hypot(x,y);if(l>1){x/=l;y/=l;}
    walk.joy={x,y};k.style.transform=`translate(${x*35}px,${y*35}px)`;}
})();

/* ---------------- loop ---------------- */
const clock=new THREE.Clock();
function tick(){
  const dt=Math.min(clock.getDelta(),0.05);
  if(mode==="walk"){
    const k=walk.keys; let f=(k.KeyW||k.ArrowUp?1:0)-(k.KeyS||k.ArrowDown?1:0)-walk.joy.y, s=(k.KeyD||k.ArrowRight?1:0)-(k.KeyA||k.ArrowLeft?1:0)+walk.joy.x;
    const len=Math.hypot(f,s);
    if(len>0.05){
      f/=Math.max(1,len); s/=Math.max(1,len);
      const sp=(k.ShiftLeft||k.ShiftRight?3.2:1.5)*dt;
      const fw=new THREE.Vector3(-Math.sin(walk.yaw),0,-Math.cos(walk.yaw)), rt=new THREE.Vector3(Math.cos(walk.yaw),0,-Math.sin(walk.yaw));
      const mv=fw.multiplyScalar(f*sp).add(rt.multiplyScalar(s*sp));
      for(const axis of ["x","z"]){ const v=new THREE.Vector3(); v[axis]=mv[axis]; const d=Math.abs(v[axis]); if(d<1e-6) continue;
        if(!blocked(walk.pos,v.clone().normalize(),d)) walk.pos[axis]+=v[axis]; }
    }
    const fl=floorAt(walk.pos.x,walk.pos.y-EYE,walk.pos.z);
    const target=(fl===null?0:fl)+EYE; walk.pos.y+= (target-walk.pos.y)*Math.min(1,dt*12);
    camera.position.copy(walk.pos);
    camera.rotation.set(walk.pitch,walk.yaw,0,"YXZ");
    if(placing && (isTouch||document.pointerLockElement)) movePlacing(true);
    if(len>0.05) sendPresence();
  } else {
    orbit.update();
  }
  if(mode==="orbit" && orbitMoved()) sendPresence();
  renderPeers();
  xf&&xf.frame();
  for(const h of texItems) for(const m of h.texMats) Tex.setSpace(m,h.obj);
  renderer.render(scene,camera);
  requestAnimationFrame(tick);
}
let lastOrbit="";
function orbitMoved(){ const s=orbit.target.toArray().map(v=>v.toFixed(1)).join(",")+camera.position.toArray().map(v=>v.toFixed(1)).join(","); if(s!==lastOrbit){lastOrbit=s;return true;} return false; }
requestAnimationFrame(tick);

/* ---------------- hints ---------------- */
function updateHint(){
  const h=$("hint"); h.textContent="";
  const add=(t,kbd)=>{ if(kbd){const k=document.createElement("kbd");k.textContent=kbd;h.append(k," ");} h.append(t+"   "); };
  if(placing){ add(isTouch?"Наведите центр экрана и нажмите «Поставить»":"Кликните, куда поставить",""); add("отмена","Esc"); return; }
  if(mode==="walk"){
    if(isTouch){ add("Джойстик — идти, проведите пальцем — осмотреться, тап — выбрать стену или предмет"); return; }
    if(document.pointerLockElement){ add("идти","WASD"); add("бегом","Shift"); add(tool?"применить — клик":"клик — выбрать"); add("освободить мышь","Esc"); }
    else add("Кликните по сцене, чтобы начать прогулку");
  } else {
    add(isTouch?"Палец — вращать, два пальца — приблизить. Тап по стене или предмету — выбрать":"Мышь: вращать, колесо — приблизить, правая кнопка — сдвинуть. Клик по стене или предмету — выбрать. Предмет можно тащить мышью");
    if(canWrite&&!isTouch){ add("двигать · вращать · масштаб","G R S"); add("все клавиши","?"); }
  }
}

/* ---------------- selection panel ---------------- */
function select(s){
  selected=s; selIds.clear(); if(s?.kind==="item") selIds.add(s.id);
  renderCtx(); highlight(); sendPresence(true);
}
/* several items at once (Shift+click, box, Ctrl+A); the last one is the main one */
function selectItems(list,primary){
  list=list.filter(id=>items.has(id));
  if(!list.length){ select(null); return; }
  selected={kind:"item",id:primary&&list.includes(primary)?primary:list[list.length-1]}; selIds.clear(); list.forEach(i=>selIds.add(i));
  renderCtx(); highlight(); sendPresence(true);
}
function toggleSelect(id){
  if(selected?.kind!=="item"){ selectItems([id]); return; }
  if(selIds.has(id)){ const rest=[...selIds].filter(i=>i!==id); selectItems(rest,rest.includes(selected.id)?selected.id:null); }
  else selectItems([...selIds,id],id);
}
let hlBoxes=[];
function highlight(){
  for(const b of hlBoxes) scene.remove(b);
  hlBoxes=[];
  if(selected?.kind!=="item") return;
  const list=[...selIds].filter(i=>items.has(i));
  if(list.length>30){      // one box around a big selection instead of hundreds
    const bb=new THREE.Box3(), h=new THREE.Box3Helper(bb,0x2f9e86);
    h.update=()=>{ bb.makeEmpty(); for(const id of list){ const it=items.get(id); if(it) bb.expandByObject(it.obj); } };
    h.update(); scene.add(h); hlBoxes.push(h);
  } else for(const id of list){ const b=new THREE.BoxHelper(items.get(id).obj,id===selected.id?0x2f9e86:0x7bd2c2); scene.add(b); hlBoxes.push(b); }
}
function refreshHl(){ for(const b of hlBoxes) if(b.update) b.update(); }
function el(tag,attrs={},...kids){ const e=document.createElement(tag); for(const[k,v]of Object.entries(attrs)){ if(v===null||v===undefined) continue; if(k==="on") for(const[ev,fn]of Object.entries(v)) e.addEventListener(ev,fn); else if(k==="text") e.textContent=v; else e.setAttribute(k,v);} e.append(...kids.filter(Boolean)); return e; }

/* paint targets: a whole material, one wall (group of meshes) or a single mesh */
const SCOPES=[["all","Все такие"],["group","Эта стена"],["piece","Этот кусок"]];
function targetFor(sc,mesh,name){
  if(sc==="group"&&mesh) return {scope:"group",key:"group:"+groupOf(mesh),label:groupOf(mesh).replace(/_/g," "),name,mesh};
  if(sc==="piece"&&mesh) return {scope:"piece",key:"piece:"+mesh.name,label:mesh.name.replace(/_/g," "),name,mesh};
  return {scope:"all",name,label:name,mesh};
}
const targetDoc=t=>t.scope==="all"?paint.get(keyOf(t.name)):parts.get(partDocId(t.key));
const snap=t=>{ const d=targetDoc(t); return d?{color:d.color,finish:d.finish||null,tex:d.tex||null}:null; };
function sendOk(ok){ if(!ok) toast("Нет связи: изменение не сохранится."); }
let fromPicker=false;
function partsByKey(){ const m=new Map(); for(const d of parts.values()) m.set(d.key,d); return m; }
/* what a mesh looks like right now: a piece / wall override replaces the whole-material look, otherwise the material's own */
function lookOf(mesh){
  const name=mesh.userData.matName, mi=materials.get(name), all=paint.get(keyOf(name)), by=partsByKey(), part=by.get("piece:"+mesh.name)||by.get("group:"+groupOf(mesh)), d=part||all;
  return {color:d?.color||mi?.orig||"#ffffff",finish:(part?(part.finish||all?.finish):all?.finish)||null,tex:d?.tex||null};
}

/* ---------------- texture picking UI (shared by surfaces and furniture) ---------------- */
let ctxTab="color";          // "color" | "tex": the tab of the surface / furniture panel
let texQuery="";
const sameSrc=(a,b)=>!!a&&!!b&&(a.id?a.id===b.id:(!b.id&&a.builtin===b.builtin));
const srcOf=t=>t.id?{id:t.id}:{builtin:t.builtin};
const clampMm=v=>Math.min(20000,Math.max(5,Math.round(v)));
function texList(){
  return [...Tex.builtinKeys.map(k=>({builtin:k})),...[...Tex.library.entries()].sort((a,b)=>(b[1].at||0)-(a[1].at||0)).map(([id])=>({id}))];
}
function texCard(src,{pressed,onClick,onInfo}){
  const s=Tex.defaultSize(src), tt=el("span",{class:"tt"}), u=Tex.thumbOf(src); if(u) tt.style.backgroundImage="url("+u+")";
  const b=el("button",{class:"tcard","aria-pressed":String(!!pressed),title:Tex.nameOf(src)},tt,el("span",{class:"cn",text:Tex.nameOf(src)}),el("span",{class:"mono cd",text:s[0]+"×"+s[1]+" мм"}));
  b.dataset.k=Tex.srcKey(src); b.addEventListener("click",onClick);
  const root=el("div",{class:"card"},b);
  if(onInfo) root.append(el("button",{class:"card-i ghost",text:"i",title:"О текстуре","aria-label":"О текстуре",on:{click:onInfo}}));
  return root;
}
/* o: {what, get() -> tex|null, finish() -> finish|null, apply(texOrNull, final, finish?, undoKey?)}.
   `final` = a finished gesture (saved and undoable), otherwise a live preview that is neither sent nor undoable */
function texTab(o){
  const box=el("div",{class:"textab"}), q=el("input",{type:"search",placeholder:"Поиск текстуры","aria-label":"Поиск текстуры",autocomplete:"off"}); q.value=texQuery;
  const grid=el("div",{class:"tgrid"}), params=el("div",{class:"tparams"});
  const fillGrid=()=>{ grid.textContent=""; const f=q.value.trim().toLowerCase(); let n=0;
    for(const s of texList()){ if(f&&!Tex.nameOf(s).toLowerCase().includes(f)) continue; n++;
      grid.append(texCard(s,{pressed:sameSrc(o.get(),s),onClick:()=>{ const c=o.get(); o.apply(Object.assign(srcOf(s),{rot:c?.rot||0,offMm:c?.offMm||[0,0],tint:c?.tint||null}),true); setBrushFrom(o.get()); },onInfo:()=>openTexInfo(s)})); }
    if(!n) grid.append(el("div",{class:"meta empty",text:"Ничего не найдено."})); };
  q.oninput=()=>{ texQuery=q.value; fillGrid(); };
  let shown=null;
  const stamp=()=>JSON.stringify(o.get())+"|"+o.finish();
  const fillParams=()=>{
    const c=o.get(); shown=stamp(); params.textContent="";
    if(!c||!Tex.exists(c)){ params.append(el("div",{class:"meta",text:"Выберите текстуру: она зальёт "+o.what+"."})); return; }
    const go=(patch,key)=>{ const cur=o.get(); if(cur) o.apply(Object.assign({},cur,patch),true,undefined,key); };
    const s=Tex.sizeOf(c), num=(v,label,on,extra)=>{ const i=el("input",Object.assign({type:"number",value:String(v),"aria-label":label},extra||{})); i.onchange=()=>{ const x=parseFloat(i.value); if(Number.isFinite(x)) on(x); else i.value=String(v); }; return i; };
    const wI=num(s[0],"Ширина фрагмента, мм",x=>go({sizeMm:[clampMm(x),s[1]]},"size"),{min:"5",max:"20000",step:"10"});
    const hI=num(s[1],"Высота фрагмента, мм",x=>go({sizeMm:[s[0],clampMm(x)]},"size"),{min:"5",max:"20000",step:"10"});
    params.append(el("span",{class:"label",text:"Размер фрагмента, мм"}),el("div",{class:"row"},wI,el("span",{class:"meta",text:"×"}),hI,
      c.sizeMm?el("button",{class:"ghost",text:"Как в библиотеке",on:{click:()=>{ const n=Object.assign({},o.get()); delete n.sizeMm; o.apply(n,true); }}}):null));
    const rot=c.rot||0, off=c.offMm||[0,0];
    params.append(el("span",{class:"label",text:"Поворот"}),el("div",{class:"row"},
      el("button",{text:"⟲ 90°",on:{click:()=>go({rot:(rot+270)%360})}}),el("span",{class:"mono",text:rot+"°"}),el("button",{text:"⟳ 90°",on:{click:()=>go({rot:(rot+90)%360})}})));
    const shift=(ax,label)=>el("div",{class:"row"},el("span",{class:"meta",text:label}),
      el("button",{class:"step",text:"−10","aria-label":label+": минус 10 мм",on:{click:()=>go({offMm:ax?[off[0],off[1]-10]:[off[0]-10,off[1]]},"off"+ax)}}),
      num(off[ax],"Сдвиг "+label+", мм",x=>go({offMm:ax?[off[0],Math.round(x)]:[Math.round(x),off[1]]},"off"+ax),{step:"10"}),
      el("button",{class:"step",text:"+10","aria-label":label+": плюс 10 мм",on:{click:()=>go({offMm:ax?[off[0],off[1]+10]:[off[0]+10,off[1]]},"off"+ax)}}));
    params.append(el("span",{class:"label",text:"Сдвиг, мм (шаг 10)"}),shift(0,"X"),shift(1,"Y"));
    params.append(el("span",{class:"label",text:"Тон (умножается на текстуру) и фактура"}));
    const pk=Picker.create({color:c.tint||"#ffffff",finish:o.finish(),showFinish:true,
      onInput:hex=>{ fromPicker=true; const cur=o.get(); if(cur) o.apply(Object.assign({},cur,{tint:hex}),false); fromPicker=false; },
      onChange:({color,finish})=>{ fromPicker=true; const cur=o.get(); if(cur) o.apply(Object.assign({},cur,{tint:color}),true,finish); fromPicker=false; shown=stamp(); }});
    params.append(pk.el,el("div",{class:"row"},el("button",{class:"ghost",text:"Без оттенка",on:{click:()=>go({tint:null})}}),el("button",{class:"danger",text:"Убрать текстуру",on:{click:()=>o.apply(null,true)}})));
  };
  fillGrid(); fillParams();
  box.append(q,grid,params);
  if(canWrite) box.append(el("button",{text:"＋ Новая текстура по фото…",on:{click:newTexture}}));
  return {el:box,sync(){ const k=o.get()?Tex.srcKey(o.get()):""; grid.querySelectorAll(".tcard").forEach(b=>b.setAttribute("aria-pressed",String(!!k&&k===b.dataset.k))); if(!fromPicker&&shown!==stamp()) fillParams(); }};
}

let ctxS=null;
function renderCtx(soft){
  const c=$("ctx");
  if(!selected){ c.hidden=true; c.textContent=""; ctxS=null; return; }
  if(selected.kind==="mat"){
    const m=materials.get(selected.name); if(!m){ c.hidden=true; return; }
    const sig=["mat",selected.name,scope,selected.mesh?.uuid,canWrite,ctxTab,libVer].join("|");
    if(soft&&ctxS&&ctxS.sig===sig){ ctxS.update(); c.hidden=false; return; }
    c.hidden=false; c.textContent="";
    const t=targetFor(scope,selected.mesh,selected.name);
    c.append(el("span",{class:"label",text:"Поверхность"}), el("h2",{text:selected.name}));
    const meta=el("div",{class:"meta mono"}); c.append(meta);
    const curOf=()=>{ const d=targetDoc(t); if(d) return {color:d.color,finish:d.finish||null,changed:true,tex:d.tex||null};
      if(t.scope==="all") return {color:m.orig,finish:null,changed:false,tex:null};
      const lk=lookOf(selected.mesh); return {color:lk.color,finish:null,changed:false,tex:lk.tex}; };
    const upd=()=>{ const cur=curOf(), tx=cur.tex&&Tex.exists(cur.tex); meta.textContent=(t.scope==="all"?"":t.label+" · ")+(tx?"Текстура «"+Tex.nameOf(cur.tex)+"»":"Цвет "+cur.color.toUpperCase())+(cur.changed?"  · изменён":"  · как в модели"); return cur; };
    const cur=upd(); let pk=null, tt=null;
    if(canWrite){
      const seg=el("div",{class:"seg scope",role:"group","aria-label":"Что красим (V)"});
      for(const[v,l]of SCOPES){ const b=el("button",{text:l,title:l+" (V)","aria-pressed":String(scope===v)}); b.disabled=!selected.mesh&&v!=="all"; b.onclick=()=>{ scope=v; renderTools(); renderCtx(); }; seg.append(b); }
      c.append(seg);
      c.append(el("div",{class:"seg",role:"group","aria-label":"Цвет или текстура"},
        ...[["color","Цвет"],["tex","Текстура"]].map(([k,l])=>el("button",{text:l,"aria-pressed":String(ctxTab===k),on:{click:()=>{ ctxTab=k; renderCtx(); }}}))));
      let before=snap(t);
      if(ctxTab==="color"){
        pk=Picker.create({color:cur.color,finish:cur.finish,showFinish:true,
          onInput:hex=>{ fromPicker=true; setTarget(t,hex,curOf().finish,false); fromPicker=false; },
          onChange:({color,finish})=>{ fromPicker=true; pushUndo({t:"target",tgt:t,prev:before}); setTarget(t,color,finish,true); before=snap(t); fromPicker=false; }});
        c.append(pk.el);
      } else {
        tt=texTab({what:"эту поверхность",get:()=>curOf().tex,finish:()=>curOf().finish,
          apply(next,final,fin,key){ if(final) pushUndo({t:"target",tgt:t,prev:before},key&&(t.scope+(t.key||t.name)+key)); setTex(t,next,final,fin); if(final) before=snap(t); }});
        c.append(tt.el);
      }
      c.append(el("button",{class:"ghost",text:"Как было",on:{click:()=>{ pushUndo({t:"target",tgt:t,prev:snap(t)}); resetTarget(t,true); before=null; }}}));
    } else {
      c.append(el("div",{class:"meta",text:"Режим просмотра: менять цвета и текстуры может только редактор."}));
    }
    c.append(el("button",{class:"ghost",text:"Закрыть",on:{click:()=>select(null)}}));
    ctxS={sig,update(){ const k=upd(); if(pk&&!fromPicker) pk.set(k.color,k.finish); tt&&tt.sync(); }};
  } else if(selIds.size>1){
    const list=[...selIds].filter(i=>items.has(i)), sig=["multi",list.join(","),canWrite].join("|");
    if(soft&&ctxS&&ctxS.sig===sig){ c.hidden=false; return; }
    c.hidden=false; c.textContent="";
    c.append(el("span",{class:"label",text:"Выбрано"}), el("h2",{text:"Предметов: "+list.length}));
    if(canWrite&&xf){
      c.append(xf.gizmoControls(), xf.groupPanel().el,
        el("div",{class:"row"}, el("button",{text:"Копия",on:{click:()=>xf.duplicateSelection()}}), el("button",{class:"danger",text:"Удалить",on:{click:()=>xf.deleteSelection()}})));
    } else c.append(el("div",{class:"meta",text:"Режим просмотра: менять предметы может только редактор."}));
    c.append(el("button",{class:"ghost",text:"Снять выделение",title:"Alt+A",on:{click:()=>select(null)}}));
    ctxS={sig,update(){}};
  } else {
    const it=items.get(selected.id); if(!it){ c.hidden=true; return; }
    const d=it.doc, def=d.type==="builtin"?LIB[d.key]:null, mdl=d.type==="model"?models.get(d.model):null;
    const sig=["item",selected.id,d.type,d.key||d.model,canWrite,ctxTab,libVer].join("|");
    const size=()=>{ const bb=new THREE.Box3().setFromObject(it.obj), sz=new THREE.Vector3(); bb.getSize(sz); return sz; };
    if(soft&&ctxS&&ctxS.sig===sig){ ctxS.update(); c.hidden=false; return; }
    c.hidden=false; c.textContent="";
    const title=def?def.name:(mdl?.name||"3D-модель");
    c.append(el("span",{class:"label",text:"Предмет"}), el("h2",{text:title}));
    const sizeMeta=el("div",{class:"meta mono"}); c.append(sizeMeta);
    const showSize=()=>{ const sz=size(), tx=items.get(selected.id)?.doc.tex; sizeMeta.textContent=`${Math.round(sz.x*1000)} × ${Math.round(sz.z*1000)} × ${Math.round(sz.y*1000)} мм`+(tx&&Tex.exists(tx)?" · текстура «"+Tex.nameOf(tx)+"»":""); };
    showSize(); let pk=null, tt=null, xp=null;
    if(canWrite){
      c.append(el("div",{class:"row"},
        el("button",{text:"⟲ 90°",title:"Повернуть (Shift+R)",on:{click:()=>rotateItem(selected.id,-Math.PI/2)}}),
        el("button",{text:"⟳ 90°",title:"Повернуть (R)",on:{click:()=>rotateItem(selected.id,Math.PI/2)}}),
        el("button",{text:"⟳ 15°",on:{click:()=>rotateItem(selected.id,Math.PI/12)}}),
        el("button",{text:"Переместить",on:{click:()=>startPlacing({moveId:selected.id})}})));
      const id=selected.id; let before=d;
      if(xf){ xp=xf.panel(id); c.append(el("span",{class:"label",text:"Трансформация (G · R · S)"}), xf.gizmoControls(), xp.el); }
      const itemTex=()=>texTab({what:def?"этот предмет":"эту модель (у неё должна быть развёртка UV)",get:()=>items.get(id)?.doc.tex||null,finish:()=>items.get(id)?.doc.finish||null,
        apply(next,final,fin,key){ const cd=items.get(id); if(!cd) return;
          if(final){ pushUndo({t:"item",id,prev:before},key&&(id+key)); commitItem(id,Object.assign({tex:next},fin!==undefined?{finish:fin}:{})); before=items.get(id)?.doc; }
          else syncItem(id,Object.assign({},cd.doc,{tex:next})); }});
      if(def){
        c.append(el("div",{class:"seg",role:"group","aria-label":"Цвет или текстура"},
          ...[["color","Цвет"],["tex","Текстура"]].map(([k,l])=>el("button",{text:l,"aria-pressed":String(ctxTab===k),on:{click:()=>{ ctxTab=k; renderCtx(); }}}))));
        if(ctxTab==="color"){
          c.append(el("span",{class:"label",text:"Цвет обивки / отделки"}));
          pk=Picker.create({color:d.color||def.color,finish:d.finish||null,showFinish:true,
            onInput:hex=>{ const cur=items.get(id); if(cur){ fromPicker=true; syncItem(id,Object.assign({},cur.doc,{color:hex,tex:null})); fromPicker=false; } },
            onChange:({color,finish})=>{ fromPicker=true; pushUndo({t:"item",id,prev:before}); commitItem(id,{color,finish,tex:null}); before=items.get(id)?.doc; fromPicker=false; }});
          c.append(pk.el);
        } else { tt=itemTex(); c.append(tt.el); }
      } else {
        c.append(el("span",{class:"label",text:"Текстура модели"})); tt=itemTex(); c.append(tt.el);
      }
      c.append(el("div",{class:"row"},
        el("button",{text:"Копия",on:{click:()=>duplicateItem(selected.id)}}),
        el("button",{class:"danger",text:"Удалить",title:"X",on:{click:()=>xf?xf.deleteSelection():removeItem(selected.id)}})));
    }
    c.append(el("button",{class:"ghost",text:"Закрыть",on:{click:()=>select(null)}}));
    ctxS={sig,update(){ showSize(); xp&&xp.update(); const cur=items.get(selected?.id)?.doc; if(pk&&cur&&!fromPicker) pk.set(cur.color||def.color,cur.finish||null); tt&&tt.sync(); }};
  }
}

/* ---------------- paint ---------------- */
function dropOwn(o){ const own=o.userData.ownMat; if(own){ own.dispose(); o.userData.ownMat=null; } }
/* one mesh: a piece / wall override replaces the whole-material look entirely (a part without a texture is a flat colour, whatever the material has) */
function applyMeshLook(o,byKey,used){
  const base=o.userData.baseMat, mi=materials.get(o.userData.matName), all=paint.get(keyOf(o.userData.matName));
  const part=byKey.get("piece:"+o.name)||byKey.get("group:"+groupOf(o)), d=part||all;
  const finish=(part?(part.finish||all?.finish):all?.finish)||null;
  if(d&&d.tex&&Tex.exists(d.tex)){
    /* textured copies are shared by every mesh with the same look: one material per (model material, texture, size, rotation, shift, tint, finish) */
    const key=base.uuid+"#"+Tex.sig(d.tex,d.tex.tint||null)+"#"+(finish||"");
    let m=houseTex.get(key); if(!m){ m=Tex.makeMat(base,d.tex); applyFinish(m,finish,mi.o); houseTex.set(key,m); }
    used.add(key); dropOwn(o); o.material=m; return;
  }
  if(!part){ dropOwn(o); if(o.material!==base) o.material=base; return; }
  let own=o.userData.ownMat; if(!own||o.material!==own){ dropOwn(o); own=o.userData.ownMat=base.clone(); o.material=own; }
  setHex(own.color,part.color);
  applyFinish(own,finish,mi.o);
}
function applyAllPaint(){
  for(const[name,m]of materials){ const d=paint.get(keyOf(name)); setHex(m.mat.color,d?.color||m.orig); applyFinish(m.mat,d?.finish||null,m.o); }
  const byKey=partsByKey(), used=new Set();
  for(const o of meshes) applyMeshLook(o,byKey,used);
  for(const[k,m]of houseTex) if(!used.has(k)){ Tex.disposeMat(m); houseTex.delete(k); }   // looks nobody wears any more: free the material and, with the last user, the picture
}
/* the stored look of a target. tex is {id|builtin, sizeMm?, rot, offMm, tint} or null; colour stays as it was when the texture is taken off */
function putTarget(t,color,finish,tex,send){
  const doc={color,finish,by:myId,at:Date.now()}; if(tex) doc.tex=tex;
  if(t.scope==="all"){ doc.name=t.name; paint.set(keyOf(t.name),doc); if(send) sendOk(Sync.setPaint(keyOf(t.name),{name:t.name,color,finish,tex:tex||undefined})); }
  else { doc.key=t.key; parts.set(partDocId(t.key),doc); if(send) sendOk(Sync.setPart(partDocId(t.key),{key:t.key,color,finish,tex:tex||undefined})); }
  applyAllPaint(); renderCtx(true);
}
/* a plain colour replaces whatever texture was there */
function setTarget(t,hex,finish,send,tex){ const old=targetDoc(t); putTarget(t,hex,finish===undefined?(old?.finish??null):finish,tex||null,send); }
function setTex(t,tex,send,finish){
  const old=targetDoc(t); if(!tex&&!old) return;
  const base=old?.color||(t.scope==="all"?materials.get(t.name)?.orig:lookOf(t.mesh).color);
  putTarget(t,base,finish===undefined?(old?.finish??null):finish,tex||null,send);
}
function resetTarget(t,send){
  if(t.scope==="all"){ paint.delete(keyOf(t.name)); if(send) sendOk(Sync.resetPaint(keyOf(t.name))); }
  else { parts.delete(partDocId(t.key)); if(send) sendOk(Sync.resetPart(partDocId(t.key))); }
  applyAllPaint(); renderCtx(true);
}

/* ---------------- items ---------------- */
function buildItem(doc){
  if(doc.type==="builtin"){
    const def=LIB[doc.key]; if(!def) return null;
    const t=mat(doc.color||def.color,0.8); applyFinish(t,doc.finish||null,{r:0.8,m:0}); const g=def.build(t); return Promise.resolve(g);
  }
  return loadModel(doc.model).then(tpl=>tpl?tpl.clone(true):null);
}
const NUM=v=>typeof v==="number"&&Number.isFinite(v);
/* position x,y,z (m), rotation rx,ry,rz (rad, order YXZ), scale sx,sy,sz. Items saved before transforms have r (= ry) and s (uniform scale) only */
function normDoc(d){
  const o=Object.assign({},d), u=NUM(d.s)?d.s:1;
  if(!NUM(o.rx)) o.rx=0; if(!NUM(o.ry)) o.ry=NUM(d.r)?d.r:0; if(!NUM(o.rz)) o.rz=0;
  if(!NUM(o.sx)) o.sx=u; if(!NUM(o.sy)) o.sy=u; if(!NUM(o.sz)) o.sz=u;
  return o;
}
function applyObjXf(obj,d,skipPos){
  if(!skipPos) obj.position.set(d.x||0,d.y||0,d.z||0);
  obj.rotation.set(d.rx||0,d.ry||0,d.rz||0,"YXZ"); obj.scale.set(d.sx||1,d.sy||1,d.sz||1);
}
const localBusy=id=>(ptr.drag&&ptr.drag.id===id)||(placing&&placing.moveId===id)||(xf&&xf.touching(id));
function syncItem(id,doc){
  doc=normDoc(doc);
  let it=items.get(id);
  const needRebuild=!it||it.doc.type!==doc.type||it.doc.key!==doc.key||it.doc.model!==doc.model||(doc.type==="builtin"&&(it.doc.color!==doc.color||it.doc.finish!==doc.finish));
  if(needRebuild){
    const token=Symbol(); const holder=it||{doc,obj:new THREE.Group(),token}; holder.token=token; holder.doc=doc; holder.obj.rotation.order="YXZ";
    if(!it){ holder.obj.userData.itemId=id; itemsRoot.add(holder.obj); items.set(id,holder); }
    if(doc.type!=="builtin"&&doc.model&&!modelReady.has(doc.model)&&models.has(doc.model)){ holder.obj.clear(); holder.obj.add(modelPlaceholder(doc.model)); }
    Promise.resolve(buildItem(doc)).then(g=>{
      if(holder.token!==token||!g) return;
      holder.obj.clear(); g.traverse(o=>{ if(o.isMesh){ o.castShadow=o.receiveShadow=true; } }); holder.obj.add(g);
      applyItemTex(holder);
      if(selected?.kind==="item"&&selected.id===id){ highlight(); renderCtx(true); }
    }).catch(()=>{});
    it=holder;
  }
  it.doc=doc;
  if(!needRebuild&&JSON.stringify(doc.tex||null)!==it.texSig) applyItemTex(it);
  if(!(xf&&xf.touching(id))) applyObjXf(it.obj,doc,(ptr.drag&&ptr.drag.id===id)||(placing&&placing.moveId===id));
  if(selIds.has(id)) highlight();
}
function dropItem(id){
  const it=items.get(id); if(!it) return; clearItemTex(it); itemsRoot.remove(it.obj); items.delete(id);
  if(selIds.has(id)){
    selIds.delete(id);
    if(selected?.kind==="item"&&selected.id===id){ const rest=[...selIds]; if(rest.length) selectItems(rest); else select(null); } else { highlight(); renderCtx(); }
  }
}
function removeMany(list){ selIds.clear(); select(null); list.forEach(dropItem); sendOk(Sync.removeItems(list)); }
function commitItem(id,patch){
  const it=items.get(id); if(!it) return;
  const doc=Object.assign({},it.doc,patch,{at:Date.now(),by:myId});
  if("r" in patch&&!("ry" in patch)) doc.ry=patch.r;
  if("s" in patch&&!("sx" in patch)) doc.sx=doc.sy=doc.sz=patch.s;
  doc.r=doc.ry; doc.s=Math.abs(doc.sy);
  syncItem(id,doc); if(selected?.id===id) renderCtx(true);
  sendOk(Sync.commitItem(id,doc));
}
function rotateItem(id,da){ const it=items.get(id); if(it) commitItem(id,{ry:r2(((it.doc.ry||0)+da)%(Math.PI*2))}); }
function removeItem(id){ dropItem(id); sendOk(Sync.removeItem(id)); }
function duplicateItem(id){ if(selIds.size>1&&selIds.has(id)&&xf){ xf.duplicateSelection(); return; } const it=items.get(id); if(!it) return; const nid=rid(); const d=Object.assign({},it.doc,{x:r2((it.doc.x||0)+0.4),z:r2((it.doc.z||0)+0.4)}); commitNew(nid,d); select({kind:"item",id:nid}); }
function commitNew(id,doc){ doc=normDoc(Object.assign({},doc,{by:myId,at:Date.now()})); doc.r=doc.ry; doc.s=Math.abs(doc.sy); syncItem(id,doc); sendOk(Sync.commitItem(id,doc)); }

/* placing */
function startPlacing(p){
  if(!canWrite) return;
  cancelPlacing(true);
  if(p.moveId){ const it=items.get(p.moveId); if(!it) return; pushUndo({t:"item",id:p.moveId,prev:it.doc}); placing={moveId:p.moveId,obj:it.obj}; }
  else {
    const g=new THREE.Group(); scene.add(g); placing={doc:p.doc,obj:g,temp:true};
    Promise.resolve(buildItem(p.doc)).then(x=>{ if(placing&&placing.obj===g&&x){ x.traverse(o=>{ if(o.isMesh){ o.material=o.material.clone(); o.material.transparent=true; o.material.opacity=0.65; } }); g.add(x); } });
  }
  if(mode==="walk" && !isTouch && !document.pointerLockElement) renderer.domElement.requestPointerLock?.();
  movePlacing(mode==="walk"&&(isTouch||!!document.pointerLockElement)); updateHint(); renderPlaceBar(); renderTools();
}
function movePlacing(center){
  if(!placing?.obj) return;
  const p=floorPoint(center||(mode==="walk"&&(isTouch||document.pointerLockElement)));
  if(p){ placing.obj.position.copy(p); placing.obj.position.y+=placing.lift||0; placing.last=p.clone(); }
}
/* PageUp / PageDown while an item is in the hands: the same spot, a little higher or lower */
function liftPlacing(){ if(placing?.obj&&placing.last){ placing.obj.position.copy(placing.last); placing.obj.position.y+=placing.lift||0; } }
function dropPlacing(){
  if(!placing) return; const p=placing.last||placing.obj.position;
  const lift=placing.lift||0;
  if(placing.moveId){ const id=placing.moveId, it=items.get(id), rr=it?r2(it.obj.rotation.y):0; placing=null; commitItem(id,{x:r2(p.x),y:r2(p.y+lift),z:r2(p.z),r:rr}); renderTools(); }
  else { const doc=Object.assign({},placing.doc,{x:r2(p.x),y:r2(p.y+lift),z:r2(p.z),r:placing.doc.r||0,s:placing.doc.s||1}); scene.remove(placing.obj); placing=null; const id=rid(); commitNew(id,doc); pushUndo({t:"item",id,prev:null});
    if(tool==="add"){ lastAddRot=doc.r; setTimeout(startAdd,30); } else select({kind:"item",id}); }
  placedFromOrbit=true; updateHint(); renderPlaceBar();
}
function cancelPlacing(silent){
  if(!placing) return;
  if(placing.temp) scene.remove(placing.obj);
  else { const it=items.get(placing.moveId); if(it) applyObjXf(it.obj,it.doc); }
  placing=null; if(!silent){ updateHint(); renderPlaceBar(); }
}
function renderPlaceBar(){
  let b=$("placeBar");
  if(!placing||!isTouch){ b?.remove(); return; }
  if(!b){ b=el("div",{id:"placeBar",class:"panel",style:"left:50%;transform:translateX(-50%);bottom:calc(64px + env(safe-area-inset-bottom,0px));padding:8px;display:flex;gap:6px"}); document.body.append(b); }
  b.textContent="";
  b.append(el("button",{class:"primary",text:"Поставить",on:{click:()=>dropPlacing()}}),
           el("button",{text:"⟳ 90°",on:{click:()=>{ if(placing.temp){placing.doc.r=((placing.doc.r||0)+Math.PI/2);placing.obj.rotation.y=placing.doc.r;} else rotateItem(placing.moveId,Math.PI/2); }}}),
           el("button",{class:"ghost",text:"Отмена",on:{click:()=>cancelPlacing()}}));
}

/* ---------------- library ---------------- */
const LIB_VER="1";                       // bump when LIB geometry / colours change: invalidates cached base thumbnails
const THUMB_LS="villa.thumb."+LIB_VER+".";
const lsGet=k=>{ try{ return localStorage.getItem(k); }catch{ return null; } };
const lsSet=(k,v)=>{ try{ localStorage.setItem(k,v); }catch{} };
let libQuery="", libSort="new";
const baseThumbs=new Map();              // key -> dataURL (memory; localStorage as second level)
const baseDims=new Map();                // key -> [w,d,h] mm
const cards=new Map();                   // "base:key" | "up:id" -> {patch()}
const thumbJobs={q:[],running:false,seen:new Set(),failed:new Set(),baseQ:[],baseRunning:false};

const fmtDims=d=>d?d.join("×")+" мм":"— мм";
const fmtSize=b=>b<1048576?Math.max(1,Math.round((b||0)/1024))+" КБ":(b/1048576).toFixed(1)+" МБ";
const libOpen=()=>!$("lib").classList.contains("collapsed");
const baseObject=key=>{ const def=LIB[key]; return def.build(mat(def.color,0.8)); };
const mmOf=sz=>[Math.round(sz.x*1000),Math.round(sz.z*1000),Math.round(sz.y*1000)];
function dimsOfBase(key){
  if(!baseDims.has(key)){ const o=baseObject(key), sz=new THREE.Vector3(); new THREE.Box3().setFromObject(o).getSize(sz); baseDims.set(key,mmOf(sz)); Thumbs.disposeObject(o); }
  return baseDims.get(key);
}
function readDataUrl(blob){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(blob); }); }
function baseThumbSrc(key){
  if(baseThumbs.has(key)) return baseThumbs.get(key);
  const v=lsGet(THUMB_LS+key); if(v&&v.startsWith("data:image/")){ baseThumbs.set(key,v); return v; }
  return null;
}
async function makeBaseThumb(key){
  const o=baseObject(key);
  try{ const {blob}=await Thumbs.renderThumb(o); const url=await readDataUrl(blob); baseThumbs.set(key,url); lsSet(THUMB_LS+key,url); }
  finally{ Thumbs.disposeObject(o); }
}
/* base furniture is drawn by the client on first open of the tab, one at a time; nothing goes to the server */
async function pumpBase(){
  if(thumbJobs.baseRunning) return; thumbJobs.baseRunning=true;
  try{
    while(thumbJobs.baseQ.length){
      const key=thumbJobs.baseQ.shift();
      try{ await makeBaseThumb(key); }catch(e){ console.warn("thumb",key,e); }
      cards.get("base:"+key)?.patch();
      await new Promise(r=>setTimeout(r,0));
    }
  } finally{ thumbJobs.baseRunning=false; }
}

/* uploaded models: normalise units / pivot (mm, cm -> m; origin at bottom centre) */
function normalizeModel(root){
  const bb=new THREE.Box3().setFromObject(root), sz=new THREE.Vector3(), c=new THREE.Vector3(); bb.getSize(sz); bb.getCenter(c);
  let k=1; const mx=Math.max(sz.x,sz.y,sz.z); if(mx>60) k=0.001; else if(mx>6) k=0.01;
  const wrap=new THREE.Group(); root.position.set(-c.x,-bb.min.y,-c.z); const inner=new THREE.Group(); inner.add(root); inner.scale.setScalar(k); wrap.add(inner);
  return wrap;
}
/* own copy of a model, never shared with the scene: the caller disposes it */
const loadFresh=m=>loadGltfProgress("/uploads/"+m.file,null,m.sizeBytes).then(g=>normalizeModel(g.scene));
async function makeModelThumb(id){
  const m=models.get(id); if(!m) return;
  const wrap=await loadFresh(m);
  try{
    const {blob,size}=await Thumbs.renderThumb(wrap);
    const r=await Sync.uploadThumb(id,blob,mmOf(size));
    if(r?.doc&&models.has(id)){ models.set(id,r.doc); cards.get("up:"+id)?.patch(); }
  } finally{ Thumbs.disposeObject(wrap); }
}
/* the editor fills in missing thumbnails of already uploaded models, strictly one after another */
async function pumpModels(){
  if(thumbJobs.running) return; thumbJobs.running=true;
  try{
    while(thumbJobs.q.length&&canWrite){
      const id=thumbJobs.q.shift(); if(!models.has(id)) continue;
      try{ await makeModelThumb(id); }catch(e){ thumbJobs.failed.add(id); console.warn("thumb",id,e); cards.get("up:"+id)?.patch(); }
    }
  } finally{ thumbJobs.running=false; }
}
function queueThumbs(){
  if(!libOpen()) return;
  if(libTab==="base"){ for(const key of Object.keys(LIB)) if(!baseThumbSrc(key)&&!thumbJobs.baseQ.includes(key)) thumbJobs.baseQ.push(key); pumpBase(); }
  else if(libTab==="up"&&canWrite){ for(const[id,m]of models) if(!m.thumb&&!thumbJobs.seen.has(id)){ thumbJobs.seen.add(id); thumbJobs.q.push(id); } pumpModels(); }
}
function cubeIcon(){
  const s=document.createElementNS("http://www.w3.org/2000/svg","svg"); s.setAttribute("viewBox","0 0 24 24"); s.setAttribute("width","30"); s.setAttribute("height","30");
  s.setAttribute("fill","none"); s.setAttribute("stroke","currentColor"); s.setAttribute("stroke-width","1.4"); s.setAttribute("stroke-linejoin","round"); s.setAttribute("aria-hidden","true");
  const p=document.createElementNS("http://www.w3.org/2000/svg","path"); p.setAttribute("d","M12 2.5 21 7.5v9L12 21.5 3 16.5v-9zM3 7.5l9 5 9-5M12 12.5v9"); s.append(p); return s;
}

/* live hover preview: ONE card spins at a time, drawn by the shared thumbnail renderer into a 2D canvas */
let hover=null;
function stopSpin(){
  if(!hover) return; const h=hover; hover=null; clearTimeout(h.timer); h.dead=true;
  h.spin?.stop(); h.cv?.remove(); if(h.obj) Thumbs.disposeObject(h.obj);
  h.box.classList.remove("spinning");
}
async function startSpin(box,make){
  stopSpin(); const h=hover={box,dead:false};
  try{
    const obj=await make(); if(h.dead){ if(obj) Thumbs.disposeObject(obj); return; }
    h.obj=obj; const cv=document.createElement("canvas"); cv.width=cv.height=Thumbs.SIZE; cv.className="spin"; box.append(cv); h.cv=cv;
    h.spin=Thumbs.spin(obj,cv); box.classList.add("spinning");
  }catch(e){ console.warn("spin",e); }
}
function bindSpin(root,box,make){
  let t=0;
  root.addEventListener("pointerenter",e=>{ if(e.pointerType==="mouse"){ clearTimeout(t); t=setTimeout(()=>startSpin(box,make),180); } });
  root.addEventListener("pointerleave",e=>{ clearTimeout(t); if(e.pointerType==="mouse") stopSpin(); });
  root.addEventListener("pointerdown",e=>{ if(e.pointerType==="touch"){ clearTimeout(t); t=setTimeout(()=>{ root.dataset.long="1"; startSpin(box,make); },450); } });
  for(const ev of ["pointerup","pointercancel"]) root.addEventListener(ev,e=>{ if(e.pointerType==="touch"){ clearTimeout(t); stopSpin(); setTimeout(()=>{ delete root.dataset.long; },400); } });
  root.addEventListener("contextmenu",e=>{ if(isTouch) e.preventDefault(); });
  root.addEventListener("click",e=>{ if(root.dataset.long){ e.stopPropagation(); e.preventDefault(); } },true);
}

function placeholder(failed){
  return el("div",{class:"ph"},cubeIcon(),el("span",{text:failed?"Нет превью":"Готовлю превью…"}));
}
/* one grid card. src() -> url | null, failed() -> bool, dims() -> [w,d,h] | null */
function makeCard({id,kind,name,dims,extra,path,src,failed,onPlace,onInfo,onSelect,selected:isSel,build}){
  const thumb=el("div",{class:"thumb"});
  const main=el("button",{class:"card-main",title:"Поставить в сцену"},thumb,el("b",{class:"cn"}),el("span",{class:"mono cd"}),extra?el("span",{class:"mono ce"}):null,path?el("span",{class:"cp"}):null);
  const info=el("button",{class:"card-i ghost",text:"i",title:"Предпросмотр","aria-label":"Предпросмотр"});
  const root=el("div",{class:"card"},main,info);
  const patch=()=>{
    const s=src(); main.querySelector(".cn").textContent=name();
    main.querySelector(".cd").textContent=fmtDims(dims());
    if(extra) main.querySelector(".ce").textContent=extra();
    if(path){ const pp=path(); const cp=main.querySelector(".cp"); cp.textContent=pp; cp.title=pp; }
    const cur=thumb.firstChild;
    if(s){
      if(cur&&cur.tagName==="IMG"&&cur.dataset.s===s) return;
      thumb.querySelectorAll("img,.ph").forEach(n=>n.remove());
      const im=el("img",{alt:"",width:Thumbs.SIZE,height:Thumbs.SIZE,loading:"lazy",decoding:"async",draggable:"false"}); im.dataset.s=s; im.src=s;
      im.onerror=()=>{ if(im.dataset.s!==s||!im.isConnected) return; im.remove(); thumb.prepend(placeholder(true)); if(kind==="up"&&canWrite&&!thumbJobs.failed.has(id)){ thumbJobs.seen.add(id); thumbJobs.q.push(id); pumpModels(); } };
      thumb.prepend(im);
    } else { thumb.querySelectorAll("img").forEach(n=>n.remove()); const f=failed(); const p=thumb.querySelector(".ph"); if(!p||p.dataset.f!==String(f)){ p?.remove(); const n=placeholder(f); n.dataset.f=String(f); thumb.prepend(n); } }
  };
  main.title=canWrite?"Поставить в сцену"+(onSelect?" (Shift+клик — выделить)":""):"Предпросмотр";
  main.onclick=e=>{ if(onSelect&&canWrite&&e.shiftKey){ e.preventDefault(); onSelect(); return; } (canWrite?onPlace:onInfo)(); }; info.onclick=onInfo;
  if(isSel) root.classList.add("sel");
  bindSpin(root,thumb,build);
  if(kind==="up"&&canWrite&&!isTouch) bindModelDrag(root,id);
  cards.set(kind+":"+id,{patch}); patch();
  return root;
}

const modelThumbSrc=m=>m.thumb?"/uploads/"+m.thumb+"?t="+(m.thumbAt||0):null;

/* ---------------- folders of the uploaded models ---------------- */
let libFolder=null;                      // folder being looked at (null = all models, the root)
const libSel=new Set();                  // models selected with Shift+click, moved together
const MAX_FOLDER_DEPTH=3;
const folderOf=m=>folders.has(m.folder)?m.folder:null;
const folderDepth=id=>{ let n=0; for(let f=id;f&&folders.has(f)&&n<10;f=folders.get(f).parent) n++; return n; };
const folderKids=id=>[...folders.entries()].filter(([,f])=>(f.parent||null)===id).sort((a,b)=>libSort==="name"?String(a[1].name).localeCompare(String(b[1].name),"ru"):((a[1].order||0)-(b[1].order||0))||String(a[1].name).localeCompare(String(b[1].name),"ru")).map(([k])=>k);
const folderTree=id=>{ const out=[id]; for(let i=0;i<out.length;i++) out.push(...folderKids(out[i])); return out; };
const folderHeight=id=>1+Math.max(0,...folderKids(id).map(folderHeight));
const folderChain=id=>{ const c=[]; for(let f=id;f&&folders.has(f)&&c.length<10;f=folders.get(f).parent) c.unshift(f); return c; };
const folderPath=id=>folderChain(id).map(f=>folders.get(f).name).join(" › ");
const modelsIn=id=>[...models.entries()].filter(([,m])=>folderOf(m)===id).map(([k])=>k);
const treeModels=id=>{ const set=new Set(folderTree(id)); return [...models.entries()].filter(([,m])=>set.has(folderOf(m))).map(([k])=>k); };
const sceneUses=list=>{ const set=new Set(list); let n=0; for(const h of items.values()) if(h.doc.model&&set.has(h.doc.model)) n++; return n; };
const plural=(n,a,b,c)=>{ const m=n%100, k=n%10; return n+" "+((m>10&&m<20)?c:k===1?a:(k>=2&&k<=4)?b:c); };
const modelsWord=n=>plural(n,"модель","модели","моделей");
let libRaf=0;
const scheduleLib=()=>{ if(libRaf) return; libRaf=requestAnimationFrame(()=>{ libRaf=0; renderLib(); }); };
const FOLDER_ERR={forbidden:"Менять папки может только редактор.",too_deep:"Папки вкладываются не глубже трёх уровней.",cycle:"Нельзя переместить папку внутрь самой себя.",too_many_folders:"Слишком много папок.",in_use:"Модели используются в сцене.",network:"Нет связи с сервером."};
const folderErr=e=>FOLDER_ERR[e&&e.code]||"Не получилось выполнить действие.";

/* in-page dialog: title, body nodes, buttons [{label,cls,run}] (run returns false to keep the dialog open); Esc / click outside = cancel */
function modal(title,body,buttons,{onCancel}={}){
  const prev=document.activeElement, msg=el("div",{class:"meta",role:"status"});
  const root=el("div",{class:"pv-back"});
  const done=()=>{ document.removeEventListener("keydown",key,true); root.remove(); try{ prev&&prev.focus(); }catch{} };
  const btns=el("div",{class:"bigwarn-btns"});
  const mk=b=>{ const x=el("button",{class:b.cls||"",text:b.label}); x.onclick=async()=>{ x.disabled=true; let r; try{ r=await b.run?.(msg); }catch(e){ msg.textContent=folderErr(e); r=false; } x.disabled=false; if(r!==false) done(); }; return x; };
  for(const b of buttons) btns.append(mk(b));
  root.append(el("div",{class:"panel pv-dlg",role:"dialog","aria-modal":"true"},el("h2",{text:title}),...body,msg,btns));
  const key=e=>{ if(e.key==="Escape"){ e.stopPropagation(); onCancel?.(); done(); } else if(e.key!=="Tab"&&!e.target.closest?.("input")) e.stopPropagation(); };
  root.addEventListener("pointerdown",e=>{ if(e.target===root){ onCancel?.(); done(); } });
  document.addEventListener("keydown",key,true); document.body.append(root);
  (root.querySelector("input")||btns.lastChild)?.focus?.();
  return {root,msg,close:done};
}
/* asks for a folder name; resolves to the trimmed name or null */
function askFolderName(title,initial){
  return new Promise(res=>{
    const inp=el("input",{type:"text",maxlength:"60","aria-label":"Название папки",class:"pv-name",value:initial||""});
    const save=()=>{ const n=inp.value.trim().slice(0,60); if(!n) return false; res(n); };
    const d=modal(title,[inp],[{label:"Отмена",cls:"ghost",run:()=>res(null)},{label:"Сохранить",cls:"primary",run:save}],{onCancel:()=>res(null)});
    inp.onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); d.root.querySelector(".primary").click(); } };
    inp.select();
  });
}
/* folder chooser: resolves to a folder id, null (the root) or undefined (cancelled). `bad(id)` greys a folder out */
function pickFolder(title,bad){
  return new Promise(res=>{
    let d; const list=el("div",{class:"fp-list"}), choose=v=>{ res(v); d.close(); };
    const row=(id,label,depth)=>{ const dis=id!==null&&bad&&bad(id); const b=el("button",{class:"fp-row",text:label,"data-folder":id===null?"root":id,disabled:dis?"":null}); b.style.paddingLeft=(10+depth*16)+"px"; b.onclick=()=>choose(id); list.append(b); };
    row(null,"Все модели (корень)",0);
    const walk=(parent,depth)=>{ for(const id of folderKids(parent)){ row(id,"📁 "+folders.get(id).name,depth); walk(id,depth+1); } };
    walk(null,1);
    d=modal(title,[list],[{label:"Отмена",cls:"ghost",run:()=>res(undefined)}],{onCancel:()=>res(undefined)});
  });
}
async function moveModelsTo(ids,dest){
  ids=ids.filter(i=>models.has(i)&&folderOf(models.get(i))!==dest); if(!ids.length) return;
  try{ await Sync.moveModels(ids,dest); libSel.clear(); toast("Перенесено: "+modelsWord(ids.length)+" → "+(dest?folders.get(dest)?.name||"папку":"Все модели")); }
  catch(e){ toast(folderErr(e)); }
}
function folderMenu(anchor,list){
  document.querySelectorAll(".fmenu").forEach(m=>m.remove());
  const m=el("div",{class:"fmenu panel",role:"menu"}); const r=anchor.getBoundingClientRect();
  for(const [label,fn,cls] of list) m.append(el("button",{class:"ghost "+(cls||""),role:"menuitem",text:label,on:{click:()=>{ close(); fn(); }}}));
  document.body.append(m); m.style.left=Math.min(r.left,innerWidth-m.offsetWidth-8)+"px"; m.style.top=Math.min(r.bottom+4,innerHeight-m.offsetHeight-8)+"px";
  const close=()=>{ m.remove(); document.removeEventListener("pointerdown",out,true); document.removeEventListener("keydown",esc,true); };
  const out=e=>{ if(!m.contains(e.target)) close(); }, esc=e=>{ if(e.key==="Escape"){ e.stopPropagation(); close(); } };
  setTimeout(()=>{ document.addEventListener("pointerdown",out,true); document.addEventListener("keydown",esc,true); },0);
  m.querySelector("button")?.focus();
}
async function newFolder(parent){
  if(folderDepth(parent)>=MAX_FOLDER_DEPTH){ toast("Папки вкладываются не глубже трёх уровней."); return; }
  const n=await askFolderName("Новая папка"+(parent?" в «"+folders.get(parent).name+"»":""),""); if(!n) return;
  try{ const r=await Sync.addFolder(n,parent); if(r?.id&&r.doc) folders.set(r.id,r.doc); renderLib(); }catch(e){ toast(folderErr(e)); }
}
async function renameFolder(id){
  const f=folders.get(id); if(!f) return; const n=await askFolderName("Переименовать папку",f.name); if(!n||n===f.name) return;
  try{ const r=await Sync.patchFolder(id,{name:n}); if(r?.doc) folders.set(id,r.doc); renderLib(); }catch(e){ toast(folderErr(e)); }
}
async function moveFolder(id){
  const sub=new Set(folderTree(id)), h=folderHeight(id);
  const dest=await pickFolder("Переместить «"+folders.get(id).name+"» в…",t=>sub.has(t)||folderDepth(t)+h>MAX_FOLDER_DEPTH); if(dest===undefined) return;
  try{ await Sync.patchFolder(id,{parent:dest}); }catch(e){ toast(folderErr(e)); }
}
/* delete: models go to the parent folder, or are deleted together with the folder (only if none of them is in the scene) */
function deleteFolder(id){
  const f=folders.get(id); if(!f) return; const inside=treeModels(id), used=sceneUses(inside), subs=folderTree(id).length-1;
  const info=el("div",{},"Папка «"+f.name+"»: "+modelsWord(inside.length)+(subs?", вложенных папок: "+subs:"")+(inside.length?"; в сцене они используются в предметах: "+used+".":"."));
  const del=used?null:{label:"Удалить вместе с моделями",cls:"danger",run:async()=>{ try{ await Sync.removeFolder(id,"models"); }catch(e){ if(e.code==="in_use") return (msgBox.textContent="Нельзя удалить: модели используются в сцене."),false; throw e; } }};
  const body=[info]; if(used) body.push(el("div",{class:"meta",text:"«Удалить вместе с моделями» недоступно: эти модели стоят в сцене ("+used+"). Сначала уберите такие предметы или перенесите модели."}));
  let msgBox=null;
  const d=modal("Удалить папку?",body,[{label:"Отмена",cls:"ghost"},{label:"Переместить модели в родительскую папку",cls:"primary",run:async()=>{ await Sync.removeFolder(id,"move"); }},...(del?[del]:[])]);
  msgBox=d.msg;
}
function renameInline(card,id){
  const nameEl=card.querySelector(".cn"), f=folders.get(id); if(!f||!canWrite) return;
  const inp=el("input",{type:"text",maxlength:"60","aria-label":"Название папки",class:"f-rename",value:f.name}); let finished=false;
  const end=async save=>{ if(finished) return; finished=true; const n=inp.value.trim().slice(0,60); if(save&&n&&n!==f.name){ try{ const r=await Sync.patchFolder(id,{name:n}); if(r?.doc) folders.set(id,r.doc); }catch(e){ toast(folderErr(e)); } } renderLib(); };
  inp.onkeydown=e=>{ e.stopPropagation(); if(e.key==="Enter"){ e.preventDefault(); end(true); } else if(e.key==="Escape"){ end(false); } };
  inp.onblur=()=>end(true); inp.onclick=e=>e.stopPropagation(); inp.ondblclick=e=>e.stopPropagation();
  nameEl.replaceWith(inp); inp.focus(); inp.select();
}
const FOLDER_SVG='<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2l2 2.2h8.8A1.5 1.5 0 0 1 21 8.7v8.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>';
function folderCard(id){
  const f=folders.get(id), n=treeModels(id).length;
  const ic=el("div",{class:"thumb fthumb"}); ic.innerHTML=FOLDER_SVG;
  const main=el("button",{class:"card-main",title:"Открыть папку"},ic,el("b",{class:"cn",text:f.name}),el("span",{class:"mono cd",text:modelsWord(n)}));
  const root=el("div",{class:"card fcard","data-folder":id,"data-drop":id},main);
  let openT=0;
  const open=()=>{ libFolder=id; libSel.clear(); libQuery=""; $("libSearch").value=""; renderLib(); };
  main.onclick=()=>{ clearTimeout(openT); if(canWrite) openT=setTimeout(open,240); else open(); };   // an editor may double-click the name to rename: the single click waits a moment
  if(canWrite){
    main.addEventListener("dblclick",e=>{ clearTimeout(openT); if(e.target.closest(".cn")){ e.preventDefault(); renameInline(root,id); } else open(); });
    const more=el("button",{class:"card-i ghost",text:"⋯",title:"Действия с папкой","aria-label":"Действия с папкой","aria-haspopup":"menu",style:"font:600 16px/20px system-ui"});
    more.onclick=e=>{ e.stopPropagation(); folderMenu(more,[["Переименовать",()=>renameInline(root,id)],["Переместить в…",()=>moveFolder(id)],["Удалить…",()=>deleteFolder(id),"danger"]]); };
    root.append(more);
  }
  return root;
}
/* pointer-driven drag of a model card (mouse; on a phone there is "Переместить в…" in the model window). Drop on a folder card or a breadcrumb. */
function bindModelDrag(card,id){
  card.addEventListener("pointerdown",e=>{
    if(e.pointerType!=="mouse"||e.button!==0||e.shiftKey||e.target.closest(".card-i")) return;
    const x0=e.clientX,y0=e.clientY; let ghost=null,over=null,ids=null;
    const clear=()=>{ over?.classList.remove("drop"); over=null; ghost?.remove(); ghost=null; document.body.classList.remove("dragging"); removeEventListener("pointermove",move,true); removeEventListener("pointerup",up,true); removeEventListener("keydown",key,true); };
    const move=ev=>{
      if(!ghost){ if(Math.hypot(ev.clientX-x0,ev.clientY-y0)<7) return;
        ids=libSel.has(id)?[...libSel]:[id]; stopSpin();
        ghost=el("div",{class:"drag-ghost",text:ids.length>1?modelsWord(ids.length):(models.get(id)?.name||"Модель")}); document.body.append(ghost); document.body.classList.add("dragging"); }
      ghost.style.left=(ev.clientX+12)+"px"; ghost.style.top=(ev.clientY+12)+"px";
      const t=document.elementFromPoint(ev.clientX,ev.clientY)?.closest("[data-drop]")||null;
      if(t!==over){ over?.classList.remove("drop"); over=t; over?.classList.add("drop"); }
    };
    const up=()=>{
      const was=!!ghost, target=over; const list=ids; clear();
      if(!was) return;
      const stop=ev=>{ ev.stopPropagation(); ev.preventDefault(); }; addEventListener("click",stop,true); setTimeout(()=>removeEventListener("click",stop,true),60);   // the drag must not also "place" the model
      if(target) moveModelsTo(list,target.dataset.drop==="root"?null:target.dataset.drop);
    };
    const key=ev=>{ if(ev.key==="Escape"){ ev.stopPropagation(); clear(); } };
    addEventListener("pointermove",move,true); addEventListener("pointerup",up,true); addEventListener("keydown",key,true);
  });
}
function crumbBar(){
  const bar=el("div",{class:"crumbs"});
  if(libFolder) bar.append(el("button",{class:"ghost crumb-back",text:"← Назад",title:"На уровень выше",on:{click:()=>{ libFolder=folders.get(libFolder)?.parent||null; libSel.clear(); renderLib(); }}}));
  const nav=el("nav",{class:"crumb-nav","aria-label":"Путь"});
  const crumb=(id,label,last)=>{ const b=el("button",{class:"ghost crumb"+(last?" cur":""),text:label,"data-drop":id===null?"root":id,on:{click:()=>{ libFolder=id; libSel.clear(); renderLib(); }}}); if(last) b.setAttribute("aria-current","page"); nav.append(b); };
  const chain=folderChain(libFolder);
  crumb(null,"Все модели",!chain.length);
  chain.forEach((fid,i)=>{ nav.append(el("span",{class:"sep",text:"›"})); crumb(fid,folders.get(fid).name,i===chain.length-1); });
  bar.append(nav);
  if(canWrite) bar.append(el("button",{id:"bNewFolder",text:"+ Папка",title:folderDepth(libFolder)>=MAX_FOLDER_DEPTH?"Глубже трёх уровней нельзя":"Новая папка здесь",disabled:folderDepth(libFolder)>=MAX_FOLDER_DEPTH?"":null,on:{click:()=>newFolder(libFolder)}}));
  return bar;
}
function selBar(){
  const n=libSel.size; if(!n||!canWrite) return null;
  return el("div",{class:"selbar"},el("span",{text:"Выбрано: "+modelsWord(n)}),
    el("button",{text:"Переместить в…",on:{click:async()=>{ const dest=await pickFolder("Переместить в…"); if(dest!==undefined) moveModelsTo([...libSel],dest); }}}),
    el("button",{class:"ghost",text:"Снять",on:{click:()=>{ libSel.clear(); renderLib(); }}}));
}
function renderLib(){
  const L=$("libList"); stopSpin(); L.textContent=""; cards.clear();
  document.querySelectorAll(".fmenu").forEach(m=>m.remove());
  $("tBase").setAttribute("aria-pressed",libTab==="base"); $("tUp").setAttribute("aria-pressed",libTab==="up"); $("tTex").setAttribute("aria-pressed",libTab==="tex");
  $("uploadRow").hidden=(libTab==="base"||!canWrite); $("libSort").hidden=(libTab!=="up");
  $("bUpload").hidden=libTab!=="up"; $("upNote").hidden=libTab!=="up"; $("bNewTex").hidden=libTab!=="tex";
  const q=libQuery.trim().toLowerCase(), hit=n=>!q||String(n).toLowerCase().includes(q);
  if(libTab==="base"){
    for(const[key,def]of Object.entries(LIB)){
      if(!hit(def.name)) continue;
      L.append(makeCard({id:key,kind:"base",name:()=>def.name,dims:()=>dimsOfBase(key),src:()=>baseThumbSrc(key),failed:()=>false,
        onPlace:()=>startPlacing({doc:{type:"builtin",key,color:def.color,r:0,s:1}}),onInfo:()=>openPreview({kind:"base",key}),
        build:async()=>baseObject(key)}));
    }
    if(!L.firstChild) L.append(el("div",{class:"meta empty",text:"Ничего не найдено."}));
  } else if(libTab==="tex"){
    const list=texList().filter(s=>hit(Tex.nameOf(s)));
    for(const s of list) L.append(texCard(s,{pressed:tool==="tex"&&sameSrc(s,texBrush.src),
      onClick:()=>{ if(!canWrite){ openTexInfo(s); return; } texBrush={src:srcOf(s),sizeMm:null,rot:0,offMm:[0,0],tint:null}; saveTexBrush(); if(tool!=="tex") setTool("tex"); else renderTools(); renderLib(); },
      onInfo:()=>openTexInfo(s)}));
    if(!list.length) L.append(el("div",{class:"meta empty",text:"Ничего не найдено."}));
  } else {
    if(libFolder&&!folders.has(libFolder)) libFolder=null;
    const searching=!!q;
    let list=[...models.entries()].filter(([,m])=>hit(m.name||"Модель")&&(searching||folderOf(m)===libFolder));
    list.sort(libSort==="name"?(a,b)=>String(a[1].name).localeCompare(String(b[1].name),"ru"):(a,b)=>(b[1].at||0)-(a[1].at||0));
    if(!searching){
      L.append(crumbBar());
      for(const fid of folderKids(libFolder)) L.append(folderCard(fid));
    } else L.append(el("div",{class:"meta empty",text:"Поиск по всем папкам."}));
    const sb=selBar(); if(sb) L.append(sb);
    if(!models.size&&!folders.size) L.append(el("div",{class:"meta empty",text:"Пока ничего не загружено. Сгенерируйте мебель по фото в нейросети, скачайте .glb и загрузите сюда."}));
    else if(!list.length&&searching) L.append(el("div",{class:"meta empty",text:"Ничего не найдено."}));
    else if(!list.length&&!folderKids(libFolder).length) L.append(el("div",{class:"meta empty",text:libFolder?"В этой папке пока пусто. Загрузите модель или перетащите сюда из другой папки.":"Пока ничего не загружено."}));
    for(const[id]of list){
      L.append(makeCard({id,kind:"up",name:()=>models.get(id)?.name||"Модель",dims:()=>models.get(id)?.dims||null,extra:()=>fmtSize(models.get(id)?.sizeBytes||0),
        path:searching?()=>{ const m=models.get(id); return m&&folderOf(m)?folderPath(folderOf(m)):"Все модели"; }:null,
        selected:libSel.has(id),onSelect:()=>{ if(libSel.has(id)) libSel.delete(id); else libSel.add(id); renderLib(); },
        src:()=>{ const m=models.get(id); return m?modelThumbSrc(m):null; },failed:()=>thumbJobs.failed.has(id),
        onPlace:()=>startPlacing({doc:{type:"model",model:id,r:0,s:1}}),onInfo:()=>openPreview({kind:"up",id}),
        build:()=>{ const m=models.get(id); return m?loadFresh(m):null; }}));
    }
  }
  queueThumbs();
}
$("tBase").onclick=()=>{libTab="base";renderLib();};
$("tUp").onclick=()=>{libTab="up";renderLib();};
$("tTex").onclick=()=>{libTab="tex";renderLib();};
$("bNewTex").onclick=newTexture;
$("libSearch").oninput=e=>{ libQuery=e.target.value; renderLib(); };
$("libSort").onchange=e=>{ libSort=e.target.value; renderLib(); };
const toggleLib=()=>{ const c=$("lib").classList.toggle("collapsed"); $("bLib").setAttribute("aria-expanded",String(!c)); $("libClose").textContent=c?"+":"—"; if(c) stopSpin(); else renderLib(); };
$("libClose").onclick=toggleLib; $("bLib").onclick=toggleLib;
if(innerWidth<720) toggleLib();

/* ---------------- preview window ---------------- */
let pv=null;
function closePreview(){
  if(!pv) return; const p=pv; pv=null;
  cancelAnimationFrame(p.raf); p.ro.disconnect(); p.controls.dispose(); p.st.remove();
  if(p.obj) Thumbs.disposeObject(p.obj);
  p.renderer.dispose(); p.renderer.forceContextLoss?.(); p.root.remove();
  document.removeEventListener("keydown",p.onKey,true); p.opener?.focus?.();
}
async function openPreview(ref){
  closePreview(); stopSpin();
  const isBase=ref.kind==="base", cur=()=>isBase?null:models.get(ref.id);
  if(!isBase&&!cur()) return;
  const title=()=>isBase?LIB[ref.key].name:(cur()?.name||"Модель");
  const dimsNow=()=>isBase?dimsOfBase(ref.key):(cur()?.dims||null);
  const folderLine=el("div",{class:"meta pv-folder"});
  const h2=el("h2",{id:"pvTitle",text:title()}), dimsEl=el("div",{class:"meta mono"}), msg=el("div",{class:"meta",role:"status"});
  const view=el("div",{class:"pv-view"},el("div",{class:"pv-load",text:"Загружаю модель…"}));
  const actions=el("div",{class:"row pv-actions"}), confirmRow=el("div",{class:"row pv-confirm",hidden:""}), headRow=el("div",{class:"pv-head"},h2);
  const close=el("button",{class:"ghost",text:"✕","aria-label":"Закрыть",on:{click:closePreview}}); headRow.append(close);
  const dlg=el("div",{class:"panel pv-dlg",role:"dialog","aria-modal":"true","aria-labelledby":"pvTitle"},headRow,view,
    el("div",{class:"meta",text:"Крутите мышью или пальцем, колесо или щипок — масштаб."}),dimsEl,
    isBase?null:el("div",{class:"meta mono",text:fmtSize(cur().sizeBytes||0)}),isBase?null:folderLine,actions,confirmRow,msg);
  const root=el("div",{id:"pv",class:"pv-back"},dlg); document.body.append(root);
  root.addEventListener("pointerdown",e=>{ if(e.target===root) closePreview(); });
  const upd=()=>{ if(!isBase&&!cur()){ closePreview(); toast("Модель удалена."); return; } h2.textContent=title(); dimsEl.textContent=fmtDims(dimsNow()); if(!isBase){ const fo=folderOf(cur()); folderLine.textContent="Папка: "+(fo?folderPath(fo):"Все модели"); } };
  upd();

  const place=el("button",{class:"primary",text:"Поставить в сцену"});
  place.onclick=()=>{ const doc=isBase?{type:"builtin",key:ref.key,color:LIB[ref.key].color,r:0,s:1}:{type:"model",model:ref.id,r:0,s:1}; closePreview(); startPlacing({doc}); };
  if(canWrite) actions.append(place);
  const refresh=el("button",{text:"Обновить превью"});
  refresh.onclick=async()=>{
    refresh.disabled=true; msg.textContent="Перерисовываю…";
    try{
      if(isBase){ await makeBaseThumb(ref.key); cards.get("base:"+ref.key)?.patch(); }
      else { thumbJobs.failed.delete(ref.id); await makeModelThumb(ref.id); }
      msg.textContent="Превью обновлено.";
    }catch(e){ console.warn(e); msg.textContent="Не получилось обновить превью."; }
    refresh.disabled=false;
  };
  if(canWrite) actions.append(refresh);
  if(canWrite&&!isBase){
    const ren=el("button",{text:"Переименовать"}), del=el("button",{class:"danger",text:"Удалить"});
    ren.onclick=()=>{
      const inp=el("input",{type:"text",maxlength:"60","aria-label":"Новое название",class:"pv-name"}); inp.value=cur().name||"";
      const ok=el("button",{class:"primary",text:"Сохранить"}), no=el("button",{class:"ghost",text:"Отмена"});
      const back=()=>{ confirmRow.hidden=true; confirmRow.textContent=""; actions.hidden=false; };
      const save=async()=>{ const n=inp.value.trim().slice(0,60); if(!n) return; ok.disabled=true;
        try{ const r=await Sync.renameModel(ref.id,n); if(r?.doc) models.set(ref.id,r.doc); cards.get("up:"+ref.id)?.patch(); upd(); back(); }catch(e){ msg.textContent="Не удалось переименовать."; ok.disabled=false; } };
      ok.onclick=save; no.onclick=back; inp.onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); save(); } };
      actions.hidden=true; confirmRow.hidden=false; confirmRow.textContent=""; confirmRow.append(inp,ok,no); inp.focus(); inp.select();
    };
    del.onclick=()=>{
      const yes=el("button",{class:"danger primary-danger",text:"Да, удалить"}), no=el("button",{class:"ghost",text:"Отмена"});
      actions.hidden=true; confirmRow.hidden=false; confirmRow.textContent="";
      confirmRow.append(el("span",{class:"pv-ask",text:"Удалить «"+title()+"»? Такие предметы пропадут и из сцены."}),yes,no); no.focus();
      no.onclick=()=>{ confirmRow.hidden=true; confirmRow.textContent=""; actions.hidden=false; };
      yes.onclick=async()=>{ yes.disabled=true; try{ await Sync.removeModel(ref.id); closePreview(); }catch(e){ msg.textContent="Не удалось удалить модель."; yes.disabled=false; } };
    };
    const mv=el("button",{text:"Переместить в…",on:{click:async()=>{ const dest=await pickFolder("Переместить «"+title()+"» в…"); if(dest===undefined) return; try{ await Sync.moveModels([ref.id],dest); }catch(e){ msg.textContent=folderErr(e); } }}});
    actions.append(mv,ren,del);
  }

  /* own renderer, created on open and released on close */
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.outputEncoding=THREE.sRGBEncoding; renderer.setClearColor(0,0);
  const cam=new THREE.PerspectiveCamera(35,1,0.01,500);
  const p=pv={root,renderer,controls:null,st:null,obj:null,raf:0,ro:null,opener:document.activeElement,cam};
  p.upd=upd;
  p.onKey=e=>{ if(e.key==="Escape"){ e.stopPropagation(); closePreview(); } else if(e.key!=="Tab"&&!e.target.closest?.("input")) e.stopPropagation(); }; // hotkeys of the scene stay silent while the window is open
  document.addEventListener("keydown",p.onKey,true);
  p.ro=new ResizeObserver(()=>{ const w=view.clientWidth,h=view.clientHeight; if(w&&h){ renderer.setSize(w,h,false); cam.aspect=w/h; cam.updateProjectionMatrix(); } });
  const cv=renderer.domElement; cv.className="pv-cv"; cv.setAttribute("aria-label","3D-предпросмотр"); p.ro.observe(view);
  p.controls=new THREE.OrbitControls(cam,cv); p.controls.enableDamping=true; p.controls.dampingFactor=0.08; p.controls.autoRotate=true; p.controls.autoRotateSpeed=1.2; p.controls.enablePan=false;
  p.controls.addEventListener("start",()=>{ p.controls.autoRotate=false; });
  (canWrite?place:close).focus();
  let obj;
  try{ obj=isBase?baseObject(ref.key):await loadFresh(cur()); }
  catch(e){ console.warn(e); if(pv===p) view.firstChild.textContent="Не удалось загрузить модель."; return; }
  if(pv!==p){ Thumbs.disposeObject(obj); return; }
  p.obj=obj; p.st=Thumbs.stage(obj);
  dimsEl.textContent=fmtDims(dimsNow()||mmOf(p.st.size));
  const r=Math.max(p.st.size.length()/2,0.05), c=p.st.center;
  cam.position.set(c.x+r*2.6*Math.sin(0.61)*Math.cos(0.5),c.y+r*2.6*Math.sin(0.5),c.z+r*2.6*Math.cos(0.61)*Math.cos(0.5));
  p.controls.target.copy(c); p.controls.minDistance=r*0.8; p.controls.maxDistance=r*8; cam.near=r/50; cam.far=r*40; cam.updateProjectionMatrix(); p.controls.update();
  view.textContent=""; view.append(cv);
  const w=view.clientWidth,h=view.clientHeight; renderer.setSize(w,h,false); cam.aspect=w/h; cam.updateProjectionMatrix();
  const loop=()=>{ if(pv!==p) return; p.raf=requestAnimationFrame(loop); p.controls.update(); renderer.render(p.st.scene,cam); };
  loop();
}

/* upload */
const BIG_WARN=30*1048576, MAX_UPLOAD=200*1048576;
/* in-page dialog (not confirm()): resolves true on "Загрузить" */
function bigWarn(text,okLabel){
  return new Promise(res=>{
    const prev=document.activeElement;
    const ok=el("button",{text:okLabel||"Загрузить",on:{click:()=>done(true)}}), no=el("button",{class:"ghost",text:"Отмена",on:{click:()=>done(false)}});
    const dlg=el("div",{class:"panel pv-dlg",role:"alertdialog","aria-modal":"true","aria-labelledby":"bwTitle"},el("h2",{id:"bwTitle",text:"Большая модель"}),el("div",{text:text}),el("div",{class:"bigwarn-btns"},no,ok));
    const root=el("div",{class:"pv-back",id:"bigWarn"},dlg); document.body.append(root);
    const key=e=>{ if(e.key==="Escape"){ e.stopPropagation(); done(false); } };
    function done(v){ document.removeEventListener("keydown",key,true); root.remove(); try{ prev&&prev.focus(); }catch{} res(v); }
    document.addEventListener("keydown",key,true); no.focus();
  });
}
const BIG_TEXT="Модель большая — у участников со слабым интернетом и на телефонах она будет грузиться долго.";
const mbOf=n=>(n/1048576).toFixed(n>=10485760?0:1)+" МБ";
/* progress with percent and speed for an upload; returns the callback for Sync.upload */
function upProgressCb(label,total){
  const t0=performance.now();
  return (fr,loaded)=>{ const sec=Math.max(.001,(performance.now()-t0)/1000), sp=loaded/sec; houseProgress(label+" "+Math.round(fr*100)+"% · "+mbOf(loaded)+" из "+mbOf(total)+" · "+(sp/1048576).toFixed(1)+" МБ/с",fr); };
}
$("bUpload").onclick=()=>$("fileIn").click();
$("fileIn").onchange=async()=>{
  const f=$("fileIn").files[0]; $("fileIn").value=""; if(!f||!canWrite) return;
  const name=f.name.replace(/\.glb$/i,"").slice(0,60)||"Модель";
  if(!/\.glb$/i.test(f.name)){ toast("Нужен файл в формате .glb"); return; }
  if(f.size>MAX_UPLOAD){ toast("Файл больше 200 МБ. Уменьшите модель (например, в Blender) и попробуйте снова."); return; }
  const big=f.size>BIG_WARN;
  if(big&&!await bigWarn(BIG_TEXT+" Размер файла: "+mbOf(f.size)+".")) return;
  $("bUpload").disabled=true;
  try{
    let thumb=null;
    if(!big){   // small files are parsed here first (validation + thumbnail); big ones are not held in the browser's memory
      houseProgress("Проверяю «"+name+"»…");
      const buf=await f.arrayBuffer();
      const gl=await new Promise((res,rej)=>loader.parse(buf,"",res,rej)); // validate
      try{ const wrap=normalizeModel(gl.scene); try{ thumb=await Thumbs.renderThumb(wrap); } finally{ Thumbs.disposeObject(wrap); } }catch(e){ console.warn("thumb",e); Thumbs.disposeObject(gl.scene); }
    }
    houseProgress("Загружаю «"+name+"» 0%",0);
    const r=await Sync.upload(f,name,upProgressCb("Загружаю «"+name+"»",f.size),libFolder);
    houseProgress("");
    if(r?.id&&r.doc) models.set(r.id,r.doc);
    libTab="up"; renderLib();
    if(r?.id&&thumb){ try{ const t=await Sync.uploadThumb(r.id,thumb.blob,mmOf(thumb.size)); if(t?.doc&&models.has(r.id)){ models.set(r.id,t.doc); cards.get("up:"+r.id)?.patch(); } }catch(e){ console.warn("thumb upload",e); } }
    else if(r?.id&&big){   // preview of a big model: rendered as usual, a placeholder card if the browser runs out of memory
      toast("Готово. Рисую превью…");
      try{ await makeModelThumb(r.id); }catch(e){ thumbJobs.failed.add(r.id); thumbJobs.seen.add(r.id); cards.get("up:"+r.id)?.patch(); console.warn("thumb (big)",e); }
    }
    toast("Готово. Нажмите на модель в списке, чтобы поставить.");
  }catch(e){
    houseProgress("");
    const code=e&&e.code;
    toast(code==="too_large"?"Файл слишком большой (максимум 200 МБ).":code==="forbidden"?"Загружать модели может только редактор.":code==="too_many_models"?"Слишком много моделей. Удалите ненужные.":code==="network"?"Нет связи с сервером. Проверьте интернет и повторите.":"Не получилось загрузить: файл повреждён или это не .glb.");
    console.warn(e);
  }finally{ $("bUpload").disabled=false; }
};
/* download progress of big models, shown to everyone who has such a model in the scene */
const dlProg=new Map();      // id -> {name, frac}
function showDl(){
  const b=$("modelDl"); if(!dlProg.size){ b.hidden=true; return; }
  const list=[...dlProg.values()], f=list.reduce((a,x)=>a+x.frac,0)/list.length;
  b.hidden=false; $("modelDlTxt").textContent="Загружается модель «"+list[0].name+"»"+(list.length>1?" и ещё "+(list.length-1):"")+"… "+Math.round(f*100)+"%"; $("modelDlBar").value=Math.round(f*100);
}
const BIG_DL=5*1048576;      // below this a model arrives too fast to be worth a progress panel
const modelReady=new Set();  // ids whose model is loaded: no placeholder for them
function loadModel(id){
  if(modelCache.has(id)) return modelCache.get(id);
  const m=models.get(id); if(!m) return Promise.resolve(null);
  const big=(m.sizeBytes||0)>=BIG_DL;
  const p=loadGltfProgress("/uploads/"+m.file,big?(fr=>{ dlProg.set(id,{name:m.name||"Модель",frac:fr}); showDl(); }):null,m.sizeBytes).then(g=>{
      const wrap=normalizeModel(g.scene);
      wrap.traverse(o=>{ if(o.isMesh){ o.castShadow=o.receiveShadow=true; } });
      modelReady.add(id);
      return wrap;
    }).catch(e=>{ console.warn(e); const g=new THREE.Group(); bx(g,.5,.5,.5,0,.25,0,mat("#c9c3b6")); modelReady.add(id); return g; })
    .finally(()=>{ dlProg.delete(id); showDl(); });
  modelCache.set(id,p); return p;
}
/* grey bounding box of the model's real size while it is still downloading */
function modelPlaceholder(id){
  const d=models.get(id)?.dims, g=new THREE.Group();
  const w=d?d[0]/1000:.6, dd=d?d[1]/1000:.6, h=d?d[2]/1000:.6;
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,dd),new THREE.MeshStandardMaterial({color:0x9a9a9a,transparent:true,opacity:.55,roughness:1}));
  m.position.y=h/2; g.add(m); return g;
}

/* ---------------- textures: furniture, brush, library window ---------------- */
/* furniture: a textured copy of the item's tint material (builtin: triplanar in the item's own frame) or a map with repeat / rotation (uploaded model with UV) */
function clearItemTex(h){
  if(h.texMats){ for(const m of h.texMats) (m.userData.mapClone?Tex.disposeMapMat:Tex.disposeMat)(m); h.texMats=null; }
  h.obj.traverse(o=>{ if(o.isMesh&&o.userData.origMat){ o.material=o.userData.origMat; o.userData.origMat=null; } });
  texItems.delete(h);
}
function applyItemTex(h){
  clearItemTex(h);
  const d=h.doc, tex=d.tex&&Tex.exists(d.tex)?d.tex:null; h.texSig=JSON.stringify(d.tex||null);
  if(!tex) return;
  const mats=new Map(), made=[];
  if(d.type==="builtin"){
    h.obj.traverse(o=>{
      if(!o.isMesh||!o.userData.tint||Array.isArray(o.material)) return;
      const orig=o.material; let m=mats.get(orig);
      if(!m){ m=Tex.makeMat(orig,tex); applyFinish(m,d.finish||null,{r:0.8,m:0}); mats.set(orig,m); made.push(m); }
      o.userData.origMat=orig; o.material=m;
    });
    if(made.length) texItems.add(h);
  } else {
    const bb=new THREE.Box3().setFromObject(h.obj), sz=new THREE.Vector3(); bb.getSize(sz);
    h.obj.traverse(o=>{
      if(!o.isMesh||Array.isArray(o.material)) return;
      const m=Tex.makeMapMat(o.material,tex,[Math.max(sz.x,sz.z),sz.y]); applyFinish(m,d.finish||null,{r:o.material.roughness,m:o.material.metalness});
      o.userData.origMat=o.material; o.material=m; made.push(m);
    });
  }
  h.texMats=made;
}
function refreshItemTex(){ for(const h of items.values()) if(h.doc.tex) applyItemTex(h); }

/* ---------------- texture brush (tool T) ---------------- */
const DEF_BRUSH=()=>({src:{builtin:"tile600"},sizeMm:null,rot:0,offMm:[0,0],tint:null});
let texBrush=DEF_BRUSH();
try{ const sv=JSON.parse(localStorage.getItem("villa.texbrush")||"null");
  if(sv&&sv.src&&(sv.src.id||Tex.builtins[sv.src.builtin])) texBrush={src:sv.src.id?{id:String(sv.src.id)}:{builtin:sv.src.builtin},sizeMm:Array.isArray(sv.sizeMm)?sv.sizeMm:null,rot:[0,90,180,270].includes(sv.rot)?sv.rot:0,offMm:Array.isArray(sv.offMm)?sv.offMm:[0,0],tint:HEXRE.test(sv.tint||"")?sv.tint:null}; }catch{}
const saveTexBrush=()=>{ try{ localStorage.setItem("villa.texbrush",JSON.stringify(texBrush)); }catch{} };
function brushTex(){ const o=Object.assign({},texBrush.src,{rot:texBrush.rot,offMm:texBrush.offMm.slice(),tint:texBrush.tint}); if(texBrush.sizeMm) o.sizeMm=texBrush.sizeMm.slice(); return o; }
function setBrushFrom(tx){ if(!tx||!Tex.exists(tx)) return; texBrush={src:srcOf(tx),sizeMm:tx.sizeMm?tx.sizeMm.slice():null,rot:tx.rot||0,offMm:(tx.offMm||[0,0]).slice(),tint:tx.tint||null}; saveTexBrush(); if(tool==="tex") renderTools(); }
function ensureBrush(){ if(!Tex.exists(texBrush.src)){ texBrush=DEF_BRUSH(); saveTexBrush(); } }
function cycleTex(d){ ensureBrush(); const L=texList(); let i=L.findIndex(s=>sameSrc(s,texBrush.src)); i=((i<0?0:i)+d+L.length)%L.length; texBrush.src=srcOf(L[i]); texBrush.sizeMm=null; saveTexBrush(); renderTools(); renderLib(); }
function scaleTex(f){ ensureBrush(); const s=texBrush.sizeMm||Tex.defaultSize(texBrush.src); texBrush.sizeMm=[clampMm(s[0]*f),clampMm(s[1]*f)]; saveTexBrush(); renderTools(); }
function rotTexBrush(){ texBrush.rot=(texBrush.rot+90)%360; saveTexBrush(); renderTools(); }

/* ---------------- new texture (photo) ---------------- */
async function newTexture(){
  if(!canWrite) return;
  if(document.pointerLockElement) document.exitPointerLock();
  const r=await TexDlg.open(); if(!r||!validTex(r.doc)) return;
  Tex.library.set(r.id,r.doc); libVer++;
  texBrush={src:{id:r.id},sizeMm:null,rot:0,offMm:[0,0],tint:null}; saveTexBrush();
  libTab="tex"; renderLib(); renderCtx(); renderTools();
  toast("Текстура «"+r.doc.name+"» добавлена и выбрана для кисти T.");
}

/* ---------------- texture window: tiled preview, size, rename / delete (editor, uploaded ones only) ---------------- */
let ti=null;
function closeTexInfo(){ if(!ti) return; const p=ti; ti=null; document.removeEventListener("keydown",p.onKey,true); p.root.remove(); p.opener?.focus?.(); }
function openTexInfo(src){
  closeTexInfo();
  const up=!!src.id, cur=()=>up?Tex.library.get(src.id):Tex.builtins[src.builtin]; if(!cur()) return;
  const h2=el("h2",{id:"tiTitle"}), info=el("div",{class:"meta mono"}), msg=el("div",{class:"meta",role:"status"}), tile=el("div",{class:"ti-tile"});
  const actions=el("div",{class:"row"}), confirmRow=el("div",{class:"row pv-confirm",hidden:""});
  const dlg=el("div",{class:"panel pv-dlg",role:"dialog","aria-modal":"true","aria-labelledby":"tiTitle"},
    el("div",{class:"pv-head"},h2,el("button",{class:"ghost",text:"✕","aria-label":"Закрыть",on:{click:closeTexInfo}})),tile,
    el("div",{class:"meta",text:"Так выглядит текстура, повторённая 3×3. Размер фрагмента — реальный размер одной картинки на поверхности."}),info,actions,confirmRow,msg);
  const root=el("div",{class:"pv-back",id:"texInfo"},dlg); document.body.append(root);
  const p=ti={root,opener:document.activeElement,upd,onKey:e=>{ if(e.key==="Escape"){ e.stopPropagation(); closeTexInfo(); } else if(e.key!=="Tab"&&!e.target.closest?.("input")) e.stopPropagation(); }};
  document.addEventListener("keydown",p.onKey,true);
  root.addEventListener("pointerdown",e=>{ if(e.target===root) closeTexInfo(); });
  function upd(){
    const d=cur(); if(!d){ closeTexInfo(); toast("Текстура удалена."); return; }
    h2.textContent=d.name; const s=d.sizeMm;
    info.textContent=s[0]+" × "+s[1]+" мм"+(up?(d.seamless?" · бесшовная":"")+(d.by?"":""):" · встроенная");
    const u=up?"/uploads/textures/"+d.file1024:Tex.builtinThumb(src.builtin);
    tile.style.backgroundImage="url("+u+")"; tile.style.backgroundSize=(100/3)+"% "+(up?(100/3*s[1]/s[0]):100/3)+"%";
  }
  upd();
  const useBtn=el("button",{class:"primary",text:"Выбрать для кисти T",on:{click:()=>{ texBrush={src:srcOf(src),sizeMm:null,rot:0,offMm:[0,0],tint:null}; saveTexBrush(); closeTexInfo(); if(tool!=="tex") setTool("tex"); else renderTools(); renderLib(); }}});
  if(canWrite) actions.append(useBtn);
  if(canWrite&&up){
    const ren=el("button",{text:"Название и размер"}), del=el("button",{class:"danger",text:"Удалить"});
    const back=()=>{ confirmRow.hidden=true; confirmRow.textContent=""; actions.hidden=false; };
    ren.onclick=()=>{
      const d=cur(), n=el("input",{type:"text",maxlength:"60","aria-label":"Название",class:"pv-name",value:d.name});
      const w=el("input",{type:"number",min:"5",max:"20000",value:String(d.sizeMm[0]),"aria-label":"Ширина, мм",class:"td-num"}), h=el("input",{type:"number",min:"5",max:"20000",value:String(d.sizeMm[1]),"aria-label":"Высота, мм",class:"td-num"});
      const ok=el("button",{class:"primary",text:"Сохранить"}), no=el("button",{class:"ghost",text:"Отмена",on:{click:back}});
      const save=async()=>{ const name=n.value.trim().slice(0,60), W=Math.round(+w.value), H=Math.round(+h.value);
        if(!name||!(W>=5&&W<=20000&&H>=5&&H<=20000)){ msg.textContent="Проверьте название и размер (5–20000 мм)."; return; }
        ok.disabled=true;
        try{ const r=await Sync.patchTexture(src.id,{name,sizeMm:[W,H]}); if(r?.doc&&validTex(r.doc)) Tex.library.set(src.id,r.doc); libVer++; upd(); back(); msg.textContent=""; renderLib(); }
        catch(e){ msg.textContent=e.code==="forbidden"?"Менять текстуры может только редактор.":"Не удалось сохранить."; ok.disabled=false; } };
      ok.onclick=save; n.onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); save(); } };
      actions.hidden=true; confirmRow.hidden=false; confirmRow.textContent=""; confirmRow.append(n,w,el("span",{class:"meta",text:"×"}),h,el("span",{class:"meta",text:"мм"}),ok,no); n.focus(); n.select();
    };
    del.onclick=()=>{
      const yes=el("button",{class:"danger primary-danger",text:"Да, удалить"}), no=el("button",{class:"ghost",text:"Отмена",on:{click:back}});
      actions.hidden=true; confirmRow.hidden=false; confirmRow.textContent="";
      confirmRow.append(el("span",{class:"pv-ask",text:"Удалить «"+cur().name+"»? Она пропадёт со всех поверхностей и предметов, где использована."}),yes,no); no.focus();
      yes.onclick=async()=>{ yes.disabled=true; try{ await Sync.removeTexture(src.id); closeTexInfo(); }catch(e){ msg.textContent=e.code==="forbidden"?"Удалять текстуры может только редактор.":"Не удалось удалить."; yes.disabled=false; } };
    };
    actions.append(ren,del);
  }
  (canWrite?useBtn:dlg.querySelector("button")).focus();
}

/* ---------------- hotkey tools ---------------- */
let tool=null, brushIdx=0, addIdx=0, lastAddRot=0;
const brush=["#f4f1ea","#d9d2c3","#8193b8","#5d5aa8","#9fb9a6","#2f4f3e","#c28a5a","#2b2926"];
let brushFinish=null, brushPickOpen=false, brushPicker=null;
try{ const sv=JSON.parse(localStorage.getItem("villa.brush")||"null"); if(sv&&Array.isArray(sv.c)) sv.c.slice(0,8).forEach((c,i)=>{ if(HEXRE.test(c)) brush[i]=c; }); if(sv&&["matte","satin","gloss","metal"].includes(sv.f)) brushFinish=sv.f; }catch{}
const saveBrush=()=>{ try{ localStorage.setItem("villa.brush",JSON.stringify({c:brush,f:brushFinish})); }catch{} };
function cycleScope(){ const i=SCOPES.findIndex(x=>x[0]===scope); scope=SCOPES[(i+1)%SCOPES.length][0]; renderTools(); renderCtx(); toast("Красим: "+SCOPES.find(x=>x[0]===scope)[1].toLowerCase()); }
const undo=[];
let undoKey=null, undoAt=0;
/* key: a burst of the same kind of change (clicking "+10 mm" five times) is one undo step */
function pushUndo(u,key){ const now=performance.now(); if(key&&undoKey===key&&undo.length&&now-undoAt<1500){ undoAt=now; return; } undo.push(u); if(undo.length>60) undo.shift(); undoKey=key||null; undoAt=now; }
function addList(){
  return [...Object.entries(LIB).map(([k,d])=>({doc:{type:"builtin",key:k,color:d.color},name:d.name})),
          ...[...models.entries()].sort((a,b)=>(b[1].at||0)-(a[1].at||0)).map(([id,m])=>({doc:{type:"model",model:id},name:m.name||"Модель"}))];
}
function setTool(t){
  if(t&&!canWrite){ toast("Только просмотр: менять сцену нельзя."); return; }
  if(tool===t) t=null;
  if(placing) cancelPlacing(true);
  tool=t; select(null);
  if(t==="add") startAdd();
  renderTools(); updateHint(); renderPlaceBar();
}
function startAdd(){
  if(tool!=="add") return; const L=addList(); if(!L.length) return;
  addIdx=((addIdx%L.length)+L.length)%L.length;
  startPlacing({doc:Object.assign({r:lastAddRot,s:1},L[addIdx].doc)});
  const g=placing&&placing.obj; if(g) g.rotation.y=lastAddRot;
}
function cycle(d){
  if(tool==="paint"){ brushIdx=(brushIdx+d+brush.length)%brush.length; renderTools(); }
  else if(tool==="add"){ addIdx+=d; if(placing) cancelPlacing(true); startAdd(); renderTools(); }
  else if(tool==="tex") cycleTex(d);
}
function aimHit(){ return pickAt(document.pointerLockElement===renderer.domElement); }
function useTool(){
  const h=aimHit();
  if(tool==="paint"){
    if(!h) return; const iid=itemIdOf(h.object), hex=brush[brushIdx];
    if(iid){ const it=items.get(iid); if(it?.doc.type==="builtin"){ pushUndo({t:"item",id:iid,prev:it.doc}); commitItem(iid,brushFinish?{color:hex,finish:brushFinish}:{color:hex}); } else toast("Загруженную модель перекрасить нельзя."); }
    else if(h.object.userData.matName){ const n=h.object.userData.matName, t=targetFor(scope,h.object,n); pushUndo({t:"target",tgt:t,prev:snap(t)}); setTarget(t,hex,brushFinish||undefined,true); P_addRecent(hex); toast(t.label+" → "+hex.toUpperCase()); }
  } else if(tool==="tex"){
    if(!h) return; ensureBrush(); const tx=brushTex(), iid=itemIdOf(h.object);
    if(iid){ const it=items.get(iid); if(!it) return; pushUndo({t:"item",id:iid,prev:it.doc}); commitItem(iid,{tex:tx}); toast("«"+Tex.nameOf(tx)+"» наложена на предмет"); }
    else if(h.object.userData.matName){ const t=targetFor(scope,h.object,h.object.userData.matName); pushUndo({t:"target",tgt:t,prev:snap(t)}); setTex(t,tx,true); toast(t.label+" ← «"+Tex.nameOf(tx)+"»"); }
  } else if(tool==="move"){
    if(placing) return; const iid=h&&itemIdOf(h.object);
    if(iid) startPlacing({moveId:iid}); else toast("Наведите прицел на предмет.");
  }
}
function grab(){
  if(placing&&placing.moveId){ dropPlacing(); return; }
  const h=aimHit(), iid=h&&itemIdOf(h.object);
  if(iid){ if(tool!=="move"){ tool="move"; renderTools(); } startPlacing({moveId:iid}); }
  else setTool("move");
}
function rotateTarget(dir){
  const da=dir*Math.PI/2;
  if(placing){ if(placing.temp){ placing.doc.r=((placing.doc.r||0)+da); lastAddRot=placing.doc.r; placing.obj.rotation.y=placing.doc.r; } else { const it=items.get(placing.moveId); if(it){ it.obj.rotation.y+=da; placing.rot=(placing.rot||0)+da; } } return; }
  const h=aimHit(), iid=(h&&itemIdOf(h.object))||(selected?.kind==="item"&&selected.id);
  if(iid){ pushUndo({t:"item",id:iid,prev:items.get(iid).doc}); rotateItem(iid,da); }
}
function deleteTarget(){
  const h=aimHit(), iid=(h&&itemIdOf(h.object))||(selected?.kind==="item"&&selected.id);
  if(!iid){ toast("Наведите прицел на предмет."); return; }
  pushUndo({t:"item",id:iid,prev:items.get(iid).doc}); removeItem(iid); toast("Удалено. Ctrl+Z — вернуть.");
}
const P_addRecent=hex=>Picker.addRecent(hex);
function pipette(){
  const h=aimHit(); if(!h) return; const iid=itemIdOf(h.object); let hex=null, fin=null, tx=null;
  if(iid){ const d=items.get(iid)?.doc; tx=d?.tex||null; if(d?.type==="builtin"){ hex=d.color||LIB[d.key]?.color; fin=d.finish||null; } }
  else if(h.object.userData.matName){ const lk=lookOf(h.object); tx=lk.tex; hex=lk.color; fin=lk.finish; }
  if(tx&&Tex.exists(tx)){ setBrushFrom(tx); if(tool!=="tex") setTool("tex"); else renderTools(); toast("Текстура взята: «"+Tex.nameOf(tx)+"»"); return; }
  if(!hex) return; brush[brushIdx]=hex; brushFinish=fin; saveBrush(); if(tool!=="paint") setTool("paint"); else renderTools(); toast("Цвет взят: "+hex.toUpperCase());
}
function doUndo(){
  const u=undo.pop(); if(!u){ toast("Нечего отменять."); return; }
  if(u.t==="target"){ if(u.prev) setTarget(u.tgt,u.prev.color,u.prev.finish,true,u.prev.tex); else resetTarget(u.tgt,true); }
  else if(u.t==="multi"){
    const put=[], gone=[];
    for(const o of u.ops){ if(o.prev){ const d=Object.assign({},o.prev); syncItem(o.id,d); put.push([o.id,d]); } else if(items.has(o.id)){ gone.push(o.id); } }
    if(gone.length){ for(const g of gone) selIds.delete(g); const keep=[...selIds]; gone.forEach(dropItem); if(!put.length) { if(keep.length) selectItems(keep); else select(null); } sendOk(Sync.removeItems(gone)); }
    if(put.length){ sendOk(Sync.commitItems(put)); selectItems(put.map(x=>x[0])); }
  }
  else if(u.prev){ const d=Object.assign({},u.prev); syncItem(u.id,d); sendOk(Sync.commitItem(u.id,d)); }
  else removeItem(u.id);
  toast("Отменено.");
}
function syncBrushUI(){
  document.querySelectorAll("#tools .bsw").forEach((b,i)=>{ b.style.background=brush[i]; b.title=brush[i]; });
  const cur=document.querySelector("#tools .cur"); if(cur) cur.style.background=brush[brushIdx];
}
function renderBrushPick(){
  const box=$("brushPick"); const show=canWrite&&tool==="paint"&&brushPickOpen; box.hidden=!show; if(!show) return;
  if(!brushPicker){
    brushPicker=Picker.create({color:brush[brushIdx],finish:brushFinish,showFinish:true,
      onInput:hex=>{ brush[brushIdx]=hex; syncBrushUI(); },
      onChange:({color,finish})=>{ brush[brushIdx]=color; brushFinish=finish; saveBrush(); syncBrushUI(); renderToolsMeta(); }});
    box.append(brushPicker.el);
  }
  brushPicker.set(brush[brushIdx],brushFinish);
}
function renderToolsMeta(){
  const m=document.getElementById("brushMeta"); if(!m) return;
  const fl=Picker.FINISHES.find(f=>f[0]===brushFinish)[1];
  m.textContent="Красим: "+SCOPES.find(x=>x[0]===scope)[1].toLowerCase()+" · фактура: "+(brushFinish?fl.toLowerCase():"не менять")+". Клик по стене, полу или предмету — залить. 1–8 или колесо — сменить цвет, V — область.";
}
function renderTools(){
  const T=$("tools"); T.textContent=""; T.hidden=!canWrite;
  if(!canWrite){ $("brushPick").hidden=true; return; }
  const bar=el("div",{class:"bar"});
  const tb=(key,label,on,act)=>{ const b=el("button",{"aria-pressed":String(!!on),title:label+" ("+key+")"},el("kbd",{text:key}),el("span",{class:"nm",text:label})); b.onclick=act; return b; };
  const cur=el("span",{class:"cur"}); cur.style.background=brush[brushIdx];
  const pb=tb("Q","Заливка",tool==="paint",()=>setTool("paint")); pb.append(cur);
  ensureBrush(); const tbtn=tb("T","Текстура",tool==="tex",()=>setTool("tex")), tp=el("span",{class:"tprev"}), tu=Tex.thumbOf(texBrush.src); if(tu) tp.style.backgroundImage="url("+tu+")"; tbtn.append(tp);
  bar.append(pb, tbtn, tb("E","Добавить",tool==="add",()=>setTool("add")), tb("G","Переместить",tool==="move",()=>grab()),
    tb("R","Повернуть",false,()=>rotateTarget(1)), tb("X","Удалить",false,()=>deleteTarget()),
    tb("C","Пипетка",false,()=>pipette()), tb("V",SCOPES.find(x=>x[0]===scope)[1],false,()=>cycleScope()), tb("Z","Отменить",false,()=>doUndo()));
  T.append(bar);
  if(tool==="paint"){
    const row=el("div",{class:"brush"});
    brush.forEach((c,i)=>{ const b=el("button",{class:"bsw","aria-pressed":String(i===brushIdx),"aria-label":"Цвет "+(i+1)+" "+c,title:c}); b.style.background=c; b.append(el("span",{text:String(i+1)})); b.onclick=()=>{brushIdx=i;renderTools();}; row.append(b); });
    row.append(el("button",{text:"Цвет…","aria-pressed":String(brushPickOpen),title:"Палитра для выбранного слота",on:{click:()=>{ brushPickOpen=!brushPickOpen; renderTools(); }}}));
    T.append(row);
    T.append(el("div",{class:"meta",id:"brushMeta"})); renderToolsMeta();
  } else if(tool==="tex"){
    const sz=texBrush.sizeMm||Tex.defaultSize(texBrush.src), big=el("span",{class:"tprev"}), bu=Tex.thumbOf(texBrush.src); if(bu) big.style.backgroundImage="url("+bu+")";
    T.append(el("div",{class:"trow"},
      el("button",{text:"‹",title:"Предыдущая ( [ или колесо )",on:{click:()=>cycleTex(-1)}}), big,
      el("b",{text:Tex.nameOf(texBrush.src),style:"min-width:130px;text-align:center"}),
      el("button",{text:"›",title:"Следующая ( ] или колесо )",on:{click:()=>cycleTex(1)}}),
      el("span",{class:"mono meta",text:sz[0]+"×"+sz[1]+" мм · "+texBrush.rot+"°"}),
      el("button",{text:"−",title:"Мельче (Shift+колесо)","aria-label":"Масштаб меньше",on:{click:()=>scaleTex(1/1.1)}}),
      el("button",{text:"+",title:"Крупнее (Shift+колесо)","aria-label":"Масштаб больше",on:{click:()=>scaleTex(1.1)}}),
      el("button",{text:"⟳ 90°",title:"Повернуть текстуру (R)",on:{click:rotTexBrush}})));
    T.append(el("div",{class:"meta",text:"Красим: "+SCOPES.find(x=>x[0]===scope)[1].toLowerCase()+". Клик по стене, полу или предмету — наложить. [ ] или колесо (в прогулке) — сменить, Shift+колесо — масштаб, R — повернуть, V — область, C — взять с поверхности."}));
  } else if(tool==="add"){
    const L=addList(); const cur=L[((addIdx%L.length)+L.length)%L.length];
    T.append(el("div",{class:"brush"},
      el("button",{text:"‹",title:"Предыдущий ( [ или колесо )",on:{click:()=>cycle(-1)}}),
      el("b",{text:cur?cur.name:"—",style:"min-width:160px;text-align:center"}),
      el("button",{text:"›",title:"Следующий ( ] или колесо )",on:{click:()=>cycle(1)}})));
    T.append(el("div",{class:"meta",text:"Клик — поставить, можно ставить подряд. Колесо — другой предмет, R — повернуть, Esc — выйти."}));
  } else if(tool==="move"){
    T.append(el("div",{class:"meta",text:placing?"Предмет у вас в руках: клик или G — поставить, R — повернуть.":"Наведите прицел на предмет и кликните или нажмите G."}));
  }
  renderBrushPick();
}

/* ---------------- people (presence over websocket) ---------------- */
const peerViews=new Map(); // peer -> {group, tag}
let lastSent=0;
let presTimer=0;
function sendPresence(force){
  const now=performance.now();
  if(!force&&now-lastSent<120){ if(!presTimer) presTimer=setTimeout(()=>{ presTimer=0; sendPresence(true); },125-(now-lastSent)); return; }   // the last state of a burst still goes out
  lastSent=now;
  const pr={mode};
  if(mode==="walk"){ pr.p=walk.pos.toArray().map(r2); pr.yaw=r2(walk.yaw); }
  else { pr.t=orbit.target.toArray().map(r2); }
  pr.sel=selected?(selected.kind==="item"?"item:"+selected.id:"mat:"+keyOf(selected.name)):null;
  const drag=ptr.drag?items.get(ptr.drag.id):(placing&&placing.moveId?items.get(placing.moveId):null);
  pr.drag=drag?{id:ptr.drag?.id||placing.moveId,p:drag.obj.position.toArray().map(r2)}:null;
  pr.xf=xf?xf.live():null;
  Sync.presence(pr);
}
function avatar(color){
  const g=new THREE.Group(); const m=new THREE.MeshStandardMaterial({roughness:.6}); m.color.setStyle(color).convertSRGBToLinear();
  const body=new THREE.Mesh(new THREE.CylinderGeometry(.2,.24,1.2,16),m); body.position.y=.6; g.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.17,16,12),m); head.position.y=1.42; g.add(head);
  const nose=new THREE.Mesh(new THREE.BoxGeometry(.08,.06,.14),new THREE.MeshStandardMaterial({color:0xffffff})); nose.position.set(0,1.45,-.16); g.add(nose);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.35,.45,32),new THREE.MeshBasicMaterial({color:m.color,side:THREE.DoubleSide,transparent:true,opacity:.8}));
  ring.rotation.x=-Math.PI/2; ring.position.y=.02; g.add(ring); g.userData.ring=ring; g.userData.body=[body,head,nose];
  return g;
}
let liveIds=new Set();       // items currently driven by somebody else's live gesture
function renderPeers(){
  const peers=Sync.peers(); const seen=new Set(), liveNow=new Set();
  for(const p of peers){
    if(p.sameTab) continue; const pr=p.presence||{}; seen.add(p.peer);
    let v=peerViews.get(p.peer);
    const color=HEXRE.test(p.color||"")?p.color:"#888888";
    if(!v||v.color!==color){ if(v){scene.remove(v.group);v.tag.remove();} v={group:avatar(color),tag:el("div",{class:"tag"}),color}; v.tag.style.background=color; document.body.append(v.tag); scene.add(v.group); peerViews.set(p.peer,v); }
    const walking=pr.mode==="walk"&&Array.isArray(pr.p), at=walking?pr.p:(Array.isArray(pr.t)?pr.t:null);
    if(!at){ v.group.visible=false; v.tag.hidden=true; continue; }
    v.group.visible=true; v.group.position.set(+at[0]||0,walking?(+at[1]||1.6)-EYE:(+at[1]||0),+at[2]||0); v.group.rotation.y=+pr.yaw||0;
    v.group.userData.body.forEach(b=>b.visible=walking);
    v.tag.textContent=(p.name||"Гость")+(walking?"":" · смотрит сюда");
    const wp=v.group.position.clone(); wp.y+=walking?1.85:0.4; wp.project(camera);
    const vis=wp.z<1&&Math.abs(wp.x)<1.2&&Math.abs(wp.y)<1.2;
    v.tag.hidden=!vis; if(vis){ v.tag.style.left=((wp.x+1)/2*innerWidth)+"px"; v.tag.style.top=((1-wp.y)/2*innerHeight)+"px"; }
    if(pr.drag&&typeof pr.drag.id==="string"&&Array.isArray(pr.drag.p)){ const it=items.get(pr.drag.id); if(it&&!localBusy(pr.drag.id)){ it.obj.position.set(+pr.drag.p[0]||0,+pr.drag.p[1]||0,+pr.drag.p[2]||0); liveNow.add(pr.drag.id); } }
    if(Array.isArray(pr.xf)) for(const e of pr.xf){
      const it=e&&items.get(e.id); if(!it||localBusy(e.id)||!Array.isArray(e.p)||!Array.isArray(e.r)||!Array.isArray(e.s)) continue;
      it.obj.position.set(+e.p[0]||0,+e.p[1]||0,+e.p[2]||0); it.obj.rotation.set(+e.r[0]||0,+e.r[1]||0,+e.r[2]||0,"YXZ"); it.obj.scale.set(+e.s[0]||1,+e.s[1]||1,+e.s[2]||1); liveNow.add(e.id);
    }
  }
  for(const id of liveIds) if(!liveNow.has(id)){ const it=items.get(id); if(it&&!localBusy(id)) applyObjXf(it.obj,it.doc); }   // the other side cancelled or finished: back to the saved state
  liveIds=liveNow;
  if(selIds.size&&hlBoxes.length&&liveNow.size) refreshHl();
  for(const[k,v]of peerViews) if(!seen.has(k)){ scene.remove(v.group); v.tag.remove(); peerViews.delete(k); }
}
function renderPeople(){
  const box=$("people"); const peers=Sync.peers();
  box.textContent=""; box.hidden=!peers.length; if(!peers.length) return;
  box.append(el("span",{class:"label",text:"Здесь "+peers.length}));
  const order=[...peers].sort((a,b)=>(b.sameTab?1:0)-(a.sameTab?1:0));
  for(const p of order){
    const chip=el("button",{class:"chip"+(p.sameTab?" me":""),title:p.sameTab?"Это вы. Нажмите, чтобы сменить имя":"Перейти к участнику"});
    const d=el("span",{class:"dot"}); d.style.background=HEXRE.test(p.color||"")?p.color:"#888"; chip.append(d);
    chip.append(document.createTextNode(p.sameTab?(p.name||"Вы")+" (вы)":(p.name||"Гость")));
    chip.onclick=p.sameTab?renameMe:()=>goTo(p);
    box.append(chip);
  }
}
function goTo(p){
  const pr=p.presence||{};
  if(pr.mode==="walk"&&Array.isArray(pr.p)){
    setMode("walk"); walk.yaw=+pr.yaw||0; walk.pos.set((+pr.p[0]||0)+Math.sin(walk.yaw)*1.2,(+pr.p[1]||1.6),(+pr.p[2]||0)+Math.cos(walk.yaw)*1.2);
  } else if(Array.isArray(pr.t)){ setMode("orbit"); const d=camera.position.clone().sub(orbit.target); orbit.target.set(+pr.t[0]||0,+pr.t[1]||0,+pr.t[2]||0); camera.position.copy(orbit.target).add(d); }
}

/* ---------------- name prompt ---------------- */
function askName(title,initial,cancelable){
  return new Promise(res=>{
    const w=$("welcome"), f=$("welcomeForm"), inp=$("nameIn");
    $("welcomeTitle").textContent=title; inp.value=initial||""; $("nameCancel").hidden=!cancelable; w.hidden=false; setTimeout(()=>inp.focus(),0);
    if(document.pointerLockElement) document.exitPointerLock();
    const done=v=>{ w.hidden=true; f.onsubmit=null; $("nameCancel").onclick=null; inp.onkeydown=null; res(v); };
    f.onsubmit=e=>{ e.preventDefault(); const v=inp.value.trim().slice(0,60); if(v) done(v); };
    $("nameCancel").onclick=()=>done(null);
    inp.onkeydown=e=>{ if(e.key==="Escape"&&cancelable) done(null); };
  });
}
async function renameMe(){ const n=await askName("Изменить имя",Sync.profile.name,true); if(n) Sync.setName(n); }

/* ---------------- sync wiring ---------------- */
function validPaint(v){ return v&&typeof v.name==="string"&&HEXRE.test(v.color||""); }
function validItem(v){ return v&&(v.type==="builtin"||v.type==="model"); }
function validTex(v){ return v&&typeof v.file==="string"&&/^[a-f0-9]{16}\.webp$/.test(v.file)&&typeof v.thumb==="string"&&Array.isArray(v.sizeMm)&&v.sizeMm.length===2; }
function validFolder(v){ return v&&typeof v.name==="string"&&(v.parent===null||typeof v.parent==="string"); }
function validModel(v){ return v&&typeof v.file==="string"&&/^[a-f0-9]{16}\.glb$/.test(v.file); }
function applyState(s){
  Tex.library.clear(); for(const[k,v]of Object.entries(s.textures||{})) if(validTex(v)) Tex.library.set(k,v); libVer++;
  if(s.house) onHouseVersion(s.house.v,houseShown);
  paint.clear(); for(const[k,v]of Object.entries(s.paint||{})) if(validPaint(v)) paint.set(k,v);
  parts.clear(); for(const[k,v]of Object.entries(s.parts||{})) if(HEXRE.test(v?.color||"")&&typeof v.key==="string") parts.set(k,v);
  models.clear(); modelCache.clear(); modelReady.clear(); for(const[k,v]of Object.entries(s.models||{})) if(validModel(v)) models.set(k,v);
  folders.clear(); for(const[k,v]of Object.entries(s.folders||{})) if(validFolder(v)) folders.set(k,v);
  if(libFolder&&!folders.has(libFolder)) libFolder=null;
  const ids=new Set(Object.keys(s.items||{}));
  for(const id of [...items.keys()]) if(!ids.has(id)) dropItem(id);
  for(const[id,v]of Object.entries(s.items||{})) if(validItem(v)) syncItem(id,v);
  Picker.setProject(s.swatches?.colors||[],canWrite);
  applyAllPaint(); renderCtx(true); renderLib(); renderTools(); pv?.upd();
}
/* ---------------- house model update (editor) ---------------- */
const HOUSE_ERR={forbidden:"Менять модель дома может только редактор.",too_large:"Файл больше 200 МБ. Уменьшите модель (например, в Blender) и попробуйте снова.",
  not_glb:"Это не подходящий файл: нужен целый .glb (glTF 2.0).",network:"Нет связи с сервером. Проверьте интернет и повторите.",not_found:"Эта версия больше недоступна.",upload_failed:"Не удалось загрузить файл. Попробуйте ещё раз."};
const houseErr=e=>HOUSE_ERR[e&&e.code]||"Не удалось обновить модель дома ("+((e&&e.message)||"ошибка")+").";
function houseProgress(txt,frac){ const b=$("houseUp"); b.hidden=!txt; if(!txt) return; $("houseUpTxt").textContent=txt; const p=$("houseUpBar"); p.hidden=frac==null; if(frac!=null) p.value=Math.round(frac*100); }
$("bHouse").onclick=()=>{ if(canWrite) $("houseIn").click(); };
$("houseIn").onchange=async e=>{
  const f=e.target.files[0]; e.target.value=""; if(!f) return;
  if(!/\.glb$/i.test(f.name)){ toast("Нужен файл в формате .glb"); return; }
  if(f.size>200*1048576){ toast(HOUSE_ERR.too_large); return; }
  if(f.size>30*1048576){ if(!await bigWarn(BIG_TEXT+" Модель дома будет заменена для всех участников; предыдущая версия сохранится в истории. Размер файла: "+mbOf(f.size)+".")) return; }
  else if(!confirm("Заменить модель дома для всех участников? Предыдущая версия сохранится в истории.")) return;
  $("bHouse").disabled=true;
  try{
    houseProgress("Проверяю файл…");
    const head=new Uint8Array(await f.slice(0,12).arrayBuffer());
    if(String.fromCharCode(...head.slice(0,4))!=="glTF") throw Object.assign(new Error("not_glb"),{code:"not_glb"});
    if(f.size<=BIG_WARN){ const gl=await new Promise((res,rej)=>f.arrayBuffer().then(buf=>loader.parse(buf,"",res,rej),rej)); disposeHouse(gl.scene); } // must parse, otherwise nobody gets it (big files: the server checks the header and size)
    houseProgress("Загружаю на сервер… 0%",0);
    await Sync.uploadHouse(f,upProgressCb("Загружаю на сервер…",f.size));
    houseProgress("");
    if(!$("houseHist").hidden) renderHist();
  }catch(err){ houseProgress(""); toast(houseErr(err)); console.warn(err); }
  finally{ $("bHouse").disabled=false; }
};
function fmtDate(t){ return new Date(t).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}); }
async function renderHist(){
  const box=$("houseHist"); box.hidden=false; $("bHist").setAttribute("aria-expanded","true");
  box.textContent=""; box.append(el("span",{class:"label",text:"История версий модели дома"}),el("span",{class:"meta",text:"Загружаю…"}));
  let info; try{ info=await Sync.houseInfo(); }catch(e){ box.textContent=""; box.append(el("span",{class:"meta",text:"Не удалось получить историю."}),el("button",{class:"ghost",text:"Закрыть",on:{click:closeHist}})); return; }
  box.textContent=""; box.append(el("span",{class:"label",text:"История версий модели дома"}),
    el("div",{class:"meta mono",text:"Сейчас: версия "+info.v+", "+fmtDate(info.at)}));
  const h=info.history||[];
  if(!h.length) box.append(el("span",{class:"meta",text:"Пока нет прошлых версий."}));
  for(const x of h){
    box.append(el("div",{class:"hrow"},el("span",{class:"mono",text:fmtDate(x.at)+" · "+(x.size/1048576).toFixed(1)+" МБ"}),
      el("button",{text:"Вернуть",on:{click:async ev=>{
        if(!confirm("Вернуть версию от "+fmtDate(x.at)+"? Текущая сохранится в истории.")) return;
        ev.target.disabled=true;
        try{ await Sync.restoreHouse(x.name); renderHist(); }catch(err){ toast(houseErr(err)); ev.target.disabled=false; }
      }}})));
  }
  box.append(el("button",{class:"ghost",text:"Закрыть",on:{click:closeHist}}));
}
function closeHist(){ $("houseHist").hidden=true; $("bHist").setAttribute("aria-expanded","false"); }
$("bHist").onclick=()=>{ if(!canWrite) return; if($("houseHist").hidden) renderHist(); else closeHist(); };

function applyRole(){
  $("bHouse").hidden=!canWrite; $("bHist").hidden=!canWrite; if(!canWrite) closeHist();
  $("viewBadge").hidden=canWrite;
  Picker.setProject(Picker.project,canWrite);
  renderLib(); renderTools(); renderCtx();
}
function boot(){
  myId=Sync.profile.uid; myColor=Sync.profile.color;
  Picker.onProject=colors=>{ Picker.setProject(colors); sendOk(Sync.setSwatches(colors)); };
  applyRole();
  Sync.on("welcome",()=>{ canWrite=Sync.canEdit; applyRole(); });
  Sync.on("state",applyState);
  Sync.on("status",ok=>banner(ok?"":"Нет связи с сервером. Переподключаюсь…"));
  Sync.on("error",m=>{ toast(m.code==="forbidden"?"Режим просмотра: менять сцену нельзя.":"Сервер не принял изменение."); });
  Sync.on("peers",()=>renderPeople());
  Sync.on("paint.set",m=>{ if(validPaint(m.doc)){ paint.set(m.id,m.doc); applyAllPaint(); renderCtx(true); } });
  Sync.on("paint.reset",m=>{ paint.delete(m.id); applyAllPaint(); renderCtx(true); });
  Sync.on("part.set",m=>{ if(HEXRE.test(m.doc?.color||"")&&typeof m.doc.key==="string"){ parts.set(m.id,m.doc); applyAllPaint(); renderCtx(true); } });
  Sync.on("part.reset",m=>{ parts.delete(m.id); applyAllPaint(); renderCtx(true); });
  Sync.on("item.set",m=>{ if(validItem(m.doc)) syncItem(m.id,m.doc); });
  Sync.on("item.delete",m=>dropItem(m.id));
  Sync.on("items.set",m=>{ for(const e of m.items||[]) if(e&&validItem(e.doc)) syncItem(e.id,e.doc); });
  Sync.on("items.delete",m=>{ for(const id of m.ids||[]) dropItem(id); });
  Sync.on("folder.added",m=>{ if(validFolder(m.doc)){ folders.set(m.id,m.doc); renderLib(); } });
  Sync.on("folder.updated",m=>{ if(validFolder(m.doc)){ folders.set(m.id,m.doc); renderLib(); } });
  Sync.on("folder.deleted",m=>{ folders.delete(m.id); if(libFolder===m.id) libFolder=null; for(const id of [...libSel]) if(!models.has(id)) libSel.delete(id); renderLib(); });
  Sync.on("model.added",m=>{ if(validModel(m.doc)){ models.set(m.id,m.doc); renderLib(); } });
  Sync.on("model.updated",m=>{ if(validModel(m.doc)&&models.has(m.id)){ const was=folderOf(models.get(m.id)); models.set(m.id,m.doc); if(folderOf(m.doc)!==was) scheduleLib(); else cards.get("up:"+m.id)?.patch(); pv?.upd(); } });
  Sync.on("model.deleted",m=>{ models.delete(m.id); modelCache.delete(m.id); modelReady.delete(m.id); renderLib(); pv?.upd(); });
  Sync.on("house.updated",m=>onHouseVersion(m.v,true));
  Sync.on("texture.added",m=>{ if(validTex(m.doc)){ Tex.library.set(m.id,m.doc); libVer++; renderLib(); renderCtx(); renderTools(); } });
  Sync.on("texture.updated",m=>{ if(validTex(m.doc)&&Tex.library.has(m.id)){ Tex.library.set(m.id,m.doc); libVer++; applyAllPaint(); refreshItemTex(); renderLib(); renderCtx(); renderTools(); ti?.upd(); } });
  Sync.on("texture.removed",m=>{ Tex.library.delete(m.id); Tex.forget(m.id); libVer++; applyAllPaint(); refreshItemTex(); renderLib(); renderCtx(); renderTools(); ti?.upd(); });
  Sync.on("swatches.set",m=>Picker.setProject(m.doc?.colors||[]));
  const go=()=>Sync.connect();
  if(Sync.profile.name) go();
  else askName("Как вас зовут?","",false).then(n=>{ Sync.setName(n); go(); });
}
/* read-only snapshot for the Playwright test (tests/house.e2e.js) */
window.__villa=()=>({modelReady:modelReady.size>0,preview:pv?{az:pv.controls.getAzimuthalAngle(),polar:pv.controls.getPolarAngle(),loaded:!!pv.obj}:null,
  cards:[...cards.keys()],houseV,shownV,mode,items:items.size,geoms:renderer.info.memory.geometries,walkY:walk.pos.y,
  colors:Object.fromEntries([...materials].map(([n,m])=>[n,hexOf(m.mat.color)])),ownCount:meshes.filter(o=>o.userData.ownMat).length,
  tool,uvTex:[...items.values()].filter(h=>h.texMats&&h.texMats.some(m=>m.userData.mapClone)).length,texLib:Tex.library.size,texMats:houseTex.size,texCache:Tex.cacheSize(),texItems:texItems.size,texBrush});
/* test hooks (read only): what a mesh wears, and where a world point lands on screen */
window.__villaTex=()=>({meshes:meshes.map(o=>({box:(b=>[b.min.toArray(),b.max.toArray()])(new THREE.Box3().setFromObject(o)),name:o.name,mat:o.userData.matName,tex:!!(o.material.userData&&o.material.userData.tp),size:o.material.userData?.tp?o.material.userData.tp.tpSize.value.toArray():null,rot:o.material.userData?.tp?o.material.userData.tp.tpRot.value.elements.slice(0,2):null})),
  project:(x,y,z)=>{ const v=new THREE.Vector3(x,y,z).project(camera); const r=renderer.domElement.getBoundingClientRect(); return [r.left+(v.x+1)/2*r.width,r.top+(1-v.y)/2*r.height]; }});
/* test hooks (read only): the live transform of an item and where a gizmo handle is on screen */
window.__villaItem=id=>{ const h=items.get(id); if(!h) return null; const o=h.obj; return {doc:h.doc,p:o.position.toArray(),r:[o.rotation.x,o.rotation.y,o.rotation.z],s:o.scale.toArray(),sel:[...selIds],folder:libFolder}; };
window.__villaCam=()=>({pos:camera.position.toArray(),fov:camera.fov});
window.__villaGizmo=()=>xf.debug();
window.__villaSelectItems=ids=>selectItems(ids);
window.__villaScreen=(x,y,z)=>{ const v=new THREE.Vector3(x,y,z).project(camera); const r=renderer.domElement.getBoundingClientRect(); return [r.left+(v.x+1)/2*r.width,r.top+(1-v.y)/2*r.height]; };
window.__villaView=(pos,target)=>{ if(mode!=="orbit") return; camera.position.set(...pos); orbit.target.set(...target); orbit.update(); };
window.__villaSelect=(name,i)=>{ const mesh=meshes.find(o=>o.userData.matName===name&&(i==null||o.name===i)); if(mesh) select({kind:"mat",name,mesh}); return !!mesh; };
xf=Xform.create({
  scene,camera,renderer,orbit,items,selIds,el,
  mode:()=>mode,canWrite:()=>canWrite,tool:()=>tool,placing:()=>placing,pv:()=>pv,house:()=>house,me:()=>myId,
  setMode,select,selectItems,syncItem,pushUndo,toast,sendOk,rid,updateHint,refreshHl,
  renderCtx:soft=>renderCtx(soft),sendPresence:force=>sendPresence(force),
  commitMany:list=>Sync.commitItems(list),removeMany,
  floorHit:floorHitAt,isVisible,isPass:o=>PASS.has(o.userData.matName),
  movePlacing:liftPlacing,
  walkState:()=>({pos:walk.pos.clone(),yaw:walk.yaw,pitch:walk.pitch}),
  restoreWalk:r=>{ walk.pos.copy(r.pos); walk.yaw=r.yaw; walk.pitch=r.pitch; },
  switching:v=>{ tabSwitch=v; },switchingNow:()=>tabSwitch,
});
boot();
updateHint(); renderLib(); renderTools();
})();
