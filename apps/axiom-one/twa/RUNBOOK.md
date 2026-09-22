# AXIOM One TWA release runbook — Zov-gated steps

**Status: ceremony procedure, not yet executed.** The rehearsal in this
directory (`README.md`, `twa-manifest.json`, `build-log-2026-09-22.txt`)
proves the pipeline on a placeholder origin with a throwaway debug keystore.
Every step below is gated: **nothing here runs until Zov explicitly approves
it**, in order. Do not create a release keystore, do not publish a Digital
Asset Links statement, do not upload to Play, until he says so.

Cost: $0 in tooling (Bubblewrap, keytool, Gradle are free). The only
spend-adjacent item is the Google Play developer account ($25 one-time,
paid by Zov outside this procedure if he wants Play distribution).

## Step 0 — Preconditions (operator verifies, no ceremony)

- The PWA is live at the chosen origin over HTTPS, serving
  `manifest.webmanifest` with 192/512 `any` + 192/512 `maskable` icons,
  `start_url`, `display: standalone`, and the two shortcuts — i.e. the
  item-6 manifest, deployed.
- `bubblewrap build` on the rehearsal config passes PWA validation against
  the live origin (the rehearsal used `--skipPwaValidation` only because the
  placeholder origin is not live; the release build MUST NOT skip it).
- Workstation has Node 22/24, JDK 17, `@bubblewrap/cli` installed.

## Step 1 — Choose the production origin (ZOV DECIDES)

Constraints:

- Must be an HTTPS origin Zov controls (serves the PWA above).
- Should be the long-term front door: changing it later means a new package
  id and a new Play listing (installed users do not migrate).
- Candidates live with Zov (product rebrand under consideration 2026-09-22);
  do not guess. Record the decision here with date when made.

```
PRODUCTION ORIGIN (fill in at ceremony): https://______________________
DECIDED BY: Zov, DATE: __________
```

## Step 2 — Release keystore ceremony (ZOV RUNS, private machine)

**Zov executes this himself** on a machine he trusts, with no screen sharing
of secrets. The agent/operator may read the *procedure* aloud but must never
see, handle, or store the passwords or the keystore file.

1. Pick two strong, distinct passwords (keystore password, key password).
   Store them in his password manager now, before generating anything.
2. Generate the release key:
   ```sh
   keytool -genkeypair -v \
     -keystore axiom-one-release.keystore -alias axiomone-release \
     -keyalg RSA -keysize 2048 -validity 9125 \
     -storepass "$KS_PASS" -keypass "$KEY_PASS" \
     -dname "CN=<his name or org>, OU=AXIOM One, O=<org>, L=<city>, ST=<state>, C=<country>"
   ```
   (`-validity 9125` = 25 years; Play requires the key valid past 2033.)
3. Back up `axiom-one-release.keystore` to **two** independent places he
   controls (e.g. encrypted USB + password-manager file attachment).
   **Losing this file means the app can never be updated — only re-listed
   under a new package id.**
4. Record the SHA-256 fingerprint (needed for Step 4) — fingerprints are
   public, passwords are not:
   ```sh
   keytool -list -v -keystore axiom-one-release.keystore -alias axiomone-release
   ```
5. The keystore file and both passwords **never** enter the repo, chat logs,
   screenshots, or backups of this machine's workspace. (The rehearsal
   `.gitignore` in this directory already excludes `*.keystore`.)

## Step 3 — Regenerate the TWA config for the real origin (operator)

With the PWA live at the Step-1 origin, regenerate (do not hand-edit the
rehearsal file):

```sh
mkdir -p ~/axiom-one-twa-release && cd ~/axiom-one-twa-release
bubblewrap init --manifest https://<PRODUCTION-ORIGIN>/manifest.webmanifest
```

- Accept/adjust the prompted values; package id should derive from the real
  origin (e.g. `com.zoverions.axiomone.twa`-style — confirm exact id with Zov).
- When prompted for the signing key, point at the Step-2 keystore and alias.
  Enter passwords at the prompt (never as CLI flags, never in a file).
- Commit the resulting `twa-manifest.json` to `apps/axiom-one/twa/` on a new
  branch (replacing the rehearsal config), open a draft PR. The keystore
  path in it must be a local path outside the repo.

## Step 4 — Digital Asset Links origin verification (operator, Zov approves publish)

This is what lets the installed app open fullscreen as a verified TWA
instead of a Custom Tab, and what lets the PWA hand off to the app.

1. Get the app's SHA-256 fingerprints (release keystore AND, if Play App
   Signing is used — Step 6 — the *app signing* key Play shows in the
   console under Release > Setup > App Integrity; include both). Note:
   when Play App Signing is on, the Play Console's App Integrity page is
   the source of truth — a locally computed fingerprint will not match.
   ```sh
   bubblewrap fingerprint --apkFile app-release-signed.apk
   # or: keytool -list -v -keystore axiom-one-release.keystore | grep SHA256
   ```
2. Publish the statement at
   `https://<PRODUCTION-ORIGIN>/.well-known/assetlinks.json`
   (exact path, no redirect, served as `application/json`).
   `sha256_cert_fingerprints` uses the **colon-delimited uppercase**
   SHA-256 fingerprint exactly as `keytool`/OpenSSL print it
   (e.g. `14:6D:E9:83:C5:73:06:50:…:44:E5` — NOT the bare hex string):
   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "<release package id>",
       "sha256_cert_fingerprints": ["<SHA-256, colon-delimited, uppercase>"]
     }
   }]
   ```
3. Verify *before* building the release:
   - Google's Digital Asset Links tester
     (`https://developers.google.com/digital-asset-links/tools/generator`)
     must show the statement as valid for the origin.
   - `curl -s https://<PRODUCTION-ORIGIN>/.well-known/assetlinks.json`
     returns the JSON with HTTP 200 and no redirect chain.
   - `bubblewrap validate --url=https://<PRODUCTION-ORIGIN>/` passes.

## Step 5 — Release build (operator)

```sh
cd <release twa dir>
bubblewrap build
```

- No `--skipPwaValidation`, no `--skipSigning`. Passwords via the interactive
  prompt or `BUBBLEWRAP_KEYSTORE_PASSWORD` / `BUBBLEWRAP_KEY_PASSWORD` env
  vars (exported in the shell, never written to a file).
- Verify outputs: `apksigner verify --print-certs app-release-signed.apk`
  shows the Step-2 certificate; `unzip -l` shows the icons under `res/`;
  version code/name match the intended release.
- Keep the `.aab` (App Bundle) — that is what Play wants. Keep the `.apk`
  for direct-install testing on a real device.

## Step 6 — Play distribution (ZOV DECIDES; operator executes)

1. Zov creates (or reuses) the Google Play developer account and creates
   the app listing. He decides the listing name, icon, screenshots, and
   description — draft copy for his review first, never publish silently.
2. Enroll in **Play App Signing** (recommended default): upload the `.aab`
   from Step 5; the Step-2 key becomes the *upload key*, Google manages the
   *app signing* key. If he declines Play signing, the Step-2 key signs what
   users install — then its backup (Step 2.3) is load-bearing.
3. First release goes to an **internal testing track**, installed on a real
   device: confirm fullscreen verified-TWA launch (no URL bar), shortcuts,
   splash screen, and offline behavior. Promote to production only on his
   explicit word.

## Step 7 — Updates (operator, per release)

```sh
cd <release twa dir>
bubblewrap update --appVersionName <n>   # bumps version code automatically
bubblewrap build                          # sign with the Step-2 keystore
```

Never lose the Step-2 keystore. Never commit it. Never email it.

## Exit / reversal notes

- Before Step 6, everything is reversible: delete the release dir, revoke
  nothing, no public state.
- After the assetlinks statement is published, it is public and cached by
  Google — removal takes down verification; coordinate with Zov.
- After a Play listing exists, the package id is permanent for that listing.
- The rehearsal artifacts in this directory (`twa-manifest.json` with the
  `.invalid` host, debug keystore path) must never be mistaken for release
  inputs — the Step-3 regeneration replaces them.
