# LastSet Stage 2 — Opt-in Monitoring Release Review

**Stage:** tested development candidate. **Do not deploy to public LastSet without a separate explicit approval.**

## Changes in this development branch
- `lastset-monitoring.js`: opt-in telemetry client. Defaults to OFF; generates a random installation ID only after consent; does not read profile or workout history.
- `lastset-monitoring.css`: device-appearance-aware, unobtrusive privacy control and consent details.
- `lastset-p2.js`: reports only `save_success` or `save_failure` at the confirmed P2 local-storage commit boundary; telemetry errors are swallowed. Other saving workflows are **not** counted as P2 save outcomes.
- `worker.js`: injects only the new CSS/JS assets for the next approved build. Existing P2 workout behavior and artwork unchanged.
- `build-cloudflare.sh` and `service-worker.js`: include the monitoring assets in the release package and offline cache.
- `tests/monitoring-privacy.test.mjs`: verifies default OFF, consent, anonymous allowlisted payloads, QA suppression, offline safety, deletion and isolation from workout keys.

## What is collected only after explicit opt-in
- Random installation UUIDv4 (never stored raw by telemetry server; HMAC pseudonym is held no more than 35 days)
- Event type: app open, P2 save success/failure, coarse fatal error, optional support signal
- Coarse platform category and app build marker
- Optional enumerated error category, never error message, stack, input or workout content

**Never:** name, email, profile, workout history, reps, weights, exercise names, notes, voice, Smart Log text, full user agent, IP fields or GPS.

The current diagnostic tracking reports only event codes. **There is no individual support ticket intake or reply mechanism** in this release. The Control Center Support queue remains explicitly DEMO.

## Release and privacy safeguards
1. Public LastSet production branch, Worker deployment and existing local data remain untouched through this stage.
2. QA sessions (`navigator.webdriver`, test-mode URL parameters, localhost) never emit events.
3. A user opts out immediately; current browser installation key is cleared; an online deletion request is best effort; offline historical data expires after 35 days.
4. Requests are intentionally not sent while offline and never block workout-saving functions.
5. Distinct installed browsers, not distinct named people, are the unit of measurement. Opt-out users are not counted.
6. Endpoint Origin checks and client suppression do not guarantee exclusion of scripted/forged traffic; published counts must be marked estimates.

## Verification to date
- Opt-in and save-path Node tests: **7 / 7 PASS**.
- Cloudflare package build: PASS, including injected `dist/index.html` and PWA service-worker precache.
- Private admin/telemetry tests: **39 / 39 PASS**.
- D1 staging schema validated, synthetic write/count/delete validated; both tables returned **zero** afterwards.
- Telemetry Cloudflare Worker and preview routes: disabled, while D1 binding and signed retention cron are staged.
- Real iPhone Safari / installed PWA and a successful production opt-in end-to-end submission: **NOT YET VERIFIED**.

## Deployment approval gate
Owner must explicitly approve a rollout after reviewing the above. Sequence should be:
1. Re-run automated tests on exact proposed commit, verify zero-change protection for actual workout storage.
2. Deploy monitored backend/enable telemetry endpoint, verify anonymous GETs blocked, CORS and POST/delete behavior with synthetic IDs, then purge synthetic records.
3. Upgrade separate private Control Center to live read-only aggregate adapter, verify GitHub admin auth and only aggregate results.
4. Deploy public LastSet instrumentation **only after explicit approval**.
5. Verify real device iPhone Safari and installed PWA: OFF default, opt in, save/reopen/history integrity, offline fallback, opt out, history untouched.
6. If errors or misleading counts appear, disable telemetry endpoint without disrupting workout logging. Restore dashboard demo view if D1 backend unavailable.

Do not require any card, paid plan, trial, or billing setup.
