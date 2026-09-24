import { vectorMagnitude, normalizeVector, meanVector, fieldStats, deltaVectorMagnitude, matchOrientation, axisPosture } from './sensor.mjs?v=0.4.0';
import { detectBPH, analyzeTimingLive, signalScore, sensitivityParams } from './core.mjs?v=0.4.0';
import { weightedCalibration, applyRateCalibration, summarizeMeasurements, assessmentFromSummary } from './report.mjs?v=0.4.0';

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
  selectedChannel:$('selectedChannel'), channelLevels:$('channelLevels'), peakNoise:$('peakNoise'), thresholdSetting:$('thresholdSetting'), secureNote:$('secureNote'), toast:$('toast'),
  calibrationChip:$('calibrationChip'), calibrationStatus:$('calibrationStatus'), calibrationDetail:$('calibrationDetail'), calibrationReference:$('calibrationReference'), addCalibrationBtn:$('addCalibrationBtn'), clearCalibrationBtn:$('clearCalibrationBtn'),
  reportBtn:$('reportBtn'), reportModal:$('reportModal'), reportContent:$('reportContent'), closeReportBtn:$('closeReportBtn'), printReportBtn:$('printReportBtn'), downloadReportBtn:$('downloadReportBtn'),
  helpBtn:$('helpBtn'), helpModal:$('helpModal'), closeHelpBtn:$('closeHelpBtn'), guideEnBtn:$('guideEnBtn'), guideArBtn:$('guideArBtn'), guideEn:$('guideEn'), guideAr:$('guideAr'),
  frontPhotoInput:$('frontPhotoInput'), backPhotoInput:$('backPhotoInput'), frontPhotoPreview:$('frontPhotoPreview'), backPhotoPreview:$('backPhotoPreview'), frontPhotoEmpty:$('frontPhotoEmpty'), backPhotoEmpty:$('backPhotoEmpty'), removeFrontPhotoBtn:$('removeFrontPhotoBtn'), removeBackPhotoBtn:$('removeBackPhotoBtn'),
  passportSummary:$('passportSummary'), passportTitle:$('passportTitle'), passportTestCount:$('passportTestCount'),
  sensorBadge:$('sensorBadge'), enableSensorsBtn:$('enableSensorsBtn'), orientationDetected:$('orientationDetected'), orientationConfidence:$('orientationConfidence'), phonePosture:$('phonePosture'), gravityVector:$('gravityVector'), autoPositionToggle:$('autoPositionToggle'), learnPositionBtn:$('learnPositionBtn'), clearOrientationBtn:$('clearOrientationBtn'), orientationProfiles:$('orientationProfiles'), magnetometerStatus:$('magnetometerStatus'), magCurrent:$('magCurrent'), magVector:$('magVector'), magStability:$('magStability'), captureBaselineBtn:$('captureBaselineBtn'), captureWatchFieldBtn:$('captureWatchFieldBtn'), magneticResult:$('magneticResult')
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
  library:loadLibrary(), activeWatchId:null,
  sensors:{motionEnabled:false,motionVector:null,motionSamples:[],motionMatch:null,magnetometer:null,magnetometerState:'off',magReadings:[],magCurrent:null,magBaseline:null,magBusy:false}
};
state.activeWatchId = state.library.activeWatchId || null;

function loadLibrary(){
  try {
    const x=JSON.parse(localStorage.getItem(STORE_KEY)||'null');
    if (x && Array.isArray(x.watches)) { x.calibrationSamples = Array.isArray(x.calibrationSamples) ? x.calibrationSamples : []; x.orientationProfiles = x.orientationProfiles && typeof x.orientationProfiles==='object' ? x.orientationProfiles : {}; x.autoPosition = Boolean(x.autoPosition); return x; }
  } catch {}
  return {watches:[],activeWatchId:null,calibrationSamples:[],orientationProfiles:{},autoPosition:false};
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
function currentCalibration(){ return weightedCalibration(state.library.calibrationSamples||[]); }
function calibrationUncertainty(cal){ if(!cal?.count) return 0; if(cal.count===1) return 5; if(cal.count===2) return Math.max(2,Number(cal.spread)||2); return Math.max(.3,Number(cal.spread)||0); }
function calibratedRate(raw){ return applyRateCalibration(raw,currentCalibration()); }
function escapeHtml(v){ return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function photoDataUrlOk(v){ return typeof v==='string' && /^data:image\/(jpeg|png|webp);base64,/i.test(v); }
async function compressWatchPhoto(file){
  if(!file||!String(file.type||'').startsWith('image/')) throw new Error('Choose an image file');
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('Could not read image'));i.src=url;});
    const max=720,scale=Math.min(1,max/Math.max(img.naturalWidth||1,img.naturalHeight||1));
    const w=Math.max(1,Math.round((img.naturalWidth||1)*scale)),h=Math.max(1,Math.round((img.naturalHeight||1)*scale));
    const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{alpha:false});ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
    return c.toDataURL('image/jpeg',0.78);
  }finally{URL.revokeObjectURL(url);}
}
function activeWatch(){ return state.library.watches.find(x=>x.id===state.activeWatchId)||null; }
function showToast(msg){ els.toast.textContent=msg; els.toast.classList.add('show'); clearTimeout(showToast.t); showToast.t=setTimeout(()=>els.toast.classList.remove('show'),2200); }
function setMicStatus(text,kind='idle'){ els.micStatus.textContent=text; els.micDot.className=`dot ${kind}`; }
function setQuality(text,kind='idle'){ els.qualityBadge.textContent=text; els.qualityBadge.className=`quality-badge ${kind}`; }


function sensorPositionLabel(code){ return POSITIONS[code]?.short || code || '—'; }
function motionMean(){ return meanVector(state.sensors.motionSamples.slice(-24)); }
function updateSensorBadge(){
  const motion=state.sensors.motionEnabled,mag=state.sensors.magnetometerState==='active';
  if(motion&&mag){els.sensorBadge.textContent='Motion + magnetometer';els.sensorBadge.className='sensor-badge live';}
  else if(motion){els.sensorBadge.textContent='Orientation active';els.sensorBadge.className='sensor-badge live';}
  else if(mag){els.sensorBadge.textContent='Magnetometer active';els.sensorBadge.className='sensor-badge live';}
  else {els.sensorBadge.textContent='Sensors off';els.sensorBadge.className='sensor-badge idle';}
}
function onDeviceMotion(ev){
  const a=ev.accelerationIncludingGravity;
  if(!a||![a.x,a.y,a.z].every(v=>Number.isFinite(Number(v)))) return;
  const sample={x:Number(a.x),y:Number(a.y),z:Number(a.z),t:performance.now()};
  state.sensors.motionSamples.push(sample);if(state.sensors.motionSamples.length>120)state.sensors.motionSamples.shift();
  const mean=motionMean();if(!mean)return;state.sensors.motionVector=mean;
  const n=normalizeVector(mean),posture=axisPosture(mean);
  els.phonePosture.textContent=`${posture.label} · ${posture.axis}`;
  els.gravityVector.textContent=n?`${n.x.toFixed(2)} / ${n.y.toFixed(2)} / ${n.z.toFixed(2)}`:'—';
  const match=matchOrientation(mean,state.library.orientationProfiles||{},28);state.sensors.motionMatch=match;
  if(match?.matched){
    els.orientationDetected.textContent=`${sensorPositionLabel(match.position)} · ${POSITIONS[match.position]?.label||match.position}`;
    els.orientationConfidence.textContent=`${Math.round(match.confidence*100)}% · ${match.angle.toFixed(1)}°`;
    if(state.library.autoPosition && match.confidence>=0.45 && !state.running && els.position.value!==match.position){els.position.value=match.position;}
  }else if(Object.keys(state.library.orientationProfiles||{}).length){
    els.orientationDetected.textContent='No learned posture match';els.orientationConfidence.textContent=match?`${match.angle.toFixed(1)}° away`:'—';
  }else {els.orientationDetected.textContent='Learn a position first';els.orientationConfidence.textContent='—';}
}
function renderOrientationProfiles(){
  const profiles=state.library.orientationProfiles||{};els.orientationProfiles.innerHTML='';
  Object.entries(POSITIONS).forEach(([code,p])=>{const b=document.createElement('button');b.type='button';const learned=Boolean(profiles[code]);b.className=`orientation-chip ${learned?'learned':''}`;b.innerHTML=`<b>${code}</b><span>${learned?'learned':'—'}</span>`;b.addEventListener('click',()=>{els.position.value=code;showToast(`${p.label} selected`);});els.orientationProfiles.appendChild(b);});
  els.autoPositionToggle.checked=Boolean(state.library.autoPosition);
}
function learnSelectedPosition(){
  const mean=motionMean(),n=normalizeVector(mean);if(!n){showToast('Enable motion sensors and hold the phone still first');return;}
  const code=els.position.value;state.library.orientationProfiles=state.library.orientationProfiles||{};state.library.orientationProfiles[code]={...n,timestamp:new Date().toISOString()};saveLibrary();renderOrientationProfiles();onDeviceMotion({accelerationIncludingGravity:mean});showToast(`${code} posture learned`);
}
function clearOrientationProfiles(){
  if(!Object.keys(state.library.orientationProfiles||{}).length)return;
  if(confirm('Clear all learned phone/watch position postures?')){state.library.orientationProfiles={};saveLibrary();state.sensors.motionMatch=null;renderOrientationProfiles();els.orientationDetected.textContent='Learn a position first';els.orientationConfidence.textContent='—';showToast('Learned positions cleared');}
}
function onMagReading(){
  const m=state.sensors.magnetometer;if(!m)return;const x=Number(m.x),y=Number(m.y),z=Number(m.z);if(![x,y,z].every(Number.isFinite))return;
  const r={x,y,z,t:performance.now()};state.sensors.magCurrent=r;state.sensors.magReadings.push(r);if(state.sensors.magReadings.length>800)state.sensors.magReadings.shift();
  const recent=state.sensors.magReadings.slice(-20),stats=fieldStats(recent);if(!stats)return;
  els.magCurrent.textContent=`${stats.magnitude.toFixed(1)} µT`;els.magVector.textContent=`${x.toFixed(1)} / ${y.toFixed(1)} / ${z.toFixed(1)} µT`;els.magStability.textContent=`σ ${stats.magStd.toFixed(2)} µT`;
}
function onMagError(ev){
  const name=ev?.error?.name||'Sensor error';state.sensors.magnetometerState='error';els.magnetometerStatus.textContent=`Unavailable · ${name}`;els.captureBaselineBtn.disabled=true;els.captureWatchFieldBtn.disabled=true;updateSensorBadge();
}
async function enableSensors(){
  els.enableSensorsBtn.disabled=true;els.enableSensorsBtn.textContent='Enabling…';
  let motionOk=state.sensors.motionEnabled;
  try{
    if('DeviceMotionEvent' in window){
      let granted=true;
      if(typeof DeviceMotionEvent.requestPermission==='function') granted=(await DeviceMotionEvent.requestPermission())==='granted';
      if(granted&&!state.sensors.motionEnabled){window.addEventListener('devicemotion',onDeviceMotion,{passive:true});state.sensors.motionEnabled=true;motionOk=true;}
    }
  }catch(e){console.warn('Motion sensor permission',e);}
  if('Magnetometer' in window && !state.sensors.magnetometer){
    try{
      const mag=new window.Magnetometer({frequency:10});mag.addEventListener('reading',onMagReading);mag.addEventListener('error',onMagError);mag.start();state.sensors.magnetometer=mag;state.sensors.magnetometerState='active';els.magnetometerStatus.textContent='Live magnetometer';els.captureBaselineBtn.disabled=false;
    }catch(e){console.warn('Magnetometer',e);state.sensors.magnetometerState='error';els.magnetometerStatus.textContent=`Unavailable · ${e?.name||'browser restriction'}`;}
  }else if(!('Magnetometer' in window)){
    state.sensors.magnetometerState='unsupported';els.magnetometerStatus.textContent='Not exposed by this browser';els.captureBaselineBtn.disabled=true;els.captureWatchFieldBtn.disabled=true;
  }
  updateSensorBadge();els.enableSensorsBtn.disabled=false;els.enableSensorsBtn.textContent=motionOk||state.sensors.magnetometerState==='active'?'Sensors enabled':'Try sensors again';
  if(!motionOk&&state.sensors.magnetometerState!=='active')showToast('This browser did not expose phone sensors');
}
async function collectMagWindow(button,label){
  if(state.sensors.magBusy||state.sensors.magnetometerState!=='active')return null;state.sensors.magBusy=true;
  const buttons=[els.captureBaselineBtn,els.captureWatchFieldBtn];buttons.forEach(b=>b.disabled=true);const old=button.textContent,start=performance.now();
  try{
    while(performance.now()-start<3000){const left=Math.max(0,3-(performance.now()-start)/1000);button.textContent=`${label} ${left.toFixed(1)} s`;await new Promise(r=>setTimeout(r,100));}
    const samples=state.sensors.magReadings.filter(r=>r.t>=start).map(({x,y,z})=>({x,y,z}));
    if(samples.length<8){showToast('Not enough magnetometer samples');return null;}
    return fieldStats(samples);
  }finally{button.textContent=old;state.sensors.magBusy=false;els.captureBaselineBtn.disabled=state.sensors.magnetometerState!=='active';els.captureWatchFieldBtn.disabled=!state.sensors.magBaseline||state.sensors.magnetometerState!=='active';}
}
async function captureMagBaseline(){
  const w=activeWatch();if(!w){showToast('Select or create a watch first');return;}
  const stats=await collectMagWindow(els.captureBaselineBtn,'Background');if(!stats)return;state.sensors.magBaseline=stats;els.captureWatchFieldBtn.disabled=false;renderMagneticResult();showToast('Background captured — now place the watch');
}
async function captureMagWatch(){
  const w=activeWatch();if(!w){showToast('Select or create a watch first');return;}if(!state.sensors.magBaseline){showToast('Capture the background first');return;}
  const watchStats=await collectMagWindow(els.captureWatchFieldBtn,'With watch');if(!watchStats)return;
  const base=state.sensors.magBaseline,delta=deltaVectorMagnitude(base,watchStats);
  const test={id:uid(),timestamp:new Date().toISOString(),baseline:{x:base.x,y:base.y,z:base.z,magnitude:base.magnitude,magStd:base.magStd,count:base.count},watch:{x:watchStats.x,y:watchStats.y,z:watchStats.z,magnitude:watchStats.magnitude,magStd:watchStats.magStd,count:watchStats.count},deltaB:delta};
  w.magneticTests=Array.isArray(w.magneticTests)?w.magneticTests:[];w.magneticTests.unshift(test);w.magneticTests=w.magneticTests.slice(0,30);state.sensors.magBaseline=null;saveLibrary();renderMagneticResult();renderPassport();showToast(`Magnetic screening saved · ΔB ${delta.toFixed(1)} µT`);
}
function renderMagneticResult(){
  const w=activeWatch(),latest=w?.magneticTests?.[0];
  if(state.sensors.magBaseline){const b=state.sensors.magBaseline;els.magneticResult.innerHTML=`<div><small>Background ready</small><strong>${b.magnitude.toFixed(1)} µT</strong><span>σ ${b.magStd.toFixed(2)} µT · place watch and capture step 2</span></div>`;return;}
  if(!latest){els.magneticResult.innerHTML='<span>No magnetic test saved yet.</span>';return;}
  els.magneticResult.innerHTML=`<div class="magnetic-kpis"><div><small>ΔB</small><strong>${Number(latest.deltaB).toFixed(1)}</strong><span>µT</span></div><div><small>Background</small><strong>${Number(latest.baseline?.magnitude).toFixed(1)}</strong><span>µT</span></div><div><small>With watch</small><strong>${Number(latest.watch?.magnitude).toFixed(1)}</strong><span>µT</span></div></div><small>${new Date(latest.timestamp).toLocaleString()} · experimental field-deviation screening</small>`;
}
function initializeSensorUi(){
  renderOrientationProfiles();renderMagneticResult();
  if('Magnetometer' in window)els.magnetometerStatus.textContent='Available after sensor permission';else els.magnetometerStatus.textContent='Not exposed by this browser';
  updateSensorBadge();
}

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
  if(state.library.autoPosition && state.sensors.motionMatch?.matched && state.sensors.motionMatch.confidence>=0.45) els.position.value=state.sensors.motionMatch.position;
  if(!navigator.mediaDevices?.getUserMedia){ setMicStatus('Microphone unavailable','error'); return; }
  try{
    clearLive({keepSignal:false});
    setMicStatus('Requesting microphone…');
    const stream=await navigator.mediaDevices.getUserMedia(requestedConstraints(els.inputDevice.value));
    const AC=window.AudioContext||window.webkitAudioContext;
    const context=new AC({latencyHint:'interactive',sampleRate:48000});
    await context.audioWorklet.addModule('./tick-processor.js?v=0.3.1');
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
    const cal=currentCalibration();
    const corrected=applyRateCalibration(state.displayRate,cal);
    const combinedUncertainty=Math.sqrt(timing.rateUncertainty*timing.rateUncertainty + calibrationUncertainty(cal)*calibrationUncertainty(cal));
    state.rateTrail.push({t:performance.now(),rate:corrected}); if(state.rateTrail.length>80) state.rateTrail.shift();
    els.rateValue.textContent=`${corrected>=0?'+':''}${corrected.toFixed(1)}`;
    els.rateUncertainty.textContent=cal.count?`raw ${state.displayRate>=0?'+':''}${state.displayRate.toFixed(1)} • cal ${cal.offset>=0?'+':''}${cal.offset.toFixed(1)} • ±${combinedUncertainty.toFixed(1)}`:`raw • ±${timing.rateUncertainty.toFixed(1)} s/day`;
    els.jitterValue.textContent=timing.jitterRms.toFixed(2);
    els.alternationValue.textContent=`${timing.alternationMs.toFixed(2)} ms`;
    state.currentReading={rawRate:state.displayRate,rate:corrected,calibrationOffset:cal.offset,calibrationCount:cal.count,bph,jitter:timing.jitterRms,alternation:timing.alternationMs,signal:sig,confidence:Math.min(1,(timing.confidence+bphC)/2),uncertainty:combinedUncertainty,duration:timing.duration,position:els.position.value};
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
  const rate=Number.isFinite(state.displayRate)?calibratedRate(state.displayRate):null;
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
  loadActiveWatchFields(); renderHistory(); renderPositionSummary(); renderPassport();
}
function loadActiveWatchFields(){ const w=activeWatch(); els.watchName.value=w?.name||'';els.watchModel.value=w?.model||'';els.watchMovement.value=w?.movement||'';renderWatchPhotos();renderPassport();renderMagneticResult(); }
function setPhotoPreview(kind,data){
  const img=kind==='front'?els.frontPhotoPreview:els.backPhotoPreview,empty=kind==='front'?els.frontPhotoEmpty:els.backPhotoEmpty,remove=kind==='front'?els.removeFrontPhotoBtn:els.removeBackPhotoBtn;
  const ok=photoDataUrlOk(data); if(img){img.hidden=!ok; if(ok)img.src=data; else img.removeAttribute('src');} if(empty)empty.hidden=ok; if(remove)remove.disabled=!ok;
}
function renderWatchPhotos(){const w=activeWatch();setPhotoPreview('front',w?.photos?.front);setPhotoPreview('back',w?.photos?.back);}
function renderPassport(){
  const w=activeWatch();
  if(!w){els.passportTitle.textContent='Current watch';els.passportTestCount.textContent='0 tests';els.passportSummary.innerHTML='<div class="passport-empty">Create or select a watch to build its passport.<br><span dir="rtl">أنشئ ساعة أو اخترها لعرض جواز الساعة.</span></div>';return;}
  const ms=calibratedMeasurements(w.measurements||[]),sum=summarizeMeasurements(ms),front=photoDataUrlOk(w?.photos?.front)?`<img src="${w.photos.front}" alt="${escapeHtml(w.name)} front">`:'<div class="passport-placeholder">⌚</div>';
  const last=ms[0]?.timestamp?new Date(ms[0].timestamp).toLocaleDateString():'Not tested';
  els.passportTitle.textContent=w.name||'Watch';els.passportTestCount.textContent=`${ms.length} test${ms.length===1?'':'s'}`;
  const mag=w?.magneticTests?.[0];
  els.passportSummary.innerHTML=`<div class="passport-thumb">${front}</div><div class="passport-info"><strong>${escapeHtml(w.name)}</strong><span>${escapeHtml(w.model||'Model / reference not set')}</span><span>${escapeHtml(w.movement||'Movement not set')}</span><small>Last test: ${escapeHtml(last)}</small></div><div class="passport-kpis"><div><small>Positions</small><b>${sum.count||0}/6</b></div><div><small>Mean</small><b>${Number.isFinite(sum.meanRate)?`${sum.meanRate>=0?'+':''}${sum.meanRate.toFixed(1)}`:'—'}</b></div><div><small>Δ</small><b>${Number.isFinite(sum.positionalDelta)?sum.positionalDelta.toFixed(1):'—'}</b></div><div><small>BPH</small><b>${Number.isFinite(sum.dominantBph)?Number(sum.dominantBph).toLocaleString():'—'}</b></div><div><small>Mag ΔB</small><b>${mag&&Number.isFinite(Number(mag.deltaB))?Number(mag.deltaB).toFixed(1):'—'}</b><em>µT · exp.</em></div></div>`;
}
async function updateWatchPhoto(kind,file){
  let w=activeWatch(); if(!w){w=saveWatchProfile();if(!w)return;}
  try{const data=await compressWatchPhoto(file);w.photos=w.photos||{};w.photos[kind]=data;saveLibrary();renderWatchPhotos();renderPassport();showToast(kind==='front'?'Front photo saved':'Caseback photo saved');}
  catch(e){console.error(e);showToast(e?.message||'Could not save photo');}
}
function removeWatchPhoto(kind){const w=activeWatch();if(!w)return;w.photos=w.photos||{};delete w.photos[kind];saveLibrary();renderWatchPhotos();renderPassport();showToast('Photo removed');}
function saveWatchProfile(){
  const name=els.watchName.value.trim(); if(!name){showToast('Enter a watch name first');return null;}
  let w=state.library.watches.find(x=>x.id===state.activeWatchId);
  if(!w){w={id:uid(),name,model:'',movement:'',createdAt:new Date().toISOString(),measurements:[],photos:{}};state.library.watches.unshift(w);state.activeWatchId=w.id;}
  w.name=name;w.model=els.watchModel.value.trim();w.movement=els.watchMovement.value.trim();saveLibrary();renderWatchSelect();renderPassport();showToast('Watch profile saved');return w;
}
function saveMeasurement({auto=false}={}){
  if(!state.currentReading){if(!auto)showToast('No valid reading to save');return false;}
  let w=state.library.watches.find(x=>x.id===state.activeWatchId)||saveWatchProfile(); if(!w)return false;
  const before=summarizeMeasurements(calibratedMeasurements(w.measurements||[]));
  const r=state.currentReading;w.measurements=w.measurements||[];w.measurements.unshift({id:uid(),timestamp:new Date().toISOString(),position:r.position,rawRate:+Number(r.rawRate??r.rate).toFixed(2),rate:+r.rate.toFixed(2),calibrationOffset:+Number(r.calibrationOffset||0).toFixed(3),calibrationCount:Number(r.calibrationCount||0),bph:r.bph,jitter:+r.jitter.toFixed(3),alternation:+r.alternation.toFixed(3),signal:Math.round(r.signal),confidence:+r.confidence.toFixed(3),uncertainty:+r.uncertainty.toFixed(2),duration:+r.duration.toFixed(2),testDuration:+(state.targetDurationSec||selectedDuration()),orientationPosition:state.sensors.motionMatch?.matched?state.sensors.motionMatch.position:'',orientationConfidence:state.sensors.motionMatch?.matched?+state.sensors.motionMatch.confidence.toFixed(3):null});
  saveLibrary();renderHistory();renderPositionSummary();renderPassport();showToast(`${POSITIONS[r.position]?.short||r.position} ${auto?'saved automatically':'result saved'}`);
  const after=summarizeMeasurements(calibratedMeasurements(w.measurements));
  if(!before.complete&&after.complete) setTimeout(()=>openReport({auto:true}),300);
  return true;
}
function calibratedMeasurements(ms=[]){const cal=currentCalibration();return ms.map(m=>({...m,rawRate:Number(m.rawRate??m.rate),rate:applyRateCalibration(Number(m.rawRate??m.rate),cal),calibrationOffset:cal.offset,calibrationCount:cal.count}));}
function measurementsForActive(){const ms=state.library.watches.find(x=>x.id===state.activeWatchId)?.measurements||[];return calibratedMeasurements(ms);}
function renderPositionSummary(){
  const ms=measurementsForActive(); els.positionSummary.innerHTML=''; const latest={}; ms.forEach(m=>{if(!latest[m.position])latest[m.position]=m;});
  Object.entries(POSITIONS).forEach(([k,p])=>{const m=latest[k];const el=document.createElement('button');el.type='button';const sev=m?(Math.abs(m.rate)<=5?'good':Math.abs(m.rate)<=15?'warn':'bad'):'';el.className=`pos-card ${m?'has-data':''} ${sev}`;el.innerHTML=`<span>${p.short}</span><small>${p.label}</small><strong>${m?`${m.rate>=0?'+':''}${m.rate.toFixed(1)}`:'—'}</strong><em>${m?'s/day':'not tested'}</em>`;el.addEventListener('click',()=>{els.position.value=k;showToast(`Position set to ${p.label}`);});els.positionSummary.appendChild(el);});
  if(ms.length){const rates=Object.values(latest).map(m=>m.rate),avg=rates.reduce((a,b)=>a+b,0)/rates.length,delta=Math.max(...rates)-Math.min(...rates);els.sessionSummary.textContent=`${rates.length}/6 positions • mean ${avg>=0?'+':''}${avg.toFixed(1)} s/day • positional Δ ${delta.toFixed(1)} s/day`;}
  else els.sessionSummary.textContent='No saved position tests yet';
}
function renderHistory(){
  const ms=measurementsForActive().slice(0,30);els.historyBody.innerHTML='';if(!ms.length){els.historyBody.innerHTML='<div class="empty-history">No saved tests for this watch.</div>';return;}
  ms.forEach(m=>{const row=document.createElement('div');row.className=`history-row ${Math.abs(m.rate)<=5?'good':Math.abs(m.rate)<=15?'warn':'bad'}`;const d=new Date(m.timestamp);row.innerHTML=`<div><b>${POSITIONS[m.position]?.short||m.position}</b><span>${d.toLocaleString()}</span></div><strong>${m.rate>=0?'+':''}${m.rate.toFixed(1)} <small>s/day</small></strong><span>${m.bph.toLocaleString()} BPH</span><span>jitter ${m.jitter.toFixed(2)} ms</span><span class="history-raw">raw ${Number(m.rawRate??m.rate)>=0?'+':''}${Number(m.rawRate??m.rate).toFixed(1)}</span><button type="button" aria-label="Delete result">×</button>`;row.querySelector('button').addEventListener('click',()=>{const w=state.library.watches.find(x=>x.id===state.activeWatchId);if(w){w.measurements=w.measurements.filter(x=>x.id!==m.id);saveLibrary();renderHistory();renderPositionSummary();renderPassport();}});els.historyBody.appendChild(row);});
}
function exportCsv(){
  const w=state.library.watches.find(x=>x.id===state.activeWatchId);if(!w||!w.measurements?.length){showToast('No saved tests to export');return;}
  const cal=currentCalibration();const rows=[['watch','model','movement','timestamp','position','raw_rate_s_day','calibrated_rate_s_day','calibration_offset_s_day','bph','jitter_ms','alternation_ms','signal_pct','confidence','uncertainty_s_day','duration_s','test_duration_s']];
  calibratedMeasurements(w.measurements).slice().reverse().forEach(m=>rows.push([w.name,w.model||'',w.movement||'',m.timestamp,m.position,m.rawRate,m.rate,cal.offset,m.bph,m.jitter,m.alternation,m.signal,m.confidence,m.uncertainty,m.duration,m.testDuration||'']));
  const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`WatchLabX-${w.name.replace(/[^a-z0-9_-]+/gi,'_')}.csv`;a.click();URL.revokeObjectURL(url);
}
function clearTests(){const w=state.library.watches.find(x=>x.id===state.activeWatchId);if(!w||!w.measurements?.length)return;if(confirm(`Delete all saved tests for ${w.name}?`)){w.measurements=[];saveLibrary();renderHistory();renderPositionSummary();renderPassport();}}

function renderCalibration(){
  const cal=currentCalibration();
  if(!cal.count){els.calibrationStatus.textContent='Uncalibrated';els.calibrationDetail.textContent='No rate correction is applied. BPH detection is unaffected.';els.calibrationChip.textContent='Rate uncalibrated';els.calibrationChip.className='cal-chip';return;}
  const spread=Number.isFinite(cal.spread)?` • spread ${cal.spread.toFixed(1)}`:'';
  const label=cal.status==='good'?'Calibrated':cal.status==='inconsistent'?'Check calibration':'Provisional';
  els.calibrationStatus.textContent=`${label} • ${cal.offset>=0?'+':''}${cal.offset.toFixed(2)} s/day`;
  els.calibrationDetail.textContent=`${cal.count} reference point${cal.count===1?'':'s'}${spread} s/day. Current rate display includes this correction.`;
  els.calibrationChip.textContent=`Cal ${cal.offset>=0?'+':''}${cal.offset.toFixed(1)}`;
  els.calibrationChip.className=`cal-chip ${cal.status}`;
}

function addCalibrationPoint(){
  if(!state.currentReading||!Number.isFinite(Number(state.currentReading.rawRate))){showToast('Take a stable reading first');return;}
  const ref=Number(els.calibrationReference.value);
  if(!Number.isFinite(ref)||Math.abs(ref)>600){showToast('Enter a trusted reference rate in s/day');return;}
  if(Number(state.currentReading.duration||0)<7.5||Number(state.currentReading.uncertainty||999)>15){showToast('Use a stable 8+ second reading for calibration');return;}
  const sample={id:uid(),timestamp:new Date().toISOString(),watchId:state.activeWatchId||null,position:state.currentReading.position,rawRate:Number(state.currentReading.rawRate),referenceRate:ref,confidence:Number(state.currentReading.confidence||.5),uncertainty:Number(state.currentReading.uncertainty||6)};
  state.library.calibrationSamples=state.library.calibrationSamples||[];
  state.library.calibrationSamples.unshift(sample);
  state.library.calibrationSamples=state.library.calibrationSamples.slice(0,20);
  saveLibrary();renderCalibration();renderHistory();renderPositionSummary();
  els.calibrationReference.value='';showToast('Calibration point added');
}

function clearCalibration(){
  if(!(state.library.calibrationSamples||[]).length)return;
  if(confirm('Clear all WatchLabX rate calibration points on this device?')){state.library.calibrationSamples=[];saveLibrary();renderCalibration();renderHistory();renderPositionSummary();showToast('Rate calibration cleared');}
}

function reportPositionName(p){return POSITIONS[p]?.label||p;}
function reportRate(v){return Number.isFinite(Number(v))?`${Number(v)>=0?'+':''}${Number(v).toFixed(1)}`:'—';}
function getReportData(){
  const w=state.library.watches.find(x=>x.id===state.activeWatchId);if(!w)return null;
  const ms=calibratedMeasurements(w.measurements||[]);const summary=summarizeMeasurements(ms);const cal=currentCalibration();const magnetic=w?.magneticTests?.[0]||null;return {w,summary,cal,magnetic,assessment:assessmentFromSummary(summary)};
}
function reportMarkup(data){
  const {w,summary,cal,magnetic,assessment}=data;const now=new Date();
  const rows=summary.rows.map(m=>`<tr><td>${escapeHtml(POSITIONS[m.position]?.short||m.position)}</td><td>${escapeHtml(reportPositionName(m.position))}</td><td>${reportRate(m.rate)}</td><td>${reportRate(m.rawRate)}</td><td>${Number(m.bph).toLocaleString()}</td><td>${Number(m.jitter).toFixed(2)}</td><td>${Math.round(Number(m.signal))}%</td><td>${Math.round(Number(m.confidence)*100)}%</td></tr>`).join('');
  const calText=cal.count?`${cal.status} • ${cal.offset>=0?'+':''}${cal.offset.toFixed(2)} s/day • ${cal.count} point${cal.count===1?'':'s'}${Number.isFinite(cal.spread)?` • spread ${cal.spread.toFixed(2)}`:''}`:'Uncalibrated — rate values are raw acoustic estimates.';
  return `<article class="report-document">
    <header><div><span>WATCHLABX TIMING REPORT</span><h3>${escapeHtml(w.name)}</h3><p>${escapeHtml([w.model,w.movement].filter(Boolean).join(' • ')||'Mechanical watch')}</p></div><div class="report-head-side">${photoDataUrlOk(w?.photos?.front)?`<img class="report-watch-photo" src="${w.photos.front}" alt="Watch front">`:''}<div class="report-sign">Dr.Eidan</div></div></header>
    <div class="report-meta"><span>${now.toLocaleString()}</span><span>${summary.count}/6 positions</span><span>${summary.complete?'Complete six-position set':'Partial set'}</span></div>
    <section class="report-kpis"><div><small>Mean rate</small><strong>${reportRate(summary.meanRate)}</strong><span>s/day</span></div><div><small>Positional Δ</small><strong>${Number.isFinite(summary.positionalDelta)?summary.positionalDelta.toFixed(1):'—'}</strong><span>s/day</span></div><div><small>Mean jitter</small><strong>${Number.isFinite(summary.meanJitter)?summary.meanJitter.toFixed(2):'—'}</strong><span>ms RMS</span></div><div><small>BPH</small><strong>${Number.isFinite(summary.dominantBph)?Number(summary.dominantBph).toLocaleString():'—'}</strong><span>dominant</span></div></section>
    <section class="report-cal"><b>Rate calibration</b><p>${escapeHtml(calText)}</p></section>
    ${magnetic?`<section class="report-mag"><b>Magnetic screening · experimental</b><div class="report-mag-grid"><span>ΔB <strong>${Number(magnetic.deltaB).toFixed(1)} µT</strong></span><span>Background <strong>${Number(magnetic.baseline?.magnitude).toFixed(1)} µT</strong></span><span>With watch <strong>${Number(magnetic.watch?.magnitude).toFixed(1)} µT</strong></span></div><p>Field-deviation screening measured by the phone sensor. No pass/fail magnetization threshold is claimed.</p></section>`:''}
    <div class="report-table-wrap"><table><thead><tr><th>Pos.</th><th>Position</th><th>Rate</th><th>Raw</th><th>BPH</th><th>Jitter</th><th>Signal</th><th>Conf.</th></tr></thead><tbody>${rows}</tbody></table></div>
    <section class="report-assessment ${assessment.tone}"><b>${escapeHtml(assessment.headline)}</b><ul>${assessment.notes.map(n=>`<li>${escapeHtml(n)}</li>`).join('')}</ul></section>
    <section class="report-foot"><p><b>Interpretation note:</b> WatchLabX is a browser-based acoustic timing tool. Calibration corrects a device-specific rate offset only when referenced to a trusted rate source. Tick/Tock Δ and magnetic screening remain experimental. Magnetic ΔB is a phone-sensor field deviation, not a calibrated percentage of watch magnetization. Results should be repeated when signal or confidence is low.</p></section>
  </article>`;
}
function openReport({auto=false}={}){
  const data=getReportData();if(!data||!data.summary.count){showToast('No saved tests to report');return;}
  els.reportContent.innerHTML=reportMarkup(data);els.reportModal.hidden=false;document.body.classList.add('report-open');
  if(auto)showToast('Six positions complete — report ready');
}
function closeReport(){els.reportModal.hidden=true;document.body.classList.remove('report-open');}
function printReport(){window.print();}
function downloadReport(){
  const data=getReportData();if(!data)return;const body=reportMarkup(data);const css=`body{font-family:Arial,sans-serif;color:#152033;margin:32px}article{max-width:900px;margin:auto}header{display:flex;justify-content:space-between;border-bottom:2px solid #17243a;padding-bottom:16px}.report-head-side{display:flex;gap:10px;align-items:flex-start}.report-watch-photo{width:76px;height:76px;object-fit:cover;border-radius:10px;border:1px solid #ccd4df}.report-sign{font-style:italic;font-size:24px}.report-meta,.report-kpis{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}.report-kpis div{border:1px solid #ccd4df;border-radius:12px;padding:12px;min-width:130px}.report-kpis strong{display:block;font-size:24px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}.report-cal,.report-mag,.report-assessment,.report-foot{margin:16px 0;padding:12px;border:1px solid #d9e0e9;border-radius:10px}.report-mag-grid{display:flex;gap:18px;flex-wrap:wrap;margin:10px 0}small,span,p{color:#526176}`;const html=`<!doctype html><meta charset="utf-8"><title>WatchLabX Report - ${escapeHtml(data.w.name)}</title><style>${css}</style>${body}`;const blob=new Blob([html],{type:'text/html'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`WatchLabX-Report-${data.w.name.replace(/[^a-z0-9_-]+/gi,'_')}.html`;a.click();URL.revokeObjectURL(url);
}

function openHelp(){els.helpModal.hidden=false;document.body.classList.add('help-open');}
function closeHelp(){els.helpModal.hidden=true;document.body.classList.remove('help-open');}
function setGuideLanguage(lang){const ar=lang==='ar';els.guideAr.hidden=!ar;els.guideEn.hidden=ar;els.guideArBtn.classList.toggle('active',ar);els.guideEnBtn.classList.toggle('active',!ar);els.guideArBtn.setAttribute('aria-selected',String(ar));els.guideEnBtn.setAttribute('aria-selected',String(!ar));}

els.startBtn.addEventListener('click',start);els.stopBtn.addEventListener('click',stop);els.resetBtn.addEventListener('click',reset);els.saveResultBtn.addEventListener('click',()=>saveMeasurement());els.durationSelect.addEventListener('change',updateIdleCountdown);
els.refreshDevicesBtn.addEventListener('click',()=>refreshInputDevices({requestPermission:true}));els.sensitivity.addEventListener('input',applySensitivity);
els.bphMode.addEventListener('change',()=>{state.lockedBph=null;state.lockedBphConfidence=0;state.candidateBph=null;state.candidateStreak=0;state.node?.port.postMessage({type:'config',minGapSec:.055});});
els.watchSelect.addEventListener('change',()=>{state.activeWatchId=els.watchSelect.value||null;saveLibrary();loadActiveWatchFields();renderHistory();renderPositionSummary();renderPassport();});els.saveWatchBtn.addEventListener('click',saveWatchProfile);els.exportCsvBtn.addEventListener('click',exportCsv);els.clearTestsBtn.addEventListener('click',clearTests);els.addCalibrationBtn.addEventListener('click',addCalibrationPoint);els.clearCalibrationBtn.addEventListener('click',clearCalibration);els.reportBtn.addEventListener('click',()=>openReport());els.closeReportBtn.addEventListener('click',closeReport);els.printReportBtn.addEventListener('click',printReport);els.downloadReportBtn.addEventListener('click',downloadReport);els.reportModal.querySelector('[data-close-report]')?.addEventListener('click',closeReport);
els.helpBtn.addEventListener('click',openHelp);els.closeHelpBtn.addEventListener('click',closeHelp);els.helpModal.querySelector('[data-close-help]')?.addEventListener('click',closeHelp);els.guideEnBtn.addEventListener('click',()=>setGuideLanguage('en'));els.guideArBtn.addEventListener('click',()=>setGuideLanguage('ar'));
els.frontPhotoInput.addEventListener('change',e=>{const f=e.target.files?.[0];if(f)updateWatchPhoto('front',f);e.target.value='';});els.backPhotoInput.addEventListener('change',e=>{const f=e.target.files?.[0];if(f)updateWatchPhoto('back',f);e.target.value='';});els.removeFrontPhotoBtn.addEventListener('click',()=>removeWatchPhoto('front'));els.removeBackPhotoBtn.addEventListener('click',()=>removeWatchPhoto('back'));
els.enableSensorsBtn.addEventListener('click',enableSensors);els.learnPositionBtn.addEventListener('click',learnSelectedPosition);els.clearOrientationBtn.addEventListener('click',clearOrientationProfiles);els.autoPositionToggle.addEventListener('change',()=>{state.library.autoPosition=els.autoPositionToggle.checked;saveLibrary();showToast(state.library.autoPosition?'Auto position enabled':'Auto position disabled');});els.captureBaselineBtn.addEventListener('click',captureMagBaseline);els.captureWatchFieldBtn.addEventListener('click',captureMagWatch);
window.addEventListener('resize',drawAll);window.addEventListener('beforeunload',()=>{state.stream?.getTracks().forEach(t=>t.stop());try{state.sensors.magnetometer?.stop();}catch{}});navigator.mediaDevices?.addEventListener?.('devicechange',()=>{if(!state.running)refreshInputDevices();});

els.secureNote.textContent=window.isSecureContext?'HTTPS secure context • audio stays on this device.':'Open via HTTPS to enable microphone access.';
refreshInputDevices();renderWatchSelect();renderCalibration();renderPassport();initializeSensorUi();setGuideLanguage('en');updateIdleCountdown();drawAll();
