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
let mode="orbit", roofShown=false, selected=null, placing=null, canWrite=false;
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
loader.load("/models/villa.glb",gltf=>{
  house=gltf.scene; scene.add(house);
  house.traverse(o=>{
    if(!o.isMesh) return;
    const m=o.material, name=m.name||"Без названия";
    if(!materials.has(name)) materials.set(name,{mat:m,orig:hexOf(m.color),o:{r:m.roughness,m:m.metalness}});
    if(m.transparent){ m.depthWrite=false; o.renderOrder=2; }
    o.castShadow=!m.transparent; o.receiveShadow=true;
    o.userData.matName=name; o.userData.baseMat=m; meshes.push(o);
    if(!PASS.has(name)) solids.push(o);
    if(!["Стекло","Стекло — матовая полоса","Навес — стекло","Растения"].includes(name)) floorsAll.push(o);
    const bb=new THREE.Box3().setFromObject(o);
    if(bb.min.y>2.12 && !/^Сала/.test(o.name) && name!=="Море") roofParts.push(o);
  });
  applyRoof(); applyAllPaint();
  $("loading").remove();
  setMode("orbit",true);
},undefined,err=>{ $("loading").textContent="Не удалось загрузить модель. Обновите страницу."; console.error(err); });

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
  else if(c==="KeyR") rotateTarget(e.shiftKey?-1:1);
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
function floorPoint(useCenter){
  if(useCenter) ndc.set(0,0);
  ray.setFromCamera(ndc,camera); ray.far=200;
  const hits=ray.intersectObjects(house?[house]:[],true).filter(h=>isVisible(h.object)&&h.face&&h.face.normal.y>0.6&&!PASS.has(h.object.userData.matName)||(h.object.userData.matName==="Газон"));
  if(hits[0]) return hits[0].point;
  const p=new THREE.Vector3(); return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),p)?p:null;
}
renderer.domElement.addEventListener("pointerdown",e=>{
  renderer.domElement.focus();
  setNdc(e); ptr.down={x:e.clientX,y:e.clientY,t:performance.now(),id:e.pointerId};
  if(placing) return;
  if(mode==="orbit" && canWrite && !tool && !(e.pointerType==="touch"&&!e.isPrimary)){
    const h=pickAt(false); const iid=h&&itemIdOf(h.object);
    if(iid){ orbit.enabled=false; ptr.drag={id:iid,start:items.get(iid).obj.position.clone(),moved:false}; select({kind:"item",id:iid}); }
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
    if(dr.moved){ const it=items.get(dr.id); if(it) commitItem(dr.id,{x:r2(it.obj.position.x),y:r2(it.obj.position.y),z:r2(it.obj.position.z)}); sendPresence(true); }
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
renderer.domElement.addEventListener("wheel",e=>{ if(mode==="walk"&&(tool==="paint"||tool==="add")){ e.preventDefault(); cycle(e.deltaY>0?1:-1); } },{passive:false});
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
  }
}

/* ---------------- selection panel ---------------- */
function select(s){
  selected=s; renderCtx(); highlight(); sendPresence(true);
}
let hlBox=null;
function highlight(){
  if(hlBox){ scene.remove(hlBox); hlBox=null; }
  if(selected?.kind==="item"){ const it=items.get(selected.id); if(it){ hlBox=new THREE.BoxHelper(it.obj,0x2f9e86); scene.add(hlBox);} }
}
function el(tag,attrs={},...kids){ const e=document.createElement(tag); for(const[k,v]of Object.entries(attrs)){ if(v===null||v===undefined) continue; if(k==="on") for(const[ev,fn]of Object.entries(v)) e.addEventListener(ev,fn); else if(k==="text") e.textContent=v; else e.setAttribute(k,v);} e.append(...kids.filter(Boolean)); return e; }

/* paint targets: a whole material, one wall (group of meshes) or a single mesh */
const SCOPES=[["all","Все такие"],["group","Эта стена"],["piece","Этот кусок"]];
function targetFor(sc,mesh,name){
  if(sc==="group"&&mesh) return {scope:"group",key:"group:"+groupOf(mesh),label:groupOf(mesh).replace(/_/g," "),name};
  if(sc==="piece"&&mesh) return {scope:"piece",key:"piece:"+mesh.name,label:mesh.name.replace(/_/g," "),name};
  return {scope:"all",name,label:name};
}
const targetDoc=t=>t.scope==="all"?paint.get(keyOf(t.name)):parts.get(partDocId(t.key));
const snap=t=>{ const d=targetDoc(t); return d?{color:d.color,finish:d.finish||null}:null; };
function sendOk(ok){ if(!ok) toast("Нет связи: изменение не сохранится."); }
let fromPicker=false;

let ctxS=null;
function renderCtx(soft){
  const c=$("ctx");
  if(!selected){ c.hidden=true; c.textContent=""; ctxS=null; return; }
  if(selected.kind==="mat"){
    const m=materials.get(selected.name); if(!m){ c.hidden=true; return; }
    const sig=["mat",selected.name,scope,selected.mesh?.uuid,canWrite].join("|");
    if(soft&&ctxS&&ctxS.sig===sig){ ctxS.update(); c.hidden=false; return; }
    c.hidden=false; c.textContent="";
    const t=targetFor(scope,selected.mesh,selected.name);
    c.append(el("span",{class:"label",text:"Поверхность"}), el("h2",{text:selected.name}));
    const meta=el("div",{class:"meta mono"}); c.append(meta);
    const curOf=()=>{ const d=targetDoc(t); return {color:d?.color||(t.scope==="all"?m.orig:hexOf(selected.mesh.material.color)),finish:d?.finish||null,changed:!!d}; };
    const upd=()=>{ const cur=curOf(); meta.textContent=(t.scope==="all"?"":t.label+" · ")+"Цвет "+cur.color.toUpperCase()+(cur.changed?"  · изменён":"  · как в модели"); return cur; };
    const cur=upd(); let pk=null;
    if(canWrite){
      const seg=el("div",{class:"seg scope",role:"group","aria-label":"Что красим (V)"});
      for(const[v,l]of SCOPES){ const b=el("button",{text:l,title:l+" (V)","aria-pressed":String(scope===v)}); b.disabled=!selected.mesh&&v!=="all"; b.onclick=()=>{ scope=v; renderTools(); renderCtx(); }; seg.append(b); }
      c.append(seg);
      let before=snap(t);
      pk=Picker.create({color:cur.color,finish:cur.finish,showFinish:true,
        onInput:hex=>{ fromPicker=true; setTarget(t,hex,curOf().finish,false); fromPicker=false; },
        onChange:({color,finish})=>{ fromPicker=true; pushUndo({t:"target",tgt:t,prev:before}); setTarget(t,color,finish,true); before=snap(t); fromPicker=false; }});
      c.append(pk.el);
      c.append(el("button",{class:"ghost",text:"Как было",on:{click:()=>{ pushUndo({t:"target",tgt:t,prev:snap(t)}); resetTarget(t,true); before=null; }}}));
    } else c.append(el("div",{class:"meta",text:"Режим просмотра: менять цвета может только редактор."}));
    c.append(el("button",{class:"ghost",text:"Закрыть",on:{click:()=>select(null)}}));
    ctxS={sig,update(){ const k=upd(); if(pk&&!fromPicker) pk.set(k.color,k.finish); }};
  } else {
    const it=items.get(selected.id); if(!it){ c.hidden=true; return; }
    const d=it.doc, def=d.type==="builtin"?LIB[d.key]:null, mdl=d.type==="model"?models.get(d.model):null;
    const sig=["item",selected.id,d.type,d.key||d.model,canWrite].join("|");
    const size=()=>{ const bb=new THREE.Box3().setFromObject(it.obj), sz=new THREE.Vector3(); bb.getSize(sz); return sz; };
    if(soft&&ctxS&&ctxS.sig===sig){ ctxS.update(); c.hidden=false; return; }
    c.hidden=false; c.textContent="";
    const title=def?def.name:(mdl?.name||"3D-модель");
    c.append(el("span",{class:"label",text:"Предмет"}), el("h2",{text:title}));
    const sizeMeta=el("div",{class:"meta mono"}); c.append(sizeMeta);
    const showSize=()=>{ const sz=size(); sizeMeta.textContent=`${Math.round(sz.x*1000)} × ${Math.round(sz.z*1000)} × ${Math.round(sz.y*1000)} мм`; };
    showSize(); let pk=null;
    if(canWrite){
      c.append(el("div",{class:"row"},
        el("button",{text:"⟲ 90°",title:"Повернуть (Shift+R)",on:{click:()=>rotateItem(selected.id,-Math.PI/2)}}),
        el("button",{text:"⟳ 90°",title:"Повернуть (R)",on:{click:()=>rotateItem(selected.id,Math.PI/2)}}),
        el("button",{text:"⟳ 15°",on:{click:()=>rotateItem(selected.id,Math.PI/12)}}),
        el("button",{text:"Переместить",on:{click:()=>startPlacing({moveId:selected.id})}})));
      if(def){
        c.append(el("span",{class:"label",text:"Цвет обивки / отделки"}));
        const id=selected.id; let before=d;
        pk=Picker.create({color:d.color||def.color,finish:d.finish||null,showFinish:true,
          onInput:hex=>{ const cur=items.get(id); if(cur){ fromPicker=true; syncItem(id,Object.assign({},cur.doc,{color:hex})); fromPicker=false; } },
          onChange:({color,finish})=>{ fromPicker=true; pushUndo({t:"item",id,prev:before}); commitItem(id,{color,finish}); before=items.get(id)?.doc; fromPicker=false; }});
        c.append(pk.el);
      } else {
        c.append(el("span",{class:"label",text:"Размер"}));
        const w=el("input",{type:"number",min:"50",step:"10",value:String(Math.round(size().x*1000)),"aria-label":"Ширина, мм",id:"itemW",style:"width:100px"});
        c.append(el("div",{class:"row"},w,el("span",{class:"meta",text:"мм по ширине"}),
          el("button",{text:"Применить",on:{click:()=>{ const sx=size().x, v=parseFloat(w.value); if(v>0&&sx>0) commitItem(selected.id,{s:r2((items.get(selected.id).doc.s||1)*(v/1000)/sx)}); }}})));
      }
      c.append(el("div",{class:"row"},
        el("button",{text:"Копия",on:{click:()=>duplicateItem(selected.id)}}),
        el("button",{class:"danger",text:"Удалить",on:{click:()=>removeItem(selected.id)}})));
    }
    c.append(el("button",{class:"ghost",text:"Закрыть",on:{click:()=>select(null)}}));
    ctxS={sig,update(){ showSize(); const cur=items.get(selected?.id)?.doc; if(pk&&cur&&!fromPicker) pk.set(cur.color||def.color,cur.finish||null); }};
  }
}

/* ---------------- paint ---------------- */
function applyMeshPart(o,byKey){
  const base=o.userData.baseMat, mi=materials.get(o.userData.matName);
  const d=byKey.get("piece:"+o.name)||byKey.get("group:"+groupOf(o));
  if(!d){ if(o.material!==base){ o.material.dispose(); o.material=base; o.userData.ownMat=null; } return; }
  let own=o.userData.ownMat; if(!own||o.material!==own){ own=o.userData.ownMat=base.clone(); o.material=own; }
  setHex(own.color,d.color);
  applyFinish(own,d.finish||paint.get(keyOf(o.userData.matName))?.finish||null,mi.o);
}
function applyAllPaint(){
  for(const[name,m]of materials){ const d=paint.get(keyOf(name)); setHex(m.mat.color,d?.color||m.orig); applyFinish(m.mat,d?.finish||null,m.o); }
  const byKey=new Map(); for(const d of parts.values()) byKey.set(d.key,d);
  for(const o of meshes) applyMeshPart(o,byKey);
}
function setTarget(t,hex,finish,send){
  const old=targetDoc(t), fin=finish===undefined?(old?.finish??null):finish;
  const doc={color:hex,finish:fin,by:myId,at:Date.now()};
  if(t.scope==="all"){ doc.name=t.name; paint.set(keyOf(t.name),doc); if(send) sendOk(Sync.setPaint(keyOf(t.name),{name:t.name,color:hex,finish:fin})); }
  else { doc.key=t.key; parts.set(partDocId(t.key),doc); if(send) sendOk(Sync.setPart(partDocId(t.key),{key:t.key,color:hex,finish:fin})); }
  applyAllPaint(); renderCtx(true);
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
function syncItem(id,doc){
  let it=items.get(id);
  const needRebuild=!it||it.doc.type!==doc.type||it.doc.key!==doc.key||it.doc.model!==doc.model||(doc.type==="builtin"&&(it.doc.color!==doc.color||it.doc.finish!==doc.finish));
  if(needRebuild){
    const token=Symbol(); const holder=it||{doc,obj:new THREE.Group(),token}; holder.token=token; holder.doc=doc;
    if(!it){ holder.obj.userData.itemId=id; itemsRoot.add(holder.obj); items.set(id,holder); }
    Promise.resolve(buildItem(doc)).then(g=>{
      if(holder.token!==token||!g) return;
      holder.obj.clear(); g.traverse(o=>{ if(o.isMesh){ o.castShadow=o.receiveShadow=true; } }); holder.obj.add(g);
      if(selected?.kind==="item"&&selected.id===id){ highlight(); renderCtx(true); }
    }).catch(()=>{});
    it=holder;
  }
  it.doc=doc;
  if(!(ptr.drag&&ptr.drag.id===id)&&!(placing&&placing.moveId===id)){
    it.obj.position.set(doc.x||0,doc.y||0,doc.z||0);
  }
  it.obj.rotation.y=doc.r||0; it.obj.scale.setScalar(doc.s||1);
  if(selected?.kind==="item"&&selected.id===id){ highlight(); }
}
function dropItem(id){ const it=items.get(id); if(!it) return; itemsRoot.remove(it.obj); items.delete(id); if(selected?.id===id) select(null); }
function commitItem(id,patch){
  const it=items.get(id); if(!it) return;
  const doc=Object.assign({},it.doc,patch,{at:Date.now(),by:myId});
  syncItem(id,doc); if(selected?.id===id) renderCtx(true);
  sendOk(Sync.commitItem(id,doc));
}
function rotateItem(id,da){ const it=items.get(id); if(it) commitItem(id,{r:r2(((it.doc.r||0)+da)%(Math.PI*2))}); }
function removeItem(id){ dropItem(id); sendOk(Sync.removeItem(id)); }
function duplicateItem(id){ const it=items.get(id); if(!it) return; const nid=rid(); const d=Object.assign({},it.doc,{x:r2((it.doc.x||0)+0.4),z:r2((it.doc.z||0)+0.4)}); commitNew(nid,d); select({kind:"item",id:nid}); }
function commitNew(id,doc){ doc=Object.assign({},doc,{by:myId,at:Date.now()}); syncItem(id,doc); sendOk(Sync.commitItem(id,doc)); }

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
  if(p){ placing.obj.position.copy(p); placing.last=p.clone(); }
}
function dropPlacing(){
  if(!placing) return; const p=placing.last||placing.obj.position;
  if(placing.moveId){ const id=placing.moveId, it=items.get(id), rr=it?r2(it.obj.rotation.y):0; placing=null; commitItem(id,{x:r2(p.x),y:r2(p.y),z:r2(p.z),r:rr}); renderTools(); }
  else { const doc=Object.assign({},placing.doc,{x:r2(p.x),y:r2(p.y),z:r2(p.z),r:placing.doc.r||0,s:placing.doc.s||1}); scene.remove(placing.obj); placing=null; const id=rid(); commitNew(id,doc); pushUndo({t:"item",id,prev:null});
    if(tool==="add"){ lastAddRot=doc.r; setTimeout(startAdd,30); } else select({kind:"item",id}); }
  placedFromOrbit=true; updateHint(); renderPlaceBar();
}
function cancelPlacing(silent){
  if(!placing) return;
  if(placing.temp) scene.remove(placing.obj);
  else { const it=items.get(placing.moveId); if(it){ it.obj.position.set(it.doc.x||0,it.doc.y||0,it.doc.z||0); it.obj.rotation.y=it.doc.r||0; } }
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
function renderLib(){
  const L=$("libList"); L.textContent="";
  $("tBase").setAttribute("aria-pressed",libTab==="base"); $("tUp").setAttribute("aria-pressed",libTab==="up");
  $("uploadRow").hidden=(libTab!=="up");
  if(libTab==="base"){
    for(const[key,def]of Object.entries(LIB)){
      const b=el("button",{class:"item-btn"},el("b",{text:def.name}),el("span",{class:"mono",text:def.size.join("×")}));
      if(!canWrite) b.disabled=true;
      b.onclick=()=>startPlacing({doc:{type:"builtin",key,color:def.color,r:0,s:1}});
      L.append(b);
    }
  } else {
    const list=[...models.entries()].sort((a,b)=>(b[1].at||0)-(a[1].at||0));
    if(!list.length) L.append(el("div",{class:"meta",style:"grid-column:1/-1;padding:4px",text:"Пока ничего не загружено. Сгенерируйте мебель по фото в нейросети, скачайте .glb и загрузите сюда."}));
    for(const[id,m]of list){
      const b=el("button",{class:"item-btn"},el("b",{text:m.name||"Модель"}),el("span",{class:"mono",text:((m.sizeBytes||0)/1048576).toFixed(1)+" МБ"}));
      if(!canWrite) b.disabled=true;
      b.onclick=()=>startPlacing({doc:{type:"model",model:id,r:0,s:1}});
      const x=el("button",{class:"ghost danger",text:"✕",title:"Удалить модель","aria-label":"Удалить модель "+(m.name||""),style:"padding:2px 6px;min-height:0"});
      x.onclick=async()=>{ if(!x.dataset.arm){ x.dataset.arm="1"; x.textContent="Удалить?"; setTimeout(()=>{ x.dataset.arm=""; x.textContent="✕"; },3000); return; }
        try{ await Sync.removeModel(id); }catch(e){ toast("Не удалось удалить модель."); } };
      const cell=el("div",{style:"display:flex;flex-direction:column;gap:2px;min-width:0"},b,x);
      L.append(cell);
    }
  }
  $("bUpload").hidden=!canWrite;
}
$("tBase").onclick=()=>{libTab="base";renderLib();};
$("tUp").onclick=()=>{libTab="up";renderLib();};
const toggleLib=()=>{ const c=$("lib").classList.toggle("collapsed"); $("bLib").setAttribute("aria-expanded",String(!c)); $("libClose").textContent=c?"+":"—"; };
$("libClose").onclick=toggleLib; $("bLib").onclick=toggleLib;
if(innerWidth<720) toggleLib();

/* upload */
$("bUpload").onclick=()=>$("fileIn").click();
$("fileIn").onchange=async()=>{
  const f=$("fileIn").files[0]; $("fileIn").value=""; if(!f||!canWrite) return;
  const name=f.name.replace(/\.glb$/i,"").slice(0,60)||"Модель";
  if(!/\.glb$/i.test(f.name)){ toast("Нужен файл в формате .glb"); return; }
  if(f.size>30*1048576){ toast("Файл больше 30 МБ. Уменьшите модель (например, в Blender) и попробуйте снова."); return; }
  try{
    toast("Загружаю «"+name+"»…");
    const buf=await f.arrayBuffer();
    await new Promise((res,rej)=>loader.parse(buf,"",res,rej)); // validate
    const r=await Sync.upload(f,name);
    if(r?.id&&r.doc) models.set(r.id,r.doc);
    libTab="up"; renderLib(); toast("Готово. Нажмите на модель в списке, чтобы поставить.");
  }catch(e){
    const code=e&&e.code;
    toast(code==="too_large"?"Файл слишком большой.":code==="forbidden"?"Загружать модели может только редактор.":code==="too_many_models"?"Слишком много моделей. Удалите ненужные.":"Не получилось загрузить: файл повреждён или это не .glb.");
    console.warn(e);
  }
};
function loadModel(id){
  if(modelCache.has(id)) return modelCache.get(id);
  const m=models.get(id); if(!m) return Promise.resolve(null);
  const p=new Promise((res,rej)=>loader.load("/uploads/"+m.file,g=>{
      const root=g.scene; const bb=new THREE.Box3().setFromObject(root), sz=new THREE.Vector3(), c=new THREE.Vector3(); bb.getSize(sz); bb.getCenter(c);
      let k=1; const mx=Math.max(sz.x,sz.y,sz.z); if(mx>60) k=0.001; else if(mx>6) k=0.01; // мм / см → м
      const wrap=new THREE.Group(); root.position.set(-c.x,-bb.min.y,-c.z); const inner=new THREE.Group(); inner.add(root); inner.scale.setScalar(k); wrap.add(inner);
      root.traverse(o=>{ if(o.isMesh){ o.castShadow=o.receiveShadow=true; } });
      res(wrap);
    },undefined,rej)).catch(e=>{ console.warn(e); const g=new THREE.Group(); bx(g,.5,.5,.5,0,.25,0,mat("#c9c3b6")); return g; });
  modelCache.set(id,p); return p;
}

/* ---------------- hotkey tools ---------------- */
let tool=null, brushIdx=0, addIdx=0, lastAddRot=0;
const brush=["#f4f1ea","#d9d2c3","#8193b8","#5d5aa8","#9fb9a6","#2f4f3e","#c28a5a","#2b2926"];
let brushFinish=null, brushPickOpen=false, brushPicker=null;
try{ const sv=JSON.parse(localStorage.getItem("villa.brush")||"null"); if(sv&&Array.isArray(sv.c)) sv.c.slice(0,8).forEach((c,i)=>{ if(HEXRE.test(c)) brush[i]=c; }); if(sv&&["matte","satin","gloss","metal"].includes(sv.f)) brushFinish=sv.f; }catch{}
const saveBrush=()=>{ try{ localStorage.setItem("villa.brush",JSON.stringify({c:brush,f:brushFinish})); }catch{} };
function cycleScope(){ const i=SCOPES.findIndex(x=>x[0]===scope); scope=SCOPES[(i+1)%SCOPES.length][0]; renderTools(); renderCtx(); toast("Красим: "+SCOPES.find(x=>x[0]===scope)[1].toLowerCase()); }
const undo=[];
function pushUndo(u){ undo.push(u); if(undo.length>60) undo.shift(); }
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
}
function aimHit(){ return pickAt(document.pointerLockElement===renderer.domElement); }
function useTool(){
  const h=aimHit();
  if(tool==="paint"){
    if(!h) return; const iid=itemIdOf(h.object), hex=brush[brushIdx];
    if(iid){ const it=items.get(iid); if(it?.doc.type==="builtin"){ pushUndo({t:"item",id:iid,prev:it.doc}); commitItem(iid,brushFinish?{color:hex,finish:brushFinish}:{color:hex}); } else toast("Загруженную модель перекрасить нельзя."); }
    else if(h.object.userData.matName){ const n=h.object.userData.matName, t=targetFor(scope,h.object,n); pushUndo({t:"target",tgt:t,prev:snap(t)}); setTarget(t,hex,brushFinish||undefined,true); P_addRecent(hex); toast(t.label+" → "+hex.toUpperCase()); }
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
  const h=aimHit(); if(!h) return; const iid=itemIdOf(h.object); let hex=null, fin=null;
  if(iid){ const d=items.get(iid)?.doc; if(d?.type==="builtin"){ hex=d.color||LIB[d.key]?.color; fin=d.finish||null; } }
  else if(h.object.userData.matName){ const n=h.object.userData.matName; hex=hexOf(h.object.material.color); fin=targetDoc(targetFor(scope,h.object,n))?.finish||paint.get(keyOf(n))?.finish||null; }
  if(!hex) return; brush[brushIdx]=hex; brushFinish=fin; saveBrush(); if(tool!=="paint") setTool("paint"); else renderTools(); toast("Цвет взят: "+hex.toUpperCase());
}
function doUndo(){
  const u=undo.pop(); if(!u){ toast("Нечего отменять."); return; }
  if(u.t==="target"){ if(u.prev) setTarget(u.tgt,u.prev.color,u.prev.finish,true); else resetTarget(u.tgt,true); }
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
  bar.append(pb, tb("E","Добавить",tool==="add",()=>setTool("add")), tb("G","Переместить",tool==="move",()=>grab()),
    tb("R","Повернуть",false,()=>rotateTarget(1)), tb("X","Удалить",false,()=>deleteTarget()),
    tb("C","Пипетка",false,()=>pipette()), tb("V",SCOPES.find(x=>x[0]===scope)[1],false,()=>cycleScope()), tb("Z","Отменить",false,()=>doUndo()));
  T.append(bar);
  if(tool==="paint"){
    const row=el("div",{class:"brush"});
    brush.forEach((c,i)=>{ const b=el("button",{class:"bsw","aria-pressed":String(i===brushIdx),"aria-label":"Цвет "+(i+1)+" "+c,title:c}); b.style.background=c; b.append(el("span",{text:String(i+1)})); b.onclick=()=>{brushIdx=i;renderTools();}; row.append(b); });
    row.append(el("button",{text:"Цвет…","aria-pressed":String(brushPickOpen),title:"Палитра для выбранного слота",on:{click:()=>{ brushPickOpen=!brushPickOpen; renderTools(); }}}));
    T.append(row);
    T.append(el("div",{class:"meta",id:"brushMeta"})); renderToolsMeta();
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
function sendPresence(force){
  const now=performance.now(); if(!force&&now-lastSent<120) return; lastSent=now;
  const pr={mode};
  if(mode==="walk"){ pr.p=walk.pos.toArray().map(r2); pr.yaw=r2(walk.yaw); }
  else { pr.t=orbit.target.toArray().map(r2); }
  pr.sel=selected?(selected.kind==="item"?"item:"+selected.id:"mat:"+keyOf(selected.name)):null;
  const drag=ptr.drag?items.get(ptr.drag.id):(placing&&placing.moveId?items.get(placing.moveId):null);
  pr.drag=drag?{id:ptr.drag?.id||placing.moveId,p:drag.obj.position.toArray().map(r2)}:null;
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
function renderPeers(){
  const peers=Sync.peers(); const seen=new Set();
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
    if(pr.drag&&typeof pr.drag.id==="string"&&Array.isArray(pr.drag.p)){ const it=items.get(pr.drag.id); if(it&&!(ptr.drag&&ptr.drag.id===pr.drag.id)&&!(placing&&placing.moveId===pr.drag.id)) it.obj.position.set(+pr.drag.p[0]||0,+pr.drag.p[1]||0,+pr.drag.p[2]||0); }
  }
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
function validModel(v){ return v&&typeof v.file==="string"&&/^[a-f0-9]{16}\.glb$/.test(v.file); }
function applyState(s){
  paint.clear(); for(const[k,v]of Object.entries(s.paint||{})) if(validPaint(v)) paint.set(k,v);
  parts.clear(); for(const[k,v]of Object.entries(s.parts||{})) if(HEXRE.test(v?.color||"")&&typeof v.key==="string") parts.set(k,v);
  models.clear(); modelCache.clear(); for(const[k,v]of Object.entries(s.models||{})) if(validModel(v)) models.set(k,v);
  const ids=new Set(Object.keys(s.items||{}));
  for(const id of [...items.keys()]) if(!ids.has(id)) dropItem(id);
  for(const[id,v]of Object.entries(s.items||{})) if(validItem(v)) syncItem(id,v);
  Picker.setProject(s.swatches?.colors||[],canWrite);
  applyAllPaint(); renderCtx(true); renderLib(); renderTools();
}
function applyRole(){
  $("lib").hidden=!canWrite; $("bLib").hidden=!canWrite; $("viewBadge").hidden=canWrite;
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
  Sync.on("model.added",m=>{ if(validModel(m.doc)){ models.set(m.id,m.doc); renderLib(); } });
  Sync.on("model.deleted",m=>{ models.delete(m.id); modelCache.delete(m.id); renderLib(); });
  Sync.on("swatches.set",m=>Picker.setProject(m.doc?.colors||[]));
  const go=()=>Sync.connect();
  if(Sync.profile.name) go();
  else askName("Как вас зовут?","",false).then(n=>{ Sync.setName(n); go(); });
}
boot();
updateHint(); renderLib(); renderTools();
})();
