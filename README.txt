LASTSET — PROPRIETARY SOFTWARE
Copyright (c) 2026 Thivagar Rajasekaran. All rights reserved.

LastSet is independently owned proprietary software, NOT an open-source
project. No general permission is granted to copy, redistribute, adapt, or
commercially incorporate original LastSet materials into other products.
Public GitHub access remains subject to GitHub's Terms of Service and
applicable law. Third-party components retain their own licenses.

Ownership: COPYRIGHT.md
Use permissions: LICENSE
External contributions: CONTRIBUTING.md
Third-party and artwork provenance: THIRD_PARTY_NOTICES.md

--------------------------------------------------------------------------

LASTSET PWA v0.14.1.1 — WEBKIT OFFLINE SHELL HOTFIX

This hotfix strengthens offline startup specifically for iPhone/WebKit after production QA found that WebKit could activate the service worker but fail to resolve the normal cached index.html key during an offline reload.

1. LastSet now stores a dedicated stable offline HTML shell key during service-worker install.
2. Offline navigation tries that dedicated shell before normal index/root cache entries.
3. Offline precaching is resilient: one optional asset failure no longer invalidates the entire cache population.
4. Successful online navigation refreshes both the normal index cache and the dedicated offline shell.
5. Chromium behavior remains unchanged; this patch targets the WebKit/iPhone navigation-cache difference caught by production QA.

LASTSET PWA v0.14.1 — OFFLINE + MUSCLE EXPLORER

This release adds two major product capabilities: reliable offline gym use and a new interactive Muscle Explorer.

OFFLINE RELIABILITY

1. Core app shell works offline after one successful online load.
2. Static LastSet assets are served cache-first, including versioned CSS/JS URLs.
3. Calendar, Today, Profile, Progress, Exercise Search, typed Smart Log, plans, history and Muscle Explorer remain available without signal.
4. A compact Offline pill confirms that training is being saved on the device.
5. Typed Smart Log is guaranteed locally; Voice Smart Log clearly notes that speech recognition still depends on the phone/browser speech service.
6. The bootstrap no longer unregisters the service worker or deletes caches.
7. LastSet requests persistent browser storage where supported.
8. Returning online shows a small confirmation without requiring a manual sync because workout data is already stored locally.

MUSCLE EXPLORER

1. New fifth top-level Explore tab with a light-bulb icon.
2. Interactive front/back anatomy model.
3. Female presentation follows a saved Female profile; Male is the default for all other/unspecified profiles.
4. Tappable body regions open focused sub-muscle choices:
   - Chest: Upper / Mid / Lower Chest
   - Shoulders: Front / Side / Rear Delts
   - Arms: Biceps / Triceps / Forearms
   - Core: Abs / Obliques
   - Back: Lats / Upper Back / Traps / Lower Back
   - Legs: Quads / Hamstrings / Glutes / Calves / Adductors
5. Equipment filters:
   - Bodyweight
   - Barbell / Free weight
   - Dumbbells
   - Machines
   - Cable / Rope
6. Exercise cards include last performance plus lightweight Setup / Do / Avoid guidance.
7. Exercises can be added directly to Today's plan or planned for a selected future date.
8. Explore-created plans use the existing LastSet plan structure and remain fully offline.
9. The bottom navigation now supports Calendar · Today · Explore · Progress · Profile.

CALENDAR INTEGRATION

Phone calendar sync/export remains intentionally on hold for a later release.

LASTSET PWA v0.14.0.2 — VOICE RELIABILITY HOTFIX

This hotfix addresses two field issues found on iPhone Voice Smart Log.

1. Spoken set counts.
   Natural phrases such as "55 kg 10 reps three sets" and "55 kg three sets of 10 reps" now expand into the correct repeated working sets. Number words and digits are both supported.

2. Dumbbell speech filler.
   Phrases such as "10 kg both hand 12 reps three sets" keep the set count rather than collapsing to one set.

3. Common iPhone transcription correction.
   Known speech-to-text variants such as "literal race" or "lateral rays" are interpreted as "lateral raise" for exercise matching while the original transcript remains visible to the user.

4. Interim transcript recovery.
   If iOS captures speech as an interim result but never promotes it to final text, LastSet now salvages the captured transcript instead of silently doing nothing.

5. Deterministic finish control.
   Voice Smart Log now includes a Done button so the user can end recording explicitly.

6. Listening timeout.
   A 15-second watchdog safely stops a stuck voice session and processes any speech already captured.

7. Better error recovery.
   No-speech, blocked microphone, unavailable audio capture and generic recognition failures now exit the listening overlay and return a useful message.

8. Regression coverage.
   Automated tests include the exact natural spoken set-count formats found during field testing.

LASTSET PWA v0.14.0 — CAPTURE, PROGRESS & MIGRATION

This is the largest PWA feature release so far. It strengthens onboarding, natural capture, progress visibility and migration without adding a backend or external AI dependency.

V0.14.0

1. Mandatory first-time profile onboarding.
   Brand-new users must save a profile before entering LastSet. Display name and weight unit are required; profile photo, gender, height and body weight are optional.

2. Draft-first new users.
   Starting a new user from the user manager now opens a profile draft. Nothing is created until Save Profile succeeds.

3. Existing-user migration.
   Existing valid named profiles are silently marked complete, so current users are not forced through onboarding again.

4. Voice Smart Log.
   Supported browsers can capture a spoken workout, show the live transcript, run it through the existing on-device Smart Log parser and present the normal review screen.

5. Exercise progress drill-down.
   Progress cards open a dedicated exercise page with session count, recent trend chart, best set, last session and chronological history.

6. One-tap memory.
   Exercise logging now uses "Use last sets" wording, and the progress detail page can preload the most recent working sets for today's session.

7. Exercise guidance.
   Resistance exercises receive lightweight setup, execution and common-mistake guidance derived from movement and equipment type.

8. Reversible CSV import.
   Hevy, Strong and generic strength CSV files are parsed locally. LastSet previews matched rows, lets the user map unmatched exercise names, tags the import as one transaction and can undo that import without touching pre-existing workouts.

9. Search-gap review.
   Previously captured zero-result exercise searches are visible in Profile so testers can see which names and machines LastSet failed to match.

10. Header identity polish.
    The current username is larger and brighter while preserving the name-first / avatar-last layout.

11. Local-first.
    Onboarding, voice interpretation, progress analytics, CSV parsing, import mapping and search-gap data continue to stay in the current LastSet local data model.

12. Native-only features remain separate.
    Photo-to-exercise recognition, Apple Health, Live Activities, Home/Lock Screen widgets and Apple Watch are intentionally not bundled into this PWA release.

LASTSET PWA v0.13.10 — PERSONAL IDENTITY + UI POLISH

This release makes the active LastSet user visible throughout the app and adds a local, user-specific profile photo without introducing a backend.

PERSONAL IDENTITY

1. Header identity.
   The top-right header now shows the current LastSet user's name followed by their avatar: "Thiva [photo]".

2. User-specific profile photo.
   Profile photos are selected from the device, centre-cropped and resized locally to 256 × 256 before storage.

3. Local-first storage.
   Only the resized avatar is stored with the active LastSet user's profile on the current device. No profile photo upload service was added.

4. Initials fallback.
   Users without a photo receive a clean initials avatar.

5. Switch-user ready.
   The identity chip reads the active user's profile on every render, so name and avatar change with the active user.

6. Profile page identity card.
   Profile now presents a larger avatar, current user name, Upload/Change photo, Remove and Switch user controls together.

7. Header polish.
   Header height is reduced slightly and the progression-mark glow is softened so the identity feels more integrated with the rest of the interface.

8. Calendar polish.
   Monthly day rows and weekday spacing are tightened slightly to reveal more content above the fixed navigation without changing the calendar structure.

9. Safe areas preserved.
   iPhone status-bar / Dynamic Island and Home Indicator spacing remain protected.

10. Regression coverage.
    Added tests for initials, avatar safety, user-specific registry persistence, header polish and calendar spacing.

LASTSET PWA v0.13.9 — BRAND INTEGRATION + NAVIGATION POLISH

This release turns the approved progression concept into the working LastSet product identity and cleans up the fixed mobile navigation.

BRAND + NAVIGATION

1. New progression mark.
   LastSet now uses the three rising bars as its primary visual symbol for progress over time.

2. Compact product header.
   The everyday header uses a restrained progression icon, white/purple LastSet wordmark, subtle BETA pill and the existing "Remember today. Build tomorrow." tagline.

3. Branded launch experience.
   New sessions receive a short dark-purple launch treatment using the progression mark instead of the old plain text splash.

4. New app icon system.
   PWA icons, Apple touch icon and the web manifest now use the progression identity.

5. Consistent navigation icons.
   Calendar, Today, Progress and Profile now use one SVG icon family rather than mixed emoji symbols.

6. Real Profile shortcut.
   The top-right profile symbol now opens Profile instead of visually looking like Profile while still behaving as the Today shortcut.

7. Bottom navigation polish.
   Active navigation uses a restrained purple surface with a lime completion indicator.

8. Scroll clearance.
   Main content now reserves enough bottom space that cards and controls do not disappear beneath the fixed bottom navigation.

9. Safe areas preserved.
   The existing iPhone Dynamic Island/status-bar and Home Indicator safe-area handling remains part of the branded layout.

10. Controlled brand hierarchy.
    Purple represents LastSet identity and progress. Lime remains reserved for completion, success and active feedback instead of competing with the wordmark.

LASTSET PWA v0.13.8 — iOS SAFE AREA FIX

This release fixes the LastSet header being hidden behind the iPhone status bar / Dynamic Island in standalone PWA mode.

IOS SAFE AREA

1. The sticky topbar now reserves env(safe-area-inset-top) when the app uses black-translucent status bar mode.
2. Header content keeps normal internal spacing after the safe area instead of relying on a fixed top padding.
3. Existing bottom navigation safe-area handling remains unchanged.
4. Theme and premium CSS cache versions were refreshed so installed PWAs receive the fix immediately after update.
5. Added a regression test covering viewport-fit, top safe area, translucent iOS status-bar mode and bottom safe-area handling.

LASTSET PWA v0.13.7 — SMARTER MEMORY + PROGRESS

This release turns LastSet's workout history into practical training intelligence without adding a backend or an external AI dependency.

SMARTER MEMORY + PROGRESS

1. Workout-level memory.
   Phrases such as "same chest workout as last week", "same as Monday" and "repeat last back day" can recall a previous resistance session for review before saving.

2. Workout modifiers.
   Recalled workouts can be adjusted with phrases such as "skip assisted dips", "bench 82.5 kg" or a new set count.

3. Correction learning.
   Repeated exercise-name corrections are observed. After the same correction pattern is seen repeatedly, LastSet asks before learning that wording as a default alias.

4. Full exercise progress metrics.
   Progress now shows session count, last working sets, best set, a recent volume/effort trend and a conservative next target.

5. PR detection.
   Current workout performance is checked against previous exercise history using rules appropriate to normal, assisted, bodyweight and timed work.

6. Next-session targets.
   Targets use the most recent working sets and the user's progression preference. Reps-first adds a rep to the weakest set; weight-first uses a small load increase only after a completed rep threshold.

7. Rich workout summaries.
   Completed days show working-set count, detected PRs and exercises whose recorded workload improved versus the previous session.

8. Zero-result search tracking.
   Search terms that return no exercise matches are stored locally with the current user's data to identify real library gaps during beta testing.

9. Better typo tolerance.
   Exercise search now accepts near-miss tokens such as common one-character spelling errors in addition to the existing fuzzy matching.

10. Local-first.
    Workout memory, analytics, correction learning and search telemetry remain in the user's existing LastSet data store.

LASTSET PWA v0.13.6 — CANONICAL MACHINE LIBRARY

This build expands LastSet's machine exercise coverage using commercial selectorized equipment catalogs as reference, while keeping the in-app library brand-neutral.

CANONICAL MACHINE LIBRARY

1. Machine names are stored by movement, not manufacturer.
2. Added meaningful variants including Diverging Seated Row, Converging Shoulder Press, Dual Axis Chest Press, Dual Axis Pulldown, Arc Leg Press, Standing Lateral Raise and Sit / Stand Hip Abduction.
3. Added missing selectorized movements including Machine Biceps Curl, Seated Dip / Triceps Press, Assisted Dip, Calf Extension, Prone Leg Curl, Seated Leg Curl, Glute Extension, Glute Bridge, Rotary Torso, Back Extension and abdominal machines.
4. Combination-machine labels resolve to each actual movement. Examples include Pulldown / Seated Row, Leg Curl / Leg Extension, Inner / Outer Thigh, Assist Dip / Chin and Abdominal / Back Extension.
5. Removed brand names and manufacturer product codes from the machine-search aliases introduced in 0.13.5.
6. Generic Leg Curl no longer captures exact Seated Leg Curl or Prone/Lying Leg Curl searches.

LASTSET PWA v0.13.5 — MACHINE LIBRARY EXPANSION

This build closes a real gym-floor search gap found during field use. Exact selectorized machine names now resolve to movement-specific LastSet exercises instead of forcing the user to guess a generic label.

MACHINE LIBRARY CHANGES

1. Added Converging Chest Press as a distinct machine exercise.
2. Added Diverging Lat Pulldown as a distinct machine exercise.
3. Added Diverging Low Row as a distinct machine exercise.
4. Added separate Rear Delt and Pec Fly movements for dual-function Rear Delt / Pec Fly machines.
5. Added separate Flat Bench Press, Incline Press and Shoulder Press modes for Multi-Press machines.
6. Added exact Precor-style labels and common aliases so gym-floor machine names are searchable.
7. These entries keep progress separate from generic cable or free-weight movements.

This build adds the first real LastSet Memory layer. It uses the user's own workout history to reduce repeated entry while keeping every remembered assumption visible and editable.

MEMORY MVP

1. Exercise specific recall.
   Phrases such as "bench same as last time" reuse the latest saved Bench Press sets rather than copying an unrelated full workout.

2. Explicit memory only.
   Previous values are never silently inserted. LastSet shows the source date and requires review before saving.

3. Memory suggestions.
   When an exercise is identified but set details are missing, LastSet can show the most recent set pattern with a one tap "Use last sets" action.

4. Partial override support.
   "Bench same as last time but 82.5 kg today" keeps the previous reps while applying the explicitly stated new load.

5. Learned phrases.
   Users can teach LastSet phrases such as "when I say incline DB, I mean Incline Dumbbell Press." Learned phrases are stored with the current user.

6. User control.
   Profile shows recent memory patterns and allows learned phrases to be cleared without deleting workout history.

7. Regression protection.
   Memory recall, history source selection, one tap suggestions, partial overrides and learned aliases are covered by automated smoke tests.

LASTSET PWA v0.13.3 — CORE RELIABILITY

This build is the Core Reliability milestone. It keeps the existing Purple + Green experience while hardening Smart Log and reducing unnecessary questions.

CORE RELIABILITY CHANGES

1. Optional cardio details no longer block saving.
   Duration or distance is enough for a cardio entry.
   Environment, incline, speed, resistance level and similar context remain useful but optional.

2. Mixed resistance and cardio parsing is isolated by activity boundary.
   Cardio numbers such as duration and machine level are not allowed to leak into the preceding resistance exercise.

3. Effort notes are separated from completed rep counts.
   Phrases such as struggled after rep 6 remain notes and must not overwrite the actual completed reps.

4. Partial set plans are preserved.
   Phrases such as 100 kg for 2 sets keep the known load and set count, then ask only for the missing reps.

5. Correction support is expanded.
   Users can correct a specific set load, cardio duration, incline and machine level without rebuilding the whole entry.

6. Load type rules are stricter.
   External and assisted exercises require load when it is essential. Normal bodyweight, band and timed work follow their own data requirements.

7. Regression coverage is expanded.
   The reliability suite now protects mixed strength plus cardio logging, effort notes, optional cardio context, partial set plans, assisted work, bodyweight work, timed work and correction handling.

LASTSET PWA v0.13.0 — PROFILE CLARITY + EQUIPMENT EXPANSION

This release builds on the v0.12.9 trust and data integrity foundation. The Purple + Green interface, on device Smart Log, Calendar artwork, Saved Workouts and protected workout history remain in place.

PROFILE AND USER CHANGES

1. User identity is separate from Display Name.
   Each stored user keeps a stable user identity label.
   Editing Display Name only changes that user's greeting and Smart Log name.
   Changing Display Name does not switch users, rename another user or move workout history.
   Profile now shows the Current User clearly with a Switch User action.

2. Profile navigation.
   The user icon at the top right now opens Profile directly.

3. Optional gender.
   Profile includes Male, Female and Prefer not to say.
   Gender is stored with the current user and is not used for calculations yet.

EQUIPMENT AND EXERCISE LIBRARY

4. New equipment filters.
   Exercise Library now includes EZ Bar, Kettlebell, Resistance Band and Smith Machine alongside the existing Barbell, Dumbbell, Cable, Machine and Bodyweight options.

5. EZ Bar exercises.
   EZ Bar Biceps Curl.
   EZ Bar Preacher Curl.
   EZ Bar Reverse Curl.
   EZ Bar Skull Crusher.

6. Kettlebell exercises.
   Kettlebell Goblet Squat, Swing, Deadlift, Romanian Deadlift, Shoulder Press, Row, Floor Press, Reverse Lunge, Clean and Snatch.

7. Resistance Band exercises.
   Resistance Band Squat, Push Up, Row, Chest Press, Shoulder Press, Biceps Curl, Triceps Extension, Lateral Raise, Face Pull, Pull Apart and Good Morning.
   Band Assisted Pull Up is tracked as assisted work, so lower assistance represents progression when an assistance rating is recorded.
   Band exercises can be logged without a known kg rating; band colour or tension can be noted instead.

8. Smith Machine exercises.
   Smith Machine Squat, Bench Press, Incline Bench Press, Shoulder Press, Romanian Deadlift, Hip Thrust and Calf Raise.

9. Progress separation.
   Equipment variants are stored as distinct exercises so an EZ Bar Curl does not overwrite Dumbbell Curl or Cable Curl progress.
   Resistance Band work has band aware Progress labels.
   Band Assisted Pull Up follows assisted progression rather than normal resisted band progression.

TRUST AND DATA FOUNDATION RETAINED FROM v0.12.9

10. Fresh start integrity.
    The old seeded Chest Press demo session is removed from fresh and reset data.
    Existing stored data is only cleaned when it exactly matches the legacy demo signature and creation date pattern.

11. Previous workout behaviour.
    Using a previous workout creates a plan containing the exercise structure.
    Previous weights, reps and sets are not recorded as completed work for today.

12. Separate users.
    Existing users can be stored and switched without mixing workout history.
    Starting a new user starts with a clean profile and clean training history.
    The current user can be kept for later or permanently deleted after a separate confirmation.

13. Saved Workout date safety.
    Starting a Saved Workout from Profile targets the real current day.
    Starting one while working from a Calendar day targets that selected date.

14. Progress accuracy.
    External load exercises use highest load and reps.
    Assisted exercises treat less assistance as progression.
    Bodyweight exercises show reps or added external load.
    Timed exercises show duration in seconds.
    Session counts are based on distinct training dates.

15. Smart Log duplicate protection.
    If Smart Log identifies an exercise already logged in the current resistance session, the new sets are merged into that exercise instead of creating a duplicate exercise row.

16. Backup and storage controls.
    Profile includes Import Backup for LastSet JSON exports.
    Import replaces only the active user's data after confirmation.
    Profile shows a device storage health indicator.

17. Input validation.
    Resistance and cardio values receive sanity checks before saving so impossible or accidental values are less likely to pollute progress history.

18. Regression testing.
    Automated GitHub Actions checks run syntax tests, build input checks and integrity smoke tests.
    v0.13.0 adds tests for stable user identity, Display Name separation, profile navigation, optional gender, expanded equipment categories and exercise coverage.

CORE REGRESSION CASES

A fresh user must have zero workout sessions.
Changing Display Name must not rename the stored user identity.
The top right user icon must open Profile.
A new user must not inherit another user's height, body weight, Saved Workouts or history.
Switching back to a stored user must restore that user's own data.
Using a previous workout must not create completed sets.
Starting a Saved Workout from Profile must target today.
Assisted progress must prefer lower assistance.
Band Assisted Pull Up must be treated as assisted progression.
Bodyweight progress must show reps or added load rather than 0 kg.
Timed progress must show seconds.
Smart Log must merge repeated exercise sets into the same exercise for the day.
10 km/h must never become 10 km.
2 km remains distance.
Push Ups save reps without requiring weight.
Plank saves seconds.
Assisted Pull Up remains assisted.
Assisted Dip remains assisted.

DEPLOYMENT

Production repository: thiva2702/lastset-training-log
Production branch: main
Primary hosting target: Cloudflare
Framework preset: None
Build command: bash build-cloudflare.sh
Build output directory: dist

Cloudflare is connected directly to GitHub so pushes to main deploy automatically. The service worker cache for this release is v0.13.0.
