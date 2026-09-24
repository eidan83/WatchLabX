import assert from 'node:assert/strict';
import { detectBPH, analyzeTiming } from './core.mjs';

function synthetic({bph=28800, rate=3.2, n=400, jitterMs=0.08}) {
  const T0 = 3600 / bph;
  const Tm = T0 / (1 + rate / 86400);
  const out = [];
  let seed = 123456789;
  const rnd = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2**32; };
  for (let i=0;i<n;i++) {
    const measurementJitter = (rnd()-0.5) * 2 * jitterMs/1000;
    out.push(i * Tm + measurementJitter);
  }
  return out;
}

for (const bph of [18000,21600,28800,36000]) {
  const ts = synthetic({bph, rate: 4.0});
  const det = detectBPH(ts);
  assert.equal(det.bph, bph, `BPH detection failed for ${bph}`);
  const a = analyzeTiming(ts,bph);
  assert.ok(Math.abs(a.rate - 4.0) < 0.35, `Rate error too high for ${bph}: ${a.rate}`);
}

const ts = synthetic({bph:28800, rate:-7.5, jitterMs:0.05});
const a = analyzeTiming(ts,28800);
assert.ok(Math.abs(a.rate + 7.5) < 0.3, `Negative rate incorrect: ${a.rate}`);
assert.ok(a.jitterRms < 0.2, `Jitter unexpectedly large: ${a.jitterRms}`);
console.log('WatchLabX core tests: PASS');

// Robustness: remove every 11th event to simulate missed acoustic detections.
const full = synthetic({bph:28800, rate:2.5, n:500, jitterMs:0.04});
const missed = full.filter((_, i) => i % 11 !== 0);
const detMissed = detectBPH(missed);
assert.equal(detMissed.bph, 28800, 'BPH detection failed with missed beats');
const aMissed = analyzeTiming(missed,28800);
assert.ok(Math.abs(aMissed.rate - 2.5) < 0.35, `Rate failed with missed beats: ${aMissed.rate}`);

// Robustness: insert secondary false acoustic impulses 20 ms after some true beats.
const falseTriggers = [...full];
for (let i=20;i<full.length;i+=37) falseTriggers.push(full[i] + 0.020);
falseTriggers.sort((a,b)=>a-b);
const aFalse = analyzeTiming(falseTriggers,28800);
assert.ok(Math.abs(aFalse.rate - 2.5) < 0.35, `Rate failed with false triggers: ${aFalse.rate}`);
console.log('WatchLabX robustness tests: PASS');

import { sensitivityParams } from './core.mjs';
const lowSensitivity = sensitivityParams(2.5);
const highSensitivity = sensitivityParams(10);
assert.ok(highSensitivity.thresholdFactor < lowSensitivity.thresholdFactor, 'Higher sensitivity must lower adaptive threshold factor');
assert.ok(highSensitivity.absThreshold <= lowSensitivity.absThreshold, 'Higher sensitivity must not raise absolute threshold');
console.log('WatchLabX sensitivity semantics test: PASS');

function addSecondaryImpulses(ts, offsetsMs=[58]) {
  const out=[];
  for (const t of ts) {
    out.push(t);
    for (const ms of offsetsMs) out.push(t + ms/1000);
  }
  return out.sort((a,b)=>a-b);
}

for (const bph of [14400,18000,19800,21600,25200,28800,36000,43200]) {
  const base = synthetic({bph, rate:1.5, n:420, jitterMs:0.04});
  const doubled = addSecondaryImpulses(base, [Math.min(58, (3600/bph)*1000*0.42)]);
  const det = detectBPH(doubled);
  assert.ok(det, `No BPH for double-impulse ${bph}`);
  assert.equal(det.bph, bph, `Double-impulse BPH failed for ${bph}: ${det?.bph}`);
  const a = analyzeTiming(doubled, bph);
  assert.ok(a && Math.abs(a.rate-1.5)<0.5, `Double-impulse rate failed for ${bph}: ${a?.rate}`);
}
console.log('WatchLabX multi-impulse recurrence tests: PASS');

// Three acoustic impulses per beat, representative of unlock/impulse/drop structure.
const base3 = synthetic({bph:28800, rate:2.0, n:360, jitterMs:0.03});
const triple = addSecondaryImpulses(base3, [24, 61]);
const det3 = detectBPH(triple);
assert.ok(det3 && det3.bph === 28800, `Triple-impulse BPH failed: ${det3?.bph}`);
console.log('WatchLabX triple-impulse test: PASS');
