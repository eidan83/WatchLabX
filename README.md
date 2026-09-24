# WatchLabX v0.4.2

Mobile-first mechanical watch timing and inspection tool by Dr.Eidan.

## Main workflow
1. Select or create a watch.
2. Select the physical watch position manually: DU, DD, CU, CD, CL, or CR.
3. Select a test duration and press Start.
4. WatchLabX requests a screen wake lock while the measurement is running (when supported by the browser).
5. The timed result is saved automatically when valid.
6. Complete all six positions for a report.

## Sensor Lab
The Sensor Lab no longer tries to infer the watch position from phone orientation. Its optional sensor function is experimental magnetic-field screening only.

## Watch management
The Watch profile panel includes Delete watch. Deletion requires confirmation and removes that watch's saved measurements, photos, and magnetic screening records. Device-level rate calibration is retained.

## Privacy
Audio, photos, timing data, and sensor results are processed/stored locally in the browser unless the user explicitly exports them.
