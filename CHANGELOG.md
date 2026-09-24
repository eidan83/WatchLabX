# Changelog

## v0.4.1 — Sensor Stability HF

- Replaces single-moment orientation learning with a 2.2 s stable capture window.
- Uses robust normalized-vector averaging and rejects motion outliers during learning.
- Stores per-position angular spread (σθ) and sample count.
- Adds adaptive matching tolerance based on the learned spread of each position.
- Requires a stable match for ~650 ms before Auto-set position changes DU/DD/CU/CD/CL/CR.
- Displays live angular stability next to the gravity vector.
- Keeps the v0.4.0 timing, calibration, report, passport and magnetic-screening logic unchanged.
