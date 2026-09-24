import { detectBPH, analyzeTiming, signalScore, sensitivityParams } from './core.mjs?v=0.1.3';

const $ = (id) => document.getElementById(id);
const els = {
  startBtn: $('startBtn'), stopBtn: $('stopBtn'), resetBtn: $('resetBtn'), refreshDevicesBtn: $('refreshDevicesBtn'),
  bphMode: $('bphMode'), position: $('position'), inputDevice: $('inputDevice'), sensitivity: $('sensitivity'), sensitivityValue: $('sensitivityValue'),
  micDot: $('micDot'), micStatus: $('micStatus'), rateValue: $('rateValue'), bphValue: $('bphValue'), bphConfidence: $('bphConfidence'), jitterValue: $('jitterValue'), signalValue: $('signalValue'), signalLabel: $('signalLabel'),
  timegrapher: $('timegrapher'), levelPlot: $('levelPlot'), eventCount: $('eventCount'), sampleRate: $('sampleRate'), elapsed: $('elapsed'), beatsStat: $('beatsStat'), eventRateStat: $('eventRateStat'), patternLockStat: $('patternLockStat'), periodStat: $('periodStat'), rateUncertainty: $('rateUncertainty'), positionStat: $('positionStat'), analysisState: $('analysisState'),
  echoSetting: $('echoSetting'), noiseSetting: $('noiseSetting'), gainSetting: $('gainSetting'), channelSetting: $('channelSetting'), sampleSetting: $('sampleSetting'), rawConfidence: $('rawConfidence'), secureNote: $('secureNote'),
  deviceSetting: $('deviceSetting'), selectedChannel: $('selectedChannel'), channelLevels: $('channelLevels'), peakNoise: $('peakNoise'), thresholdSetting: $('thresholdSetting')
};

const state = {
  stream: null, context: null, source: null, node: null, sink: null,
  ticks: [], levelHistory: [], startedAt: null, raf: 0, lastAnalysis: null,
  detectedBph: null, latestLevel: { rms: 0, noise: 0.00002, peak: 0, threshold: 0.00003, channels: [], selectedChannel: 0 },
  latestEvent: null, running: false, selectedDeviceLabel: 'System default microphone', detectorLockBph: null
};

function fmtBool(v) { return v === true ? 'On' : v === false ? 'Off' : 'Not reported'; }
function setMicStatus(text, kind = 'idle') { els.micStatus.textContent = text; els.micDot.className = `dot ${kind}`; }
function dbfs(v) { return 20 * Math.log10(Math.max(1e-9, v)); }
function shortDb(v) { return `${dbfs(v).toFixed(1)} dBFS`; }

function requestedConstraints(deviceId = '') {
  const supported = navigator.mediaDevices?.getSupportedConstraints?.() || {};
  const audio = { channelCount: { ideal: 2 }, sampleRate: { ideal: 48000 } };
  if (deviceId) audio.deviceId = { exact: deviceId };
  if (supported.echoCancellation) audio.echoCancellation = { ideal: false };
  if (supported.noiseSuppression) audio.noiseSuppression = { ideal: false };
  if (supported.autoGainControl) audio.autoGainControl = { ideal: false };
  return { audio, video: false };
}

async function refreshInputDevices({ requestPermission = false } = {}) {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  let tempStream = null;
  try {
    if (requestPermission) {
      tempStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
    const previous = els.inputDevice.value;
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
    els.inputDevice.innerHTML = '';
    const defaultOption = new Option('System default microphone', '');
    els.inputDevice.add(defaultOption);
    devices.forEach((d, i) => {
      if (d.deviceId === 'default') return;
      const label = d.label || `Microphone ${i + 1}`;
      els.inputDevice.add(new Option(label, d.deviceId));
    });
    if ([...els.inputDevice.options].some(o => o.value === previous)) els.inputDevice.value = previous;
    state.selectedDeviceLabel = els.inputDevice.selectedOptions[0]?.textContent || 'System default microphone';
    els.deviceSetting.textContent = state.selectedDeviceLabel;
  } catch (err) {
    console.warn('Could not enumerate microphones', err);
  } finally {
    tempStream?.getTracks().forEach(t => t.stop());
  }
}

async function start() {
  if (state.running) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    setMicStatus('Microphone API unavailable', 'error');
    els.analysisState.textContent = 'Unsupported browser/context';
    return;
  }
  try {
    setMicStatus('Requesting microphone…', 'idle');
    const selectedDeviceId = els.inputDevice.value;
    const stream = await navigator.mediaDevices.getUserMedia(requestedConstraints(selectedDeviceId));
    const AC = window.AudioContext || window.webkitAudioContext;
    const context = new AC({ latencyHint: 'interactive', sampleRate: 48000 });
    await context.audioWorklet.addModule('./tick-processor.js?v=0.1.3');
    await context.resume();

    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, 'watchlabx-tick-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 2,
      channelCountMode: 'max',
      channelInterpretation: 'discrete'
    });
    const sink = context.createGain();
    sink.gain.value = 0;
    source.connect(node).connect(sink).connect(context.destination);

    node.port.onmessage = onAudioMessage;
    state.stream = stream; state.context = context; state.source = source; state.node = node; state.sink = sink;
    state.running = true; state.startedAt = performance.now();
    state.detectorLockBph = null;
    state.ticks = []; state.levelHistory = []; state.lastAnalysis = null; state.detectedBph = null; state.latestEvent = null; state.detectorLockBph = null;
    applySensitivity();
    showTrackSettings(stream.getAudioTracks()[0]);

    els.startBtn.disabled = true; els.stopBtn.disabled = false; els.inputDevice.disabled = true; els.refreshDevicesBtn.disabled = true;
    els.analysisState.textContent = 'Acquiring beats';
    setMicStatus('Microphone active', 'live');
    await refreshInputDevices();
    loop();
  } catch (err) {
    console.error(err);
    setMicStatus('Microphone unavailable', 'error');
    els.analysisState.textContent = err?.name === 'NotAllowedError' ? 'Permission denied' : err?.name === 'OverconstrainedError' ? 'Selected input unavailable' : 'Start failed';
  }
}

async function stop() {
  state.running = false;
  cancelAnimationFrame(state.raf);
  try { state.node?.disconnect(); } catch {}
  try { state.source?.disconnect(); } catch {}
  try { state.sink?.disconnect(); } catch {}
  state.stream?.getTracks().forEach(t => t.stop());
  if (state.context && state.context.state !== 'closed') await state.context.close();
  state.stream = state.context = state.source = state.node = state.sink = null;
  els.startBtn.disabled = false; els.stopBtn.disabled = true; els.inputDevice.disabled = false; els.refreshDevicesBtn.disabled = false;
  setMicStatus('Microphone idle', 'idle');
  els.analysisState.textContent = state.ticks.length ? 'Stopped — result retained' : 'Waiting';
  await refreshInputDevices();
}

function reset() {
  state.ticks = []; state.levelHistory = []; state.lastAnalysis = null; state.detectedBph = null; state.latestEvent = null;
  state.startedAt = state.running ? performance.now() : null;
  state.node?.port.postMessage({ type: 'reset' });
  els.rateValue.textContent = '—'; els.bphValue.textContent = '—'; els.bphConfidence.textContent = 'waiting'; els.jitterValue.textContent = '—'; els.signalValue.textContent = '—'; els.signalLabel.textContent = state.running ? 'listening' : 'idle';
  els.selectedChannel.textContent = '—'; els.channelLevels.textContent = '—'; els.peakNoise.textContent = '—'; els.thresholdSetting.textContent = '—';
  drawAll(); updateStats();
}

function applySensitivity() {
  const s = Number(els.sensitivity.value);
  els.sensitivityValue.textContent = `${s.toFixed(1)}×`;
  const cfg = sensitivityParams(s);
  state.node?.port.postMessage({ type: 'config', ...cfg });
}

function onAudioMessage(e) {
  const d = e.data || {};
  if (d.type === 'tick') {
    const last = state.ticks.at(-1);
    if (!last || d.time > last + 0.05) {
      state.ticks.push(d.time);
      state.latestEvent = d;
      if (state.ticks.length > 1600) state.ticks.splice(0, state.ticks.length - 1600);
    }
  } else if (d.type === 'level') {
    state.latestLevel = d;
    state.levelHistory.push({ t: performance.now(), rms: d.rms, noise: d.noise, peak: d.peak });
    if (state.levelHistory.length > 600) state.levelHistory.shift();
    els.sampleRate.textContent = `${Math.round(d.sampleRate).toLocaleString()} Hz`;
    updateChannelDiagnostics(d);
  }
}

function updateChannelDiagnostics(d) {
  const channels = d.channels || [];
  if (channels.length) {
    const labels = channels.slice(0, 2).map((c, i) => `${i === 0 ? 'L' : 'R'} ${shortDb(c.rms)}`);
    els.channelLevels.textContent = labels.join(' / ');
    const idx = Number.isFinite(d.selectedChannel) ? d.selectedChannel : 0;
    els.selectedChannel.textContent = channels.length === 1 ? 'Mono / Ch 1' : `${idx === 0 ? 'Left' : idx === 1 ? 'Right' : `Ch ${idx + 1}`}`;
    const active = channels[idx] || channels[0];
    els.peakNoise.textContent = `${shortDb(active.peak)} / ${shortDb(active.noise)}`;
    els.thresholdSetting.textContent = shortDb(active.threshold);
  }
}

function setDetectorRefractory(bph) {
  if (!state.node || !bph || state.detectorLockBph === bph) return;
  const T = 3600 / bph;
  const minGapSec = Math.max(0.045, Math.min(0.110, 0.55 * T));
  state.node.port.postMessage({ type: 'config', minGapSec });
  state.detectorLockBph = bph;
}

function currentNominalBph() {
  if (els.bphMode.value !== 'auto') {
    const bph = Number(els.bphMode.value);
    setDetectorRefractory(bph);
    return bph;
  }
  const recent = state.ticks.slice(-360);
  const d = detectBPH(recent);
  state.detectedBph = d;
  if (d?.bph && d.confidence >= 0.32) setDetectorRefractory(d.bph);
  return d?.bph || null;
}

function updateAnalysis() {
  const bph = currentNominalBph();
  if (bph) {
    els.bphValue.textContent = bph.toLocaleString();
    if (els.bphMode.value === 'auto') {
      const c = state.detectedBph?.confidence ?? 0;
      els.bphConfidence.textContent = `auto • ${(c * 100).toFixed(0)}% confidence`;
    } else {
      els.bphConfidence.textContent = 'manual nominal';
    }
  } else {
    els.bphValue.textContent = '—';
    els.bphConfidence.textContent = state.ticks.length < 8 ? 'collecting beats' : 'uncertain';
  }

  const timing = bph ? analyzeTiming(state.ticks.slice(-500), bph) : null;
  state.lastAnalysis = timing;
  if (timing) {
    els.rateValue.textContent = `${timing.rate >= 0 ? '+' : ''}${timing.rate.toFixed(1)}`;
    els.jitterValue.textContent = timing.jitterRms.toFixed(2);
    els.periodStat.textContent = `${timing.periodMs.toFixed(3)} ms`;
    els.rateUncertainty.textContent = `±${timing.rateUncertainty.toFixed(2)} s/day`;
    const eventSnr = state.latestEvent?.eventSnr || 0;
    els.analysisState.textContent = timing.duration >= 15 && eventSnr >= 3 ? 'Stable estimate' : timing.duration >= 8 ? 'Preliminary estimate' : 'Acquiring beats';
  } else {
    els.rateValue.textContent = '—'; els.jitterValue.textContent = '—'; els.periodStat.textContent = '—'; els.rateUncertainty.textContent = '—';
  }

  const eventSnr = state.latestEvent?.eventSnr || 0;
  const s = signalScore(state.latestLevel.rms, state.latestLevel.noise, state.latestLevel.peak, eventSnr);
  els.signalValue.textContent = `${Math.round(s)}%`;
  els.signalLabel.textContent = s >= 75 ? 'excellent' : s >= 50 ? 'good' : s >= 25 ? 'usable' : 'weak';
}

function updateStats() {
  const elapsed = state.startedAt ? Math.max(0, (performance.now() - state.startedAt) / 1000) : 0;
  els.elapsed.textContent = `${elapsed.toFixed(1)} s`;
  els.beatsStat.textContent = state.ticks.length.toLocaleString();
  els.eventCount.textContent = `${state.ticks.length.toLocaleString()} events`;

  let eventRate = NaN;
  if (state.ticks.length >= 2) {
    const tEnd = state.ticks.at(-1);
    const recent = state.ticks.filter(t => t >= tEnd - 5);
    if (recent.length >= 2) {
      const span = recent.at(-1) - recent[0];
      if (span > 0) eventRate = (recent.length - 1) / span;
    }
  }
  els.eventRateStat.textContent = Number.isFinite(eventRate) ? `${eventRate.toFixed(1)} events/s` : '—';
  const d = state.detectedBph;
  els.patternLockStat.textContent = d ? `${(100*d.confidence).toFixed(0)}% • gap ${Number(d.medianEventGap || 1).toFixed(1)}` : '—';
  els.positionStat.textContent = els.position.value;
}

function showTrackSettings(track) {
  const s = track.getSettings?.() || {};
  els.echoSetting.textContent = fmtBool(s.echoCancellation);
  els.noiseSetting.textContent = fmtBool(s.noiseSuppression);
  els.gainSetting.textContent = fmtBool(s.autoGainControl);
  els.channelSetting.textContent = s.channelCount ?? '—';
  els.sampleSetting.textContent = s.sampleRate ? `${Number(s.sampleRate).toLocaleString()} Hz` : `${Math.round(state.context?.sampleRate || 0).toLocaleString()} Hz`;
  const label = track.label || els.inputDevice.selectedOptions[0]?.textContent || 'Selected microphone';
  state.selectedDeviceLabel = label;
  els.deviceSetting.textContent = label;
  const vals = [s.echoCancellation, s.noiseSuppression, s.autoGainControl].filter(v => typeof v === 'boolean');
  const off = vals.filter(v => v === false).length;
  els.rawConfidence.textContent = vals.length === 0 ? 'Unknown' : off === vals.length ? 'High' : off >= 2 ? 'Moderate' : 'Low';
}

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(10, Math.round(rect.width * dpr));
  const h = Math.max(10, Math.round(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return { w, h, dpr };
}

function drawGrid(ctx, w, h) {
  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle = 'rgba(255,255,255,.055)'; ctx.lineWidth = 1;
  for (let i = 1; i < 6; i++) { const y = h * i / 6; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
  for (let i = 1; i < 10; i++) { const x = w * i / 10; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
}

function drawTimegrapher() {
  const c = els.timegrapher, {w,h} = resizeCanvas(c), ctx = c.getContext('2d'); drawGrid(ctx,w,h);
  const r = state.lastAnalysis?.residuals || [];
  if (r.length < 2) return;
  const recent = r.slice(-220);
  const maxAbs = Math.max(1, Math.min(12, Math.max(...recent.map(Math.abs)) * 1.2));
  ctx.strokeStyle = 'rgba(110,217,255,.75)'; ctx.lineWidth = 1.7;
  ctx.beginPath();
  recent.forEach((v,i) => {
    const x = 12 + (w - 24) * (i / Math.max(1,recent.length - 1));
    const y = h/2 - (v / maxAbs) * (h * .42);
    if (i === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
  ctx.fillStyle = 'rgba(159,140,255,.95)';
  recent.forEach((v,i) => {
    const x = 12 + (w - 24) * (i / Math.max(1,recent.length - 1));
    const y = h/2 - (v / maxAbs) * (h * .42);
    ctx.beginPath(); ctx.arc(x,y,2.2,0,Math.PI*2); ctx.fill();
  });
  ctx.fillStyle = 'rgba(154,168,193,.8)'; ctx.font = `${12 * (window.devicePixelRatio||1)}px system-ui`;
  ctx.fillText(`±${maxAbs.toFixed(1)} ms`, 12, 20 * (window.devicePixelRatio||1));
}

function drawLevel() {
  const c = els.levelPlot, {w,h} = resizeCanvas(c), ctx = c.getContext('2d'); drawGrid(ctx,w,h);
  const a = state.levelHistory.slice(-240);
  if (a.length < 2) return;
  const vals = a.map(p => dbfs(p.rms));
  const minDb = -90, maxDb = -10;
  ctx.strokeStyle = 'rgba(105,230,170,.85)'; ctx.lineWidth = 2;
  ctx.beginPath();
  vals.forEach((v,i) => {
    const x = (w-2) * i / Math.max(1, vals.length-1);
    const y = h - ((Math.max(minDb, Math.min(maxDb,v)) - minDb)/(maxDb-minDb))*h;
    if (!i) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
}

function drawAll() { drawTimegrapher(); drawLevel(); }
function loop() {
  if (!state.running) return;
  updateAnalysis(); updateStats(); drawAll();
  state.raf = requestAnimationFrame(loop);
}

els.startBtn.addEventListener('click', start);
els.stopBtn.addEventListener('click', stop);
els.resetBtn.addEventListener('click', reset);
els.refreshDevicesBtn.addEventListener('click', () => refreshInputDevices({ requestPermission: true }));
els.inputDevice.addEventListener('change', () => {
  state.selectedDeviceLabel = els.inputDevice.selectedOptions[0]?.textContent || 'System default microphone';
  els.deviceSetting.textContent = state.selectedDeviceLabel;
});
els.sensitivity.addEventListener('input', applySensitivity);
els.position.addEventListener('change', () => els.positionStat.textContent = els.position.value);
els.bphMode.addEventListener('change', () => { state.detectedBph = null; state.detectorLockBph = null; if (state.node) state.node.port.postMessage({ type: 'config', minGapSec: 0.055 }); });
window.addEventListener('resize', drawAll);
window.addEventListener('beforeunload', () => state.stream?.getTracks().forEach(t => t.stop()));
navigator.mediaDevices?.addEventListener?.('devicechange', () => { if (!state.running) refreshInputDevices(); });

if (window.isSecureContext) els.secureNote.textContent = 'Secure context detected • audio remains on this device.';
else els.secureNote.textContent = 'Open via HTTPS or localhost to enable microphone access.';
refreshInputDevices();
drawAll();
