export function vectorMagnitude(v){
  const x=Number(v?.x),y=Number(v?.y),z=Number(v?.z);
  return [x,y,z].every(Number.isFinite) ? Math.hypot(x,y,z) : NaN;
}

export function normalizeVector(v){
  const m=vectorMagnitude(v);
  if(!Number.isFinite(m)||m<1e-9) return null;
  return {x:Number(v.x)/m,y:Number(v.y)/m,z:Number(v.z)/m};
}

export function meanVector(samples=[]){
  const valid=samples.filter(s=>[Number(s?.x),Number(s?.y),Number(s?.z)].every(Number.isFinite));
  if(!valid.length) return null;
  return {
    x:valid.reduce((a,s)=>a+Number(s.x),0)/valid.length,
    y:valid.reduce((a,s)=>a+Number(s.y),0)/valid.length,
    z:valid.reduce((a,s)=>a+Number(s.z),0)/valid.length,
    count:valid.length
  };
}

export function fieldStats(samples=[]){
  const mean=meanVector(samples);
  if(!mean) return null;
  const mags=samples.map(vectorMagnitude).filter(Number.isFinite);
  const magnitude=vectorMagnitude(mean);
  const magMean=mags.reduce((a,b)=>a+b,0)/mags.length;
  const magStd=mags.length>1?Math.sqrt(mags.reduce((a,b)=>a+(b-magMean)**2,0)/(mags.length-1)):0;
  const vectorRms=Math.sqrt(samples.reduce((a,s)=>a+(Number(s.x)-mean.x)**2+(Number(s.y)-mean.y)**2+(Number(s.z)-mean.z)**2,0)/samples.length);
  return {...mean,magnitude,magMean,magStd,vectorRms,count:samples.length};
}

export function deltaVectorMagnitude(a,b){
  if(!a||!b) return NaN;
  const d={x:Number(b.x)-Number(a.x),y:Number(b.y)-Number(a.y),z:Number(b.z)-Number(a.z)};
  return vectorMagnitude(d);
}

export function angularDistanceDeg(a,b){
  const na=normalizeVector(a),nb=normalizeVector(b);
  if(!na||!nb) return NaN;
  const dot=Math.max(-1,Math.min(1,na.x*nb.x+na.y*nb.y+na.z*nb.z));
  return Math.acos(dot)*180/Math.PI;
}

export function matchOrientation(current,profiles={},maxAngleDeg=28){
  const n=normalizeVector(current);
  if(!n) return null;
  const candidates=Object.entries(profiles||{}).map(([position,p])=>({position,angle:angularDistanceDeg(n,p)})).filter(x=>Number.isFinite(x.angle)).sort((a,b)=>a.angle-b.angle);
  if(!candidates.length) return null;
  const best=candidates[0],second=candidates[1];
  const confidence=Math.max(0,Math.min(1,1-best.angle/Math.max(1,maxAngleDeg)));
  const margin=second?second.angle-best.angle:90;
  return {...best,confidence,margin,matched:best.angle<=maxAngleDeg && margin>=5};
}

export function axisPosture(v){
  const n=normalizeVector(v);
  if(!n) return {axis:'—',label:'Waiting for motion sensor'};
  const axes=[['X',n.x],['Y',n.y],['Z',n.z]].sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));
  const [axis,val]=axes[0];
  const sign=val>=0?'+':'−';
  const label=axis==='Z'?'Phone approximately flat':axis==='Y'?'Phone approximately upright':'Phone approximately on its side';
  return {axis:`${sign}${axis}`,label,dominance:Math.abs(val)};
}
