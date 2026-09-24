# WatchLabX v0.3.0 — Calibration & Report

- Added reference-based rate calibration stored locally per browser/device.
- Added weighted calibration from multiple reference points with status and spread diagnostics.
- Added raw-rate transparency: the UI and saved records retain raw rate while displaying the calibrated rate when calibration exists.
- Added calibration contribution to displayed rate uncertainty.
- Existing saved v0.2.x measurements are recalculated with the current calibration in summaries and reports when raw rate is available; older records fall back to their saved rate as raw.
- Added automatic six-position watch report after DU/DD/CU/CD/CL/CR are complete.
- Added manual Report button for partial or complete reports.
- Report includes mean rate, positional delta, mean jitter, dominant BPH, per-position table, calibration status and informational assessment.
- Added Print / Save PDF through the browser and standalone HTML report download.
- CSV now includes raw rate, calibrated rate and calibration offset.
- Retained v0.2.2 BPH auto-correction and v0.2.1 timed mobile test workflow.
- Retained Dr.Eidan signature.
