/* Colour picker: saturation/brightness field, hue, HEX/RGB, quick adjustments, 13 hue families,
   finish, recent colours (localStorage) and the shared project palette. Exposes window.Picker. */
(() => {
"use strict";
const HEX=/^#[0-9a-f]{6}$/i;
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const hexToRgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const rgbToHex=(r,g,b)=>"#"+[r,g,b].map(v=>Math.round(clamp(v,0,255)).toString(16).padStart(2,"0")).join("");
function rgbToHsv(r,g,b){ r/=255;g/=255;b/=255; const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn; let h=0;
  if(d){ if(mx===r) h=((g-b)/d)%6; else if(mx===g) h=(b-r)/d+2; else h=(r-g)/d+4; h*=60; if(h<0) h+=360; }
  return [h,mx?d/mx:0,mx]; }
function hsvToRgb(h,s,v){ const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c; let r=0,g=0,b=0;
  if(h<60)[r,g,b]=[c,x,0]; else if(h<120)[r,g,b]=[x,c,0]; else if(h<180)[r,g,b]=[0,c,x]; else if(h<240)[r,g,b]=[0,x,c]; else if(h<300)[r,g,b]=[x,0,c]; else [r,g,b]=[c,0,x];
  return [(r+m)*255,(g+m)*255,(b+m)*255]; }
function rgbToHsl(r,g,b){ r/=255;g/=255;b/=255; const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,d=mx-mn; let h=0,s=0;
  if(d){ s=d/(1-Math.abs(2*l-1)); if(mx===r) h=((g-b)/d)%6; else if(mx===g) h=(b-r)/d+2; else h=(r-g)/d+4; h*=60; if(h<0) h+=360; }
  return [h,s,l]; }
function hslToRgb(h,s,l){ const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2; let r=0,g=0,b=0;
  if(h<60)[r,g,b]=[c,x,0]; else if(h<120)[r,g,b]=[x,c,0]; else if(h<180)[r,g,b]=[0,c,x]; else if(h<240)[r,g,b]=[0,x,c]; else if(h<300)[r,g,b]=[x,0,c]; else [r,g,b]=[c,0,x];
  return [(r+m)*255,(g+m)*255,(b+m)*255]; }

const ADJUST=[
  ["Светлее",hex=>{ const [h,s,l]=rgbToHsl(...hexToRgb(hex)); return rgbToHex(...hslToRgb(h,s,clamp(l+0.07))); }],
  ["Темнее",hex=>{ const [h,s,l]=rgbToHsl(...hexToRgb(hex)); return rgbToHex(...hslToRgb(h,s,clamp(l-0.07))); }],
  ["Теплее",hex=>{ const [r,g,b]=hexToRgb(hex); return rgbToHex(r+10,g+2,b-10); }],
  ["Холоднее",hex=>{ const [r,g,b]=hexToRgb(hex); return rgbToHex(r-10,g-2,b+10); }],
  ["Ярче",hex=>{ const [h,s,l]=rgbToHsl(...hexToRgb(hex)); return rgbToHex(...hslToRgb(h,clamp(s*1.2+0.04),l)); }],
  ["Приглушить",hex=>{ const [h,s,l]=rgbToHsl(...hexToRgb(hex)); return rgbToHex(...hslToRgb(h,clamp(s*0.8-0.03),l)); }],
];

const FAMILIES=[
  ["Белые",["#ffffff","#fbfaf6","#f4f1ea","#ece8de","#e3dfd3","#f7f3e8","#eef0ee","#e6ebee"]],
  ["Бежевые",["#f0e6d2","#e6d8bd","#dccaa6","#d2bc91","#c4a97a","#b69a68","#a08556","#8a7048"]],
  ["Серые",["#f1f1f0","#dcdcda","#c4c4c1","#a8a8a5","#8a8a87","#6c6c6a","#4e4e4c","#323231"]],
  ["Чёрные",["#3a3a3a","#2e2e2e","#262626","#1f1f1f","#181818","#121212","#0b0b0b","#000000"]],
  ["Коричневые",["#d7b89b","#c19a76","#a97c55","#8f6240","#774d31","#5f3b25","#482b1a","#331d11"]],
  ["Красные",["#f6c4bd","#ee9c92","#e2766a","#d4554a","#bf3b32","#a02a24","#801f1b","#5f1714"]],
  ["Оранжевые",["#fbd9b4","#f7c18a","#f2a661","#ea8c3e","#d9742a","#bb5f1f","#96491a","#703716"]],
  ["Жёлтые",["#fcf1b5","#f8e48a","#f1d35e","#e5c13c","#d0aa27","#b08f1d","#8b7217","#675412"]],
  ["Зелёные",["#d5e8c8","#b4d6a0","#8fc078","#6ca857","#4f8f43","#3a7334","#2c5927","#1f401d"]],
  ["Бирюзовые",["#c8ece6","#9fdcd2","#72c8bc","#4aafa3","#2f948a","#237771","#195a56","#123f3d"]],
  ["Синие",["#cfe1f5","#a8c8ec","#7eabdf","#568ccf","#3a6eb8","#2c5798","#213f73","#162b52"]],
  ["Фиолетовые",["#e0d6f0","#c8b8e4","#ae98d4","#9479c2","#7a5eac","#624a8e","#4a366e","#33254d"]],
  ["Розовые",["#fbd5e0","#f7b4c9","#f08fae","#e66a92","#d44a78","#b0365f","#8a2849","#641c34"]],
];
const FINISHES=[[null,"Как есть"],["matte","Матовая"],["satin","Сатин"],["gloss","Глянец"],["metal","Металл"]];

/* shared state */
const P={ FINISHES, project:[], canEdit:false, onProject:null, instances:new Set() };
let recent=[]; try{ recent=JSON.parse(localStorage.getItem(Env.ls("villa.recent"))||"[]").filter(c=>HEX.test(c)).slice(0,16); }catch{}
P.addRecent=hex=>{ hex=hex.toLowerCase(); recent=[hex,...recent.filter(c=>c!==hex)].slice(0,16); try{ localStorage.setItem(Env.ls("villa.recent"),JSON.stringify(recent)); }catch{} P.refresh(); };
P.setProject=(colors,canEdit)=>{ P.project=colors.filter(c=>HEX.test(c)).slice(0,40); if(canEdit!==undefined) P.canEdit=canEdit; P.refresh(); };
P.refresh=()=>{ for(const i of [...P.instances]){ if(!i.el.isConnected){ P.instances.delete(i); continue; } i.renderLists(); } };

function h(tag,attrs={},...kids){ const e=document.createElement(tag); for(const[k,v]of Object.entries(attrs)){ if(v==null) continue; if(k==="on") for(const[ev,fn]of Object.entries(v)) e.addEventListener(ev,fn); else if(k==="text") e.textContent=v; else e.setAttribute(k,v); } e.append(...kids.filter(Boolean)); return e; }

/* opts: {color, finish, showFinish, onInput(hex), onChange({color,finish})} */
P.create=function(opts){
  const st={ color:(HEX.test(opts.color||"")?opts.color:"#cccccc").toLowerCase(), finish:opts.finish||null, family:0, removing:false };
  [st.h,st.s,st.v]=rgbToHsv(...hexToRgb(st.color));
  const root=h("div",{class:"picker"});

  /* saturation / brightness field */
  const cv=h("canvas",{width:240,height:132,class:"pk-sv",tabindex:"0",role:"slider","aria-label":"Насыщенность и яркость"});
  const thumb=h("i",{class:"pk-thumb"});
  const field=h("div",{class:"pk-field"},cv,thumb);
  const hue=h("input",{type:"range",min:"0",max:"359",step:"1",class:"pk-hue","aria-label":"Оттенок"});
  const prev=h("span",{class:"pk-prev"});
  const hexIn=h("input",{type:"text",class:"mono pk-hex",maxlength:"7",spellcheck:"false","aria-label":"HEX"});
  const rgbIn=["R","G","B"].map(n=>h("input",{type:"number",min:"0",max:"255",class:"mono pk-rgb","aria-label":n}));
  root.append(field,hue,h("div",{class:"row pk-vals"},prev,hexIn,...rgbIn));

  function drawSV(){
    const c=cv.getContext("2d"),w=cv.width,hh=cv.height;
    c.fillStyle=rgbToHex(...hsvToRgb(st.h,1,1)); c.fillRect(0,0,w,hh);
    let g=c.createLinearGradient(0,0,w,0); g.addColorStop(0,"#fff"); g.addColorStop(1,"rgba(255,255,255,0)"); c.fillStyle=g; c.fillRect(0,0,w,hh);
    g=c.createLinearGradient(0,0,0,hh); g.addColorStop(0,"rgba(0,0,0,0)"); g.addColorStop(1,"#000"); c.fillStyle=g; c.fillRect(0,0,w,hh);
  }
  function paint(skipHex){
    drawSV();
    thumb.style.left=(st.s*100)+"%"; thumb.style.top=((1-st.v)*100)+"%"; thumb.style.background=st.color;
    hue.value=String(Math.round(st.h)%360);
    prev.style.background=st.color;
    if(!skipHex) hexIn.value=st.color.toUpperCase();
    const rgb=hexToRgb(st.color); rgbIn.forEach((inp,i)=>{ if(document.activeElement!==inp) inp.value=String(rgb[i]); });
    cv.setAttribute("aria-valuetext",st.color);
  }
  const setFromHex=(hex,keepHue)=>{ st.color=hex.toLowerCase(); const [hh,s,v]=rgbToHsv(...hexToRgb(st.color)); if(!keepHue||s>0.02) st.h=hh; st.s=s; st.v=v; };
  const fromHsv=()=>{ st.color=rgbToHex(...hsvToRgb(st.h,st.s,st.v)); };
  const live=()=>{ paint(); opts.onInput&&opts.onInput(st.color); };
  const commit=()=>{ paint(); P.addRecent(st.color); opts.onChange&&opts.onChange({color:st.color,finish:st.finish}); };
  const apply=hex=>{ setFromHex(hex); commit(); };

  let dragging=false;
  const pick=e=>{ const r=cv.getBoundingClientRect(); st.s=clamp((e.clientX-r.left)/r.width); st.v=1-clamp((e.clientY-r.top)/r.height); fromHsv(); live(); };
  cv.addEventListener("pointerdown",e=>{ dragging=true; cv.setPointerCapture(e.pointerId); pick(e); });
  cv.addEventListener("pointermove",e=>{ if(dragging) pick(e); });
  const end=()=>{ if(dragging){ dragging=false; commit(); } };
  cv.addEventListener("pointerup",end); cv.addEventListener("pointercancel",end);
  cv.addEventListener("keydown",e=>{ const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[e.key]; if(!d) return; e.preventDefault();
    st.s=clamp(st.s+d[0]*0.02); st.v=clamp(st.v+d[1]*0.02); fromHsv(); live(); clearTimeout(cv.t); cv.t=setTimeout(commit,400); });
  hue.addEventListener("input",()=>{ st.h=+hue.value; fromHsv(); live(); });
  hue.addEventListener("change",commit);
  hexIn.addEventListener("input",()=>{ let v=hexIn.value.trim(); if(v&&v[0]!=="#") v="#"+v; if(HEX.test(v)){ setFromHex(v,true); paint(true); opts.onInput&&opts.onInput(st.color); } });
  hexIn.addEventListener("change",()=>{ let v=hexIn.value.trim(); if(v&&v[0]!=="#") v="#"+v; if(HEX.test(v)) apply(v); else paint(); });
  hexIn.addEventListener("keydown",e=>{ if(e.key==="Enter") hexIn.dispatchEvent(new Event("change")); });
  const rgbChange=()=>{ apply(rgbToHex(...rgbIn.map(i=>clamp(parseInt(i.value)||0,0,255)))); };
  rgbIn.forEach(i=>i.addEventListener("change",rgbChange));

  /* quick adjustments */
  const adj=h("div",{class:"pk-adj"});
  for(const[label,fn]of ADJUST) adj.append(h("button",{class:"ghost",text:label,on:{click:()=>apply(fn(st.color))}}));
  root.append(adj);

  /* 13 families */
  const famRow=h("div",{class:"pk-fam",role:"group","aria-label":"Семейства оттенков"}), shades=h("div",{class:"pk-shades"});
  FAMILIES.forEach(([name,list],i)=>{ const b=h("button",{class:"sw",title:name,"aria-label":name}); b.style.background=list[3]; b.onclick=()=>{ st.family=i; renderFam(); }; famRow.append(b); });
  function renderFam(){
    [...famRow.children].forEach((b,i)=>b.setAttribute("aria-pressed",String(i===st.family)));
    shades.textContent=""; const [name,list]=FAMILIES[st.family];
    for(const c of list){ const b=h("button",{class:"sw",title:name+" "+c,"aria-label":c,"aria-pressed":String(c===st.color)}); b.style.background=c; b.onclick=()=>apply(c); shades.append(b); }
  }
  root.append(h("span",{class:"label",text:"Оттенки"}),famRow,shades);

  /* finish */
  let finBox=null;
  if(opts.showFinish){
    finBox=h("div",{class:"seg pk-fin",role:"group","aria-label":"Фактура"});
    for(const[val,label]of FINISHES) finBox.append(h("button",{text:label,"data-f":val||"",on:{click:()=>{ st.finish=val; renderFinish(); opts.onChange&&opts.onChange({color:st.color,finish:st.finish}); }}}));
    root.append(h("span",{class:"label",text:"Фактура"}),finBox);
  }
  function renderFinish(){ if(finBox) [...finBox.children].forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.f===(st.finish||"")))); }

  /* recent + project palette */
  const recBox=h("div",{class:"pk-list"}), projBox=h("div",{class:"pk-list"}), projTools=h("div",{class:"row"});
  root.append(h("span",{class:"label",text:"Недавние"}),recBox,h("span",{class:"label",text:"Палитра проекта"}),projBox,projTools);
  function renderLists(){
    renderFam(); renderFinish();
    recBox.textContent=""; if(!recent.length) recBox.append(h("span",{class:"meta",text:"Пока пусто"}));
    for(const c of recent){ const b=h("button",{class:"sw",title:c,"aria-label":c}); b.style.background=c; b.onclick=()=>apply(c); recBox.append(b); }
    projBox.textContent=""; if(!P.project.length) projBox.append(h("span",{class:"meta",text:"Пока пусто"}));
    for(const c of P.project){ const b=h("button",{class:"sw"+(st.removing?" rm":""),title:st.removing?"Убрать "+c:c,"aria-label":c}); b.style.background=c;
      b.onclick=()=>{ if(st.removing&&P.canEdit) P.onProject&&P.onProject(P.project.filter(x=>x!==c)); else apply(c); }; projBox.append(b); }
    projTools.textContent="";
    if(P.canEdit){
      const add=h("button",{text:"+ Текущий цвет",title:"Добавить в палитру проекта",on:{click:()=>{ if(!P.project.includes(st.color)&&P.project.length<40) P.onProject&&P.onProject([...P.project,st.color]); }}});
      add.disabled=P.project.length>=40;
      projTools.append(add,h("button",{class:"ghost","aria-pressed":String(st.removing),text:"Убрать цвета",on:{click:()=>{ st.removing=!st.removing; renderLists(); }}}));
    }
  }

  const inst={ el:root, renderLists, set(color,finish){ if(dragging) return; setFromHex(color,true); st.finish=finish||null; paint(); renderLists(); } };
  P.instances.add(inst);
  paint(); renderLists();
  return inst;
};
window.Picker=P;
})();
