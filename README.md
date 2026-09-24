# WatchLabX v0.2.1 — Mobile Timer

A phone-first browser timegrapher for mechanical watches.

## What changed in v0.2.1

- Measurement duration selector: 15, 30, 45, 60, 90, or 120 seconds.
- Large live countdown and time-progress bar.
- Automatic stop at the selected duration.
- Automatic save of the latest valid reading to the selected watch and position.
- If no valid reading exists at timeout, the test stops without saving false data.
- Mobile measurement workspace redesigned so watch, position, duration, rate gauge, live metrics, and Start/Stop/Save/Reset are visible together.
- Sticky mobile control dock keeps the measurement controls reachable without scrolling.
- Watch profile, measurement settings, history, and diagnostics moved below the live workspace.
- Saved results now include the scheduled test duration in local storage and CSV export.
- Completion vibration is used on supported phones.

## Measurement engine

The v0.2.0 timing engine and the original v0.1.3 acoustic detector are retained. v0.2.1 focuses on the timed mobile workflow rather than changing the detector again.

`Tick/Tock Δ` remains experimental and is not a calibrated beat-error value.

## GitHub Pages

Upload the GitHub Pages-ready files to the repository root and keep `.nojekyll`. Existing GitHub Pages settings do not need to be changed.
