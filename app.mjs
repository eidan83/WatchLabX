import { detectBPH, analyzeTimingLive, signalScore, sensitivityParams } from './core.mjs?v=0.2.2';

const $ = id => document.getElementById(id);
const els = {
  startBtn:$('startBtn'), stopBtn:$('stopBtn'), resetBtn:$('resetBtn'), saveResultBtn:$('saveResultBtn'), durationSelect:$('durationSelect'), countdownValue:$('countdownValue'), timerCaption:$('timerCaption'),
  bphMode:$('bphMode'), position:$('position'), sensitivity:$('sensitivity'), sensitivityValue:$('sensitivityValue'),
  inputDevice:$('inputDevice'), refreshDevicesBtn:$('refreshDevicesBtn'),
  micDot:$('micDot'), micStatus:$('micStatus'), analysisState:$('analysisState'), qualityBadge:$('qualityBadge'),
  rateValue:$('rateValue'), rateUncertainty:$('rateUncertainty'), bphValue:$('bphValue'), bphConfidence:$('bphConfidence'),
  jitterValue:$('jitterValue'), signalValue:$('signalValue'), signalLabel:$('signalLabel'), alternationValue:$('alternationValue'),
  elapsed:$('elapsed'), eventCount:$('eventCount'), sampleRate:$('sampleRate'), progressBar:$('progressBar'),
  rateGauge:$('rateGauge'), timegrapher:$('timegrapher'), levelPlot:$('levelPlot'),
  watchSelect:$('watchSelect'), watchName:$('watchName'), watchModel:$('watchModel'), watchMovement:$('watchMovement'), saveWatchBtn:$('saveWatchBtn'),
  positionSummary:$('positionSummary'), historyBody:$('historyBody'), sessionSummary:$('sessionSummary'), exportCsvBtn:$('exportCsvBtn'), clearTestsBtn:$('clearTestsBtn'),
  echoSetting:$('echoSetting'), noiseSetting:$('noiseSetting'), gainSetting:$('gainSetting'), channelSetting:$('channelSetting'), sampleSetting:$('sampleSetting'), deviceSetting:$('deviceSetting'),
  selectedChannel:$('selectedChannel'), channelLevels:$('channelLevels'), peakNoise:$('peakNoise'), thresholdSetting:$('thresholdSetting'), secureNote:$('secureNote'), toast:$('toast')
};

const POSITIONS = {
  DU:{label:'Dial up', short:'DU'}, DD:{label:'Dial down', short:'DD'},
  CU:{label:'Crown up', short:'CU'}, CD:{label:'Crown down', short:'CD'},
  CL:{label:'Crown left', short:'CL'}, CR:{label:'Crown right', short:'CR'}
};
const STORE_KEY = 'watchlabx.v0.2.0.library';

const state = {
  stream:null, context:null, source:null, node:null, sink:null, running:false, startedAt:null, raf:0,
  ticks:[], levelHistory:[], latestLevel:{rms:0,noise:1e-7,peak:0,channels:[],selectedChannel:0}, latestEvent:null,
  lockedBph:null, lockedBphConfidence:0, candidateBph:null, candidateStreak:0, bphDetection:null, lastTiming:null,
  displayRate:null, rateTrail:[], currentReading:null, lastAnalysisWall:0, staleSince:null, targetDurationSec:30, finishing:false,
  library:loadLibrary(), activeWatchId:null
};
state.activeWatchId = state.library.activeWatchId || null;

function loadLibrary(){
  try {
    const x=JSON.parse(localStorage.getItem(STORE_KEY)||'null');
    if (x && Array.isArray(x.watches)) return x;
  } catch {}
  return {watches:[],activeWatchId:null};
}
function saveLibrary(){
  state.library.activeWatchId=state.activeWatchId;
  localStorage.setItem(STORE_KEY,JSON.stringify(state.library));
}
function uid(){ return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`; }
function fmtBool(v){ return v===true?'On':v===false?'Off':'Not reported'; }
function dbfs(v){ return 20*Math.log10(Math.max(1e-9,v)); }
function shortDb(v){ return `${dbfs(v).toFixed(1)} dBFS`; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function showToast(msg){ els.toast.textContent=msg; els.toast.classList.add('show'); clearTimeout(showToast.t); showToast.t=setTimeout(()=>els.toast.classList.remove('show'),2200); }
function setMicStatus(text,kind='idle'){ els.micStatus.textContent=text; els.micDot.className=`dot ${kind}`; }
function setQuality(text,kind='idle'){ els.qualityBadge.textContent=text; els.qualityBadge.className=`quality-badge ${kind}`; }

function requestedConstraints(deviceId=''){
  const supported=navigator.mediaDevices?.getSupportedConstraints?.()||{};
  const audio={channelCount:{ideal:2},sampleRate:{ideal:48000}};
  if(deviceId) audio.deviceId={exact:deviceId};
  if(supported.echoCancellation) audio.echoCancellation={ideal:false};
  if(supported.noiseSuppression) audio.noiseSuppression={ideal:false};
  if(supported.autoGainControl) audio.autoGainControl={ideal:false};
  return {audio,video:false};
}

async function refreshInputDevices({requestPermission=false}={}){
  if(!navigator.mediaDevices?.enumerateDevices) return;
  let temp=null;
  try{
    if(requestPermission) temp=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    const previous=els.inputDevice.value;
    const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput');
    els.inputDevice.innerHTML='';
    els.inputDevice.add(new Option('System default microphone',''));
    devices.forEach((d,i)=>{ if(d.deviceId!=='default') els.inputDevice.add(new Option(d.label||`Microphone ${i+1}`,d.deviceId)); });
    if([...els.inputDevice.options].some(o=>o.value===previous)) els.inputDevice.value=previous;
  }catch(e){ console.warn(e); }
  finally{ temp?.getTracks().forEach(t=>t.stop()); }
}

function formatCountdown(seconds){
  const n=Math.max(0,Math.ceil(Number(seconds)||0));
  const m=Math.floor(n/60),s=n%60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function selectedDuration(){ return Math.max(5,Number(els.durationSelect?.value)||30); }
function updateIdleCountdown(){ if(!state.running&&els.countdownValue){els.countdownValue.textContent=formatCountdown(selectedDuration());els.timerCaption.textContent='test duration';els.progressBar.style.width='0%';} }

async function start(){
  if(state.running) return;
  if(!navigator.mediaDevices?.getUserMedia){ setMicStatus('Microphone unavailable','error'); return; }
  try{
    clearLive({keepSignal:false});
    setMicStatus('Requesting microphone…');
    const stream=await navigator.mediaDevices.getUserMedia(requestedConstraints(els.inputDevice.value));
    const AC=window.AudioContext||window.webkitAudioContext;
    const context=new AC({latencyHint:'interactive',sampleRate:48000});
    await context.audioWorklet.addModule('./tick-processor.js?v=0.2.2');
    await context.resume();
    const source=context.createMediaStreamSource(stream);
    const node=new AudioWorkletNode(context,'watchlabx-tick-processor',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:2,channelCountMode:'max',channelInterpretation:'discrete'});
    const sink=context.createGain(); sink.gain.value=0;
    source.connect(node).connect(sink).connect(context.destination);
    node.port.onmessage=onAudioMessage;
    Object.assign(state,{stream,context,source,node,sink,running:true,startedAt:performance.now(),ticks:[],levelHistory:[],latestEvent:null,lockedBph:null,lockedBphConfidence:0,candidateBph:null,candidateStreak:0,bphDetection:null,lastTiming:null,displayRate:null,rateTrail:[],currentReading:null,lastAnalysisWall:0,targetDurationSec:selectedDuration(),finishing:false});
    applySensitivity(); showTrackSettings(stream.getAudioTracks()[0]);
    els.startBtn.disabled=true; els.stopBtn.disabled=false; els.saveResultBtn.disabled=true; els.inputDevice.disabled=true; els.refreshDevicesBtn.disabled=true; els.durationSelect.disabled=true; els.position.disabled=true; els.watchSelect.disabled=true;
    els.countdownValue.textContent=formatCountdown(state.targetDurationSec); els.timerCaption.textContent='remaining'; els.progressBar.style.width='0%';
    setMicStatus('Microphone active','live'); setQuality('Listening','idle'); els.analysisState.textContent='Listening for a mechanical beat';
    loop();
  }catch(err){
    console.error(err); setMicStatus('Microphone unavailable','error');
    els.analysisState.textContent=err?.name==='NotAllowedError'?'Microphone permission denied':'Could not start audio input';
  }
}

async function stop(){
  state.running=false; cancelAnimationFrame(state.raf);
  try{state.node?.disconnect();}catch{} try{state.source?.disconnect();}catch{} try{state.sink?.disconnect();}catch{}
  state.stream?.getTracks().forEach(t=>t.stop());
  if(state.context&&state.context.state!=='closed') await state.context.close();
  state.stream=state.context=state.source=state.node=state.sink=null;
  els.startBtn.disabled=false; els.stopBtn.disabled=true; els.inputDevice.disabled=false; els.refreshDevicesBtn.disabled=false; els.durationSelect.disabled=false; els.position.disabled=false; els.watchSelect.disabled=false;
  setMicStatus('Microphone idle');
  els.analysisState.textContent=state.currentReading?'Stopped — result ready to save':'Stopped';
  updateIdleCountdown();
}

async function finishTimedMeasurement(){
  if(!state.running||state.finishing) return;
  state.finishing=true;
  const snapshot=state.currentReading?{...state.currentReading}:null;
  await stop();
  let saved=false;
  if(snapshot){
    state.currentReading=snapshot;
    saved=saveMeasurement({auto:true});
  }
  if(saved){
    state.currentReading=null; els.saveResultBtn.disabled=true;
    els.analysisState.textContent='Test complete • saved automatically';
    els.timerCaption.textContent='saved';
  }else if(snapshot){
    state.currentReading=snapshot; els.saveResultBtn.disabled=false;
    els.analysisState.textContent='Test complete • result ready to save';
    els.timerCaption.textContent='complete';
  }else{
    els.analysisState.textContent='Test complete • no valid result to save';
    els.timerCaption.textContent='no result';
  }
  els.countdownValue.textContent='00:00'; els.progressBar.style.width='100%';
  if(navigator.vibrate) navigator.vibrate([70,50,110]);
  state.finishing=false;
}


function reset(){
  state.ticks=[]; state.levelHistory=[]; state.latestEvent=null; state.lockedBph=null; state.lockedBphConfidence=0; state.candidateBph=null; state.candidateStreak=0; state.bphDetection=null; state.lastTiming=null; state.displayRate=null; state.rateTrail=[]; state.currentReading=null;
  state.startedAt=state.running?performance.now():null;
  state.node?.port.postMessage({type:'reset'}); clearLive({keepSignal:false}); updateIdleCountdown(); drawAll();
}

function clearLive({keepSignal=true}={}){
  els.rateValue.textContent='—'; els.rateUncertainty.textContent=''; els.bphValue.textContent='—'; els.bphConfidence.textContent='waiting'; els.jitterValue.textContent='—'; els.alternationValue.textContent='—';
  if(!keepSignal){els.signalValue.textContent='—';els.signalLabel.textContent='idle';}
  els.saveResultBtn.disabled=true; state.currentReading=null; state.lastTiming=null; state.displayRate=null;
  setQuality(state.running?'Searching':'Idle','idle');
}

function applySensitivity(){
  const s=Number(els.sensitivity.value); els.sensitivityValue.textContent=`${s.toFixed(1)}×`;
  state.node?.port.postMessage({type:'config',...sensitivityParams(s)});
}

function onAudioMessage(e){
  const d=e.data||{};
  if(d.type==='tick'){
    const last=state.ticks.at(-1);
    if(!last||d.time>last+0.045){ state.ticks.push(d.time); state.latestEvent=d; if(state.ticks.length>1800) state.ticks.splice(0,state.ticks.length-1800); }
  } else if(d.type==='level'){
    state.latestLevel=d; state.levelHistory.push({t:performance.now(),rms:d.rms,noise:d.noise,peak:d.peak}); if(state.levelHistory.length>500) state.levelHistory.shift();
    els.sampleRate.textContent=`${Math.round(d.sampleRate).toLocaleString()} Hz`; updateChannelDiagnostics(d);
  }
}

function updateChannelDiagnostics(d){
  const ch=d.channels||[];
  if(!ch.length) return;
  els.channelLevels.textContent=ch.slice(0,2).map((c,i)=>`${i?'R':'L'} ${shortDb(c.rms)}`).join(' / ');
  const idx=Number.isFinite(d.selectedChannel)?d.selectedChannel:0; const active=ch[idx]||ch[0];
  els.selectedChannel.textContent=ch.length===1?'Mono':idx===0?'Left':'Right';
  els.peakNoise.textContent=`${shortDb(active.peak)} / ${shortDb(active.noise)}`; els.thresholdSetting.textContent=shortDb(active.threshold);
}

function setDetectorRefractory(bph){
  if(!state.node||!bph) return;
  const T=3600/bph; state.node.port.postMessage({type:'config',minGapSec:Math.max(0.042,Math.min(0.105,0.50*T))});
}

function recentTicks(seconds){
  if(!state.ticks.length) return [];
  const end=state.ticks.at(-1); return state.ticks.filter(t=>t>=end-seconds);
}

function updateBphLock(){
  if(els.bphMode.value!=='auto'){
    const manual=Number(els.bphMode.value);
    state.lockedBph=manual;
    state.lockedBphConfidence=1;
    setDetectorRefractory(manual);
    return manual;
  }

  // Auto mode deliberately keeps the acoustic detector at its neutral 55 ms
  // refractory period. A wrong provisional BPH must never feed back into the
  // detector and suppress the events needed to correct itself.
  state.node?.port.postMessage({type:'config',minGapSec:.055});

  // v0.1.3 baseline recurrence detector, evaluated continuously. Do not make
  // the first plausible result permanent: phone microphones often produce a
  // noisy first second while the watch is being positioned.
  const d=detectBPH(state.ticks.slice(-360));
  state.bphDetection=d;
  if(!d?.bph || d.confidence<0.32) return state.lockedBph;

  if(d.bph===state.lockedBph){
    state.lockedBphConfidence=d.confidence;
    state.candidateBph=null;
    state.candidateStreak=0;
    return state.lockedBph;
  }

  if(state.candidateBph===d.bph) state.candidateStreak++;
  else { state.candidateBph=d.bph; state.candidateStreak=1; }

  // Fast first acquisition, but reversible. If the first result was a harmonic
  // or an acoustic transient, two/three later confirmations can replace it.
  const noCurrent=!state.lockedBph;
  const immediate=noCurrent && d.confidence>=0.60;
  const needed=noCurrent ? 2 : (d.confidence>=0.65 ? 2 : 3);
  if(immediate || state.candidateStreak>=needed){
    state.lockedBph=d.bph;
    state.lockedBphConfidence=d.confidence;
    state.candidateBph=null;
    state.candidateStreak=0;
  }
  return state.lockedBph;
}

function updateAnalysis(){
  const bph=updateBphLock();
  const eventSnr=state.latestEvent?.eventSnr||0;
  const sig=signalScore(state.latestLevel.rms,state.latestLevel.noise,state.latestLevel.peak,eventSnr);
  els.signalValue.textContent=`${Math.round(sig)}%`; els.signalLabel.textContent=sig>=75?'excellent':sig>=50?'good':sig>=25?'usable':'weak';

  if(!bph){
    els.bphValue.textContent='—'; els.bphConfidence.textContent=state.ticks.length<8?'listening…':'finding beat pattern…';
    els.rateValue.textContent='—'; els.jitterValue.textContent='—'; els.alternationValue.textContent='—';
    setQuality('Searching','idle'); els.analysisState.textContent='Place the watch close to the microphone'; return;
  }

  els.bphValue.textContent=bph.toLocaleString();
  const bphC=els.bphMode.value==='auto'?(state.lockedBphConfidence||0):1;
  els.bphConfidence.textContent=els.bphMode.value==='auto'?`${Math.round(bphC*100)}% • auto correcting`:'manual';

  const timing=analyzeTimingLive(state.ticks,bph,{windowSec:12,tolerance:0.22,maxSeeds:14});
  if(!timing){
    els.rateValue.textContent='…'; els.jitterValue.textContent='—'; els.alternationValue.textContent='—';
    setQuality('BPH locked','acquiring'); els.analysisState.textContent='Acquiring rate…'; return;
  }

  const nowAudio=state.context?.currentTime??timing.cleanedTimes.at(-1);
  const lastClean=timing.cleanedTimes.at(-1);
  const T=3600/bph; const stale=nowAudio-lastClean>Math.max(0.70,5*T);
  if(stale){
    state.lockedBph=null; state.lockedBphConfidence=0; state.candidateBph=null; state.candidateStreak=0; clearLive({keepSignal:true});
    els.analysisState.textContent='Watch removed — waiting for beats'; return;
  }

  state.lastTiming=timing;
  const plausible=Math.abs(timing.rate)<=600 && Number.isFinite(timing.rateUncertainty) && timing.rateUncertainty<=120;
  const preview=plausible && timing.duration>=2.2 && timing.cleanedTimes.length>=14;
  const stable=preview && timing.duration>=7.5 && timing.rateUncertainty<=8 && timing.confidence>=0.63;

  if(preview){
    const alpha=state.displayRate==null?1:(stable?0.20:0.32);
    state.displayRate=state.displayRate==null?timing.rate:(1-alpha)*state.displayRate+alpha*timing.rate;
    state.rateTrail.push({t:performance.now(),rate:state.displayRate}); if(state.rateTrail.length>80) state.rateTrail.shift();
    els.rateValue.textContent=`${state.displayRate>=0?'+':''}${state.displayRate.toFixed(1)}`;
    els.rateUncertainty.textContent=`±${timing.rateUncertainty.toFixed(1)} s/day`;
    els.jitterValue.textContent=timing.jitterRms.toFixed(2);
    els.alternationValue.textContent=`${timing.alternationMs.toFixed(2)} ms`;
    state.currentReading={rate:state.displayRate,bph,jitter:timing.jitterRms,alternation:timing.alternationMs,signal:sig,confidence:Math.min(1,(timing.confidence+bphC)/2),uncertainty:timing.rateUncertainty,duration:timing.duration,position:els.position.value};
    els.saveResultBtn.disabled=false;
    if(stable){setQuality('Stable','good');els.analysisState.textContent='Stable estimate — ready to save';}
    else {setQuality('Quick result','acquiring');els.analysisState.textContent='Quick result — keep measuring for higher confidence';}
  }else{
    els.rateValue.textContent='…'; els.rateUncertainty.textContent=''; els.jitterValue.textContent=timing.jitterRms.toFixed(2); els.alternationValue.textContent=`${timing.alternationMs.toFixed(2)} ms`;
    setQuality('Acquiring','acquiring'); els.analysisState.textContent='Acquiring accurate rate…';
  }
}

function updateStats(){
  const e=state.startedAt?Math.max(0,(performance.now()-state.startedAt)/1000):0;
  els.elapsed.textContent=`${e.toFixed(1)} s`; els.eventCount.textContent=`${state.ticks.length} events`;
  const duration=state.targetDurationSec||selectedDuration();
  const remaining=Math.max(0,duration-e);
  els.countdownValue.textContent=formatCountdown(remaining);
  els.timerCaption.textContent=state.running?'remaining':'test duration';
  const p=clamp(e/duration,0,1); els.progressBar.style.width=`${Math.round(p*100)}%`;
  if(state.running&&remaining<=0&&!state.finishing) finishTimedMeasurement();
}

function showTrackSettings(track){
  const s=track.getSettings?.()||{}; els.echoSetting.textContent=fmtBool(s.echoCancellation); els.noiseSetting.textContent=fmtBool(s.noiseSuppression); els.gainSetting.textContent=fmtBool(s.autoGainControl); els.channelSetting.textContent=s.channelCount??'—'; els.sampleSetting.textContent=s.sampleRate?`${Number(s.sampleRate).toLocaleString()} Hz`:`${Math.round(state.context?.sampleRate||0).toLocaleString()} Hz`; els.deviceSetting.textContent=track.label||'Selected microphone';
}

function resizeCanvas(c){ const r=c.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1),w=Math.max(10,Math.round(r.width*dpr)),h=Math.max(10,Math.round(r.height*dpr)); if(c.width!==w||c.height!==h){c.width=w;c.height=h;} return {w,h,dpr}; }
function drawGrid(ctx,w,h){ ctx.clearRect(0,0,w,h);ctx.strokeStyle='rgba(255,255,255,.055)';ctx.lineWidth=1;for(let i=1;i<5;i++){let y=h*i/5;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}for(let i=1;i<8;i++){let x=w*i/8;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();} }

function drawGauge(){
  const c=els.rateGauge,{w,h,dpr}=resizeCanvas(c),ctx=c.getContext('2d');ctx.clearRect(0,0,w,h);
  const cx=w/2,cy=h*.84,r=Math.min(w*.44,h*.76); const a0=Math.PI*1.12,a1=Math.PI*1.88;
  ctx.lineCap='round'; ctx.lineWidth=14*dpr;
  const segs=[[-60,-15,'rgba(255,111,128,.55)'],[-15,-5,'rgba(255,203,92,.55)'],[-5,5,'rgba(83,218,151,.75)'],[5,15,'rgba(255,203,92,.55)'],[15,60,'rgba(255,111,128,.55)']];
  const angle=v=>a0+(clamp(v,-60,60)+60)/120*(a1-a0);
  segs.forEach(([lo,hi,col])=>{ctx.strokeStyle=col;ctx.beginPath();ctx.arc(cx,cy,r,angle(lo),angle(hi));ctx.stroke();});
  ctx.lineWidth=1*dpr;ctx.strokeStyle='rgba(255,255,255,.25)';ctx.fillStyle='rgba(210,220,238,.8)';ctx.font=`${11*dpr}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';
  [-60,-30,-15,-5,0,5,15,30,60].forEach(v=>{const a=angle(v),ri=r-18*dpr,ro=r+4*dpr;ctx.beginPath();ctx.moveTo(cx+ri*Math.cos(a),cy+ri*Math.sin(a));ctx.lineTo(cx+ro*Math.cos(a),cy+ro*Math.sin(a));ctx.stroke();const rt=r-38*dpr;ctx.fillText(v>0?`+${v}`:`${v}`,cx+rt*Math.cos(a),cy+rt*Math.sin(a));});
  const rate=state.displayRate;
  if(Number.isFinite(rate)){
    const a=angle(rate);ctx.strokeStyle='#7ddcff';ctx.lineWidth=3*dpr;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+(r-25*dpr)*Math.cos(a),cy+(r-25*dpr)*Math.sin(a));ctx.stroke();ctx.fillStyle='#7ddcff';ctx.beginPath();ctx.arc(cx,cy,6*dpr,0,Math.PI*2);ctx.fill();
    state.rateTrail.slice(-24).forEach((p,i)=>{const aa=angle(p.rate),rr=r-8*dpr;ctx.fillStyle=`rgba(159,140,255,${0.15+0.7*i/24})`;ctx.beginPath();ctx.arc(cx+rr*Math.cos(aa),cy+rr*Math.sin(aa),2.2*dpr,0,Math.PI*2);ctx.fill();});
  }
  ctx.fillStyle='rgba(220,229,244,.72)';ctx.font=`${12*dpr}px system-ui`;ctx.fillText('RATE  s/day',cx,cy-8*dpr);
}

function drawTimegrapher(){
  const c=els.timegrapher,{w,h}=resizeCanvas(c),ctx=c.getContext('2d');drawGrid(ctx,w,h);const r=state.lastTiming?.residuals||[];if(r.length<2)return;const recent=r.slice(-180);const maxAbs=Math.max(0.5,Math.min(8,Math.max(...recent.map(Math.abs))*1.25));
  recent.forEach((v,i)=>{const x=10+(w-20)*i/Math.max(1,recent.length-1),y=h/2-(v/maxAbs)*(h*.42);ctx.fillStyle=i%2?'rgba(159,140,255,.90)':'rgba(110,217,255,.90)';ctx.beginPath();ctx.arc(x,y,2.2,0,Math.PI*2);ctx.fill();});
  ctx.strokeStyle='rgba(105,230,170,.35)';ctx.beginPath();ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();
}
function drawLevel(){ const c=els.levelPlot,{w,h}=resizeCanvas(c),ctx=c.getContext('2d');drawGrid(ctx,w,h);const a=state.levelHistory.slice(-220);if(a.length<2)return;const vals=a.map(p=>dbfs(p.rms)),min=-90,max=-10;ctx.strokeStyle='rgba(105,230,170,.85)';ctx.lineWidth=2;ctx.beginPath();vals.forEach((v,i)=>{const x=(w-2)*i/Math.max(1,vals.length-1),y=h-((clamp(v,min,max)-min)/(max-min))*h;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke(); }
function drawAll(){drawGauge();drawTimegrapher();drawLevel();}

function loop(){
  if(!state.running)return; const now=performance.now(); if(now-state.lastAnalysisWall>180){updateAnalysis();updateStats();state.lastAnalysisWall=now;} drawAll();state.raf=requestAnimationFrame(loop);
}

function renderWatchSelect(){
  const prev=state.activeWatchId; els.watchSelect.innerHTML='<option value="">+ New watch</option>';
  state.library.watches.forEach(w=>els.watchSelect.add(new Option(`${w.name}${w.model?` — ${w.model}`:''}`,w.id)));
  if(prev&&state.library.watches.some(w=>w.id===prev)) els.watchSelect.value=prev; else els.watchSelect.value='';
  loadActiveWatchFields(); renderHistory(); renderPositionSummary();
}
function loadActiveWatchFields(){ const w=state.library.watches.find(x=>x.id===state.activeWatchId); els.watchName.value=w?.name||'';els.watchModel.value=w?.model||'';els.watchMovement.value=w?.movement||''; }
function saveWatchProfile(){
  const name=els.watchName.value.trim(); if(!name){showToast('Enter a watch name first');return null;}
  let w=state.library.watches.find(x=>x.id===state.activeWatchId);
  if(!w){w={id:uid(),name,model:'',movement:'',createdAt:new Date().toISOString(),measurements:[]};state.library.watches.unshift(w);state.activeWatchId=w.id;}
  w.name=name;w.model=els.watchModel.value.trim();w.movement=els.watchMovement.value.trim();saveLibrary();renderWatchSelect();showToast('Watch profile saved');return w;
}
function saveMeasurement({auto=false}={}){
  if(!state.currentReading){if(!auto)showToast('No valid reading to save');return false;}
  let w=state.library.watches.find(x=>x.id===state.activeWatchId)||saveWatchProfile(); if(!w)return false;
  const r=state.currentReading;w.measurements=w.measurements||[];w.measurements.unshift({id:uid(),timestamp:new Date().toISOString(),position:r.position,rate:+r.rate.toFixed(2),bph:r.bph,jitter:+r.jitter.toFixed(3),alternation:+r.alternation.toFixed(3),signal:Math.round(r.signal),confidence:+r.confidence.toFixed(3),uncertainty:+r.uncertainty.toFixed(2),duration:+r.duration.toFixed(2),testDuration:+(state.targetDurationSec||selectedDuration())});saveLibrary();renderHistory();renderPositionSummary();showToast(`${POSITIONS[r.position]?.short||r.position} ${auto?'saved automatically':'result saved'}`);return true;
}
function measurementsForActive(){return state.library.watches.find(x=>x.id===state.activeWatchId)?.measurements||[];}
function renderPositionSummary(){
  const ms=measurementsForActive(); els.positionSummary.innerHTML=''; const latest={}; ms.forEach(m=>{if(!latest[m.position])latest[m.position]=m;});
  Object.entries(POSITIONS).forEach(([k,p])=>{const m=latest[k];const el=document.createElement('button');el.type='button';const sev=m?(Math.abs(m.rate)<=5?'good':Math.abs(m.rate)<=15?'warn':'bad'):'';el.className=`pos-card ${m?'has-data':''} ${sev}`;el.innerHTML=`<span>${p.short}</span><small>${p.label}</small><strong>${m?`${m.rate>=0?'+':''}${m.rate.toFixed(1)}`:'—'}</strong><em>${m?'s/day':'not tested'}</em>`;el.addEventListener('click',()=>{els.position.value=k;showToast(`Position set to ${p.label}`);});els.positionSummary.appendChild(el);});
  if(ms.length){const rates=Object.values(latest).map(m=>m.rate),avg=rates.reduce((a,b)=>a+b,0)/rates.length,delta=Math.max(...rates)-Math.min(...rates);els.sessionSummary.textContent=`${rates.length}/6 positions • mean ${avg>=0?'+':''}${avg.toFixed(1)} s/day • positional Δ ${delta.toFixed(1)} s/day`;}
  else els.sessionSummary.textContent='No saved position tests yet';
}
function renderHistory(){
  const ms=measurementsForActive().slice(0,30);els.historyBody.innerHTML='';if(!ms.length){els.historyBody.innerHTML='<div class="empty-history">No saved tests for this watch.</div>';return;}
  ms.forEach(m=>{const row=document.createElement('div');row.className=`history-row ${Math.abs(m.rate)<=5?'good':Math.abs(m.rate)<=15?'warn':'bad'}`;const d=new Date(m.timestamp);row.innerHTML=`<div><b>${POSITIONS[m.position]?.short||m.position}</b><span>${d.toLocaleString()}</span></div><strong>${m.rate>=0?'+':''}${m.rate.toFixed(1)} <small>s/day</small></strong><span>${m.bph.toLocaleString()} BPH</span><span>jitter ${m.jitter.toFixed(2)} ms</span><button type="button" aria-label="Delete result">×</button>`;row.querySelector('button').addEventListener('click',()=>{const w=state.library.watches.find(x=>x.id===state.activeWatchId);if(w){w.measurements=w.measurements.filter(x=>x.id!==m.id);saveLibrary();renderHistory();renderPositionSummary();}});els.historyBody.appendChild(row);});
}
function exportCsv(){
  const w=state.library.watches.find(x=>x.id===state.activeWatchId);if(!w||!w.measurements?.length){showToast('No saved tests to export');return;}
  const rows=[['watch','model','movement','timestamp','position','rate_s_day','bph','jitter_ms','alternation_ms','signal_pct','confidence','uncertainty_s_day','duration_s','test_duration_s']];
  w.measurements.slice().reverse().forEach(m=>rows.push([w.name,w.model||'',w.movement||'',m.timestamp,m.position,m.rate,m.bph,m.jitter,m.alternation,m.signal,m.confidence,m.uncertainty,m.duration,m.testDuration||'']));
  const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`WatchLabX-${w.name.replace(/[^a-z0-9_-]+/gi,'_')}.csv`;a.click();URL.revokeObjectURL(url);
}
function clearTests(){const w=state.library.watches.find(x=>x.id===state.activeWatchId);if(!w||!w.measurements?.length)return;if(confirm(`Delete all saved tests for ${w.name}?`)){w.measurements=[];saveLibrary();renderHistory();renderPositionSummary();}}

els.startBtn.addEventListener('click',start);els.stopBtn.addEventListener('click',stop);els.resetBtn.addEventListener('click',reset);els.saveResultBtn.addEventListener('click',()=>saveMeasurement());els.durationSelect.addEventListener('change',updateIdleCountdown);
els.refreshDevicesBtn.addEventListener('click',()=>refreshInputDevices({requestPermission:true}));els.sensitivity.addEventListener('input',applySensitivity);
els.bphMode.addEventListener('change',()=>{state.lockedBph=null;state.lockedBphConfidence=0;state.candidateBph=null;state.candidateStreak=0;state.node?.port.postMessage({type:'config',minGapSec:.055});});
els.watchSelect.addEventListener('change',()=>{state.activeWatchId=els.watchSelect.value||null;saveLibrary();loadActiveWatchFields();renderHistory();renderPositionSummary();});els.saveWatchBtn.addEventListener('click',saveWatchProfile);els.exportCsvBtn.addEventListener('click',exportCsv);els.clearTestsBtn.addEventListener('click',clearTests);
window.addEventListener('resize',drawAll);window.addEventListener('beforeunload',()=>state.stream?.getTracks().forEach(t=>t.stop()));navigator.mediaDevices?.addEventListener?.('devicechange',()=>{if(!state.running)refreshInputDevices();});

els.secureNote.textContent=window.isSecureContext?'HTTPS secure context • audio stays on this device.':'Open via HTTPS to enable microphone access.';
refreshInputDevices();renderWatchSelect();updateIdleCountdown();drawAll();
