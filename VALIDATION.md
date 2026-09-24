# WatchLabX v0.2.2 Validation

Automated checks run before packaging:

- PASS — original WatchLabX core/robustness tests
- PASS — multi-impulse and triple-impulse recurrence tests
- PASS — v0.2.0 fast/robust timing tests
- PASS — v0.2.1 mobile timer/UI consistency tests
- PASS — v0.2.2 harmonic-discrimination tests for 28,800 BPH with missed beats, false lead events, and 1/2/3 acoustic impulses per mechanical beat
- PASS — all standard BPH candidates: 14,400; 18,000; 19,800; 21,600; 25,200; 28,800; 36,000; 43,200
- PASS — static regression check that the old irreversible first-lock logic is absent

Real-device validation on the user's phone remains the deciding test because microphone acoustics are device-dependent.
