AXIOM One — TWA / APK packaging (rehearsal)

PWA → TWA → APK path for AXIOM One, built with Bubblewrap (@bubblewrap/cli).

STATUS: REHEARSAL (LAB-GRADE)

This directory holds a rehearsal configuration generated 2026-09-22 from the item-6 PWA manifest (../manifest.webmanifest). It proves the local APK pipeline worked end-to-end. It is not a release configuration.

- host is the placeholder axiom-one.twa-rehearsal.invalid (RFC 2606 .invalid). The production origin is owner-gated and is not chosen here.
- packageId invalid.twa_rehearsal.axiom_one.twa is placeholder-derived. A release package id must be derived from the real origin at release time and must never collide with this rehearsal id.
- signingKey points at ./twa-debug.keystore, a throwaway rehearsal keystore generated outside the repository. The file is git-ignored and never committed. It must never sign a release build.
- fingerprints is empty: no Digital Asset Links statement has been published. A rehearsal APK therefore falls back to a Custom Tab rather than claiming a verified fullscreen TWA.

FILES

- twa-manifest.json — rehearsal TWA config generated with the real @bubblewrap/core TwaManifest class and validated locally.
- RUNBOOK.txt — ordered release ceremony. Production origin selection, release-key custody, DAL publication and Play distribution remain separately owner-gated.
- build-log-2026-09-22.txt — sanitized transcript of the completed local rehearsal build and APK/AAB verification evidence. Secrets are redacted.
- verify-twa-rehearsal.mjs — deterministic offline invariant checker for the checked-in rehearsal config.
- .gitignore — excludes keystore/private-key container formats from this rehearsal directory.

The two prose files use .txt intentionally: the repository-wide Markdown boundary checker treats every .md file as canonical documentation. This bounded application rehearsal keeps its operational notes adjacent to the fixture without silently expanding the canonical-document set.

DETERMINISTIC CHECK FROM A CLEAN CHECKOUT

From the repository root:

  node apps/axiom-one/twa/verify-twa-rehearsal.mjs

This is the clean-checkout reproduction path for the checked-in evidence. It is offline and must pass without a network call, a keystore, or generated Android files.

REHEARSAL BUILD REPRODUCTION BOUNDARY

Do not run `bubblewrap init` against the .invalid placeholder from the repository workspace. The .invalid origin is intentionally non-live, and Bubblewrap initialization fetches a web manifest. This branch therefore does not claim that a clean checkout can regenerate the Android project from that URL.

The 2026-09-22 Android project was initialized in disposable local scratch while the source PWA assets were available to the rehearsal environment. Only the bounded config, verifier and sanitized evidence were copied back to the repository.

If the Android build itself is repeated, keep every generated file outside the repository:

  SCRATCH="$(mktemp -d)"
  cp apps/axiom-one/twa/twa-manifest.json "$SCRATCH/twa-manifest.json"
  cd "$SCRATCH"

Create the throwaway rehearsal key in that scratch directory. Do not place passwords in command-line arguments; let keytool prompt interactively:

  keytool -genkeypair -v \
    -keystore ./twa-debug.keystore -alias axiomone-rehearsal-debug \
    -keyalg RSA -keysize 2048 -validity 365 \
    -dname "CN=AXIOM One TWA rehearsal (DEBUG ONLY), OU=rehearsal, O=invalid, C=XX"

Use an already initialized disposable Bubblewrap project that matches the checked-in rehearsal config, or explicitly create an isolated local HTTPS fixture before initialization. Do not map or serve the placeholder from the repository tree, and do not copy generated Android project files back into the repository.

Build from the disposable generated-project directory. The rehearsal may skip PWA validation only because the placeholder origin is intentionally non-live:

  cd <scratch-generated-project-dir>
  BUBBLEWRAP_KEYSTORE_PASSWORD=<debug-only-password> \
  BUBBLEWRAP_KEY_PASSWORD=<debug-only-password> \
    bubblewrap build --manifest <scratch>/twa-manifest.json \
      --directory <scratch-generated-project-dir> --skipPwaValidation

Those environment variables are acceptable only for this throwaway rehearsal secret in a disposable shell. Release credentials must use the interactive/private-machine ceremony in RUNBOOK.txt and must never appear in arguments, repository files, chat, CI, or shared logs.

The first build may download Android SDK components. The 2026-09-22 evidence used OpenJDK 17, Gradle 8.11.1 / AGP 8.9.1, Android platform 36 and build-tools 36.1.0. See build-log-2026-09-22.txt for the exact observed toolchain and environment-specific notes.

Outputs are app-release-signed.apk and app-release-bundle.aab in the disposable project directory. They are rehearsal artifacts only and are not tracked.

RELEASE BOUNDARY

RUNBOOK.txt defines the separate release ceremony. A release requires a real HTTPS origin, a fresh release package id, privately generated release-key material, published and verified Digital Asset Links, PWA validation without --skipPwaValidation, device testing, and an explicitly authorized distribution step. None of those production effects is performed by this rehearsal branch.
