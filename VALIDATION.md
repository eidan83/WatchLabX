# WatchLabX v0.4.2 validation

## Release intent
This release simplifies the mobile workflow: watch position is manual, screen wake lock is active during timing when supported, and saved watches can be deleted safely.

## Automated regression results
- Core timing/BPH tests: PASS
- Robustness / missed & false impulses: PASS
- Multi-impulse and triple-impulse recurrence: PASS
- v0.2.0 fast/robust timing regression: PASS
- v0.2.1 mobile timer regression: PASS
- v0.2.2 BPH harmonic-discrimination regression: PASS
- v0.3.0 calibration/report regression: PASS
- v0.3.1 bilingual guide/Watch Passport regression: PASS
- v0.4.2 manual-position / wake-lock / delete-watch checks: PASS

## Stability protection
The scientific engines remain byte-for-byte identical to v0.4.1:
- `core.mjs`
- `report.mjs`
- `tick-processor.js`
- `sensor.mjs`

Only the application workflow/UI integration in `app.mjs`, `index.html`, and `styles.css` was changed.

## v0.4.2 checks
- DU/DD/CU/CD/CL/CR remain manually selectable.
- Orientation Assist UI and DeviceMotion runtime permission logic are removed.
- Magnetometer screening remains available.
- Screen Wake Lock is requested at measurement start, released at stop, and reacquired when a running page becomes visible again.
- A saved watch can be deleted only after an explicit confirmation; its measurements, photos, and magnetic tests are removed with that watch record.
