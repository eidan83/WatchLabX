# WatchLabX Changelog

## v0.2.2 — BPH Accuracy Fix

- Restored the proven v0.1.3 recurrence logic as the basis of automatic BPH detection.
- Removed the irreversible early BPH lock used in v0.2.1. A provisional phone-microphone result can now correct itself while measuring.
- Auto mode keeps the acoustic event detector at a neutral 55 ms refractory interval so a wrong provisional BPH cannot suppress the beats needed to recover.
- Added phase-periodicity scoring to distinguish the true beat period from 2:1 subharmonics (for example 28,800 vs 14,400 BPH), including multi-impulse watch acoustics.
- Kept the v0.2.1 mobile timer, auto-save, watch profiles, position history, CSV export, gauge, and mobile-first UI unchanged.
- No changes to tick-processor.js.
