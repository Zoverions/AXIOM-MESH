# Offline Payload Staging

Place fully local installation payloads here before building the ISO:

- `models/` — local model binaries (GGUF, safetensors, etc.)
- `wheels/` — Python wheelhouse for offline pip installs
- `npm/` — prepacked npm tarballs or cached mirrors
- `platforms/windows` — optional Windows helper payloads
- `platforms/linux` — optional Linux helper payloads
- `platforms/macos` — optional macOS helper payloads

The builder copies this directory into the live image at:
`/opt/axiom-mesh/live-installer/offline`.
