(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const enc = new TextEncoder(), dec = new TextDecoder();
const DB_NAME = "kanri-book-vault", STORE = "secure", RECORD = "vault", KEY_RECORD = "device-key";
const AAD_PREFIX = "kanri-book|format-2|";
const LEGACY_EMOJIS = ["🐶","🐱","🐰","🦊","🐻","🐼","🐸","🐧","🦉","🦔","🐢","🐙","🐳","🦋","🌵","🍀","🌻","🍎","🍋","🍇","🍙","🍩","☕","🎈","🎧","🚲","🚗","✈️","🌙","⭐","☁️","🔥","💧","🎲","🧸","📚"];
const LOCK_EMOJIS = ["🐶","🐱","🐰","🐻","🐼","🍎","🍋","🍀","⭐","🌙","🚗","☕"];
const LOCK_DIGITS = ["1","2","3","4","5","6","7","8","9","0"];
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
const RETURN_PROGRAMS = {
  docomo:{months:23,name:"いつでもカエドキプログラム"},
  au:{months:24,name:"スマホトクするプログラム＋"},
  SoftBank:{months:24,name:"新トクするサポート＋"},
  "楽天モバイル":{months:24,name:"楽天モバイル買い替え超トクプログラム"},
  other:{months:24,name:"返却プログラム"}
};
let db, key = null, book = null, gateConfig = null, unlockContext = null, filter = "all", viewMode = "line", detailId = null, idleTimer = null, saveQueue = Promise.resolve(), formReviewAuto = true, draftTimer = null, suppressDraft = false, formDirty = false, skipDraftClose = false, sortDraftOrder = [];
const emptyBook = () => ({ schema:"kanri-book", schemaVersion:1, version:1, lines:[], sets:[], devices:[], draft:null, settings:{ autoLock:15,reviewDays:{...DEFAULT_REVIEW_DAYS},listSort:"default",lineOrder:[] }, createdAt:Date.now(), updatedAt:Date.now() });

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
const newRecord = async (data,cryptoKey,config) => ({format:2,cipher:"AES-256-GCM",key:"non-extractable-device-key",gate:await encryptPart(config,cryptoKey,"gate"),payload:await encryptPart(data,cryptoKey,"payload"),updatedAt:Date.now()});

const lockChoices = mode => mode==="number"?LOCK_DIGITS:mode==="mixed"?[...LOCK_DIGITS,...LOCK_EMOJIS.slice(0,10)]:LOCK_EMOJIS;
const lockModeLabel = mode => ({emoji:"絵文字",number:"数字",mixed:"絵文字と数字",none:"ロックキーなし"}[mode]||"画面ロック");
const lockSummary = config => config?.mode==="none"?"ロックキーなし（ワンタップ）":`${lockModeLabel(config?.mode)}${config?.length||0}個`;
const sameTokens = (a,b) => a.length===b.length&&a.every((value,index)=>value===b[index]);
function makeLockConfig(mode,tokens=[]){return{version:2,mode:mode==="none"?"none":mode,length:mode==="none"?0:tokens.length,tokens:mode==="none"?[]:[...tokens],updatedAt:Date.now()};}
function normalizeLockConfig(value){
  if(value?.version!==2)return null;
  const mode=value.mode,length=Number(value.length),tokens=Array.isArray(value.tokens)?value.tokens:[];
  if(mode==="none"&&length===0&&tokens.length===0)return makeLockConfig("none");
  if(!["emoji","number","mixed"].includes(mode)||![1,2,3].includes(length)||tokens.length!==length)return null;
  const allowed=lockChoices(mode);if(tokens.some(token=>!allowed.includes(token)))return null;
  return{version:2,mode,length,tokens:[...tokens],updatedAt:value.updatedAt||Date.now()};
}
function renderLockEntry(root,config,{prompt="ロックキーを入力",mask=true,autoSubmit=false,actionLabel="この内容で決める",onSubmit,onBack,onFirst}={}){
  const chosen=[];let submitted=false;
  const submit=async()=>{if(submitted||chosen.length!==config.length)return;submitted=true;root.querySelectorAll("button").forEach(button=>button.disabled=true);try{await onSubmit([...chosen])}catch{submitted=false;paint()}};
  const paint=()=>{
    root.replaceChildren();
    const progress=document.createElement("div");progress.className="emoji-progress";
    for(let i=0;i<config.length;i++){const slot=document.createElement("span");slot.className=`emoji-slot ${chosen[i]?"filled":""}`;slot.textContent=chosen[i]?(mask?"●":chosen[i]):"";progress.append(slot)}
    const label=document.createElement("div");label.className="emoji-prompt";label.textContent=chosen.length<config.length?`${chosen.length+1}個目を選ぶ`:"入力できました";
    const grid=document.createElement("div");grid.className=`lock-key-grid ${config.mode}`;
    lockChoices(config.mode).forEach(token=>{const button=document.createElement("button");button.type="button";button.className=`lock-key ${LOCK_DIGITS.includes(token)?"number":""}`;button.textContent=token;button.setAttribute("aria-label",LOCK_DIGITS.includes(token)?`数字 ${token}`:token);button.onclick=()=>{if(chosen.length===0)onFirst?.();if(chosen.length>=config.length)return;chosen.push(token);paint();if(autoSubmit&&chosen.length===config.length)setTimeout(submit,180)};grid.append(button)});
    const actions=document.createElement("div");actions.className="lock-entry-actions";
    if(chosen.length){const back=document.createElement("button");back.type="button";back.className="lock-back";back.textContent="1つ戻る";back.onclick=()=>{chosen.pop();submitted=false;paint()};actions.append(back)}
    if(onBack){const options=document.createElement("button");options.type="button";options.className="lock-back";options.textContent="選び方を変える";options.onclick=onBack;actions.append(options)}
    root.append(progress,label,grid,actions);
    if(chosen.length===config.length&&!autoSubmit){const done=document.createElement("button");done.type="button";done.className="primary";done.textContent=actionLabel;done.onclick=submit;root.append(done)}
    const help=document.createElement("p");help.className="lock-description";help.textContent=prompt;root.prepend(help);
  };
  paint();
}
function renderLockWizard(rootId,onComplete,initial=gateConfig){
  const root=$(rootId);let length=initial?.mode==="none"?0:(initial?.length||2),mode=initial?.mode&&initial.mode!=="none"?initial.mode:"emoji",first=[];
  const finish=async(config,button)=>{button.disabled=true;try{await onComplete(config)}catch{button.disabled=false}};
  const choose=()=>{
    root.replaceChildren();
    const lengths=document.createElement("div");lengths.className="lock-selector";lengths.innerHTML='<span class="lock-selector-label">個数</span>';
    const lengthOptions=document.createElement("div");lengthOptions.className="lock-options";
    [[0,"使わない",""],[1,"1個","手軽"],[2,"2個","おすすめ"],[3,"3個",""]].forEach(([value,label,small])=>{const button=document.createElement("button");button.type="button";button.className=`lock-option ${length===value?"active":""}`;button.innerHTML=`${label}${small?`<small>${small}</small>`:""}`;button.onclick=()=>{length=value;choose()};lengthOptions.append(button)});lengths.append(lengthOptions);root.append(lengths);
    if(length>0){const modes=document.createElement("div");modes.className="lock-selector";modes.innerHTML='<span class="lock-selector-label">種類</span>';const options=document.createElement("div");options.className="lock-options modes";[["emoji","絵文字"],["number","数字"],["mixed","まぜる"]].forEach(([value,label])=>{const button=document.createElement("button");button.type="button";button.className=`lock-option ${mode===value?"active":""}`;button.textContent=label;button.onclick=()=>{mode=value;choose()};options.append(button)});modes.append(options);root.append(modes)}
    const description=document.createElement("p");description.className="lock-description";description.textContent=length===0?"コードは使わず、ボタンを1回押して開きます。":length===1?"もっとも手軽です。共有端末では2個以上がおすすめです。":length===2?"覚えやすさとのぞき見対策のバランスがよい設定です。":"3個を順番に選びます。配置は毎回変わりません。";root.append(description);
    const next=document.createElement("button");next.type="button";next.className="primary";next.textContent=length===0?"ワンタップで開く設定にする":"次へ";next.onclick=()=>length===0?finish(makeLockConfig("none"),next):enter();root.append(next);
  };
  const enter=()=>renderLockEntry(root,{mode,length},{mask:false,prompt:`${lockModeLabel(mode)}を${length}個、順番に選びます。`,actionLabel:"この内容で決める",onBack:choose,onSubmit:tokens=>{first=tokens;confirmEntry()}});
  const confirmEntry=(mismatch=false)=>{renderLockEntry(root,{mode,length},{mask:false,prompt:"確認のため、同じ順番でもう一度選んでください。",actionLabel:"確認する",onBack:enter,onSubmit:async tokens=>{if(!sameTokens(first,tokens)){confirmEntry(true);return}await onComplete(makeLockConfig(mode,tokens))}});if(mismatch){const error=document.createElement("p");error.className="inline-error";error.textContent="順番が違います。もう一度お試しください。";root.append(error)}};
  choose();
}
function runLegacyPicker(expected,onDone){
  const root=$("unlock-picker"),chosen=[];
  const paint=()=>{root.replaceChildren();const progress=document.createElement("div");progress.className="emoji-progress";for(let i=0;i<3;i++){const slot=document.createElement("span");slot.className=`emoji-slot ${chosen[i]?"filled":""}`;slot.textContent=chosen[i]||"";progress.append(slot)}const prompt=document.createElement("div");prompt.className="emoji-prompt";prompt.textContent=`${["1つ目","2つ目","3つ目"][chosen.length]}の絵文字を選ぶ`;const correct=expected[chosen.length],pool=LEGACY_EMOJIS.filter(value=>value!==correct),choices=shuffle([correct,...shuffle(pool).slice(0,5)]),grid=document.createElement("div");grid.className="emoji-grid";choices.forEach(emoji=>{const button=document.createElement("button");button.type="button";button.className="emoji-choice";button.textContent=emoji;button.setAttribute("aria-label",emoji);button.onclick=()=>{if(chosen.length===0)$("unlock-error").textContent="";chosen.push(emoji);if(chosen.length===3){root.querySelectorAll("button").forEach(item=>item.disabled=true);onDone([...chosen])}else paint()};grid.append(button)});root.append(progress,prompt,grid)};paint();
}
async function writeGateConfig(config,deviceKey){await saveQueue.catch(()=>{});const old=await dbGet(),gate=await encryptPart(config,deviceKey,"gate");await dbPut({...old,gate,updatedAt:Date.now()});}
async function openVault(context){try{book=await decryptPart(context.record.payload,context.deviceKey,"payload");key=context.deviceKey;unlockContext=null;enterApp()}catch{key=null;book=null;$("unlock-error").textContent="データを開けませんでした。";show("unlock-view");prepareUnlock()}}
function startLegacyMigration(context){
  unlockContext=context;show("setup-view");$("setup-heading").textContent="画面ロックを新しくする";$("setup-lead").textContent="旧方式から、覚えやすい固定配置へ切り替えます。";$("setup-error").textContent="";
  renderLockWizard("setup-picker",async config=>{try{await writeGateConfig(config,context.deviceKey);gateConfig=config;await openVault(context)}catch{$("setup-error").textContent="設定を保存できませんでした。もう一度お試しください。";throw new Error("gate-save")}},makeLockConfig("emoji",["🐶","🐱"]));
}
function renderModernUnlock(preserveError=false){
  $("legacy-reset").hidden=true;if(!preserveError)$("unlock-error").textContent="";$("unlock-lead").textContent=gateConfig.mode==="none"?"ロックキーは設定されていません。":`${lockSummary(gateConfig)}を、決めた順番で選びます。`;
  const root=$("unlock-picker");
  if(gateConfig.mode==="none"){root.replaceChildren();const button=document.createElement("button");button.type="button";button.className="primary";button.textContent="管理ブックを開く";button.onclick=()=>{button.disabled=true;openVault(unlockContext)};root.append(button);return}
  renderLockEntry(root,gateConfig,{mask:true,autoSubmit:true,prompt:"配置は毎回変わりません。",onFirst:()=>{$("unlock-error").textContent=""},onSubmit:tokens=>{if(!sameTokens(tokens,gateConfig.tokens)){$("unlock-error").textContent="ロックキーが違います。";setTimeout(()=>renderModernUnlock(true),450);return}return openVault(unlockContext)}});
}
async function prepareUnlock(){
  try{const record=await dbGet(),deviceKey=await dbGet(KEY_RECORD);if(!record||!deviceKey||record.format!==2)throw new Error("unsupported");const gate=await decryptPart(record.gate,deviceKey,"gate");unlockContext={record,deviceKey,legacy:false};gateConfig=normalizeLockConfig(gate);$("legacy-reset-confirm").hidden=true;$("legacy-reset-open").hidden=false;
    if(gateConfig){renderModernUnlock();return}
    if(gate?.version===2||!Array.isArray(gate?.sequence)||gate.sequence.length!==3||gate.sequence.some(token=>!LEGACY_EMOJIS.includes(token)))throw new Error("invalid-gate");unlockContext.legacy=true;$("unlock-lead").textContent="以前に決めた3つの絵文字を選びます。";$("legacy-reset").hidden=false;$("unlock-error").textContent="";const handleLegacy=tokens=>{if(!sameTokens(tokens,gate.sequence)){$("unlock-error").textContent="絵文字の順番が違います。";setTimeout(()=>runLegacyPicker(gate.sequence,handleLegacy),450);return}startLegacyMigration(unlockContext)};runLegacyPicker(gate.sequence,handleLegacy);
  }catch{showFatal("暗号化データを開けません。ブラウザの保存データが揃っているか確認してください。")}
}
async function createVault(config){
  $("setup-error").textContent="";
  try{const deviceKey=await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]),data=emptyBook(),record=await newRecord(data,deviceKey,config);await dbPutBoth(record,deviceKey);key=deviceKey;book=data;gateConfig=config;navigator.storage?.persist?.().catch(()=>{});enterApp()}
  catch{key=null;book=null;$("setup-error").textContent="保存できませんでした。もう一度お試しください。";throw new Error("vault-create")}
}
function startInitialSetup(){$("setup-heading").textContent="画面ロックを選ぶ";$("setup-lead").textContent="あとから設定で変更できます。";$("setup-error").textContent="";renderLockWizard("setup-picker",createVault,makeLockConfig("emoji",["🐶","🐱"]))}
$("legacy-reset-open").addEventListener("click",event=>{event.currentTarget.hidden=true;$("legacy-reset-confirm").hidden=false});
$("legacy-reset-cancel").addEventListener("click",()=>{$("legacy-reset-confirm").hidden=true;$("legacy-reset-open").hidden=false});
$("legacy-reset-run").addEventListener("click",()=>{if(unlockContext?.legacy)startLegacyMigration(unlockContext)});
async function init(){
  if(!window.crypto?.subtle||!window.indexedDB){showFatal("このブラウザでは暗号化保存を使えません。Safari、Chrome、Firefoxの最新版で開いてください。");return}
  try{db=await openDB();const record=await dbGet();if(record){show("unlock-view");await prepareUnlock()}else{show("setup-view");startInitialSetup()}}
  catch{showFatal("保存データを開けません。ブラウザの設定を確認してください。")}
}
function show(id){ ["setup-view","unlock-view","app-view"].forEach(x=>$(x).hidden=x!==id); document.body.classList.toggle("unlocked",id==="app-view"); }
function showFatal(message){ show("setup-view"); $("setup-view").innerHTML=`<h2>管理ブックを開けません</h2><p class="lead" style="margin-top:.6rem"></p>`; $("setup-view").querySelector("p").textContent=message; }
function enterApp(){ book.sets=Array.isArray(book.sets)?book.sets:[];book.devices=Array.isArray(book.devices)?book.devices:[];book.settings=book.settings||{};book.settings.reviewDays={...DEFAULT_REVIEW_DAYS,...(book.settings.reviewDays||{})};show("app-view");render();resetIdle(); }
async function lock(){if($("line-dialog").open){await flushDraft().catch(()=>{});skipDraftClose=true}key=null;book=null;detailId=null;clearTimeout(idleTimer);document.querySelectorAll(".detail-secret code").forEach(x=>x.textContent="");suppressDraft=true;document.querySelectorAll("dialog[open]").forEach(d=>d.close());suppressDraft=false;show("unlock-view");prepareUnlock();}
function resetIdle(){ if(!book)return; clearTimeout(idleTimer); const min=Number(book.settings?.autoLock??15); if(min>0) idleTimer=setTimeout(lock,min*60000); }
["pointerdown","keydown"].forEach(type=>document.addEventListener(type,resetIdle,{passive:true}));
document.addEventListener("visibilitychange",()=>{if(document.hidden&&book){if($("line-dialog").open)flushDraft().catch(()=>{});if(Number(book.settings?.autoLock)>0)resetIdle()}});

function persist(){
  if(!book||!key)return Promise.reject(new Error("locked"));book.updatedAt=Date.now();const snapshot=structuredClone(book),activeKey=key;
  saveQueue=saveQueue.catch(()=>{}).then(async()=>{const old=await dbGet(),payload=await encryptPart(snapshot,activeKey,"payload");await dbPut({...old,payload,updatedAt:Date.now()})});
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
const addMonths = (start,count) => {if(!start)return"";const [y,m]=start.split("-").map(Number),d=new Date(Date.UTC(y,m-1+Number(count),1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`;};
const monthText = value => {if(!value)return"未設定";const [y,m]=value.split("-");return `${y}年${Number(m)}月`;};
const returnCarrierKey = value => value==="docomo"||value==="ahamo"?"docomo":value==="au"?"au":value==="SoftBank"?"SoftBank":value==="楽天モバイル"?"楽天モバイル":"other";
const selectedCarrierKey = () => $("carrier").value||"other";
const reviewDaysFor = carrierKey => Number(book.settings.reviewDays?.[carrierKey]??180);
function updateReviewDayCount(){const n=daysBetween($("contract-date").value,$("next-date").value),el=$("review-day-count"),days=reviewDaysFor(selectedCarrierKey());el.textContent=n===null?`設定中の目安：契約から ${days} 日`:n<0?"見直し日が契約日より前になっています。":`契約から ${n.toLocaleString("ja-JP")} 日${formReviewAuto?"（設定中の目安）":""}`;el.style.color=n<0?"var(--danger)":"";}
function applyReviewDate(force=false){const start=$("contract-date").value;if(!start)return;if(force||formReviewAuto||!$("next-date").value){$("next-date").value=addDays(start,reviewDaysFor(selectedCarrierKey()));formReviewAuto=true}updateReviewDayCount();}
function fillCarrierSelect(line){const select=$("carrier");select.replaceChildren(new Option("選択",""));Object.keys(CARRIERS).forEach(name=>select.add(new Option(name,name)));select.add(new Option("その他","other"));const known=line?.carrierKey&&CARRIERS[line.carrierKey]?line.carrierKey:CARRIERS[line?.carrier]?line.carrier:line?.carrier?"other":"";select.value=known;$("carrier-custom").value=known==="other"?(line?.carrier||""):"";$("carrier-custom-field").hidden=known!=="other";fillPlanSelect(line?.plan||"")}
function fillPlanSelect(selected=""){const carrier=$("carrier").value,plans=CARRIERS[carrier]||[],select=$("plan");select.replaceChildren(new Option("選択",""));plans.forEach(name=>select.add(new Option(name,name)));select.add(new Option("その他","__other__"));if(selected&&plans.includes(selected)){select.value=selected;$("plan-custom").value=""}else if(selected){select.value="__other__";$("plan-custom").value=selected}else{$("plan-custom").value=""}$("plan-custom-field").hidden=select.value!=="__other__";}
function selectedCarrierName(){return $("carrier").value==="other"?$("carrier-custom").value.trim():$("carrier").value;}
function selectedPlanName(){return $("plan").value==="__other__"?$("plan-custom").value.trim():$("plan").value;}
function showReturnPanel(schedule=null){const carrier=schedule?.purchaseCarrierKey||returnCarrierKey($("carrier").value),preset=RETURN_PROGRAMS[carrier]||RETURN_PROGRAMS.other,start=schedule?.startMonth||$("contract-date").value.slice(0,7);$("device-purchase-carrier").value=carrier;$("device-return-program").value=schedule?.programName||preset.name;$("device-start-month").value=start;$("device-return-month").value=schedule?.targetMonth||(start?addMonths(start,preset.months):"");$("device-return-panel").hidden=false;updateReturnNote();}
function updateReturnNote(){const carrier=$("device-purchase-carrier").value,preset=RETURN_PROGRAMS[carrier]||RETURN_PROGRAMS.other,start=$("device-start-month").value;$("device-return-note").textContent=`${preset.months}か月後の目安 · ほかの時期は契約内容を確認`;if(start&&!$("device-return-month").value)$("device-return-month").value=addMonths(start,preset.months);}
function currentReturnSchedule(){if($("device-return-panel").hidden)return null;const carrier=$("device-purchase-carrier").value,preset=RETURN_PROGRAMS[carrier]||RETURN_PROGRAMS.other;return{purchaseCarrierKey:carrier,programName:$("device-return-program").value.trim(),startMonth:$("device-start-month").value,targetMonth:$("device-return-month").value,offsetMonths:preset.months,updatedAt:Date.now()};}
const statusText = s => ({active:"利用中",planned:"MNP予定",cancelled:"終了"}[s]||"利用中");
const escapeSearch = v => (v??"").toString().toLowerCase();
const readSharedArray = keyName => { try { const value=JSON.parse(localStorage.getItem(keyName)); return Array.isArray(value)?value:[]; } catch { return []; } };
const kaisenProfiles = () => readSharedArray("simProfiles").filter(p=>p&&p.id&&p.name);
const kaisenHistory = () => readSharedArray("checkHistory").filter(r=>r&&r.t);
const linkedProfile = line => kaisenProfiles().find(p=>p.id===line.links?.kaisenCheckProfileId);
const latestCheck = line => kaisenHistory().filter(r=>r.profileId===line.links?.kaisenCheckProfileId).sort((a,b)=>b.t-a.t)[0];
const lineSet = line => book.sets.find(x=>x.id===line.setId);
const lineDevice = line => book.devices.find(x=>x.id===line.deviceId);
const icsEscape = value => String(value||"").replace(/\\/g,"\\\\").replace(/([,;])/g,"\\$1").replace(/\n/g,"\\n");
const icsDate = value => value.replace(/-/g,"");
const localDate = () => {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
function foldIcsLine(line){const chunks=[];let chunk="",size=0;for(const char of line){const n=enc.encode(char).length,limit=chunks.length?74:75;if(chunk&&size+n>limit){chunks.push(`${chunks.length?" ":""}${chunk}`);chunk=char;size=n}else{chunk+=char;size+=n}}chunks.push(`${chunks.length?" ":""}${chunk}`);return chunks.join("\r\n");}
const maskedLine = line => line.nickname||`回線 ${digits(line.phone).slice(-4).padStart(4,"•")}`;
function calendarEvents(){
  const today=localDate(),events=[];
  (book.lines||[]).filter(line=>line.status!=="cancelled").forEach(line=>{
    if(line.nextDate&&!line.nextDone&&line.nextDate>=today)events.push({type:"line",uid:`line-${line.id}@kanri-book`,title:`管理ブック：${maskedLine(line)}を見直す`,start:line.nextDate,end:addDays(line.nextDate,1),description:[line.carrier,line.plan,"管理ブックで確認"].filter(Boolean).join("\n")});
    (line.options||[]).filter(option=>option.date&&!option.done&&option.date>=today).forEach((option,index)=>events.push({type:"option",uid:`option-${line.id}-${option.id||index}@kanri-book`,title:`管理ブック：${option.name||"オプション"}を見直す`,start:option.date,end:addDays(option.date,1),description:`${maskedLine(line)}\n管理ブックで確認`}));
  });
  (book.devices||[]).forEach(device=>{const schedule=device.returnSchedule;if(!schedule?.targetMonth)return;const start=`${schedule.targetMonth}-01`,end=`${addMonths(schedule.targetMonth,1)}-01`;if(end<today)return;events.push({type:"device",uid:`device-${device.id}@kanri-book`,title:"手続きを確認する月",start,end,description:[device.name,schedule.programName,"2年利用時のおトク返却月","ほかの時期は契約内容を確認","管理ブックで確認"].filter(Boolean).join("\n")})});
  return events.sort((a,b)=>a.start.localeCompare(b.start));
}
function downloadCalendar(events,filename="kanri-book.ics"){
  if(!events.length)return;
  const stamp=new Date().toISOString().replace(/[-:]|\.\d{3}/g,"");
  const parts=["BEGIN:VCALENDAR","VERSION:2.0","CALSCALE:GREGORIAN","METHOD:PUBLISH","PRODID:-//mumupoikatsu//kanri-book//JA"];
  events.forEach(event=>{parts.push("BEGIN:VEVENT",`UID:${icsEscape(event.uid)}`,`DTSTAMP:${stamp}`,`DTSTART;VALUE=DATE:${icsDate(event.start)}`,`DTEND;VALUE=DATE:${icsDate(event.end)}`,`SUMMARY:${icsEscape(event.title)}`,`DESCRIPTION:${icsEscape(event.description)}`,"BEGIN:VALARM","ACTION:DISPLAY","TRIGGER:-P30D",`DESCRIPTION:${icsEscape(event.title)}`,"END:VALARM","BEGIN:VALARM","ACTION:DISPLAY","TRIGGER:-P7D",`DESCRIPTION:${icsEscape(event.title)}`,"END:VALARM","BEGIN:VALARM","ACTION:DISPLAY","TRIGGER:-P1D",`DESCRIPTION:${icsEscape(event.title)}`,"END:VALARM","END:VEVENT")});
  parts.push("END:VCALENDAR");const blob=new Blob([parts.map(foldIcsLine).join("\r\n")+"\r\n"],{type:"text/calendar;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),10000);book.settings.lastCalendarExportAt=Date.now();persist().catch(()=>{});renderCalendarCard();toast(`${events.length}件を書き出しました`);
}
function renderCalendarCard(){const events=calendarEvents(),card=$("calendar-card"),counts={line:0,option:0,device:0};events.forEach(event=>counts[event.type]++);card.hidden=!events.length;if(!events.length)return;$("calendar-count").textContent=`${events.length}件`;$("calendar-breakdown").textContent=[["回線",counts.line],["オプション",counts.option],["端末",counts.device]].filter(x=>x[1]).map(x=>`${x[0]} ${x[1]}件`).join(" · ");const last=book.settings.lastCalendarExportAt;$("calendar-last").textContent=last?`前回：${new Date(last).toLocaleDateString("ja-JP")} · 通知はカレンダー側で行われます`:"通知はカレンダー側で行われます";}
function deadlines(line){
  const items=[]; if(line.nextDate&&!line.nextDone) items.push({date:line.nextDate,name:line.nextAction||"見直し"});
  (line.options||[]).filter(o=>o.date&&!o.done).forEach(o=>items.push({date:o.date,name:o.name||"オプション"}));
  return items.sort((a,b)=>a.date.localeCompare(b.date));
}
const SORT_LABELS={default:"現在の並び",manual:"任意の順","contract-desc":"契約日が新しい順","contract-asc":"契約日が古い順"};
const currentSortMode=()=>Object.hasOwn(SORT_LABELS,book?.settings?.listSort)?book.settings.listSort:"default";
function normalizedManualOrder(order=book?.settings?.lineOrder,fallback=book?.lines||[]){const lines=book?.lines||[],valid=new Set(lines.map(line=>line.id)),seen=new Set(),result=[];const add=id=>{if(valid.has(id)&&!seen.has(id)){seen.add(id);result.push(id)}};(Array.isArray(order)?order:[]).forEach(add);fallback.forEach(line=>add(typeof line==="string"?line:line.id));lines.forEach(line=>add(line.id));return result;}
function sortLines(lines){
  const result=[...lines],sourceIndex=new Map((book.lines||[]).map((line,index)=>[line.id,index])),fallback=(a,b)=>(a.status==="cancelled")-(b.status==="cancelled")||(b.updatedAt||0)-(a.updatedAt||0)||(sourceIndex.get(a.id)||0)-(sourceIndex.get(b.id)||0),mode=currentSortMode();
  if(mode==="manual"){const rank=new Map(normalizedManualOrder().map((id,index)=>[id,index]));return result.sort((a,b)=>(rank.get(a.id)??Number.MAX_SAFE_INTEGER)-(rank.get(b.id)??Number.MAX_SAFE_INTEGER)||fallback(a,b))}
  if(mode==="contract-desc"||mode==="contract-asc")return result.sort((a,b)=>{const ad=/^\d{4}-\d{2}-\d{2}$/.test(a.contractDate||"")?a.contractDate:null,bd=/^\d{4}-\d{2}-\d{2}$/.test(b.contractDate||"")?b.contractDate:null;if(!ad||!bd)return(!ad)-(!bd)||fallback(a,b);const compared=ad.localeCompare(bd)*(mode==="contract-desc"?-1:1);return compared||fallback(a,b)});
  return result.sort(fallback);
}
function render(){
  const lines=book.lines||[], nowSoon=lines.flatMap(deadlines).filter(x=>{const d=daysUntil(x.date);return d>=0&&d<=30}).length;
  $("active-count").innerHTML=`${lines.filter(x=>x.status!=="cancelled").length}<small>回線</small>`;
  $("soon-count").innerHTML=`${nowSoon}<small>件</small>`;
  $("auto-lock").value=String(book.settings?.autoLock??15);$("lock-summary").textContent=lockSummary(gateConfig);$("sort-summary").textContent=SORT_LABELS[currentSortMode()];renderDraftCard();renderCalendarCard();
  const q=escapeSearch($("search").value).replace(/-/g,"");
  const visible=sortLines(lines.filter(l=>filter==="all"||l.status===filter).filter(l=>{
    const set=lineSet(l),device=lineDevice(l); const hay=[l.phone,l.nickname,l.carrier,l.holder,l.plan,l.store,l.notes,set?.name,set?.email,device?.name,device?.model,device?.imei,device?.eid].map(escapeSearch).join(" ").replace(/-/g,""); return !q||hay.includes(q);
  }));
  const list=$("line-list"); list.replaceChildren();
  if(!visible.length){
    const empty=document.createElement("div"); empty.className="card empty";
    empty.innerHTML=`<svg class="empty-dog" viewBox="0 0 90 66" aria-hidden="true"><path d="M71 43q15-9 9-24" fill="none" stroke="#7CAD88" stroke-width="6" stroke-linecap="round"/><ellipse cx="48" cy="47" rx="29" ry="14" fill="#C3E2C9"/><circle cx="26" cy="36" r="16" fill="#A7D3B0"/><path d="M16 25Q5 17 9 39l10 1ZM36 24q10-5 6 13l-8 4Z" fill="#75AD82"/><circle cx="22" cy="35" r="1.7" fill="#466C50"/><circle cx="31" cy="35" r="1.7" fill="#466C50"/><ellipse cx="27" cy="40" rx="2.5" ry="2" fill="#466C50"/><path d="M27 42q-3 4-6 1m6-1q3 4 6 1" fill="none" stroke="#466C50" stroke-width="1.3"/><path d="M34 57v6m28-6v6" stroke="#86B890" stroke-width="6" stroke-linecap="round"/></svg><h3>${lines.length?"該当する回線はありません":"回線が登録されていません"}</h3><p>${lines.length?"検索条件を変更してください。":"携帯番号や契約日を登録できます。"}</p>${lines.length?"":"<button class=\"primary\" type=\"button\">回線を追加</button>"}`;
    empty.querySelector("button")?.addEventListener("click",openNewForm); list.append(empty); return;
  }
  if(viewMode==="line") visible.forEach(line=>list.append(makeCard(line)));
  else {
    const source=viewMode==="device"?book.devices:book.sets, keyName=viewMode==="device"?"deviceId":"setId", none=viewMode==="device"?"端末なし":"セットなし";
    const groups=new Map(); visible.forEach(line=>{const id=line[keyName]||"__none__";if(!groups.has(id))groups.set(id,[]);groups.get(id).push(line)});
    [...groups.entries()].sort(([a],[b])=>(a==="__none__")-(b==="__none__")).forEach(([id,rows])=>{const entity=source.find(x=>x.id===id),group=document.createElement("section");group.className="line-group";const h=document.createElement("div");h.className="group-heading";h.textContent=(entity?.name||none)+(viewMode==="device"&&entity?.returnSchedule?.targetMonth?` · ${monthText(entity.returnSchedule.targetMonth)}`:"");group.append(h);rows.forEach(line=>group.append(makeCard(line)));list.append(group)});
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

function pendingDraft(){const draft=book?.draft;if(!draft)return null;const line=draft.lineId&&book.lines.find(item=>item.id===draft.lineId);return line&&(line.updatedAt||0)>=(draft.updatedAt||0)?null:draft;}
function renderDraftCard(){const draft=pendingDraft(),card=$("draft-card");card.hidden=!draft;if(!draft)return;const d=new Date(draft.updatedAt);$("draft-updated").textContent=`${d.toLocaleDateString("ja-JP")} ${d.toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})} に自動保存`;}
function collectFormDraft(force=false){if(!force&&!$("line-dialog").open)return null;const fieldIds=["phone","nickname","status","holder","contract-date","store","next-action","next-date","pin","notes","carrier","carrier-custom","plan","plan-custom","kaisen-profile"],fields={};fieldIds.forEach(id=>fields[id]=$(id).value);const accounts=[...$("account-list").querySelectorAll(".repeat-row")].map(r=>({service:r.querySelector(".account-service").value,id:r.querySelector(".account-id").value,secret:r.querySelector(".account-secret").value}));const options=[...$("option-list").querySelectorAll(".repeat-row")].map(r=>({id:r.dataset.id||uuid(),name:r.querySelector(".option-name").value,date:r.querySelector(".option-date").value,done:r.querySelector(".option-done").checked}));return{schemaVersion:1,lineId:$("line-id").value||null,updatedAt:Date.now(),formReviewAuto,fields,setSelection:$("set-select").value,setData:{name:$("set-name").value,email:$("set-email").value},deviceSelection:$("device-select").value,deviceData:{name:$("device-name").value,model:$("device-model").value,imei:$("device-imei").value,eid:$("device-eid").value,returnSchedule:currentReturnSchedule()},accounts,options};}
function scheduleDraft(){if(suppressDraft||!book||!$("line-dialog").open)return;formDirty=true;clearTimeout(draftTimer);draftTimer=setTimeout(()=>flushDraft().catch(()=>{}),700);}
async function flushDraft(){clearTimeout(draftTimer);draftTimer=null;if(suppressDraft||!formDirty||!book||!key||!$("line-dialog").open)return;const draft=collectFormDraft();if(!draft)return;book.draft=draft;await persist();renderDraftCard();}
function applyDraft(draft){const base=draft.lineId?book.lines.find(line=>line.id===draft.lineId):null;suppressDraft=true;openForm(base||null);const f=draft.fields||{};["phone","nickname","status","holder","contract-date","store","next-action","next-date","pin","notes"].forEach(id=>$(id).value=f[id]||"");$("carrier").value=f.carrier||"";$("carrier-custom-field").hidden=$("carrier").value!=="other";$("carrier-custom").value=f["carrier-custom"]||"";fillPlanSelect();$("plan").value=f.plan||"";$("plan-custom").value=f["plan-custom"]||"";$("plan-custom-field").hidden=$("plan").value!=="__other__";formReviewAuto=!!draft.formReviewAuto;updateReviewDayCount();fillEntitySelect("set",draft.setSelection);$("set-select").value=draft.setSelection||"";syncEntityEditor("set");if(draft.setSelection){$("set-name").value=draft.setData?.name||"";$("set-email").value=draft.setData?.email||""}fillEntitySelect("device",draft.deviceSelection);$("device-select").value=draft.deviceSelection||"";syncEntityEditor("device");if(draft.deviceSelection){$("device-name").value=draft.deviceData?.name||"";$("device-model").value=draft.deviceData?.model||"";$("device-imei").value=draft.deviceData?.imei||"";$("device-eid").value=draft.deviceData?.eid||"";if(draft.deviceData?.returnSchedule)showReturnPanel(draft.deviceData.returnSchedule);else $("device-return-panel").hidden=true}$("account-list").replaceChildren();(draft.accounts||[]).forEach(addAccountRow);$("option-list").replaceChildren();(draft.options||[]).forEach(addOptionRow);if([...$("kaisen-profile").options].some(o=>o.value===f["kaisen-profile"]))$("kaisen-profile").value=f["kaisen-profile"];suppressDraft=false;}
function openNewForm(){const draft=pendingDraft();if(draft&&!confirm("入力途中の内容を削除して、新しい回線を入力しますか？"))return;if(book.draft){book.draft=null;persist().catch(()=>{});}openForm();}

function openForm(line=null){
  formDirty=false;$("line-form").reset();$("device-return-panel").hidden=true;$("account-list").replaceChildren();$("option-list").replaceChildren();$("form-error").textContent=""; $("line-id").value=line?.id||""; $("form-heading").textContent=line?"回線を編集":"回線を追加"; $("line-delete").hidden=!line;
  const values={phone:line?.phone,nickname:line?.nickname,status:line?.status||"active",holder:line?.holder,"contract-date":line?.contractDate,store:line?.store,"next-action":line?.nextAction,"next-date":line?.nextDate,pin:line?.pin,notes:line?.notes}; Object.entries(values).forEach(([id,v])=>$(id).value=v||"");formReviewAuto=line?.reviewDateAuto??!line?.nextDate;fillCarrierSelect(line);if(formReviewAuto&&line?.contractDate)applyReviewDate();else updateReviewDayCount();
  fillEntitySelect("set",line?.setId); fillEntitySelect("device",line?.deviceId); syncEntityEditor("set"); syncEntityEditor("device");
  const profiles=kaisenProfiles(), select=$("kaisen-profile"); select.replaceChildren(new Option("紐づけない","")); profiles.forEach(p=>select.add(new Option(p.name,p.id))); const linkedId=line?.links?.kaisenCheckProfileId||""; if(linkedId&&!profiles.some(p=>p.id===linkedId))select.add(new Option("以前のSIM（回線チェック側で削除済み）",linkedId)); select.value=linkedId; $("kaisen-link-field").hidden=$("kaisen-link-hint").hidden=profiles.length===0&&!linkedId;
  const set=line?lineSet(line):null; $("account-list").replaceChildren(); (set?.accounts||line?.accounts||[]).forEach(addAccountRow); (line?.options||[]).forEach(addOptionRow);$("line-dialog").showModal();$("line-dialog").querySelector(".dialog-body").scrollTop=0;
}
function fillEntitySelect(type,selected=""){const select=$(`${type}-select`),items=type==="set"?book.sets:book.devices,label=type==="set"?"セット":"端末";select.replaceChildren(new Option(`${label}なし`,""),new Option(`＋ 新しい${label}`,"__new__"));items.forEach(x=>select.add(new Option(x.name,x.id)));select.value=items.some(x=>x.id===selected)?selected:""}
function syncEntityEditor(type){const select=$(`${type}-select`),editor=$(`${type}-editor`),id=select.value,items=type==="set"?book.sets:book.devices,entity=items.find(x=>x.id===id);editor.hidden=!id;if(!id)return;if(type==="set"){$("set-name").value=entity?.name||"";$("set-email").value=entity?.email||"";$("account-list").replaceChildren();(entity?.accounts||[]).forEach(addAccountRow)}else{$("device-name").value=entity?.name||"";$("device-model").value=entity?.model||"";$("device-imei").value=entity?.imei||"";$("device-eid").value=entity?.eid||"";if(entity?.returnSchedule)showReturnPanel(entity.returnSchedule);else $("device-return-panel").hidden=true}}
$("set-select").addEventListener("change",()=>syncEntityEditor("set")); $("device-select").addEventListener("change",()=>syncEntityEditor("device"));
$("device-return-setup").addEventListener("click",()=>{showReturnPanel();scheduleDraft()});
$("device-return-clear").addEventListener("click",()=>{$("device-return-panel").hidden=true;scheduleDraft()});
$("device-purchase-carrier").addEventListener("change",()=>{const preset=RETURN_PROGRAMS[$("device-purchase-carrier").value]||RETURN_PROGRAMS.other;$("device-return-program").value=preset.name;$("device-return-month").value=$("device-start-month").value?addMonths($("device-start-month").value,preset.months):"";updateReturnNote()});
$("device-start-month").addEventListener("change",()=>{const preset=RETURN_PROGRAMS[$("device-purchase-carrier").value]||RETURN_PROGRAMS.other;$("device-return-month").value=addMonths($("device-start-month").value,preset.months);updateReturnNote()});
function makeInput(cls,placeholder,value="",type="text"){const i=document.createElement("input");i.className=`control ${cls}`;i.placeholder=placeholder;i.value=value||"";i.type=type;return i}
function addAccountRow(data={}){
  const row=document.createElement("div");row.className="repeat-row";const del=document.createElement("button");del.type="button";del.className="remove-row";del.textContent="×";del.setAttribute("aria-label","アカウントを削除");del.onclick=()=>row.remove();row.append(del);
  const service=document.createElement("label");service.className="field";service.innerHTML="<span>サービス</span>";service.append(makeInput("account-service","dアカウント / au ID など",data.service));
  const grid=document.createElement("div");grid.className="grid-2";const a=document.createElement("label");a.className="field";a.innerHTML="<span>ID</span>";const accountId=makeInput("account-id","ID・メールアドレス",data.id);accountId.autocomplete="off";a.append(accountId);const p=document.createElement("label");p.className="field";p.innerHTML="<span>パスワード・補足</span>";const accountSecret=makeInput("account-secret","必要な場合のみ",data.secret,"password");accountSecret.autocomplete="off";p.append(accountSecret);grid.append(a,p);row.append(service,grid);$("account-list").append(row);
}
function addOptionRow(data={}){
  const row=document.createElement("div");row.className="repeat-row";row.dataset.id=data.id||uuid();const del=document.createElement("button");del.type="button";del.className="remove-row";del.textContent="×";del.setAttribute("aria-label","オプションを削除");del.onclick=()=>row.remove();row.append(del);
  const name=document.createElement("label");name.className="field";name.innerHTML="<span>オプション名</span>";name.append(makeInput("option-name","補償・動画サービスなど",data.name));const date=document.createElement("label");date.className="field";date.innerHTML="<span>見直し日</span>";date.append(makeInput("option-date","",data.date,"date"));const check=document.createElement("label");check.className="check-row";const cb=document.createElement("input");cb.type="checkbox";cb.className="option-done";cb.checked=!!data.done;check.append(cb,document.createTextNode("見直し済み"));row.append(name,date,check);$("option-list").append(row);
}
$("account-add").addEventListener("click",()=>{addAccountRow();scheduleDraft()});$("option-add").addEventListener("click",()=>{addOptionRow();scheduleDraft()});
$("line-form").addEventListener("input",scheduleDraft);$("line-form").addEventListener("change",scheduleDraft);$("line-form").addEventListener("click",event=>{if(event.target.closest(".remove-row"))setTimeout(scheduleDraft,0)});
$("line-dialog").addEventListener("close",()=>{if(skipDraftClose){skipDraftClose=false;return}if(!suppressDraft&&formDirty&&book&&key){const draft=collectFormDraft(true);if(draft){book.draft=draft;persist().then(renderDraftCard).catch(()=>{})}}});
$("draft-resume").addEventListener("click",()=>{const draft=pendingDraft();if(draft)applyDraft(draft)});
$("draft-discard").addEventListener("click",async()=>{if(!book.draft||!confirm("入力途中の内容を削除しますか？"))return;book.draft=null;await persist();renderDraftCard();toast("下書きを削除しました")});
$("calendar-all").addEventListener("click",()=>downloadCalendar(calendarEvents()));
$("carrier").addEventListener("change",()=>{$("carrier-custom-field").hidden=$("carrier").value!=="other";fillPlanSelect();applyReviewDate()});
$("plan").addEventListener("change",()=>{$("plan-custom-field").hidden=$("plan").value!=="__other__"});
$("contract-date").addEventListener("change",()=>{applyReviewDate();if(!$("device-return-panel").hidden&&!$("device-start-month").value){$("device-start-month").value=$("contract-date").value.slice(0,7);const preset=RETURN_PROGRAMS[$("device-purchase-carrier").value]||RETURN_PROGRAMS.other;$("device-return-month").value=addMonths($("device-start-month").value,preset.months);updateReturnNote()}});
$("next-date").addEventListener("change",()=>{formReviewAuto=false;updateReviewDayCount()});
$("review-reset").addEventListener("click",()=>{applyReviewDate(true);scheduleDraft()});
$("line-form").addEventListener("submit",async e=>{
  e.preventDefault(); const d=digits($("phone").value); if(d.length<10||d.length>11){$("form-error").textContent="電話番号は10〜11桁で正確に入力してください。";$("phone").focus();return} $("form-error").textContent="";
  const id=$("line-id").value||uuid(), old=book.lines.find(x=>x.id===id), now=Date.now();
  let setId=$("set-select").value,deviceId=$("device-select").value;
  if(setId){if(!$("set-name").value.trim()){$("form-error").textContent="利用セットの名前を入力してください。";$("set-name").focus();return}if(setId==="__new__")setId=uuid()}
  if(deviceId){if(!$("device-name").value.trim()){$("form-error").textContent="端末の呼び名を入力してください。";$("device-name").focus();return}if(deviceId==="__new__")deviceId=uuid()}
  const accounts=[...$("account-list").querySelectorAll(".repeat-row")].map(r=>({service:r.querySelector(".account-service").value.trim(),id:r.querySelector(".account-id").value.trim(),secret:r.querySelector(".account-secret").value})).filter(a=>a.service||a.id||a.secret);
  const options=[...$("option-list").querySelectorAll(".repeat-row")].map(r=>({id:r.dataset.id||uuid(),name:r.querySelector(".option-name").value.trim(),date:r.querySelector(".option-date").value,done:r.querySelector(".option-done").checked})).filter(o=>o.name||o.date);
  if(setId){const value={id:setId,name:$("set-name").value.trim(),email:$("set-email").value.trim(),accounts,updatedAt:now};const i=book.sets.findIndex(x=>x.id===setId);if(i<0)book.sets.push({...value,createdAt:now});else book.sets[i]={...book.sets[i],...value}}
  if(deviceId){const value={id:deviceId,name:$("device-name").value.trim(),model:$("device-model").value.trim(),imei:$("device-imei").value.trim(),eid:$("device-eid").value.trim(),returnSchedule:currentReturnSchedule(),updatedAt:now};const i=book.devices.findIndex(x=>x.id===deviceId);if(i<0)book.devices.push({...value,createdAt:now});else book.devices[i]={...book.devices[i],...value}}
  const line={id,phone:$("phone").value.trim(),phoneDigits:d,nickname:$("nickname").value.trim(),status:$("status").value,carrier:selectedCarrierName(),carrierKey:$("carrier").value||null,holder:$("holder").value.trim(),plan:selectedPlanName(),contractDate:$("contract-date").value,store:$("store").value.trim(),nextAction:$("next-action").value.trim(),nextDate:$("next-date").value,reviewDateAuto:formReviewAuto,pin:$("pin").value,accounts:setId?[]:accounts,setId:setId||null,deviceId:deviceId||null,options,links:{kaisenCheckProfileId:$("kaisen-profile").value||null},notes:$("notes").value.trim(),createdAt:old?.createdAt||now,updatedAt:now};
  const duplicate=book.lines.find(x=>x.id!==id&&digits(x.phone)===d); if(duplicate&&!confirm("同じ電話番号の記録があります。それでも保存しますか？"))return;
  const index=book.lines.findIndex(x=>x.id===id); if(index<0){book.lines.push(line);if(currentSortMode()==="manual")book.settings.lineOrder=normalizedManualOrder()}else book.lines[index]=line;
  const submit=e.currentTarget.querySelector('[type="submit"]'),pendingDraft=collectFormDraft(true);submit.disabled=true;clearTimeout(draftTimer);book.draft=null;
  try{await persist();skipDraftClose=true;suppressDraft=true;$("line-dialog").close();suppressDraft=false;render();toast("保存しました");}catch{book.draft=pendingDraft;$("form-error").textContent="保存できませんでした。もう一度お試しください。"}finally{submit.disabled=false}
});
$("line-delete").addEventListener("click",async()=>{const id=$("line-id").value,line=book.lines.find(x=>x.id===id);if(!line||!confirm(`${formatPhone(line.phone)} の記録を削除しますか？\nこの操作は元に戻せません。`))return;book.lines=book.lines.filter(x=>x.id!==id);if(Array.isArray(book.settings?.lineOrder))book.settings.lineOrder=book.settings.lineOrder.filter(lineId=>lineId!==id);book.draft=null;clearTimeout(draftTimer);await persist();skipDraftClose=true;suppressDraft=true;$("line-dialog").close();suppressDraft=false;render();toast("記録を削除しました")});

function addDetail(parent,label,value){const x=document.createElement("div");x.className="detail-item";const s=document.createElement("span");s.textContent=label;const b=document.createElement("strong");b.textContent=value||"未記録";x.append(s,b);parent.append(x)}
function secretRow(value){const wrap=document.createElement("div");wrap.className="detail-secret";const code=document.createElement("code");code.textContent=value?"••••••••":"未記録";const btn=document.createElement("button");btn.type="button";btn.textContent="表示";let shown=false;btn.onclick=()=>{shown=!shown;code.textContent=shown?(value||"未記録"):(value?"••••••••":"未記録");btn.textContent=shown?"隠す":"表示"};wrap.append(code,btn);return wrap}
function openDetail(id){
  const line=book.lines.find(x=>x.id===id);if(!line)return;detailId=id;const body=$("detail-body"),set=lineSet(line),device=lineDevice(line);body.replaceChildren();
  const head=document.createElement("section");head.className="form-section";const n=document.createElement("div");n.className="line-number";n.textContent=formatPhone(line.phone);const sub=document.createElement("div");sub.className="line-label";sub.textContent=[line.nickname,line.carrier,statusText(line.status)].filter(Boolean).join(" · ");head.append(n,sub);const grid=document.createElement("div");grid.className="detail-grid";addDetail(grid,"契約日",dateText(line.contractDate));addDetail(grid,"契約から",daysFrom(line.contractDate)===null?"未記録":`${daysFrom(line.contractDate)}日`);addDetail(grid,"契約名義",line.holder);addDetail(grid,"契約したお店",line.store);addDetail(grid,"プラン名",line.plan);addDetail(grid,"見直し日",line.nextDate?`${dateText(line.nextDate)} ${line.nextAction||""}`:"未記録");head.append(grid);body.append(head);
  if(set||device){const sec=document.createElement("section");sec.className="form-section";sec.innerHTML='<div class="form-title">利用セットと端末</div>';const g=document.createElement("div");g.className="detail-grid";addDetail(g,"利用セット",set?.name);addDetail(g,"メール",set?.email);addDetail(g,"端末",device?.name);addDetail(g,"機種",device?.model);addDetail(g,"IMEI",device?.imei);addDetail(g,"EID",device?.eid);if(device?.returnSchedule){addDetail(g,"購入したキャリア",device.returnSchedule.purchaseCarrierKey==="other"?"その他":device.returnSchedule.purchaseCarrierKey);addDetail(g,"2年利用時のおトク返却月",monthText(device.returnSchedule.targetMonth))}sec.append(g);if(device?.returnSchedule){const note=document.createElement("p");note.className="hint";note.textContent="ほかの時期は契約内容を確認";sec.append(note)}body.append(sec)}
  const pin=document.createElement("section");pin.className="form-section";pin.innerHTML='<div class="form-title">暗証番号</div>';const block=document.createElement("div");block.className="detail-block";block.append(secretRow(line.pin));pin.append(block);body.append(pin);
  const accounts=set?.accounts||line.accounts||[]; if(accounts.length){const sec=document.createElement("section");sec.className="form-section";sec.innerHTML='<div class="form-title">紐づくアカウント</div>';accounts.forEach(a=>{const box=document.createElement("div");box.className="detail-account";const title=document.createElement("strong");title.textContent=a.service||"アカウント";const id=document.createElement("div");id.textContent=a.id||"ID未記録";box.append(title,id,secretRow(a.secret));sec.append(box)});body.append(sec)}
  if(line.options?.length){const sec=document.createElement("section");sec.className="form-section";sec.innerHTML='<div class="form-title">オプション</div>';line.options.forEach(o=>{const box=document.createElement("div");box.className=`detail-option ${o.done?"done":""}`;box.textContent=`${o.name||"オプション"}　${o.date?dateText(o.date):"日付未記録"}${o.done?"　済み":""}`;sec.append(box)});body.append(sec)}
  const kp=linkedProfile(line),check=latestCheck(line); if(kp){const sec=document.createElement("section");sec.className="form-section";sec.innerHTML='<div class="form-title">回線チェックとの紐づけ</div>';const p=document.createElement("p");p.className="hint";p.style.fontSize=".76rem";p.textContent=check?`${kp.name} · 最終チェック ${new Date(check.t).toLocaleString("ja-JP")}`:`${kp.name} · まだチェック記録はありません`;sec.append(p);body.append(sec)}
  if(line.notes){const sec=document.createElement("section");sec.className="form-section";sec.innerHTML='<div class="form-title">メモ</div>';const p=document.createElement("p");p.className="hint";p.style.whiteSpace="pre-wrap";p.style.fontSize=".76rem";p.textContent=line.notes;sec.append(p);body.append(sec)}
  const related=calendarEvents().filter(event=>event.uid.startsWith(`line-${line.id}@`)||event.uid.startsWith(`option-${line.id}-`)||(device&&event.uid===`device-${device.id}@kanri-book`));if(related.length){const button=document.createElement("button");button.type="button";button.className="calendar-action detail-calendar";button.textContent=related.length===1?"カレンダーに追加":`${related.length}件をカレンダーに追加`;button.addEventListener("click",()=>downloadCalendar(related,`kanri-book-${digits(line.phone).slice(-4)}.ics`));body.append(button)}
  $("detail-dialog").showModal();$("detail-body").scrollTop=0;
}
$("detail-edit").addEventListener("click",()=>{const l=book.lines.find(x=>x.id===detailId),draft=pendingDraft();if(draft?.lineId===l?.id){$("detail-dialog").close();applyDraft(draft);return}if(draft&&!confirm("入力途中の内容を削除して、この回線を編集しますか？"))return;if(book.draft){book.draft=null;persist().catch(()=>{})}$("detail-dialog").close();openForm(l)});
$("add-open").addEventListener("click",openNewForm); $("search").addEventListener("input",render);
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>{viewMode=b.dataset.view;document.querySelectorAll("[data-view]").forEach(x=>x.classList.toggle("active",x===b));render()}));
document.querySelectorAll(".filter-chip").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.filter;document.querySelectorAll(".filter-chip").forEach(x=>x.classList.toggle("active",x===b));render()}));

function renderManualOrder(focusId=null,direction=0){
  const list=$("manual-order-list");list.replaceChildren();
  if(!sortDraftOrder.length){const empty=document.createElement("p");empty.className="hint";empty.textContent="回線を登録すると並び替えできます。";list.append(empty);return}
  sortDraftOrder.forEach((id,index)=>{const line=book.lines.find(item=>item.id===id);if(!line)return;const row=document.createElement("div");row.className="manual-order-row";row.dataset.lineId=id;const number=document.createElement("span");number.className="manual-order-number";number.textContent=String(index+1);const main=document.createElement("div");main.className="manual-order-main";const phone=document.createElement("strong");phone.textContent=formatPhone(line.phone);const detail=document.createElement("span");detail.textContent=[line.nickname,line.carrier].filter(Boolean).join(" · ")||"契約情報";main.append(phone,detail);const actions=document.createElement("div");actions.className="manual-order-actions";[[-1,"↑","上へ"],[1,"↓","下へ"]].forEach(([delta,symbol,label])=>{const button=document.createElement("button");button.type="button";button.className="manual-move";button.dataset.delta=String(delta);button.textContent=symbol;button.disabled=delta<0?index===0:index===sortDraftOrder.length-1;button.setAttribute("aria-label",`${formatPhone(line.phone)}を${label}`);button.onclick=()=>{const next=index+delta;[sortDraftOrder[index],sortDraftOrder[next]]=[sortDraftOrder[next],sortDraftOrder[index]];renderManualOrder(id,delta)};actions.append(button)});row.append(number,main,actions);list.append(row)});
  if(focusId){const row=[...list.children].find(item=>item.dataset.lineId===focusId),preferred=row?.querySelector(`[data-delta="${direction}"]:not(:disabled)`);(preferred||row?.querySelector(".manual-move:not(:disabled)"))?.focus()}
}
function updateSortDialog(){const manual=$("sort-mode").value==="manual";$("manual-order-panel").hidden=!manual;if(manual)renderManualOrder()}
function openSortDialog(){
  const saved=Array.isArray(book.settings?.lineOrder)?book.settings.lineOrder:[],hasSaved=saved.some(id=>book.lines.some(line=>line.id===id)),fallback=hasSaved?book.lines:sortLines(book.lines);
  sortDraftOrder=normalizedManualOrder(saved,fallback);$("sort-mode").value=currentSortMode();$("sort-error").textContent="";updateSortDialog();$("sort-dialog").showModal();$("sort-dialog").querySelector(".dialog-body").scrollTop=0;
}
$("sort-open").addEventListener("click",openSortDialog);
$("sort-mode").addEventListener("change",updateSortDialog);
$("sort-form").addEventListener("submit",async event=>{event.preventDefault();const mode=$("sort-mode").value;if(!Object.hasOwn(SORT_LABELS,mode))return;const oldSettings=structuredClone(book.settings),oldUpdatedAt=book.updatedAt,submit=event.currentTarget.querySelector('[type="submit"]');submit.disabled=true;$("sort-error").textContent="";book.settings.listSort=mode;if(mode==="manual")book.settings.lineOrder=normalizedManualOrder(sortDraftOrder);try{await persist();$("sort-dialog").close();render();toast("並び順を保存しました")}catch{book.settings=oldSettings;book.updatedAt=oldUpdatedAt;render();$("sort-error").textContent="保存できませんでした。もう一度お試しください。"}finally{submit.disabled=false}});

$("settings-open").addEventListener("click",()=>$("settings-dialog").showModal());
function renderReviewSettings(){const list=$("review-settings-list");list.replaceChildren();[...Object.keys(CARRIERS),"other"].forEach((carrier,index)=>{const row=document.createElement("div");row.className="review-setting-row";const label=document.createElement("label");label.htmlFor=`review-carrier-${index}`;label.textContent=carrier==="other"?"その他":carrier;const wrap=document.createElement("div");wrap.className="review-day-input";const input=document.createElement("input");input.id=`review-carrier-${index}`;input.className="control";input.type="number";input.inputMode="numeric";input.min="1";input.max="3650";input.required=true;input.value=reviewDaysFor(carrier);input.dataset.carrier=carrier;wrap.append(input,document.createTextNode("日"));row.append(label,wrap);list.append(row)})}
$("review-settings-open").addEventListener("click",()=>{$("settings-dialog").close();$("review-settings-error").textContent="";renderReviewSettings();$("review-settings-dialog").showModal()});
$("review-settings-form").addEventListener("submit",async e=>{e.preventDefault();const inputs=[...$("review-settings-list").querySelectorAll("input")],values={};for(const input of inputs){const n=Number(input.value);if(!Number.isInteger(n)||n<1||n>3650){$("review-settings-error").textContent="1日から3650日の範囲で入力してください。";input.focus();return}values[input.dataset.carrier]=n}book.settings.reviewDays=values;book.lines.forEach(line=>{if(!line.reviewDateAuto||!line.contractDate)return;const carrierKey=line.carrierKey&&values[line.carrierKey]?line.carrierKey:CARRIERS[line.carrier]?line.carrier:"other";line.nextDate=addDays(line.contractDate,values[carrierKey]??180);line.updatedAt=Date.now()});try{await persist();$("review-settings-dialog").close();render();toast("設定を保存しました")}catch{$("review-settings-error").textContent="保存できませんでした。"}});
$("auto-lock").addEventListener("change",async e=>{book.settings.autoLock=Number(e.target.value);await persist();resetIdle();toast("設定を保存しました")});
$("lock-now").addEventListener("click",lock);
async function changeLockConfig(config){$("pass-error").textContent="";try{await writeGateConfig(config,key);gateConfig=config;$("pass-dialog").close();render();toast("画面ロックを変更しました")}catch{$("pass-error").textContent="変更できませんでした。もう一度お試しください。";throw new Error("gate-change")}}
$("pass-change-open").addEventListener("click",()=>{$("settings-dialog").close();$("pass-error").textContent="";$("pass-dialog").showModal();$("pass-dialog").querySelector(".dialog-body").scrollTop=0;renderLockWizard("change-picker",changeLockConfig,gateConfig)});

document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>$(b.dataset.close).close()));
document.querySelectorAll("dialog").forEach(d=>d.addEventListener("click",e=>{if(e.target===d)d.close()}));
document.querySelectorAll("[data-reveal]").forEach(b=>b.addEventListener("click",()=>{const i=$(b.dataset.reveal),show=i.type==="password";i.type=show?"text":"password";b.textContent=show?"隠す":"表示"}));
function toast(message){const t=$("toast");t.textContent=message;t.classList.add("show");clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove("show"),2200)}
$("reload-latest").addEventListener("click",event=>{const button=event.currentTarget;button.disabled=true;button.textContent="読み込み中…";const u=new URL(location.href);u.searchParams.set("_kb_refresh",Date.now());location.replace(u.href)});
{const u=new URL(location.href);if(u.searchParams.has("_kb_refresh")){u.searchParams.delete("_kb_refresh");history.replaceState(null,"",u.pathname+u.search+u.hash)}}
window.addEventListener("storage",event=>{if(book&&["simProfiles","checkHistory","lastCheck"].includes(event.key))render()});
init();
})();
