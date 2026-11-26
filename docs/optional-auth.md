# Optional multi-user mode

DeshiA is **single-user by default**: no sign-in, no roles, no session reads.
For a small team that wants separate accounts on the same device, an opt-in
layer is available.

## Enable

Set `DESHIA_MULTIUSER=1` in the environment (see `.env.example`) and restart.
Then:

1. Open `/login` → **First run: create administrator**.
2. Sign in with that account.
3. Open `/admin/users` to create `ANNOTATOR` / `REVIEWER` / `ADMIN` accounts.

The floating auth control (bottom-right) shows the signed-in user, links to user
management for admins, and signs out.

## What is protected

Write paths check for a valid session when the mode is enabled: workspace
create/rename/delete, source and output scans, annotation draft/submit/skip,
schema edits, and snapshot backup. Read-only screens work with a session; the
image/frame byte routes remain local to the device.

Passwords are PBKDF2-SHA256 with a per-user salt (310,000 iterations). Only a
one-way hash of the opaque 30-day session token is stored in SQLite; cookies
are HttpOnly and SameSite=Lax (Secure in production).

## Disable again

Remove `DESHIA_MULTIUSER=1` and restart. The login UI disappears and all
actions return to the local single-user path. User rows remain in the database
but are not consulted.

This layer is deliberately local-only: no remote identity provider, password
reset e-mail, CSRF token or hosted deployment is implied.
