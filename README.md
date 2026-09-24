# WatchLabX v0.4.0 — Sensor Lab

WatchLabX v0.4.0 extends the validated mobile timing workflow with optional phone-sensor tools while preserving the v0.3.1 timing core.

## New in v0.4.0

- **Orientation Assist** using `DeviceMotionEvent.accelerationIncludingGravity`.
- User-learned DU / DD / CU / CD / CL / CR postures. This avoids assuming how a particular phone is oriented or how the watch is coupled to it.
- Optional **Auto position** after a learned posture is recognized.
- **Experimental magnetic screening** using the browser Magnetometer API when available.
- Two-step magnetic workflow: 3 s background capture, then 3 s with the watch near the same sensor area.
- Reports `ΔB = ||B_watch - B_background||` in microtesla (µT), plus background and watch-field magnitudes.
- Magnetic screening is stored in the Watch Passport and added to the Watch Report.
- Bilingual guide updated with Sensor Lab instructions.

## Scientific boundary

Magnetic screening is intentionally **not** reported as a percentage of magnetization and does not apply a pass/fail threshold. Phone geometry, internal magnets, cases and sensor calibration vary. The value is an experimental field-deviation screening result only.

## Browser compatibility

- Motion sensing is broadly useful on mobile browsers, but some platforms require the user to tap **Enable phone sensors** and approve motion access.
- The web Magnetometer API is not available in every browser. WatchLabX detects support at runtime. If unavailable, timing, Watch Passport, reports and Orientation Assist continue to work.
- HTTPS is required for microphone and sensor access. GitHub Pages provides HTTPS.

## Recommended orientation workflow

Keep the physical coupling between watch and phone consistent. For each standard position, select DU/DD/CU/CD/CL/CR, place the phone/watch exactly as you intend to test it, then tap **Learn selected position**. Once learned, Auto position can recognize that phone-specific posture.

## Files

- `index.html` — mobile UI
- `app.mjs` — timing, storage, report and sensor orchestration
- `core.mjs` — acoustic timing core (unchanged from v0.3.1)
- `tick-processor.js` — AudioWorklet detector (unchanged)
- `report.mjs` — timing/report math (unchanged)
- `sensor.mjs` — Sensor Lab vector/statistics helpers
- `styles.css` — mobile UI styles

Designed & developed by **Dr.Eidan**.
