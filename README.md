# WatchLabX v0.2.2 — Mobile BPH Accuracy Fix

This build keeps the mobile workflow introduced in v0.2.1 but repairs automatic beat-frequency detection.

## Why v0.2.1 could show the wrong BPH
Two feedback problems were identified in the code: the first plausible automatic BPH could become permanently locked, and that provisional value then changed the detector refractory interval. On a phone, the first second often contains handling transients while the watch is being positioned, so an early harmonic could persist for the whole test.

## v0.2.2 behavior
- Automatic BPH remains reversible throughout the measurement.
- The event detector stays at a neutral 55 ms refractory interval in Auto mode.
- A phase-periodicity score helps distinguish a true mechanical period from half-frequency subharmonics while still tolerating multiple acoustic impulses per beat.
- Manual BPH remains available when the nominal movement frequency is already known.
- The timed mobile test, automatic saving, watch profiles, six positions, history, CSV export, rate gauge and plots are retained.

## Suggested first validation
Use a mechanical watch whose nominal frequency is known (for example 28,800 BPH). Start with Auto BPH and 30 seconds. The BPH may be provisional during the first second, but it is allowed to correct itself rather than staying stuck on an early harmonic.
