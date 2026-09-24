export const POSITION_ORDER = ['DU','DD','CU','CD','CL','CR'];

export function weightedCalibration(samples = []) {
  const valid = samples.filter(s => Number.isFinite(Number(s?.rawRate)) && Number.isFinite(Number(s?.referenceRate)));
  if (!valid.length) return { offset: 0, count: 0, spread: NaN, status: 'uncalibrated' };
  const points = valid.map(s => {
    const delta = Number(s.referenceRate) - Number(s.rawRate);
    const confidence = Math.max(0.15, Math.min(1, Number(s.confidence) || 0.5));
    const uncertainty = Math.max(0.6, Math.min(30, Math.abs(Number(s.uncertainty) || 6)));
    const weight = confidence / (uncertainty * uncertainty);
    return { delta, weight };
  });
  const wsum = points.reduce((a,p)=>a+p.weight,0);
  const offset = wsum > 0 ? points.reduce((a,p)=>a+p.delta*p.weight,0)/wsum : points.reduce((a,p)=>a+p.delta,0)/points.length;
  const spread = points.length > 1 ? Math.sqrt(points.reduce((a,p)=>a+(p.delta-offset)*(p.delta-offset),0)/(points.length-1)) : NaN;
  let status = points.length >= 3 && Number.isFinite(spread) && spread <= 2.5 ? 'good' : points.length >= 2 ? 'provisional' : 'single-point';
  if (points.length >= 3 && Number.isFinite(spread) && spread > 5) status = 'inconsistent';
  return { offset, count: points.length, spread, status };
}

export function applyRateCalibration(rawRate, calibration) {
  if (!Number.isFinite(Number(rawRate))) return NaN;
  const offset = Number(calibration?.offset);
  return Number(rawRate) + (Number.isFinite(offset) ? offset : 0);
}

export function latestByPosition(measurements = []) {
  const latest = {};
  for (const m of measurements) {
    if (!m?.position || latest[m.position]) continue;
    latest[m.position] = m;
  }
  return latest;
}

export function summarizeMeasurements(measurements = []) {
  const latest = latestByPosition(measurements);
  const rows = POSITION_ORDER.map(position => latest[position]).filter(Boolean);
  if (!rows.length) return { count: 0, complete: false, latest, rows: [] };
  const rates = rows.map(m=>Number(m.rate)).filter(Number.isFinite);
  const rawRates = rows.map(m=>Number(m.rawRate ?? m.rate)).filter(Number.isFinite);
  const jitters = rows.map(m=>Number(m.jitter)).filter(Number.isFinite);
  const signals = rows.map(m=>Number(m.signal)).filter(Number.isFinite);
  const confidences = rows.map(m=>Number(m.confidence)).filter(Number.isFinite);
  const bphs = rows.map(m=>Number(m.bph)).filter(Number.isFinite);
  const mean = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : NaN;
  const dominantBph = bphs.length ? [...new Set(bphs)].sort((a,b)=>bphs.filter(x=>x===b).length-bphs.filter(x=>x===a).length)[0] : NaN;
  const minRate = rates.length ? Math.min(...rates) : NaN;
  const maxRate = rates.length ? Math.max(...rates) : NaN;
  const best = rows.reduce((a,b)=>Math.abs(Number(b.rate))<Math.abs(Number(a.rate))?b:a,rows[0]);
  const fastest = rows.reduce((a,b)=>Number(b.rate)>Number(a.rate)?b:a,rows[0]);
  const slowest = rows.reduce((a,b)=>Number(b.rate)<Number(a.rate)?b:a,rows[0]);
  return {
    count: rows.length,
    complete: rows.length === POSITION_ORDER.length,
    latest,
    rows,
    meanRate: mean(rates),
    meanRawRate: mean(rawRates),
    positionalDelta: Number.isFinite(minRate)&&Number.isFinite(maxRate)?maxRate-minRate:NaN,
    meanJitter: mean(jitters),
    meanSignal: mean(signals),
    meanConfidence: mean(confidences),
    dominantBph,
    bestPosition: best?.position,
    fastestPosition: fastest?.position,
    slowestPosition: slowest?.position,
    minRate,
    maxRate
  };
}

export function assessmentFromSummary(summary) {
  if (!summary?.count) return { tone:'neutral', headline:'No measurements', notes:['Run at least one position test to create a report.'] };
  const notes=[];
  const absMean=Math.abs(Number(summary.meanRate));
  const delta=Number(summary.positionalDelta);
  const jitter=Number(summary.meanJitter);
  if (summary.complete) notes.push('All six standard positions are represented by the latest saved test.');
  else notes.push(`${summary.count}/6 standard positions are represented; this is a partial report.`);
  if (Number.isFinite(absMean)) {
    if (absMean <= 5) notes.push('The position-averaged rate is close to zero.');
    else if (absMean <= 15) notes.push('The position-averaged rate shows a moderate daily offset.');
    else notes.push('The position-averaged rate shows a large daily offset.');
  }
  if (Number.isFinite(delta)) {
    if (delta <= 10) notes.push('Positional spread is relatively tight.');
    else if (delta <= 25) notes.push('Positional spread is noticeable.');
    else notes.push('Positional spread is large and should be rechecked with repeat measurements.');
  }
  if (Number.isFinite(jitter) && jitter > 4) notes.push('Acoustic timing scatter is high; repeat testing with stronger microphone coupling is advisable.');
  let tone='good';
  if ((Number.isFinite(absMean)&&absMean>15)||(Number.isFinite(delta)&&delta>25)) tone='bad';
  else if ((Number.isFinite(absMean)&&absMean>5)||(Number.isFinite(delta)&&delta>10)) tone='warn';
  return { tone, headline: summary.complete ? 'Six-position timing summary' : 'Partial timing summary', notes };
}
