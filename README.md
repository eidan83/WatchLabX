# WatchLabX v0.2.0 — Mobile Sessions

A mobile-first browser timegrapher for mechanical watches.

## What changed in v0.2.0

- Fast BPH lock with harmonic refinement to reduce half-frequency locks.
- Quick rate estimate after a few seconds; confidence improves with measurement duration.
- Robust rolling timing fit with separate Tick/Tock phase term and outlier resistance.
- Implausible/unstable rates are withheld instead of showing huge transient values.
- Live readings clear when valid watch beats disappear.
- Mobile rate gauge with colored quality zones and recent-rate trail.
- Saved watch profiles: name, model/reference, and movement.
- Six-position test workflow: Dial Up, Dial Down, Crown Up, Crown Down, Crown Left, Crown Right.
- Multiple saved tests per position, persistent in browser localStorage.
- Position summary with mean rate and positional delta.
- CSV export and individual-history deletion.
- Original v0.1.3 acoustic detector retained to avoid destabilizing microphone capture.

## Measurement notes

BPH can lock quickly, but an accurate rate requires observing phase drift over time. The UI therefore separates a quick estimate from a stable estimate rather than displaying an unreliable instant number.

`Tick/Tock Δ` is an experimental timing-asymmetry indicator. It is not yet a calibrated beat-error measurement and should not be interpreted as one.

## GitHub Pages

Upload the files in this folder to the repository root. Keep `.nojekyll`. Configure GitHub Pages to deploy from `main` and `/ (root)`.

## Local test

Run `serve.bat` on Windows. The local build uses port 8774.
