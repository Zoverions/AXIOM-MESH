# AXIOM One — TWA / APK packaging (rehearsal)

PWA → TWA → APK path for AXIOM One, built with
[Bubblewrap](https://github.com/GoogleChrome/bubblewrap) (`@bubblewrap/cli`).

## Status: REHEARSAL (LAB-GRADE)

This directory holds a **rehearsal configuration**, generated 2026-09-22 from
the item-6 PWA manifest (`../manifest.webmanifest`). It proves the local
APK pipeline works end-to-end. It is **not** a release configuration:

- `host` is the placeholder `axiom-one.twa-rehearsal.invalid`
  (RFC 2606 `.invalid` — can never resolve). The production origin is
  **Zov-gated** and not chosen here.
- `packageId` (`invalid.twa_rehearsal.axiom_one.twa`) is derived from that
  placeholder host. The release package id must be derived from the real
  origin at release time and must never collide with this rehearsal id.
- `signingKey` points at `./twa-debug.keystore`, a throwaway debug keystore
  generated locally with `keytool`. The file itself is git-ignored and never
  committed. It must **never** be used for a release build.
- `fingerprints` is empty: no Digital Asset Links statement has been
  published (origin verification is Zov-gated). A rehearsal APK therefore
  opens the PWA in a Custom Tab fallback rather than a verified fullscreen
  TWA — expected, and verified in the build log.

## Files

- `twa-manifest.json` — the TWA project config, generated with the real
  `@bubblewrap/core` `TwaManifest` class (construction + `validate()` +
  `saveToFile()`), mirroring what `bubblewrap init --manifest <url>` maps
  from the web manifest: name, launcher name, display, display-override,
  theme/background colors, start URL, 512 any + 512 maskable icons, the two
  shortcuts (Local Social → `/#social`, Vault → `/#vault`), scope.
- `RUNBOOK.md` — the ordered release ceremony: release keystore creation
  (Zov's ceremony), Digital Asset Links origin verification, Play signing.
- `build-log-2026-09-22.txt` — sanitized transcript of the local rehearsal
  build plus the APK/AAB verification report (2026-09-22). Secrets redacted.
- `verify-twa-rehearsal.mjs` — deterministic, offline check of the rehearsal
  invariants in `twa-manifest.json` (placeholder host, debug-only key path,
  empty fingerprints, icons, shortcuts). Run with
  `node verify-twa-rehearsal.mjs`; exit 0 = pass.

## Reproducing the rehearsal build ($0, local only)

Prerequisites: Node 22/24, a JDK 17, `@bubblewrap/cli`.

```sh
cd apps/axiom-one/twa

# 1. Throwaway DEBUG keystore (never release, never commit).
keytool -genkeypair -v \
  -keystore ./twa-debug.keystore -alias axiomone-rehearsal-debug \
  -keyalg RSA -keysize 2048 -validity 365 \
  -storepass <debug-only-password> -keypass <debug-only-password> \
  -dname "CN=AXIOM One TWA rehearsal (DEBUG ONLY), OU=rehearsal, O=invalid, C=XX"

# 2. Generate the Android project once (needs the PWA manifest + icons
#    reachable; for the .invalid placeholder this means serving the
#    item-6 files locally, as the 2026-09-22 rehearsal did):
bubblewrap init --manifest https://axiom-one.twa-rehearsal.invalid/manifest.webmanifest

# 3. Build from the generated project directory. --skipPwaValidation
#    because the placeholder origin is not live; the release build MUST
#    run PWA validation against the real origin. NOTE: run with cwd =
#    the project directory — Bubblewrap executes ./gradlew from
#    process.cwd().
cd <generated-project-dir>
BUBBLEWRAP_KEYSTORE_PASSWORD=<debug-only-password> \
BUBBLEWRAP_KEY_PASSWORD=<debug-only-password> \
  bubblewrap build --manifest <path-to>/twa-manifest.json \
    --directory <generated-project-dir> --skipPwaValidation
```

The first build downloads the Android SDK command-line tools, platform, and
build-tools (several GB, one-time). If the SDK auto-install fails in your
environment, install manually and point Bubblewrap's config
(`androidSdkPath`) at the SDK root:

```sh
sdkmanager --install "platforms;android-36" "build-tools;36.1.0"
```

Environment notes from the 2026-09-22 rehearsal (local-only, see
`build-log-2026-09-22.txt`): Java needed `-Djava.net.preferIPv4Stack=true`
(the proxy hostname's IPv6 was dead), Bubblewrap 1.25's SDK validator
expects the legacy `tools/` layout directly under the SDK root, and the
build must run with cwd = the project directory.

Outputs: `app-release-signed.apk` and `app-release-bundle.aab` in the
project directory.

## What the release run changes

See `RUNBOOK.md`. In short: Zov picks the origin and runs the keystore
ceremony, `twa-manifest.json` is regenerated with the real host/package id/
release keystore, Digital Asset Links are published and verified, and the
build runs **without** `--skipPwaValidation`.
