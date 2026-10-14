# LastSet Stage 2 — Verified controlled release (2026-10-14)

## Release acceptance
**GO — deployed and automated production acceptance passed.**

- Verified workout client source: `84ef5586b48a76828f0c50d01b22da7a7108f09c` (build ID `84ef5586b48a76828f0c50d01b`), plus workflow/test-only commits.
- Cloudflare training Worker production version: `79534653-6f92-4304-a340-b27c6b1111db`.
- Pre-release local candidate browsers: **19/19 Chromium and 19/19 WebKit** passed: [Run 38487498681](https://github.com/thivaappschat-lab/lastset-training-log/actions/runs/38487498681).
- Released live production browsers: **28/28** passed, **64/64** static assets matched and **11** artwork files matched the prior version: [Run 38487955174](https://github.com/thivaappschat-lab/lastset-training-log/actions/runs/38487955174).
- On production, live disposable opt-in → anonymous POST → opt-out → delete passed Chromium and WebKit: [Run 38488265957](https://github.com/thivaappschat-lab/lastset-training-log/actions/runs/38488265957). Both synthetic records were deleted; D1 showed 0 installations and 0 daily rows afterward.
- Privacy client **7/7**, Control Center/telemetry private test suite **39/39** passed.
- Private Control Center Worker version `5aa68668-ffe3-4435-abcc-fd16f0aef4c4`; GitHub allowlist auth preserved, D1 binding enabled.
- Separate telemetry Worker version `aedbefd2-6d48-47f5-acc5-6682675620b9`; HMAC signing key, D1 binding and daily retention cleanup enabled. Preview URLs disabled for admin and telemetry.
- Rollback target: previous public fitness Worker `2defb86d-16d7-4407-be51-e019fdc553c0`. No rollback needed.

## Privacy/user impact
The feature is **off by default** and does not send telemetry until a user explicitly opts in. Metrics count consenting browser installations (not guaranteed unique people); older usage cannot be reconstructed. Workout data remains local and untouched; only minimal enumerated event types, broad platform and version are sent, and a raw random ID is hashed server-side. The active record limit is at most 35 days, with scheduled cleanup and an opt-out deletion request when online. Production QA automation traffic is suppressed by default.

The Support Center's tickets and Releases section continue to be labeled **DEMO**; only aggregate Overview/Usage/Health are connected to actual opt-in telemetry.

## Outstanding external validation
Real physical iPhone Safari and installed PWA acceptance require a physical-device check; emulated mobile WebKit/Chromium passed. Alerts and user-to-admin support intake are not yet implemented. Do not make a claim that counts include people who did not consent.

No payment plan or card setup was used, and there were no artwork changes or workout-history migrations.
