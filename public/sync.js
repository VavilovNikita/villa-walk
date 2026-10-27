/* Sync layer: WebSocket + REST client for the villa server. Exposes window.Sync. */
(() => {
"use strict";
const LS = { get(k){ try{ return localStorage.getItem(k); }catch{ return null; } }, set(k,v){ try{ localStorage.setItem(k,v); }catch{} } };
const HEX=/^#[0-9a-f]{6}$/i;
const COLORS=["#2f6f62","#c4625a","#5d5aa8","#c28a5a","#4a8fb8","#8a6aa8","#6a9a3a","#d0803a","#b05a8a","#3a8a8a"];

/* profile: name + colour live in localStorage, no registration */
let profile=null;
try{ profile=JSON.parse(LS.get("villa.profile")||"null"); }catch{}
if(!profile||typeof profile!=="object") profile={};
if(!/^[A-Za-z0-9]{8,32}$/.test(profile.uid||"")) profile.uid=Math.random().toString(36).slice(2,10)+Date.now().toString(36);
if(!HEX.test(profile.color||"")) profile.color=COLORS[Math.floor(Math.random()*COLORS.length)];
profile.name=typeof profile.name==="string"?profile.name.slice(0,60):"";
const saveProfile=()=>LS.set("villa.profile",JSON.stringify(profile));
saveProfile();

/* edit key: ?k=... is stored and removed from the address bar */
let key=LS.get("villa.key")||"";
try{
  const u=new URL(location.href), k=u.searchParams.get("k");
  if(k){ key=k; LS.set("villa.key",k); u.searchParams.delete("k"); history.replaceState(null,"",u.pathname+(u.search||"")+u.hash); }
}catch{}

const handlers={};
const on=(n,f)=>{ (handlers[n]||(handlers[n]=[])).push(f); };
const emit=(n,...a)=>{ for(const f of handlers[n]||[]){ try{ f(...a); }catch(e){ console.error(e); } } };

let ws=null, retry=0, timer=null, started=false, wasOnline=false;
const S={ profile, canEdit:false, peerId:null, online:false, on, peerMap:new Map() };

function send(m){ if(ws&&ws.readyState===1&&S.online){ ws.send(JSON.stringify(m)); return true; } return false; }

async function loadState(){
  try{ const r=await fetch("/api/state",{cache:"no-store"}); if(!r.ok) throw new Error("http "+r.status); emit("state",await r.json()); }
  catch(e){ console.warn("state",e); }
}

function open(){
  clearTimeout(timer);
  ws=new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host+"/ws");
  ws.onopen=()=>ws.send(JSON.stringify({t:"hello",name:profile.name,color:profile.color,uid:profile.uid,key:key||undefined}));
  ws.onmessage=ev=>{
    let m; try{ m=JSON.parse(ev.data); }catch{ return; }
    switch(m.t){
      case "welcome":
        S.peerId=m.peerId; S.canEdit=!!m.canEdit; S.online=true; retry=0;
        emit("welcome",S); emit("status",true); loadState(); wasOnline=true; break;
      case "peers":
        S.peerMap=new Map(m.list.map(p=>{ const old=S.peerMap.get(p.peerId); return [p.peerId,Object.assign({},old,p)]; }));
        emit("peers",S.peers()); break;
      case "presence": { const p=S.peerMap.get(m.peerId); if(p) p.presence=m.d; break; }
      case "error": console.warn("server rejected",m.ref,m.code); emit("error",m); loadState(); break;
      default: emit(m.t,m);
    }
  };
  ws.onclose=()=>{
    const was=S.online; S.online=false; S.peerMap=new Map(); ws=null;
    if(was||!wasOnline) emit("status",false);
    emit("peers",[]);
    clearTimeout(timer); timer=setTimeout(open,Math.min(10000,500*2**retry++)+Math.random()*300);
  };
  ws.onerror=()=>{ try{ ws.close(); }catch{} };
}

S.connect=()=>{ if(started) return; started=true; open(); };
S.peers=()=>[...S.peerMap.values()].map(p=>({peer:p.peerId,uid:p.uid,name:p.name,color:p.color,presence:p.presence,sameTab:p.peerId===S.peerId}));
S.setName=name=>{ profile.name=String(name).trim().slice(0,60); saveProfile(); send({t:"hello",name:profile.name,color:profile.color,uid:profile.uid}); };
S.presence=d=>send({t:"presence",d});
S.setPaint=(id,doc)=>send({t:"paint.set",id,doc});
S.resetPaint=id=>send({t:"paint.reset",id});
S.setPart=(id,doc)=>send({t:"part.set",id,doc});
S.resetPart=id=>send({t:"part.reset",id});
S.setSwatches=colors=>send({t:"swatches.set",colors});
S.commitItem=(id,doc)=>send({t:"item.set",id,doc});
S.removeItem=id=>send({t:"item.delete",id});

async function api(method,url,body,extra){
  const r=await fetch(url,{method,body,headers:Object.assign({"x-edit-key":key,"x-uid":profile.uid},extra)});
  const j=await r.json().catch(()=>({}));
  if(!r.ok){ const e=new Error(j.error||("http "+r.status)); e.code=j.error||String(r.status); throw e; }
  return j;
}
/* XHR instead of fetch: only it reports upload progress */
const xhrPost=(url,fd,onProgress)=>new Promise((res,rej)=>{
  const x=new XMLHttpRequest(); x.open("POST",url); x.setRequestHeader("x-edit-key",key); x.setRequestHeader("x-uid",profile.uid); x.responseType="json";
  x.upload.onprogress=e=>{ if(e.lengthComputable&&onProgress) onProgress(e.loaded/e.total,e.loaded,e.total); };
  x.onload=()=>{ const j=x.response||{}; if(x.status>=200&&x.status<300) res(j); else { const e=new Error(j.error||("http "+x.status)); e.code=j.error||String(x.status); rej(e); } };
  x.onerror=()=>{ const e=new Error("network"); e.code="network"; rej(e); };
  x.send(fd);
});
S.upload=(file,name,onProgress)=>{ const fd=new FormData(); fd.append("name",name); fd.append("file",file,file.name); return xhrPost("/api/models",fd,onProgress); };
S.uploadThumb=(id,blob,mm)=>api("POST","/api/models/"+encodeURIComponent(id)+"/thumb?w="+mm[0]+"&d="+mm[1]+"&h="+mm[2],blob,{"content-type":blob.type});
S.renameModel=(id,name)=>api("PATCH","/api/models/"+encodeURIComponent(id),JSON.stringify({name}),{"content-type":"application/json"});
S.removeModel=id=>api("DELETE","/api/models/"+encodeURIComponent(id));
S.uploadTexture=fd=>api("POST","/api/textures",fd);
S.patchTexture=(id,patch)=>api("PATCH","/api/textures/"+encodeURIComponent(id),JSON.stringify(patch),{"content-type":"application/json"});
S.removeTexture=id=>api("DELETE","/api/textures/"+encodeURIComponent(id));

S.houseInfo=async()=>{ const r=await fetch("/api/house",{cache:"no-store",headers:{"x-edit-key":key}}); if(!r.ok) throw new Error("http "+r.status); return r.json(); };
S.restoreHouse=name=>api("POST","/api/house/restore",JSON.stringify({name}),{"content-type":"application/json"});
S.uploadHouse=(file,onProgress)=>{ const fd=new FormData(); fd.append("file",file,file.name); return xhrPost("/api/house",fd,onProgress); };

window.Sync=S;
})();
