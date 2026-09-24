class TickProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sampleIndex = 0;
    this.lastEventSample = -1e12;
    this.thresholdFactor = 4.75;
    this.absThreshold = 0.00003;
    this.minGapSec = 0.055;
    this.blockCounter = 0;
    this.channelStates = [];
    this.lastEventChannel = -1;

    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === 'config') {
        if (Number.isFinite(d.thresholdFactor)) this.thresholdFactor = d.thresholdFactor;
        if (Number.isFinite(d.absThreshold)) this.absThreshold = d.absThreshold;
        if (Number.isFinite(d.minGapSec)) this.minGapSec = d.minGapSec;
      }
      if (d.type === 'reset') {
        this.lastEventSample = -1e12;
        this.sampleIndex = 0;
        this.lastEventChannel = -1;
        this.channelStates = [];
      }
    };
  }

  ensureChannels(n) {
    while (this.channelStates.length < n) {
      this.channelStates.push({
        fastEnv: 0,
        slowEnv: 0.00002,
        prevAbs: 0,
        rmsAcc: 0,
        rmsCount: 0,
        peak: 0,
        lastThreshold: this.absThreshold
      });
    }
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length || !input[0]?.length) return true;

    const channelCount = input.length;
    this.ensureChannels(channelCount);
    const frames = input[0].length;
    const alphaFast = 0.20;
    const alphaSlow = 0.00025;
    const minGapSamples = this.minGapSec * sampleRate;

    for (let i = 0; i < frames; i++, this.sampleIndex++) {
      let bestCandidate = null;

      for (let c = 0; c < channelCount; c++) {
        const ch = input[c];
        const st = this.channelStates[c];
        const x = ch[i] || 0;
        const ax = Math.abs(x);

        st.fastEnv += alphaFast * (ax - st.fastEnv);
        if (st.fastEnv < st.slowEnv * 3.0) {
          st.slowEnv += alphaSlow * (st.fastEnv - st.slowEnv);
        } else {
          st.slowEnv += (alphaSlow * 0.025) * (st.fastEnv - st.slowEnv);
        }
        st.slowEnv = Math.max(1e-7, st.slowEnv);

        st.rmsAcc += x * x;
        st.rmsCount++;
        if (ax > st.peak) st.peak = ax;

        const threshold = Math.max(this.absThreshold, st.slowEnv * this.thresholdFactor);
        st.lastThreshold = threshold;
        const rising = ax > st.prevAbs * 1.06;
        const score = st.fastEnv / Math.max(threshold, 1e-9);

        if (rising && score > 1.0 && (!bestCandidate || score > bestCandidate.score)) {
          bestCandidate = {
            channel: c,
            score,
            env: st.fastEnv,
            noise: st.slowEnv,
            threshold,
            peak: ax
          };
        }
        st.prevAbs = ax;
      }

      const gapOk = (this.sampleIndex - this.lastEventSample) >= minGapSamples;
      if (gapOk && bestCandidate) {
        this.lastEventSample = this.sampleIndex;
        this.lastEventChannel = bestCandidate.channel;
        this.port.postMessage({
          type: 'tick',
          time: this.sampleIndex / sampleRate,
          channel: bestCandidate.channel,
          env: bestCandidate.env,
          noise: bestCandidate.noise,
          threshold: bestCandidate.threshold,
          peak: bestCandidate.peak,
          eventSnr: bestCandidate.env / Math.max(bestCandidate.noise, 1e-9)
        });
      }
    }

    this.blockCounter++;
    if (this.blockCounter >= 8) {
      const channels = this.channelStates.slice(0, channelCount).map((st, index) => {
        const rms = Math.sqrt(st.rmsAcc / Math.max(1, st.rmsCount));
        const out = {
          index,
          rms,
          peak: st.peak,
          noise: st.slowEnv,
          threshold: st.lastThreshold,
          peakNoise: st.peak / Math.max(st.slowEnv, 1e-9)
        };
        st.rmsAcc = 0;
        st.rmsCount = 0;
        st.peak = 0;
        return out;
      });

      let strongest = 0;
      for (let i = 1; i < channels.length; i++) {
        if (channels[i].peakNoise > channels[strongest].peakNoise) strongest = i;
      }
      const chosen = channels[this.lastEventChannel >= 0 && this.lastEventChannel < channels.length ? this.lastEventChannel : strongest];

      this.port.postMessage({
        type: 'level',
        rms: chosen?.rms || 0,
        peak: chosen?.peak || 0,
        noise: chosen?.noise || 1e-7,
        threshold: chosen?.threshold || this.absThreshold,
        channels,
        selectedChannel: this.lastEventChannel >= 0 ? this.lastEventChannel : strongest,
        sampleRate
      });
      this.blockCounter = 0;
    }
    return true;
  }
}

registerProcessor('watchlabx-tick-processor', TickProcessor);
