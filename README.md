# WatchLabX v0.3.1 — Bilingual Guide & Watch Passport

Mobile-first browser timegrapher for mechanical watches. This release preserves the validated v0.3.0 calibration/report workflow and v0.2.2 BPH detector, while adding a compact bilingual guide and a local Watch Passport with front/caseback photos.

## Bilingual guide
A **Guide · الدليل** button is visible in the top bar. The guide can be switched between English and Arabic and covers:

- microphone placement and timed tests
- the six standard positions (DU, DD, CU, CD, CL, CR)
- BPH, rate, jitter, signal and experimental Tick/Tock Δ
- reference-based rate calibration
- saving tests and generating the final report

## Watch Passport
Each saved watch can now store two optional user-supplied photos:

- Front / واجهة الساعة
- Caseback / ظهر الساعة

Images are resized to a maximum dimension of 720 px and compressed to JPEG locally in the browser before storage. They are stored in the same local browser library as the watch and test data; no image upload or server is used by WatchLabX.

The Passport summary shows the watch identity, movement/reference, number of tests, completed positions, mean rate, positional delta and dominant BPH. The user's real front photo is also included in the Watch Report when available.

## Data continuity
The existing storage key remains `watchlabx.v0.2.0.library`, so watches, measurements and calibration points from v0.2.x/v0.3.0 remain available after upgrading. Photos are added as optional fields and do not alter older records.

## Scientific scope
No timing-analysis algorithm was changed for v0.3.1. BPH detection, rate analysis, calibration and reporting remain the v0.3.0/v0.2.2 implementations. The guide explicitly keeps Tick/Tock Δ experimental and does not label it certified beat error.

## Future path
The Passport photo structure prepares WatchLabX for a later optional camera/AI identification workflow. AI identification is not included in v0.3.1.
