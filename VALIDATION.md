# WatchLabX v0.4.0 Validation

Validation completed for the v0.4.0 Sensor Lab build.

## Regression

- Original acoustic core tests: PASS
- Robustness / missed-beat / false-impulse tests: PASS
- v0.2.0 fast analysis tests: PASS
- v0.2.1 mobile timer tests: PASS
- v0.2.2 BPH accuracy / harmonic discrimination tests: PASS
- v0.3.0 calibration and report tests: PASS
- v0.3.1 bilingual guide / Watch Passport tests: PASS

## Sensor Lab

- Vector magnitude and normalization: PASS
- Mean-vector statistics: PASS
- Magnetic vector-difference calculation: PASS
- Learned orientation matching: PASS
- Opposite-orientation discrimination: PASS
- Sensor Lab UI markers: PASS
- Magnetometer feature-detection code path: PASS
- Motion permission code path: PASS
- Magnetic Watch Passport / report integration markers: PASS

## Core preservation

`core.mjs`, `tick-processor.js`, and `report.mjs` are byte-for-byte identical to v0.3.1.

Magnetic screening is experimental and intentionally does not claim a pass/fail magnetization threshold.
