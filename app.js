(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const enc = new TextEncoder(), dec = new TextDecoder();
const DB_NAME = "kanri-book-vault", STORE = "secure", RECORD = "vault", KEY_RECORD = "device-key";
const AAD_PREFIX = "kanri-book|format-2|";
const EMOJIS = ["🐶","🐱","🐰","🦊","🐻","🐼","🐸","🐧","🦉","🦔","🐢","🐙","🐳","🦋","🌵","🍀","🌻","🍎","🍋","🍇","🍙","🍩","☕","🎈","🎧","🚲","🚗","✈️","🌙","⭐","☁️","🔥","💧","🎲","🧸","📚"];
const CARRIERS = {
  "docomo": ["ドコモ MAX","ドコモ ポイ活 MAX","ドコモ ポイ活 20","ドコモ mini"],
  "ahamo": ["ahamo"],
  "au": ["auバリューリンクプラン","auバリューリンク マネ活2","使い放題MAX＋ 5G／4G","スマホミニプラン＋"],
  "UQ mobile": ["コミコミプランバリュー","トクトクプラン2"],
  "povo": ["povo2.0"],
  "SoftBank": ["ペイトク２","テイガク無制限","ミニフィット２","スマホデビュープラン＋"],
  "Y!mobile": ["シンプル3 S","シンプル3 M","シンプル3 L"],
  "LINEMO": ["LINEMOベストプラン","LINEMOベストプランV"],
  "楽天モバイル": ["Rakuten最強プラン","Rakuten最強U-NEXT"],
  "IIJmio": ["ギガプラン"],
  "LinksMate": [],
  "mineo": ["マイピタ","マイそく スタンダード","マイそく プレミアム","マイそく ライト"],
  "日本通信SIM": ["合理的シンプル290プラン","合理的みんなのプラン","合理的50GBプラン"],
  "NUROモバイル": ["NEOプラン","NEOプランW","VMプラン","VLプラン"],
  "BIGLOBEモバイル": ["プランS","プランR","プランM"],
  "HISモバイル": ["自由自在2.0プラン"],
  "イオンモバイル": ["音声プラン","シェアプラン","やさしいプラン"],
  "J:COM MOBILE": ["J:COM MOBILE Aプラン ST","J:COM MOBILE Aプラン SU"],
  "JALモバイル": ["シンプルワンプラン","自分に合ったぴったりプラン"],
  "ANAモバイル": ["基本プラン"]
};
const DEFAULT_REVIEW_DAYS = Object.fromEntries([...Object.keys(CARRIERS),"other"].map(name=>[name,180]));
let db, key = null, book = null, unlockCode = null, filter = "all", viewMode = "line", detailId = null, idleTimer = null, saveQueue = Promise.resolve(), formReviewAuto = true;
const emptyBook = () => ({ schema:"kanri-book", schemaVersion:1, version:1, lines:[], sets:[], devices:[], settings:{ autoLock:15,reviewDays:{...DEFAULT_REVIEW_DAYS} }, createdAt:Date.now(), updatedAt:Date.now() });

const openDB = () => new Promise((resolve,reject) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
const dbGet = (name=RECORD) => new Promise((resolve,reject) => { const r=db.transaction(STORE).objectStore(STORE).get(name); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); });
const dbPut = (value,name=RECORD) => new Promise((resolve,reject) => { const t=db.transaction(STORE,"readwrite"); t.objectStore(STORE).put(value,name); t.oncomplete=resolve; t.onerror=()=>reject(t.error); });
const dbPutBoth = (record,cryptoKey) => new Promise((resolve,reject) => { const t=db.transaction(STORE,"readwrite"),s=t.objectStore(STORE);s.put(record,RECORD);s.put(cryptoKey,KEY_RECORD);t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error); });
const bytes = (n) => crypto.getRandomValues(new Uint8Array(n));
const b64 = (arr) => { const a=new Uint8Array(arr),parts=[];for(let i=0;i<a.length;i+=32768)parts.push(String.fromCharCode(...a.subarray(i,i+32768)));return btoa(parts.join("")); };
const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const shuffle = values => { const a=[...values]; for(let i=a.length-1;i>0;i--){const r=new Uint32Array(1);crypto.getRandomValues(r);const j=r[0]%(i+1);[a[i],a[j]]=[a[j],a[i]]}return a; };
const encryptPart = async (data,cryptoKey,purpose) => { const iv=bytes(12),aad=enc.encode(AAD_PREFIX+purpose),plain=enc.encode(JSON.stringify(data));const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:aad,tagLength:128},cryptoKey,plain);return {iv:b64(iv),ciphertext:b64(ciphertext)}; };
const decryptPart = async (part,cryptoKey,purpose) => JSON.parse(dec.decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(part.iv),additionalData:enc.encode(AAD_PREFIX+purpose),tagLength:128},cryptoKey,unb64(part.ciphertext))));
const newRecord = async (data,cryptoKey,code) => ({format:2,cipher:"AES-256-GCM",key:"non-extractable-device-key",gate:await encryptPart({sequence:code},cryptoKey,"gate"),payload:await encryptPart(data,cryptoKey,"payload"),updatedAt:Date.now()});

function runPicker(containerId,expected,onDone){
  const root=$(containerId),chosen=[];
  const paint=()=>{root.replaceChildren();const progress=document.createElement("div");progress.className="emoji-progress";for(let i=0;i<3;i++){const slot=document.createElement("span");slot.className=`emoji-slot ${chosen[i]?"filled":""}`;slot.textContent=chosen[i]||"";progress.append(slot)}const prompt=document.createElement("div");prompt.className="emoji-prompt";prompt.textContent=`${["1つ目","2つ目","3つ目"][chosen.length]}の絵文字を選ぶ`;const correct=expected?.[chosen.length],pool=EMOJIS.filter(x=>x!==correct),choices=correct?shuffle([correct,...shuffle(pool).slice(0,5)]):shuffle(EMOJIS).slice(0,6),grid=document.createElement("div");grid.className="emoji-grid";choices.forEach(emoji=>{const b=document.createElement("button");b.type="button";b.className="emoji-choice";b.textContent=emoji;b.setAttribute("aria-label",emoji);b.onclick=()=>{chosen.push(emoji);if(chosen.length===3){root.querySelectorAll("button").forEach(x=>x.disabled=true);onDone([...chosen]);}else paint()};grid.append(b)});root.append(progress,prompt,grid)};
  paint();
}
async function prepareUnlock(){
  try{const record=await dbGet(),deviceKey=await dbGet(KEY_RECORD);if(!record||!deviceKey||record.format!==2)throw new Error("unsupported");const gate=await decryptPart(record.gate,deviceKey,"gate");unlockCode=gate.sequence;runPicker("unlock-picker",unlockCode,unlockWithCode)}catch{showFatal("暗号化データを開けません。ブラウザの保存データが揃っているか確認してください。");}
}
async function createVault(code){
  $("setup-error").textContent="";
  try{const deviceKey=await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);const data=emptyBook(),record=await newRecord(data,deviceKey,code);await dbPutBoth(record,deviceKey);key=deviceKey;book=data;unlockCode=code;navigator.storage?.persist?.().catch(()=>{});enterApp()}
  catch{key=null;book=null;$("setup-error").textContent="保存できませんでした。もう一度お試しください。";runPicker("setup-picker",null,createVault)}
}
async function unlockWithCode(code){
  $("unlock-error").textContent="";
  if(code.some((x,i)=>x!==unlockCode[i])){$("unlock-error").textContent="絵文字の順番が違います。";setTimeout(()=>runPicker("unlock-picker",unlockCode,unlockWithCode),450);return}
  try{const record=await dbGet(),deviceKey=await dbGet(KEY_RECORD);book=await decryptPart(record.payload,deviceKey,"payload");key=deviceKey;enterApp()}
  catch{key=null;book=null;$("unlock-error").textContent="データを開けませんでした。";runPicker("unlock-picker",unlockCode,unlockWithCode)}
}
async function init(){
  if (!window.crypto?.subtle || !window.indexedDB) { showFatal("このブラウザでは暗号化保存を使えません。Safari、Chrome、Firefoxの最新版で開いてください。"); return; }
  try { db=await openDB(); const record=await dbGet(); if(record){show("unlock-view");await prepareUnlock()}else{show("setup-view");runPicker("setup-picker",null,createVault)} }
  catch { showFatal("保存データを開けません。ブラウザの設定を確認してください。"); }
}
function show(id){ ["setup-view","unlock-view","app-view"].forEach(x=>$(x).hidden=x!==id); document.body.classList.toggle("unlocked",id==="app-view"); }
function showFatal(message){ show("setup-view"); $("setup-view").innerHTML=`<h2>管理ブックを開けません</h2><p class="lead" style="margin-top:.6rem"></p>`; $("setup-view").querySelector("p").textContent=message; }
function enterApp(){ book.sets=Array.isArray(book.sets)?book.sets:[];book.devices=Array.isArray(book.devices)?book.devices:[];book.settings=book.settings||{};book.settings.reviewDays={...DEFAULT_REVIEW_DAYS,...(book.settings.reviewDays||{})};show("app-view");render();resetIdle(); }
function lock(){ key=null; book=null; detailId=null; clearTimeout(idleTimer);document.querySelectorAll(".detail-secret code").forEach(x=>x.textContent="");document.querySelectorAll("dialog[open]").forEach(d=>d.close());show("unlock-view");prepareUnlock(); }
function resetIdle(){ if(!book)return; clearTimeout(idleTimer); const min=Number(book.settings?.autoLock??15); if(min>0) idleTimer=setTimeout(lock,min*60000); }
["pointerdown","keydown"].forEach(type=>document.addEventListener(type,resetIdle,{passive:true}));
document.addEventListener("visibilitychange",()=>{ if(document.hidden && book && Number(book.settings?.autoLock)>0) resetIdle(); });

function persist(){
  if(!book||!key)return Promise.reject(new Error("locked")); book.updatedAt=Date.now();
  saveQueue=saveQueue.then(async()=>{const old=await dbGet(),payload=await encryptPart(book,key,"payload");await dbPut({...old,payload,updatedAt:Date.now()})});
  return saveQueue;
}
const uuid = () => crypto.randomUUID?.() || [...bytes(16)].map(x=>x.toString(16).padStart(2,"0")).join("");
const digits = s => (s||"").replace(/\D/g,"");
const formatPhone = s => { const d=digits(s); return d.length===11?`${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`:s||"番号なし"; };
const dateText = s => { if(!s)return"未記録"; const [y,m,d]=s.split("-"); return `${y}年${Number(m)}月${Number(d)}日`; };
const daysFrom = s => s ? Math.floor((new Date().setHours(0,0,0,0)-new Date(s+"T00:00:00"))/86400000) : null;
const daysUntil = s => s ? Math.ceil((new Date(s+"T00:00:00")-new Date().setHours(0,0,0,0))/86400000) : null;
const daysBetween = (start,end) => { if(!start||!end)return null;const a=start.split("-").map(Number),b=end.split("-").map(Number);return Math.round((Date.UTC(b[0],b[1]-1,b[2])-Date.UTC(a[0],a[1]-1,a[2]))/86400000); };
const addDays = (start,count) => {if(!start)return"";const a=start.split("-").map(Number),d=new Date(Date.UTC(a[0],a[1]-1,a[2]+Number(count)));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;};
const selectedCarrierKey = () => $("carrier").value||"other";
const reviewDaysFor = carrierKey => Number(book.settings.reviewDays?.[carrierKey]??180);
function updateReviewDayCount(){const n=daysBetween($("contract-date").value,$("next-date").value),el=$("review-day-count"),days=reviewDaysFor(selectedCarrierKey());el.textContent=n===null?`設定中の目安：契約から ${days} 日`:n<0?"見直し日が契約日より前になっています。":`契約から ${n.toLocaleString("ja-JP")} 日${formReviewAuto?"（設定中の目安）":""}`;el.style.color=n<0?"var(--danger)":"";}
function applyReviewDate(force=false){const start=$("contract-date").value;if(!start)return;if(force||formReviewAuto||!$("next-date").value){$("next-date").value=addDays(start,reviewDaysFor(selectedCarrierKey()));formReviewAuto=true}updateReviewDayCount();}
function fillCarrierSelect(line){const select=$("carrier");select.replaceChildren(new Option("選択",""));Object.keys(CARRIERS).forEach(name=>select.add(new Option(name,name)));select.add(new Option("その他","other"));const known=line?.carrierKey&&CARRIERS[line.carrierKey]?line.carrierKey:CARRIERS[line?.carrier]?line.carrier:line?.carrier?"other":"";select.value=known;$("carrier-custom").value=known==="other"?(line?.carrier||""):"";$("carrier-custom-field").hidden=known!=="other";fillPlanSelect(line?.plan||"")}
function fillPlanSelect(selected=""){const carrier=$("carrier").value,plans=CARRIERS[carrier]||[],select=$("plan");select.replaceChildren(new Option("選択",""));plans.forEach(name=>select.add(new Option(name,name)));select.add(new Option("その他","__other__"));if(selected&&plans.includes(selected)){select.value=selected;$("plan-custom").value=""}else if(selected){select.value="__other__";$("plan-custom").value=selected}else{$("plan-custom").value=""}$("plan-custom-field").hidden=select.value!=="__other__";}
function selectedCarrierName(){return $("carrier").value==="other"?$("carrier-custom").value.trim():$("carrier").value;}
function selectedPlanName(){return $("plan").value==="__other__"?$("plan-custom").value.trim():$("plan").value;}
const statusText = s => ({active:"利用中",planned:"MNP予定",cancelled:"終了"}[s]||"利用中");
const escapeSearch = v => (v??"").toString().toLowerCase();
const readSharedArray = keyName => { try { const value=JSON.parse(localStorage.getItem(keyName)); return Array.isArray(value)?value:[]; } catch { return []; } };
const kaisenProfiles = () => readSharedArray("simProfiles").filter(p=>p&&p.id&&p.name);
const kaisenHistory = () => readSharedArray("checkHistory").filter(r=>r&&r.t);
const linkedProfile = line => kaisenProfiles().find(p=>p.id===line.links?.kaisenCheckProfileId);
const latestCheck = line => kaisenHistory().filter(r=>r.profileId===line.links?.kaisenCheckProfileId).sort((a,b)=>b.t-a.t)[0];
const lineSet = line => book.sets.find(x=>x.id===line.setId);
const lineDevice = line => book.devices.find(x=>x.id===line.deviceId);
function deadlines(line){
  const items=[]; if(line.nextDate&&!line.nextDone) items.push({date:line.nextDate,name:line.nextAction||"見直し"});
  (line.options||[]).filter(o=>o.date&&!o.done).forEach(o=>items.push({date:o.date,name:o.name||"オプション"}));
  return items.sort((a,b)=>a.date.localeCompare(b.date));
}
function render(){
  const lines=book.lines||[], nowSoon=lines.flatMap(deadlines).filter(x=>{const d=daysUntil(x.date);return d>=0&&d<=30}).length;
  $("active-count").innerHTML=`${lines.filter(x=>x.status!=="cancelled").length}<small>回線</small>`;
  $("soon-count").innerHTML=`${nowSoon}<small>件</small>`;
  $("auto-lock").value=String(book.settings?.autoLock??15);
  const q=escapeSearch($("search").value).replace(/-/g,"");
  const visible=lines.filter(l=>filter==="all"||l.status===filter).filter(l=>{
    const set=lineSet(l),device=lineDevice(l); const hay=[l.phone,l.nickname,l.carrier,l.holder,l.plan,l.store,l.notes,set?.name,set?.email,device?.name,device?.model,device?.imei,device?.eid].map(escapeSearch).join(" ").replace(/-/g,""); return !q||hay.includes(q);
  }).sort((a,b)=>(a.status==="cancelled")-(b.status==="cancelled")||(b.updatedAt||0)-(a.updatedAt||0));
  const list=$("line-list"); list.replaceChildren();
  if(!visible.length){
    const empty=document.createElement("div"); empty.className="card empty";
    empty.innerHTML=`<svg class="empty-dog" viewBox="0 0 90 66" aria-hidden="true"><path d="M71 43q15-9 9-24" fill="none" stroke="#7CAD88" stroke-width="6" stroke-linecap="round"/><ellipse cx="48" cy="47" rx="29" ry="14" fill="#C3E2C9"/><circle cx="26" cy="36" r="16" fill="#A7D3B0"/><path d="M16 25Q5 17 9 39l10 1ZM36 24q10-5 6 13l-8 4Z" fill="#75AD82"/><circle cx="22" cy="35" r="1.7" fill="#466C50"/><circle cx="31" cy="35" r="1.7" fill="#466C50"/><ellipse cx="27" cy="40" rx="2.5" ry="2" fill="#466C50"/><path d="M27 42q-3 4-6 1m6-1q3 4 6 1" fill="none" stroke="#466C50" stroke-width="1.3"/><path d="M34 57v6m28-6v6" stroke="#86B890" stroke-width="6" stroke-linecap="round"/></svg><h3>${lines.length?"該当する回線はありません":"回線が登録されていません"}</h3><p>${lines.length?"検索条件を変更してください。":"携帯番号や契約日を登録できます。"}</p>${lines.length?"":"<button class=\"primary\" type=\"button\">回線を追加</button>"}`;
    empty.querySelector("button")?.addEventListener("click",()=>openForm()); list.append(empty); return;
  }
  if(viewMode==="line") visible.forEach(line=>list.append(makeCard(line)));
  else {
    const source=viewMode==="device"?book.devices:book.sets, keyName=viewMode==="device"?"deviceId":"setId", none=viewMode==="device"?"端末なし":"セットなし";
    const groups=new Map(); visible.forEach(line=>{const id=line[keyName]||"__none__";if(!groups.has(id))groups.set(id,[]);groups.get(id).push(line)});
    [...groups.entries()].sort(([a],[b])=>(a==="__none__")-(b==="__none__")).forEach(([id,rows])=>{const entity=source.find(x=>x.id===id),group=document.createElement("section");group.className="line-group";const h=document.createElement("div");h.className="group-heading";h.textContent=entity?.name||none;group.append(h);rows.forEach(line=>group.append(makeCard(line)));list.append(group)});
  }
}
function makeCard(line){
  const el=document.createElement("article"); el.className=`line-card ${line.status||"active"}`;
  const top=document.createElement("div"); top.className="line-top";
  const title=document.createElement("div"); const num=document.createElement("div"); num.className="line-number"; num.textContent=formatPhone(line.phone); const label=document.createElement("div"); label.className="line-label"; label.textContent=[line.nickname,line.carrier].filter(Boolean).join(" · ")||"契約情報"; title.append(num,label);
  const badge=document.createElement("span"); badge.className=`status ${line.status}`; badge.textContent=statusText(line.status); top.append(title,badge); el.append(top);
  const set=lineSet(line),device=lineDevice(line); if(set||device){const tags=document.createElement("div");tags.className="link-tags";[["セット",set?.name],["端末",device?.name]].filter(x=>x[1]).forEach(([kind,value])=>{const tag=document.createElement("span");tag.className="link-tag";tag.textContent=`${kind}：${value}`;tags.append(tag)});el.append(tags)}
  const meta=document.createElement("div"); meta.className="line-meta";
  const elapsed=daysFrom(line.contractDate); [["契約日",dateText(line.contractDate)],["契約から",elapsed===null?"未記録":elapsed<0?"契約前":`${elapsed}日`],["契約したお店",line.store||"未記録"],["プラン",line.plan||"未記録"]].forEach(([a,b])=>{const c=document.createElement("div");c.className="meta-cell";const s=document.createElement("span");s.textContent=a;const strong=document.createElement("strong");strong.textContent=b;c.append(s,strong);meta.append(c)}); el.append(meta);
  const checked=latestCheck(line); if(checked){const dt=new Date(checked.t),box=document.createElement("div");box.className="next-action";box.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>';const span=document.createElement("span");span.textContent=`回線チェック：${dt.getMonth()+1}月${dt.getDate()}日に確認済み`;box.append(span);el.append(box)}
  const next=deadlines(line)[0]; if(next){const d=daysUntil(next.date), box=document.createElement("div");box.className=`next-action ${d<=30?"soon":""}`;box.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';const span=document.createElement("span");span.textContent=d<0?`${next.name}：${Math.abs(d)}日超過`:d===0?`${next.name}：今日`: `${next.name}：あと${d}日`;box.append(span);el.append(box)}
  const hit=document.createElement("button"); hit.type="button"; hit.className="card-hit"; hit.setAttribute("aria-label",`${formatPhone(line.phone)}の詳細`); hit.addEventListener("click",()=>openDetail(line.id)); el.append(hit); return el;
}

function openForm(line=null){
  $("line-form").reset(); $("account-list").replaceChildren(); $("option-list").replaceChildren(); $("form-error").textContent=""; $("line-id").value=line?.id||""; $("form-heading").textContent=line?"回線を編集":"回線を追加"; $("line-delete").hidden=!line;
  const values={phone:line?.phone,nickname:line?.nickname,status:line?.status||"active",holder:line?.holder,"contract-date":line?.contractDate,store:line?.store,"next-action":line?.nextAction,"next-date":line?.nextDate,pin:line?.pin,notes:line?.notes}; Object.entries(values).forEach(([id,v])=>$(id).value=v||"");formReviewAuto=line?.reviewDateAuto??!line?.nextDate;fillCarrierSelect(line);if(formReviewAuto&&line?.contractDate)applyReviewDate();else updateReviewDayCount();
  fillEntitySelect("set",line?.setId); fillEntitySelect("device",line?.deviceId); syncEntityEditor("set"); syncEntityEditor("device");
  const profiles=kaisenProfiles(), select=$("kaisen-profile"); select.replaceChildren(new Option("紐づけない","")); profiles.forEach(p=>select.add(new Option(p.name,p.id))); const linkedId=line?.links?.kaisenCheckProfileId||""; if(linkedId&&!profiles.some(p=>p.id===linkedId))select.add(new Option("以前のSIM（回線チェック側で削除済み）",linkedId)); select.value=linkedId; $("kaisen-link-field").hidden=$("kaisen-link-hint").hidden=profiles.length===0&&!linkedId;
  const set=line?lineSet(line):null; $("account-list").replaceChildren(); (set?.accounts||line?.accounts||[]).forEach(addAccountRow); (line?.options||[]).forEach(addOptionRow); $("line-dialog").showModal(); setTimeout(()=>$("phone").focus(),80);
}
function fillEntitySelect(type,selected=""){const select=$(`${type}-select`),items=type==="set"?book.sets:book.devices,label=type==="set"?"セット":"端末";select.replaceChildren(new Option(`${label}なし`,""),new Option(`＋ 新しい${label}`,"__new__"));items.forEach(x=>select.add(new Option(x.name,x.id)));select.value=items.some(x=>x.id===selected)?selected:""}
function syncEntityEditor(type){const select=$(`${type}-select`),editor=$(`${type}-editor`),id=select.value,items=type==="set"?book.sets:book.devices,entity=items.find(x=>x.id===id);editor.hidden=!id;if(!id)return;if(type==="set"){$("set-name").value=entity?.name||"";$("set-email").value=entity?.email||"";$("account-list").replaceChildren();(entity?.accounts||[]).forEach(addAccountRow)}else{$("device-name").value=entity?.name||"";$("device-model").value=entity?.model||"";$("device-imei").value=entity?.imei||"";$("device-eid").value=entity?.eid||""}}
$("set-select").addEventListener("change",()=>syncEntityEditor("set")); $("device-select").addEventListener("change",()=>syncEntityEditor("device"));
function makeInput(cls,placeholder,value="",type="text"){const i=document.createElement("input");i.className=`control ${cls}`;i.placeholder=placeholder;i.value=value||"";i.type=type;return i}
function addAccountRow(data={}){
  const row=document.createElement("div");row.className="repeat-row";const del=document.createElement("button");del.type="button";del.className="remove-row";del.textContent="×";del.setAttribute("aria-label","アカウントを削除");del.onclick=()=>row.remove();row.append(del);
  const service=document.createElement("label");service.className="field";service.innerHTML="<span>サービス</span>";service.append(makeInput("account-service","dアカウント / au ID など",data.service));
  const grid=document.createElement("div");grid.className="grid-2";const a=document.createElement("label");a.className="field";a.innerHTML="<span>ID</span>";a.append(makeInput("account-id","ID・メールアドレス",data.id));const p=document.createElement("label");p.className="field";p.innerHTML="<span>パスワード・補足</span>";p.append(makeInput("account-secret","必要な場合のみ",data.secret,"password"));grid.append(a,p);row.append(service,grid);$("account-list").append(row);
}
function addOptionRow(data={}){
  const row=document.createElement("div");row.className="repeat-row";const del=document.createElement("button");del.type="button";del.className="remove-row";del.textContent="×";del.setAttribute("aria-label","オプションを削除");del.onclick=()=>row.remove();row.append(del);
  const name=document.createElement("label");name.className="field";name.innerHTML="<span>オプション名</span>";name.append(makeInput("option-name","補償・動画サービスなど",data.name));const date=document.createElement("label");date.className="field";date.innerHTML="<span>見直し日</span>";date.append(makeInput("option-date","",data.date,"date"));const check=document.createElement("label");check.className="check-row";const cb=document.createElement("input");cb.type="checkbox";cb.className="option-done";cb.checked=!!data.done;check.append(cb,document.createTextNode("見直し済み"));row.append(name,date,check);$("option-list").append(row);
}
$("account-add").addEventListener("click",()=>addAccountRow()); $("option-add").addEventListener("click",()=>addOptionRow());
$("carrier").addEventListener("change",()=>{$("carrier-custom-field").hidden=$("carrier").value!=="other";fillPlanSelect();applyReviewDate()});
$("plan").addEventListener("change",()=>{$("plan-custom-field").hidden=$("plan").value!=="__other__"});
$("contract-date").addEventListener("change",()=>applyReviewDate());
$("next-date").addEventListener("change",()=>{formReviewAuto=false;updateReviewDayCount()});
$("review-reset").addEventListener("click",()=>applyReviewDate(true));
$("line-form").addEventListener("submit",async e=>{
  e.preventDefault(); const d=digits($("phone").value); if(d.length<10||d.length>11){$("form-error").textContent="電話番号は10〜11桁で正確に入力してください。";$("phone").focus();return} $("form-error").textContent="";
  const id=$("line-id").value||uuid(), old=book.lines.find(x=>x.id===id), now=Date.now();
  let setId=$("set-select").value,deviceId=$("device-select").value;
  if(setId){if(!$("set-name").value.trim()){$("form-error").textContent="利用セットの名前を入力してください。";$("set-name").focus();return}if(setId==="__new__")setId=uuid()}
  if(deviceId){if(!$("device-name").value.trim()){$("form-error").textContent="端末の呼び名を入力してください。";$("device-name").focus();return}if(deviceId==="__new__")deviceId=uuid()}
  const accounts=[...$("account-list").querySelectorAll(".repeat-row")].map(r=>({service:r.querySelector(".account-service").value.trim(),id:r.querySelector(".account-id").value.trim(),secret:r.querySelector(".account-secret").value})).filter(a=>a.service||a.id||a.secret);
  const options=[...$("option-list").querySelectorAll(".repeat-row")].map(r=>({name:r.querySelector(".option-name").value.trim(),date:r.querySelector(".option-date").value,done:r.querySelector(".option-done").checked})).filter(o=>o.name||o.date);
  if(setId){const value={id:setId,name:$("set-name").value.trim(),email:$("set-email").value.trim(),accounts,updatedAt:now};const i=book.sets.findIndex(x=>x.id===setId);if(i<0)book.sets.push({...value,createdAt:now});else book.sets[i]={...book.sets[i],...value}}
  if(deviceId){const value={id:deviceId,name:$("device-name").value.trim(),model:$("device-model").value.trim(),imei:$("device-imei").value.trim(),eid:$("device-eid").value.trim(),updatedAt:now};const i=book.devices.findIndex(x=>x.id===deviceId);if(i<0)book.devices.push({...value,createdAt:now});else book.devices[i]={...book.devices[i],...value}}
  const line={id,phone:$("phone").value.trim(),phoneDigits:d,nickname:$("nickname").value.trim(),status:$("status").value,carrier:selectedCarrierName(),carrierKey:$("carrier").value||null,holder:$("holder").value.trim(),plan:selectedPlanName(),contractDate:$("contract-date").value,store:$("store").value.trim(),nextAction:$("next-action").value.trim(),nextDate:$("next-date").value,reviewDateAuto:formReviewAuto,pin:$("pin").value,accounts:setId?[]:accounts,setId:setId||null,deviceId:deviceId||null,options,links:{kaisenCheckProfileId:$("kaisen-profile").value||null},notes:$("notes").value.trim(),createdAt:old?.createdAt||now,updatedAt:now};
  const duplicate=book.lines.find(x=>x.id!==id&&digits(x.phone)===d); if(duplicate&&!confirm("同じ電話番号の記録があります。それでも保存しますか？"))return;
  const index=book.lines.findIndex(x=>x.id===id); if(index<0)book.lines.push(line);else book.lines[index]=line;
  const submit=e.currentTarget.querySelector('[type="submit"]');submit.disabled=true;
  try{await persist();$("line-dialog").close();render();toast("保存しました");}catch{$("form-error").textContent="保存できませんでした。もう一度お試しください。"}finally{submit.disabled=false}
});
$("line-delete").addEventListener("click",async()=>{const id=$("line-id").value,line=book.lines.find(x=>x.id===id);if(!line||!confirm(`${formatPhone(line.phone)} の記録を削除しますか？\nこの操作は元に戻せません。`))return;book.lines=book.lines.filter(x=>x.id!==id);await persist();$("line-dialog").close();render();toast("記録を削除しました")});

function addDetail(parent,label,value){const x=document.createElement("div");x.className="detail-item";const s=document.createElement("span");s.textContent=label;const b=document.createElement("strong");b.textContent=value||"未記録";x.append(s,b);parent.append(x)}
function secretRow(value){const wrap=document.createElement("div");wrap.className="detail-secret";const code=document.createElement("code");code.textContent=value?"••••••••":"未記録";const btn=document.createElement("button");btn.type="button";btn.textContent="表示";let shown=false;btn.onclick=()=>{shown=!shown;code.textContent=shown?(value||"未記録"):(value?"••••••••":"未記録");btn.textContent=shown?"隠す":"表示"};wrap.append(code,btn);return wrap}
function openDetail(id){
  const line=book.lines.find(x=>x.id===id);if(!line)return;detailId=id;const body=$("detail-body");body.replaceChildren(),set=lineSet(line),device=lineDevice(line);
  const head=document.createElement("section");head.className="form-section";const n=document.createElement("div");n.className="line-number";n.textContent=formatPhone(line.phone);const sub=document.createElement("div");sub.className="line-label";sub.textContent=[line.nickname,line.carrier,statusText(line.status)].filter(Boolean).join(" · ");head.append(n,sub);const grid=document.createElement("div");grid.className="detail-grid";addDetail(grid,"契約日",dateText(line.contractDate));addDetail(grid,"契約から",daysFrom(line.contractDate)===null?"未記録":`${daysFrom(line.contractDate)}日`);addDetail(grid,"契約名義",line.holder);addDetail(grid,"契約したお店",line.store);addDetail(grid,"プラン・契約",line.plan);addDetail(grid,"見直し日",line.nextDate?`${dateText(line.nextDate)} ${line.nextAction||""}`:"未記録");head.append(grid);body.append(head);
  if(set||device){const sec=document.createElement("section");sec.className="form-section";sec.innerHTML='<div class="form-title">利用セットと端末</div>';const g=document.createElement("div");g.className="detail-grid";addDetail(g,"利用セット",set?.name);addDetail(g,"メール",set?.email);addDetail(g,"端末",device?.name);addDetail(g,"機種",device?.model);addDetail(g,"IMEI",device?.imei);addDetail(g,"EID",device?.eid);sec.append(g);body.append(sec)}
  const pin=document.createElement("section");pin.className="form-section";pin.innerHTML='<div class="form-title">暗証番号</div>';const block=document.createElement("div");block.className="detail-block";block.append(secretRow(line.pin));pin.append(block);body.append(pin);
  const accounts=set?.accounts||line.accounts||[]; if(accounts.length){const sec=document.createElement("section");sec.className="form-section";sec.innerHTML='<div class="form-title">紐づくアカウント</div>';accounts.forEach(a=>{const box=document.createElement("div");box.className="detail-account";const title=document.createElement("strong");title.textContent=a.service||"アカウント";const id=document.createElement("div");id.textContent=a.id||"ID未記録";box.append(title,id,secretRow(a.secret));sec.append(box)});body.append(sec)}
  if(line.options?.length){const sec=document.createElement("section");sec.className="form-section";sec.innerHTML='<div class="form-title">オプション</div>';line.options.forEach(o=>{const box=document.createElement("div");box.className=`detail-option ${o.done?"done":""}`;box.textContent=`${o.name||"オプション"}　${o.date?dateText(o.date):"日付未記録"}${o.done?"　済み":""}`;sec.append(box)});body.append(sec)}
  const kp=linkedProfile(line),check=latestCheck(line); if(kp){const sec=document.createElement("section");sec.className="form-section";sec.innerHTML='<div class="form-title">回線チェックとの紐づけ</div>';const p=document.createElement("p");p.className="hint";p.style.fontSize=".76rem";p.textContent=check?`${kp.name} · 最終チェック ${new Date(check.t).toLocaleString("ja-JP")}`:`${kp.name} · まだチェック記録はありません`;sec.append(p);body.append(sec)}
  if(line.notes){const sec=document.createElement("section");sec.className="form-section";sec.innerHTML='<div class="form-title">メモ</div>';const p=document.createElement("p");p.className="hint";p.style.whiteSpace="pre-wrap";p.style.fontSize=".76rem";p.textContent=line.notes;sec.append(p);body.append(sec)}
  $("detail-dialog").showModal();
}
$("detail-edit").addEventListener("click",()=>{const l=book.lines.find(x=>x.id===detailId);$("detail-dialog").close();openForm(l)});
$("add-open").addEventListener("click",()=>openForm()); $("search").addEventListener("input",render);
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>{viewMode=b.dataset.view;document.querySelectorAll("[data-view]").forEach(x=>x.classList.toggle("active",x===b));render()}));
document.querySelectorAll(".filter-chip").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.filter;document.querySelectorAll(".filter-chip").forEach(x=>x.classList.toggle("active",x===b));render()}));

$("settings-open").addEventListener("click",()=>$("settings-dialog").showModal());
function renderReviewSettings(){const list=$("review-settings-list");list.replaceChildren();[...Object.keys(CARRIERS),"other"].forEach((carrier,index)=>{const row=document.createElement("div");row.className="review-setting-row";const label=document.createElement("label");label.htmlFor=`review-carrier-${index}`;label.textContent=carrier==="other"?"その他":carrier;const wrap=document.createElement("div");wrap.className="review-day-input";const input=document.createElement("input");input.id=`review-carrier-${index}`;input.className="control";input.type="number";input.inputMode="numeric";input.min="1";input.max="3650";input.required=true;input.value=reviewDaysFor(carrier);input.dataset.carrier=carrier;wrap.append(input,document.createTextNode("日"));row.append(label,wrap);list.append(row)})}
$("review-settings-open").addEventListener("click",()=>{$("settings-dialog").close();$("review-settings-error").textContent="";renderReviewSettings();$("review-settings-dialog").showModal()});
$("review-settings-form").addEventListener("submit",async e=>{e.preventDefault();const inputs=[...$("review-settings-list").querySelectorAll("input")],values={};for(const input of inputs){const n=Number(input.value);if(!Number.isInteger(n)||n<1||n>3650){$("review-settings-error").textContent="1日から3650日の範囲で入力してください。";input.focus();return}values[input.dataset.carrier]=n}book.settings.reviewDays=values;book.lines.forEach(line=>{if(!line.reviewDateAuto||!line.contractDate)return;const carrierKey=line.carrierKey&&values[line.carrierKey]?line.carrierKey:CARRIERS[line.carrier]?line.carrier:"other";line.nextDate=addDays(line.contractDate,values[carrierKey]??180);line.updatedAt=Date.now()});try{await persist();$("review-settings-dialog").close();render();toast("設定を保存しました")}catch{$("review-settings-error").textContent="保存できませんでした。"}});
$("auto-lock").addEventListener("change",async e=>{book.settings.autoLock=Number(e.target.value);await persist();resetIdle();toast("設定を保存しました")});
$("lock-now").addEventListener("click",lock);
$("pass-change-open").addEventListener("click",()=>{$("settings-dialog").close();$("pass-error").textContent="";$("pass-dialog").showModal();runPicker("change-picker",null,async code=>{try{const old=await dbGet(),gate=await encryptPart({sequence:code},key,"gate");await dbPut({...old,gate,updatedAt:Date.now()});unlockCode=code;$("pass-dialog").close();toast("絵文字キーを変更しました")}catch{$("pass-error").textContent="変更できませんでした。";runPicker("change-picker",null,()=>{})}})});

document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>$(b.dataset.close).close()));
document.querySelectorAll("dialog").forEach(d=>d.addEventListener("click",e=>{if(e.target===d)d.close()}));
document.querySelectorAll("[data-reveal]").forEach(b=>b.addEventListener("click",()=>{const i=$(b.dataset.reveal),show=i.type==="password";i.type=show?"text":"password";b.textContent=show?"隠す":"表示"}));
function toast(message){const t=$("toast");t.textContent=message;t.classList.add("show");clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove("show"),2200)}
$("reload-latest").addEventListener("click",event=>{const button=event.currentTarget;button.disabled=true;button.textContent="読み込み中…";const u=new URL(location.href);u.searchParams.set("_kb_refresh",Date.now());location.replace(u.href)});
{const u=new URL(location.href);if(u.searchParams.has("_kb_refresh")){u.searchParams.delete("_kb_refresh");history.replaceState(null,"",u.pathname+u.search+u.hash)}}
window.addEventListener("storage",event=>{if(book&&["simProfiles","checkHistory","lastCheck"].includes(event.key))render()});
init();
})();
