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
    const error = medErr
      + (1 - coverage) * 0.18
      + Math.max(0, medGap - 1) * 0.010
      + Math.max(0, medMultiple - 1) * 0.025;

    if (!best || error < best.error) {
      best = { bph, error, coverage, medianResidual: medErr, medianEventGap: medGap, medianMultiple: medMultiple };
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

export function analyzeTiming(timestamps, nominalBph) {
  if (!nominalBph || timestamps.length < 10) return null;
  const T0 = 3600 / nominalBph;

  // Build a beat-indexed sequence. This tolerates isolated false triggers
  // (too early) and missed beats (2x, 3x, ... nominal period).
  const cleanedTimes = [timestamps[0]];
  const beatIndices = [0];
  for (let i = 1; i < timestamps.length; i++) {
    const prevT = cleanedTimes[cleanedTimes.length - 1];
    const dt = timestamps[i] - prevT;
    if (dt < T0 * 0.50) continue; // likely duplicate/secondary acoustic impulse
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

  return {
    rate,
    Tm,
    periodMs: Tm * 1000,
    jitterRms,
    residuals,
    cleanedTimes,
    beatIndices,
    rateUncertainty,
    duration
  };
}

export function sensitivityParams(sensitivity) {
  const s = Math.max(1, Math.min(10, Number(sensitivity) || 5));
  // Higher UI sensitivity must mean a LOWER detector threshold.
  const thresholdFactor = Math.max(2.0, 8.0 - 0.60 * s);
  // Keep only a tiny absolute floor; the adaptive noise floor does the real work.
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
