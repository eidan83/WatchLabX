# WatchLabX v0.3.0 — Rate Calibration & Watch Report

Mobile-first browser timegrapher for mechanical watches. This release keeps the v0.2.2 BPH detector and timed six-position workflow, and adds reference-based rate calibration plus a printable watch report.

## Rate calibration
The BPH detector does not require rate calibration. Absolute rate in s/day can, however, inherit a device/browser audio-clock offset. v0.3.0 therefore stores a local calibration offset derived from a trusted reference.

1. Obtain a stable WatchLabX reading (at least about 8 seconds, low uncertainty).
2. Measure the same watch and position with a trusted timegrapher or a verified long-duration reference.
3. Enter the trusted rate in **Rate calibration** and press **Use current reading**.
4. Repeat for at least three calibration points when possible.

The displayed rate then becomes `raw acoustic rate + stored calibration offset`. Raw rate is still shown for transparency. Calibration is stored locally in the browser and can be cleared.

## Watch report
Each timed test can be saved to one of six positions: DU, DD, CU, CD, CL and CR. When all six positions have at least one saved result, WatchLabX automatically opens a report. A report can also be opened at any time from **Report**.

The report contains watch identity, mean rate, positional delta, mean jitter, dominant BPH, calibration state, a six-position table, and an informational interpretation. It can be printed/saved as PDF using the browser or downloaded as standalone HTML.

## Data continuity
The existing localStorage key is intentionally retained (`watchlabx.v0.2.0.library`) so watches and measurements saved by v0.2.x remain available after upgrading.

## Important limitation
WatchLabX is an acoustic browser tool, not a certified timing instrument. Reference calibration corrects a rate offset; it does not validate microphone event detection, beat error, amplitude, or movement condition. `Tick/Tock Δ` remains experimental and is not labeled as certified beat error.
