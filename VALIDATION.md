# WatchLabX v0.2.0 Validation

## Automated tests

PASS — original v0.1.3 core tests

- standard BPH detection: 18,000 / 21,600 / 28,800 / 36,000
- positive and negative rate recovery
- missed acoustic beats
- false secondary impulses
- sensitivity semantics
- multi-impulse recurrence across standard BPH values
- triple-impulse 28,800 BPH case

PASS — v0.2.0 live-analysis tests

- robust rate recovery with leading false events
- missed beats and secondary impulses
- Tick/Tock phase offset handled separately from rate slope
- short-window quick estimate
- beat-sequence extraction robustness
- harmonic refinement avoids a 14,400 lock on synthetic 28,800 data

PASS — UI consistency

- every DOM id referenced by `app.mjs` exists in `index.html`
- JavaScript syntax checks pass for `app.mjs`, `core.mjs`, and `tick-processor.js`

## Important limitation

Browser/phone microphone timing remains an acoustic estimate and must be validated against real watches and, ideally, a hardware timegrapher. The `Tick/Tock Δ` field is experimental and is deliberately not labeled Beat Error.
