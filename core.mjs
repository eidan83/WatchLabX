export const STANDARD_BPH = [14400, 18000, 19800, 21600, 25200, 28800, 36000, 43200];

export function median(values) {
  if (!values.length) return NaN;
  const a = [...values].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function mad(values, center = median(values)) {
  if (!values.length || !Number.isFinite(center)) return NaN;
  return median(values.map(v => Math.abs(v - center)));
}

export function robustFilterIntervals(intervals) {
  const valid = intervals.filter(v => Number.isFinite(v) && v >= 0.06 && v <= 0.35);
  if (valid.length < 5) return valid;
  const c = median(valid);
  const m = mad(valid, c) || 1e-6;
  const tol = Math.max(0.004, 5 * 1.4826 * m);
  return valid.filter(v => Math.abs(v - c) <= tol);
}

function phasePeriodicityScore(ts, T) {
  if (!ts.length || !(T > 0)) return 0;
  let best = 0;
  // Multiple acoustic impulses can occur within each mechanical beat.
  // A true beat period repeats the phase pattern at a lower harmonic order
  // than a 2:1 subharmonic, so penalize higher circular harmonics.
  for (let k = 1; k <= 6; k++) {
    let cx = 0, cy = 0;
    const w = 2 * Math.PI * k / T;
    for (const t of ts) { cx += Math.cos(w * t); cy += Math.sin(w * t); }
    const R = Math.hypot(cx, cy) / ts.length;
    const score = R / Math.pow(k, 0.70);
    if (score > best) best = score;
  }
  return Math.max(0, Math.min(1, best));
}

export function detectBPH(timestamps, candidates = STANDARD_BPH) {
  if (timestamps.length < 8) return null;
  const ts = timestamps.filter(Number.isFinite);
  if (ts.length < 8) return null;

  // Robust recurrence detector. Mechanical watch acoustics often contain
  // two or more impulses per actual beat (unlock / impulse / drop). Therefore
  // consecutive event spacing is NOT assumed to equal the beat period.
  // Instead, for every standard BPH candidate we ask whether the event pattern
  // recurs one nominal period later. A secondary impulse then matches its own
  // counterpart on the next beat and no longer confuses the BPH estimator.
  let best = null;
  for (const bph of candidates) {
    const T = 3600 / bph;
    const residuals = [];
    const eventGaps = [];
    const beatMultiples = [];
    let opportunities = 0;

    for (let i = 0; i < ts.length - 1; i++) {
      // Only count starts for which at least one nominal beat period remains.
      if (ts.at(-1) - ts[i] < 0.82 * T) continue;
      opportunities++;

      let localBest = null;
      // Search a small number of later acoustic events. This covers multi-
      // impulse beats without making random distant coincidences attractive.
      const jMax = Math.min(ts.length, i + 10);
      for (let j = i + 1; j < jMax; j++) {
        const dt = ts[j] - ts[i];
        if (!(dt > 0)) continue;
        if (dt > 4.22 * T) break;

        const m = Math.max(1, Math.min(4, Math.round(dt / T)));
        const err = Math.abs(dt - m * T) / T;
        // Prefer recurrence after one beat; permit 2–4 beats for missed events.
        const score = err + 0.035 * (m - 1) + 0.004 * Math.max(0, (j - i) - m);
        if (err <= 0.16 && (!localBest || score < localBest.score)) {
          localBest = { err, score, gap: j - i, multiple: m };
        }
      }

      if (localBest) {
        residuals.push(localBest.err);
        eventGaps.push(localBest.gap);
        beatMultiples.push(localBest.multiple);
      }
    }

    if (opportunities < 6 || residuals.length < 6) continue;
    const coverage = residuals.length / opportunities;
    if (coverage < 0.46) continue;

    const medErr = median(residuals);
    const medGap = median(eventGaps);
    const medMultiple = median(beatMultiples);
    // Harmonic guard: if two candidate periods both recur, prefer the one
    // requiring fewer intervening acoustic events and fewer missed beats.
    const phasePeriodicity = phasePeriodicityScore(ts, T);
    const error = medErr
      + (1 - coverage) * 0.18
      + Math.max(0, medGap - 1) * 0.010
      + Math.max(0, medMultiple - 1) * 0.025
      + (1 - phasePeriodicity) * 0.10;

    if (!best || error < best.error) {
      best = { bph, error, coverage, medianResidual: medErr, medianEventGap: medGap, medianMultiple: medMultiple, phasePeriodicity };
    }
  }

  if (!best) return null;
  const residualQuality = Math.max(0, Math.min(1, 1 - best.medianResidual / 0.16));
  const coverageQuality = Math.max(0, Math.min(1, (best.coverage - 0.35) / 0.60));
  const gapQuality = 1 / (1 + 0.10 * Math.max(0, best.medianEventGap - 1));
  const confidence = Math.max(0, Math.min(1, residualQuality * (0.35 + 0.65 * coverageQuality) * gapQuality));
  return { ...best, confidence };
}

function linearSlope(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return NaN;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    num += dx * (ys[i] - my);
    den += dx * dx;
  }
  return den > 0 ? num / den : NaN;
}

// Baseline v0.1.3 analyzer retained for regression testing / reference.
export function analyzeTiming(timestamps, nominalBph) {
  if (!nominalBph || timestamps.length < 10) return null;
  const T0 = 3600 / nominalBph;
  const cleanedTimes = [timestamps[0]];
  const beatIndices = [0];
  for (let i = 1; i < timestamps.length; i++) {
    const prevT = cleanedTimes[cleanedTimes.length - 1];
    const dt = timestamps[i] - prevT;
    if (dt < T0 * 0.50) continue;
    const multiple = Math.round(dt / T0);
    if (multiple < 1 || multiple > 4) continue;
    const perBeat = dt / multiple;
    if (Math.abs(perBeat - T0) <= T0 * 0.18) {
      cleanedTimes.push(timestamps[i]);
      beatIndices.push(beatIndices[beatIndices.length - 1] + multiple);
    }
  }
  if (cleanedTimes.length < 8) return null;

  const Tm = linearSlope(beatIndices, cleanedTimes);
  if (!Number.isFinite(Tm) || Tm <= 0) return null;
  const rate = 86400 * (T0 / Tm - 1);

  const fit0 = cleanedTimes.reduce((s, t, i) => s + (t - beatIndices[i] * Tm), 0) / cleanedTimes.length;
  const residuals = cleanedTimes.map((t, i) => (t - (fit0 + beatIndices[i] * Tm)) * 1000);

  const diffs = [];
  for (let i = 1; i < cleanedTimes.length; i++) {
    const m = beatIndices[i] - beatIndices[i - 1];
    const perBeat = (cleanedTimes[i] - cleanedTimes[i - 1]) / m;
    diffs.push((perBeat - Tm) * 1000);
  }
  const jitterRms = Math.sqrt(diffs.reduce((s, v) => s + v * v, 0) / Math.max(1, diffs.length));

  const duration = cleanedTimes.at(-1) - cleanedTimes[0];
  const scatterMs = 1.4826 * (mad(diffs, median(diffs)) || 0);
  const rateUncertainty = duration > 0 ? Math.max(0.05, (scatterMs / 1000) / duration * 86400 * 2) : NaN;

  return { rate, Tm, periodMs: Tm * 1000, jitterRms, residuals, cleanedTimes, beatIndices, rateUncertainty, duration };
}

function solve3(A, b) {
  const m = [
    [A[0][0], A[0][1], A[0][2], b[0]],
    [A[1][0], A[1][1], A[1][2], b[1]],
    [A[2][0], A[2][1], A[2][2], b[2]],
  ];
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-15) return null;
    if (pivot !== col) [m[pivot], m[col]] = [m[col], m[pivot]];
    const div = m[col][col];
    for (let c = col; c < 4; c++) m[col][c] /= div;
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = m[r][col];
      for (let c = col; c < 4; c++) m[r][c] -= f * m[col][c];
    }
  }
  return [m[0][3], m[1][3], m[2][3]];
}

function weightedParityFit(times, indices, maxIter = 5) {
  if (times.length < 6 || times.length !== indices.length) return null;
  let weights = new Array(times.length).fill(1);
  let beta = null;
  let residuals = [];

  for (let iter = 0; iter < maxIter; iter++) {
    const A = [[0,0,0],[0,0,0],[0,0,0]];
    const b = [0,0,0];
    for (let i = 0; i < times.length; i++) {
      const x = [1, indices[i], (indices[i] % 2 === 0 ? -1 : 1)];
      const w = weights[i];
      for (let r = 0; r < 3; r++) {
        b[r] += w * x[r] * times[i];
        for (let c = 0; c < 3; c++) A[r][c] += w * x[r] * x[c];
      }
    }
    beta = solve3(A, b);
    if (!beta) return null;
    residuals = times.map((t, i) => t - (beta[0] + beta[1] * indices[i] + beta[2] * (indices[i] % 2 === 0 ? -1 : 1)));
    const center = median(residuals);
    const scale = 1.4826 * (mad(residuals, center) || 0);
    if (!(scale > 1e-7)) break;
    const c = 1.5 * scale;
    weights = residuals.map(r => {
      const a = Math.abs(r - center);
      return a <= c ? 1 : c / Math.max(a, 1e-12);
    });
  }
  return { beta, residuals, weights };
}

export function extractBeatSequence(timestamps, nominalBph, options = {}) {
  if (!nominalBph) return null;
  const T0 = 3600 / nominalBph;
  let ts = timestamps.filter(Number.isFinite).sort((a,b) => a-b);
  if (ts.length < 8) return null;
  const windowSec = Number(options.windowSec ?? 12);
  const end = ts.at(-1);
  if (Number.isFinite(windowSec) && windowSec > 0) ts = ts.filter(t => t >= end - windowSec);
  if (ts.length < 8) return null;

  const tol = Math.max(0.10, Math.min(0.28, Number(options.tolerance ?? 0.22)));
  const maxSeeds = Math.min(ts.length, Math.max(4, Number(options.maxSeeds ?? 14)));
  let best = null;

  for (let s = 0; s < maxSeeds; s++) {
    const seed = ts[s];
    const chosen = new Map();
    for (let i = s; i < ts.length; i++) {
      const k = Math.round((ts[i] - seed) / T0);
      if (k < 0) continue;
      const predicted = seed + k * T0;
      const err = Math.abs(ts[i] - predicted);
      if (err > tol * T0) continue;
      const prev = chosen.get(k);
      if (!prev || err < prev.err) chosen.set(k, { time: ts[i], err });
    }

    const entries = [...chosen.entries()].sort((a,b) => a[0]-b[0]);
    if (entries.length < 8) continue;
    const firstK = entries[0][0], lastK = entries.at(-1)[0];
    const expected = Math.max(1, lastK - firstK + 1);
    const coverage = entries.length / expected;
    const medErr = median(entries.map(([,v]) => v.err)) / T0;
    const duration = entries.at(-1)[1].time - entries[0][1].time;
    const score = entries.length + 5 * coverage + 0.25 * duration / T0 - 18 * medErr;
    if (!best || score > best.score) {
      best = {
        score,
        times: entries.map(([,v]) => v.time),
        indices: entries.map(([k]) => k - firstK),
        coverage,
        medianPhaseError: medErr,
        duration
      };
    }
  }
  return best;
}

export function analyzeTimingLive(timestamps, nominalBph, options = {}) {
  const T0 = 3600 / nominalBph;
  if (!Number.isFinite(T0) || T0 <= 0) return null;
  const seq = extractBeatSequence(timestamps, nominalBph, options);
  if (!seq || seq.times.length < 10) return null;

  const fit = weightedParityFit(seq.times, seq.indices);
  if (!fit) return null;
  const [intercept, Tm, parityOffset] = fit.beta;
  if (!Number.isFinite(Tm) || Tm <= 0) return null;

  const rate = 86400 * (T0 / Tm - 1);
  const residualMs = fit.residuals.map(v => v * 1000);
  const center = median(residualMs);
  const robustSigmaMs = 1.4826 * (mad(residualMs, center) || 0);
  const clipped = residualMs.filter(v => Math.abs(v - center) <= Math.max(0.15, 3.5 * robustSigmaMs));
  const jitterRms = clipped.length
    ? Math.sqrt(clipped.reduce((s,v) => s + (v-center)*(v-center), 0) / clipped.length)
    : 0;

  const meanK = seq.indices.reduce((s,v) => s+v,0)/seq.indices.length;
  const sxx = seq.indices.reduce((s,v) => s + (v-meanK)*(v-meanK), 0);
  const sigmaSec = Math.max(1e-7, robustSigmaMs/1000);
  const seT = sxx > 0 ? sigmaSec / Math.sqrt(sxx) : NaN;
  const rateUncertainty = Number.isFinite(seT) ? 1.96 * 86400 * T0 / (Tm*Tm) * seT : NaN;

  const durationQuality = Math.max(0, Math.min(1, (seq.duration - 1.5) / 8.5));
  const coverageQuality = Math.max(0, Math.min(1, (seq.coverage - 0.45) / 0.50));
  const phaseQuality = Math.max(0, Math.min(1, 1 - seq.medianPhaseError / 0.20));
  const jitterQuality = Math.max(0, Math.min(1, 1 - robustSigmaMs / 4.0));
  const confidence = Math.max(0, Math.min(1,
    0.20 + 0.30 * durationQuality + 0.25 * coverageQuality + 0.15 * phaseQuality + 0.10 * jitterQuality
  ));

  return {
    rate,
    Tm,
    periodMs: Tm * 1000,
    jitterRms,
    residuals: residualMs,
    cleanedTimes: seq.times,
    beatIndices: seq.indices,
    rateUncertainty,
    duration: seq.duration,
    coverage: seq.coverage,
    confidence,
    alternationMs: Math.abs(2 * parityOffset * 1000),
    intercept
  };
}

export function sensitivityParams(sensitivity) {
  const s = Math.max(1, Math.min(10, Number(sensitivity) || 5));
  const thresholdFactor = Math.max(2.0, 8.0 - 0.60 * s);
  const absThreshold = 0.00003;
  return { thresholdFactor, absThreshold };
}

export function signalScore(rms, noiseFloor, peak = 0, eventSnr = 0) {
  if (!Number.isFinite(noiseFloor) || noiseFloor <= 0) return 0;
  const rmsRatio = Math.max(1, (Number.isFinite(rms) ? rms : 0) / noiseFloor);
  const peakRatio = Math.max(1, (Number.isFinite(peak) ? peak : 0) / noiseFloor);
  const eventRatio = Math.max(1, Number.isFinite(eventSnr) ? eventSnr : 1);
  const logNorm = (ratio, maxRatio) => Math.max(0, Math.min(1, Math.log10(ratio) / Math.log10(maxRatio)));
  const score = 25 * logNorm(rmsRatio, 8) + 45 * logNorm(peakRatio, 40) + 30 * logNorm(eventRatio, 12);
  return Math.max(0, Math.min(100, score));
}
