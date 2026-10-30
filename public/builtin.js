/* Procedural furniture, the old "Базовая" library. It is no longer offered anywhere; this code only draws items of type "builtin" that already stand in a scene.
   app.js loads this file the first time such an item has to be drawn - a scene without them never downloads it. */
window.BuiltinFurniture=function(h){
"use strict";
const {mat,bx,cy}=h;
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
return LIB;
};
