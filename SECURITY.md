# Security Policy

DeshiA is a **local, offline-first desktop annotation workstation**. It runs on
your machine, reads a source image folder **read-only**, and writes only inside
the output folder you choose. It has no backend service, no telemetry, and makes
no network calls during annotation.

## Supported versions

| Version | Supported |
| --- | --- |
| `0.1.x` (pre-release) | ✅ active development |
| older / forks | ❌ |

## Reporting a vulnerability

Please **do not open a public issue** for security-sensitive reports.

- Use GitHub's **private vulnerability reporting** (Security → *Report a
  vulnerability*) on [`0mehedihasan/deshia`](https://github.com/0mehedihasan/deshia), or
- email the maintainer (Md. Mehedi Hasan, AMIR Lab, BUBT) via the address on the
  GitHub profile.

Include reproduction steps, affected version/commit, and impact. Expect an
initial acknowledgement within a few days.

## Security model & hardening

The threat model is a single local user annotating their own dataset. The
properties DeshiA actively defends:

- **Source images are read-only.** DeshiA never writes into or near the source
  tree, and never modifies or draws onto original frames.
- **Path validation.** Every filesystem write is confined to the workspace
  output tree; path traversal (`..`) and writes outside the output root are
  rejected (`src/core/filesystem/paths.ts`).
- **Byte-serving route is scoped.** The image route (`/api/image/[id]`) serves
  only known image rows that resolve inside the workspace's read-only source
  directory; anything else returns `403`/`404`.
- **Untrusted schema input.** Imported/authored annotation schemas are validated
  with zod before use; malformed schemas are rejected rather than trusted.
- **No secrets.** DeshiA does not store credentials or tokens.

## Out of scope

- Vulnerabilities in third-party dependencies (report upstream; we will bump).
- Issues requiring an attacker to already control the machine or the source
  dataset the user explicitly imports.
