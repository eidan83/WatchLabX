# WatchLabX v0.4.1 Validation

Validation completed for the Sensor Stability hotfix.

## Automated regression suite

- Core timing / robustness / sensitivity / multi-impulse: PASS
- v0.2.0 fast/robust analysis: PASS
- v0.2.1 mobile timer/UI: PASS
- v0.2.2 BPH accuracy/harmonic regression: PASS
- v0.3.0 calibration/report: PASS
- v0.3.1 bilingual guide/passport: PASS
- v0.4.0 Sensor Lab: PASS
- v0.4.1 sensor stability: PASS

## New v0.4.1 checks

- Stable orientation cloud with injected outliers recovers the correct normalized direction.
- Outlier samples are rejected during orientation calibration.
- Learned DU profile correctly matches a nearby live orientation.
- Orientation learning uses a multi-second capture window rather than a single instantaneous sample.
- Auto-position logic requires a dwell interval before changing the selected position.

The acoustic timing engine and calibration/report logic were not redesigned in this hotfix.
