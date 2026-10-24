javascript:(()=>{
"use strict";
const S="sd_deff_manager_v1",P="sd_deff_manager_pos_v1",
O="sd_deff_manager_options_v1",
A="https://dssk.innogamescdn.com/asset/8e371e58/graphic/unit/unit_",
U=["spear","sword","archer","heavy"],
W={spear:1,sword:1,archer:1,heavy:6},
Q=[["name","Dedina"],["spear","Kopija"],["sword","Meč"],
["archer","Lukostrelec"],["heavy","Ťažká jazda"],["units","DEFF populácia"]],
K=[
["full","FULL DEFF","#287a31","#d4edda",16500],
["three","3/4 DEFF","#5e8627","#e6f5d0",13000],
["half","2/4 DEFF","#9a7400","#fff3cd",10000],
["quarter","1/4 DEFF","#b76500","#ffe5b4",5500],
["small","Pod 1/4","#777","#f1f1f1",0]
];
if(document.getElementById("sdDM"))return;
const read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},
load=()=>read(S,{}),
save=d=>localStorage.setItem(S,JSON.stringify(d)),
esc=x=>String(x??"").replace(/[&<>"']/g,c=>({
"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c])),
icon=u=>`<img src="${A+u}.webp" width="16" style="vertical-align:middle">`,
coord=s=>String(s).match(/\b\d{1,3}\|\d{1,3}\b/)?.[0],
fmt=n=>Number(n||0).toLocaleString("sk-SK"),
empty=()=>Object.fromEntries(U.map(u=>[u,0])),
pop=v=>U.reduce((s,u)=>s+(v[u]||0)*W[u],0),
normalize=s=>String(s??"").normalize("NFD")
.replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
function player(){
const s=document.querySelector('#ally_content select[name="player_id"]')
||document.querySelector('select[name="player_id"]');
return s?.selectedOptions[0]?.textContent.trim()||"Neznámy";
}
let opt=read(O,{mode:"current",filters:K.map(c=>c[0])});
let mode=["current","incoming","total"].includes(opt.mode)?opt.mode:"current";
let filters=Array.isArray(opt.filters)?opt.filters:K.map(c=>c[0]);
let active=player(),key="units",asc=false,status="";
function persistOptions(){localStorage.setItem(O,JSON.stringify({mode,filters}))}
function values(v){
const a=v.current||empty(),b=v.incoming||empty();
return Object.fromEntries(U.map(u=>[
u,mode==="current"?(a[u]||0):mode==="incoming"?(b[u]||0):(a[u]||0)+(b[u]||0)
]));
}
function category(n){return K.find(c=>n>=c[4])||K[K.length-1]}
function allRows(){
return (load()[active]?.villages||[]).map((v,i)=>{
const x=values(v),units=pop(x);
return {v,i,x,units,cat:category(units)};
});
}
function rows(){
return allRows().filter(o=>filters.includes(o.cat[0])).sort((a,b)=>{
const n=key==="name"?a.v.name.localeCompare(b.v.name,"sk",{numeric:true}):
(key==="units"?a.units-b.units:a.x[key]-b.x[key]);
return asc?n:-n;
});
}
const chosen=()=>rows().filter(o=>o.v.selected!==false);
const p=document.createElement("div");
p.id="sdDM";
p.style.cssText="position:fixed;top:100px;left:120px;width:78vw;height:75vh;max-width:95vw;max-height:92vh;background:#f4e4bc;border:2px solid #8b5a2b;border-radius:8px;font:13px Verdana;color:#000;z-index:99999;display:flex;flex-direction:column";
p.innerHTML=`
<style>
#sdDM *{box-sizing:border-box}
#sdDM button{padding:5px 8px;margin:2px;font-weight:bold;background:linear-gradient(#947a62,#6c4824);color:white;border:1px solid #000;border-radius:5px;cursor:pointer}
#sdDM select{padding:4px;background:#fff8e7;border:1px solid #8b5a2b}
#sdDM th{padding:7px;border-right:1px solid #bfa77b;cursor:pointer;white-space:nowrap;background:#d9c79e;position:sticky;top:0}
#sdDM td{padding:6px;border-bottom:1px solid #d6c8a9}
#sdDM .flt{display:inline-flex;align-items:center;gap:4px;margin:3px 10px 3px 0;font-weight:bold;cursor:pointer}
#sdDM small{display:block;font-size:10px;color:#69553b;white-space:nowrap;margin-top:3px}
</style>
<div id="sdDH" style="cursor:move;touch-action:none;background:#d9c79e;padding:9px;text-align:center;position:relative;font-weight:bold;font-size:16px">
${icon("spear")} Kmeňový DEFF Manager ${icon("heavy")}
<div id="sdDP" style="font-size:13px;margin-top:4px"></div>
<button id="sdDClose" style="position:absolute;right:4px;top:2px">×</button>
</div>
<div style="padding:5px">
<button id="sdDUpdate">Aktualizovať</button>
<button id="sdDAll">Vybrať všetky</button>
<button id="sdDCopy">Kopírovať</button>
<button id="sdDBB">Kopírovať BBCode</button>
<button id="sdDPlan">Kopírovať plánovač</button>
<label style="display:inline-block;margin:4px">Zobrazenie:
<select id="sdDMode">
<option value="current">V dedine</option>
<option value="incoming">Prichádzajúce</option>
<option value="total">Spolu</option>
</select></label>
</div>
<div id="sdDFilters" style="padding:5px 10px;border-block:1px solid #bfa77b">
${K.map(c=>`<label class="flt" style="color:${c[2]}"><input type="checkbox" data-cat="${c[0]}" ${filters.includes(c[0])?"checked":""}>${c[1]}</label>`).join("")}
<small>Kategórie aj súčty sa riadia zvoleným zobrazením. Kopírujú sa iba vybrané zobrazené dediny.</small>
<small>DEFF populácia = kopije + meče + luky + 6 × ťažká jazda. SD = 20 000 populácie.</small>
</div>
<div id="sdDStatus" style="padding:5px 10px;font-size:11px;color:#69553b"></div>
<div id="sdDList" style="flex:1;min-height:0;overflow:auto;background:#fffaf0;margin:0 4px;border:1px solid #8b5a2b;border-radius:5px"></div>
<div id="sdDSum" style="padding:8px;font-weight:bold;line-height:1.6"></div>`;
document.body.appendChild(p);
const $=s=>p.querySelector(s);
$("#sdDMode").value=mode;
function render(){
if(!p.isConnected)return;
const r=rows(),sel=r.filter(o=>o.v.selected!==false);
const totals=empty(),here=empty(),inc=empty();
let h=`<table style="width:100%;border-collapse:collapse;text-align:center">
<thead><tr>${Q.map(([k,n])=>`<th data-sort="${k}">${n}${key===k?(asc?" ▲":" ▼"):""}</th>`).join("")}<th>Kategória</th></tr></thead><tbody>`;
for(const o of r){
const {v,i,x,units,cat}=o;
h+=`<tr style="background:${cat[3]}">
<td style="text-align:left"><label style="cursor:pointer;white-space:nowrap">
<input class="sdDCheck" type="checkbox" data-index="${i}" ${v.selected!==false?"checked":""}> ${esc(v.name)}
</label></td>
${U.map(u=>`<td>${fmt(x[u])} ${icon(u)}${mode==="total"?`<small>${fmt(v.current[u])} doma + ${fmt(v.incoming[u])} na ceste</small>`:""}</td>`).join("")}
<td><b>${fmt(units)}</b>${mode==="total"?`<small>${fmt(pop(v.current))} + ${fmt(pop(v.incoming))}</small>`:""}</td>
<td style="color:${cat[2]};font-weight:bold;white-space:nowrap">${cat[1]}</td></tr>`;
}
if(!r.length)h+='<tr><td colspan="7" style="padding:25px">Žiadne dediny. Otvor prehľad Obrana, klikni na Aktualizovať alebo skontroluj filtre.</td></tr>';
$("#sdDList").innerHTML=h+"</tbody></table>";
$("#sdDP").textContent=active;
const data=load()[active];
$("#sdDStatus").textContent=status||(data?.updated?
`Načítané: ${new Date(data.updated).toLocaleString("sk-SK")} • Údaje sú uložený snímok prehľadu.`:
"Otvor kmeňový prehľad Obrana požadovaného hráča a klikni na Aktualizovať.");
for(const {v,x} of sel)for(const u of U){
totals[u]+=x[u];here[u]+=v.current[u];inc[u]+=v.incoming[u];
}
$("#sdDSum").innerHTML=
`Zobrazené: ${r.length} | Vybrané: ${sel.length} | DEFF populácia: ${fmt(pop(totals))} | SD: ${(pop(totals)/20000).toFixed(2)}
<br>V dedine: ${fmt(pop(here))} | Prichádzajúce: ${fmt(pop(inc))} | Spolu: ${fmt(pop(here)+pop(inc))}
<br>${U.map(u=>`<span style="display:inline-block;margin-right:15px">${icon(u)} ${fmt(totals[u])}</span>`).join("")}`;
$("#sdDAll").textContent=r.length&&r.every(o=>o.v.selected!==false)?"Odznačiť všetky":"Vybrať všetky";
}

/* Rozbalí aj bunky s rowspan/colspan, aby sedeli stĺpce
   pri druhom riadku dediny – „prichádzajúce“. */
function grid(table){
const out=[];
const rr=[...table.rows].filter(r=>r.closest("table")===table);
rr.forEach((row,ri)=>{
out[ri]??=[];
let ci=0;
for(const cell of row.cells){
while(out[ri][ci])ci++;
const rs=cell.rowSpan===0?rr.length-ri:Math.max(1,cell.rowSpan||1);
const cs=Math.max(1,cell.colSpan||1);
for(let y=0;y<rs;y++){
out[ri+y]??=[];
for(let x=0;x<cs;x++)out[ri+y][ci+x]=cell;
}
ci+=cs;
}
});
return out.slice(0,rr.length);
}
function findTable(){
for(const table of document.querySelectorAll("#ally_content table")){
const g=grid(table);
for(let ri=0;ri<g.length;ri++){
const map={};
g[ri].forEach((cell,ci)=>{
for(const img of cell.querySelectorAll("img")){
const u=(img.getAttribute("src")||"").match(/(?:^|\/)unit_(spear|sword|axe|archer|spy|light|marcher|heavy|ram|catapult|knight|snob|militia)(?:[.@/?_-]|$)/i)?.[1]?.toLowerCase();
if(u&&map[u]===undefined)map[u]=ci;
}
});
if(["spear","sword","heavy"].every(u=>map[u]!==undefined)){
return {g,map,header:ri};
}
}
}
return null;
}
function parseCount(cell,label){
const text=(cell?.textContent||"").replace(/[\s\u00a0\u202f.,]/g,"");
if(!/^\d+$/.test(text)||!Number.isSafeInteger(Number(text))){
throw new Error(`Nedajú sa spoľahlivo načítať jednotky: ${label}.`);
}
return Number(text);
}
$("#sdDUpdate").onclick=()=>{
try{
const found=findTable();
if(!found)throw new Error("Nenašla sa tabuľka obrany. Otvor záložku Obrana v prehľade člena kmeňa.");
const {g,map,header}=found;
const firstUnit=Math.min(...Object.values(map));
const villages=new Map();
let lastId=null,currentRows=0,incomingRows=0;
for(let ri=header+1;ri<g.length;ri++){
const row=g[ri];
const prefix=[...new Set(row.slice(0,firstUnit).filter(Boolean))];
const nameCell=prefix.find(c=>coord(c.textContent));
const id=nameCell?coord(nameCell.textContent):lastId;
const label=prefix.map(c=>normalize(c.textContent)).join(" ");
let type=null;
if(/prichadzajuce|incoming/.test(label))type="incoming";
else if(/v dedine|in village|in the village/.test(label))type="current";
if(!type)continue;
if(!id)throw new Error("Riadok jednotiek nemá rozpoznateľné súradnice dediny.");
lastId=id;
if(!villages.has(id))villages.set(id,{
name:nameCell?.textContent.trim()||id,
current:empty(),incoming:empty(),seen:{}
});
const v=villages.get(id);
if(v.seen[type])throw new Error(`Duplicitný riadok ${type==="current"?"v dedine":"prichádzajúce"} pri ${id}.`);
const counts=empty();
for(const u of U){
counts[u]=map[u]===undefined?0:parseCount(row[map[u]],`${id} – ${u}`);
}
v[type]=counts;v.seen[type]=true;
if(type==="current")currentRows++;else incomingRows++;
}
if(!villages.size||!currentRows)throw new Error("Nenašli sa riadky „v dedine“. Otvor prehľad Obrana.");
for(const [id,v] of villages){
if(!v.seen.current||!v.seen.incoming){
throw new Error(`Pri ${id} chýba riadok „v dedine“ alebo „prichádzajúce“. Načítanie bolo zastavené.`);
}
}
const pl=player(),d=load();
const old=new Map((d[pl]?.villages||[]).map(v=>[coord(v.name)||v.name,v.selected!==false]));
d[pl]={updated:Date.now(),villages:[...villages.entries()].map(([id,v])=>({
name:v.name,current:v.current,incoming:v.incoming,
selected:old.has(id)?old.get(id):true
}))};
save(d);active=pl;
status=`Načítané: ${new Date(d[pl].updated).toLocaleString("sk-SK")} • ${villages.size} dedín • ${currentRows} riadkov v dedine • ${incomingRows} prichádzajúcich.`;
render();
}catch(e){alert(e.message+"\nPôvodné uložené údaje zostali zachované.")}
};
$("#sdDMode").onchange=e=>{
mode=e.target.value;persistOptions();render();
};
$("#sdDFilters").onchange=()=>{
filters=[...p.querySelectorAll("[data-cat]:checked")].map(e=>e.dataset.cat);
persistOptions();render();
};
$("#sdDAll").onclick=()=>{
const r=rows();if(!r.length)return;
const on=!r.every(o=>o.v.selected!==false),d=load();
if(!d[active])return;
for(const {i} of r)d[active].villages[i].selected=on;
save(d);render();
};
$("#sdDList").onchange=e=>{
if(!e.target.matches(".sdDCheck"))return;
const d=load(),i=Number(e.target.dataset.index);
if(!d[active]?.villages[i])return;
d[active].villages[i].selected=e.target.checked;
save(d);render();
};
$("#sdDList").onclick=e=>{
const th=e.target.closest("[data-sort]");if(!th)return;
const k=th.dataset.sort;asc=key===k?!asc:k==="name";key=k;render();
};
async function copy(text){
if(!chosen().length)return alert("Nie je vybraná žiadna dedina.");
try{await navigator.clipboard.writeText(text);alert("Skopírované.")}
catch{
const t=document.createElement("textarea");
t.value=text;t.style.cssText="position:fixed;left:-9999px;top:0";
document.body.appendChild(t);t.select();
let ok=false;try{ok=document.execCommand("copy")}catch{}
t.remove();alert(ok?"Skopírované.":"Kopírovanie sa nepodarilo. Povoľ prístup do schránky.");
}
}
const modeName=()=>({current:"V dedine",incoming:"Prichádzajúce",total:"Spolu"}[mode]);
$("#sdDCopy").onclick=()=>{
const r=chosen();
copy(`DEFF ${active} – ${modeName()}\n\n`+r.map(({v,x,units,cat})=>
`${v.name} – ${cat[1]}\nKopije: ${x.spear}, meče: ${x.sword}, luky: ${x.archer}, ŤJ: ${x.heavy}\nV dedine: ${pop(v.current)} | Prichádzajúce: ${pop(v.incoming)} | Zvolené: ${units}`
).join("\n\n")+`\n\nDEFF populácia: ${r.reduce((n,o)=>n+o.units,0)}`);
};
$("#sdDBB").onclick=()=>{
const r=chosen();
copy(`[b]DEFF ${active} – ${modeName()}[/b]\n\n`+
r.map(({v,x,units,cat})=>
`[coord]${coord(v.name)}[/coord] [b][color=${cat[2]}]${cat[1]}[/color][/b]\n`+
`[unit]spear[/unit] ${x.spear}  [unit]sword[/unit] ${x.sword}  [unit]archer[/unit] ${x.archer}  [unit]heavy[/unit] ${x.heavy}\n`+
`V dedine: ${fmt(pop(v.current))} | Prichádzajúce: ${fmt(pop(v.incoming))} | Zvolené: ${fmt(units)}\n`
).join("\n"));
};
$("#sdDPlan").onclick=()=>copy(`${active}: ${chosen().length}x\n`);
$("#sdDClose").onclick=()=>p.remove();
const pos=read(P,null);
if(pos){
const x=parseFloat(pos.left),y=parseFloat(pos.top);
if(Number.isFinite(x))p.style.left=Math.max(0,Math.min(innerWidth-80,x))+"px";
if(Number.isFinite(y))p.style.top=Math.max(0,Math.min(innerHeight-40,y))+"px";
}
$("#sdDH").onpointerdown=e=>{
if(e.button!==0||e.target.closest("button"))return;
e.preventDefault();
const h=$("#sdDH"),x=p.offsetLeft-e.clientX,y=p.offsetTop-e.clientY;
h.setPointerCapture(e.pointerId);
h.onpointermove=e=>{
p.style.left=Math.max(0,Math.min(innerWidth-80,e.clientX+x))+"px";
p.style.top=Math.max(0,Math.min(innerHeight-40,e.clientY+y))+"px";
};
h.onpointerup=h.onpointercancel=()=>{
h.onpointermove=null;h.onpointerup=h.onpointercancel=null;
localStorage.setItem(P,JSON.stringify({left:p.style.left,top:p.style.top}));
};
};
render();
})();
