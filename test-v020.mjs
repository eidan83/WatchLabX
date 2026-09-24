import assert from 'node:assert/strict';
import {detectBPH, analyzeTimingLive, extractBeatSequence} from './core.mjs';

function synthetic({bph=28800,rate=3,n=160,jitterMs=.08,altMs=1.2,missEvery=0,falseLead=false}){
  const T0=3600/bph, Tm=T0/(1+rate/86400); let seed=246813579;
  const rnd=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2**32};
  const out=[];
  if(falseLead) out.push(.011,.043);
  for(let i=0;i<n;i++){
    if(missEvery && i>0 && i%missEvery===0) continue;
    const alt=(i%2?1:-1)*altMs/2000;
    out.push(.1+i*Tm+alt+(rnd()-.5)*2*jitterMs/1000);
  }
  for(let i=18;i<n;i+=41) out.push(.1+i*Tm+.021);
  return out.sort((a,b)=>a-b);
}

for(const bph of [18000,21600,28800,36000]){
  const ts=synthetic({bph,rate:4.2,n:180,missEvery:23,falseLead:true});
  const det=detectBPH(ts);
  assert.equal(det?.bph,bph,`detectBPH ${bph}`);
  const a=analyzeTimingLive(ts,bph,{windowSec:12});
  assert.ok(a,`live analysis missing ${bph}`);
  assert.ok(Math.abs(a.rate-4.2)<0.8,`rate ${bph}: ${a.rate}`);
  assert.ok(a.coverage>.75,`coverage ${bph}: ${a.coverage}`);
}

const quick=synthetic({bph:28800,rate:-5.5,n:34,jitterMs:.05,altMs:1.6,falseLead:true});
const q=analyzeTimingLive(quick,28800,{windowSec:4});
assert.ok(q && q.duration>3,`quick duration ${q?.duration}`);
assert.ok(Math.abs(q.rate+5.5)<1.8,`quick rate ${q?.rate}`);
assert.ok(q.alternationMs>1.0 && q.alternationMs<2.2,`alternation ${q.alternationMs}`);

const noisy=synthetic({bph:28800,rate:2.1,n:120,jitterMs:.12,altMs:1.0,missEvery:17,falseLead:true});
const seq=extractBeatSequence(noisy,28800,{windowSec:12});
assert.ok(seq && seq.times.length>70,'robust beat sequence');
const n=analyzeTimingLive(noisy,28800,{windowSec:12});
assert.ok(Math.abs(n.rate-2.1)<1.0,`robust rate ${n.rate}`);
console.log('WatchLabX v0.2.0 fast/robust analysis tests: PASS');
