# WatchLabX v0.4.1 — Sensor Stability

This hotfix focuses only on Orientation Assist stability. The timing engine, BPH logic, calibration, reports and Watch Passport are inherited from v0.4.0.

## Orientation learning

Choose a position (DU/DD/CU/CD/CL/CR), hold the phone/watch assembly still, and tap **Learn selected position**. WatchLabX collects about 2.2 seconds of motion-sensor samples, rejects outliers, and saves a robust mean gravity direction plus its angular spread.

## Auto position

A position is not auto-selected from one noisy sensor sample. The match must remain stable for about 650 ms and pass both angular-distance and separation checks.

## Notes

- Re-learn the six positions after installing v0.4.1 for best results.
- Keep the phone/watch coupling geometry consistent with the geometry used during learning.
- Magnetic screening remains experimental and unchanged.
