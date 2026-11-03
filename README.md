# MIB — Make it better

A reusable feedback widget and private review inbox for David's apps. Runs on Cloudflare Workers + D1; no application framework or runtime dependencies.

## Current status

First implementation, not deployed. Backend tests pass using Node's SQLite implementation as a D1 adapter. JavaScript syntax checked. Browser interaction, real Cloudflare deployment, and live Linear calls have not yet been verified. Email notifications are draft previews only; this version does not send mail.

## Implemented

- Shared, style-isolated MIB widget with hover/focus invitation, native modal dialog, keyboard support, optional email and explicit update consent.
- Uses device keyboard dictation; does not record audio.
- Project-specific allowed origin; suggestions do not capture page URLs, browser history, or account details.
- D1-backed projects, ideas, submissions, opt-ins, status, Linear links.
- Private API protected by an admin bearer token; token stays in tab memory.
- Create projects and copy embeds; filter/review ideas; edit titles and status.
- Merge submissions within a project, retaining every original submission and sender.
- Explicit approval before Linear promotion. Sender email never enters Linear.
- Manual Linear status check: completed maps to ready, not shipped.
- Release preview for shipped improvements from one project; deduplicated opted-in recipients. No sending.
- Body limits, prepared SQL, honeypot and per-project/IP hourly rate limits.

## Run / deploy

Requires Node 24 for tests and a Cloudflare account with Workers and D1 access.

1. `npm install` (Wrangler v4; commit the generated lockfile after installation).
2. `npx wrangler login`
3. `npx wrangler d1 create mib`
4. Replace `[MISSING]` in `wrangler.jsonc` with the returned database ID.
5. `npm run db:remote`
6. `npx wrangler secret put ADMIN_TOKEN` — generate a unique random value of at least 32 characters using a password manager. Never commit it.
7. Optional: `npx wrangler secret put LINEAR_API_KEY` — Linear personal API key; store only as a Worker secret.
8. `npm test`
9. `npm run deploy`
10. Open the returned Worker URL, enter the admin token, and create the first app project with its exact origin and optional Linear team ID. Copy the generated embed into that app.

For local development: put secrets in ignored `.dev.vars`, apply `npm run db:local`, then `npm run dev`. Do not use production feedback for testing.

A project maps to one origin. Register separate projects for different origins in this first version. Script runs after body creation (`defer`). The host site's CSP must permit MIB's origin in `script-src`, `connect-src`, `img-src`, and permit the widget's inline shadow styles. Test installation against each host's CSP. No weakening of host security settings should be automatic.

## Pending before broad rollout

- Deploy and test in the actual Cloudflare account; mobile and desktop browser QA.
- Pin exact dependency versions with lockfile after a successful registry install.
- Replace the setup token workflow with owner-friendly Cloudflare Access or another verified login flow; keep all data endpoints protected. Current admin token is a bootstrap credential, not a multiuser identity system.
- Consider Turnstile and edge rate limiting for higher-volume installs; origin checks are not bot authentication.
- Add project editing, pagination beyond the first 500 ideas, data deletion/retention controls and email opt-out management.
- Finish notification delivery: verified sending domain, durable per-release recipient outbox, unsubscribe links, retry/idempotency handling, and explicit release approval. Never use a CC list exposing recipients.
- Add signed Linear webhooks or scheduled synchronization if automatic status updates are desired.
- Add release records rather than preview-only selection state.

## Linear failure recovery

The promotion lock stays `pending` after an uncertain API outcome to avoid duplicate issues. An operator must look for the MIB reference in Linear, reconcile the issue ID and URL into D1 if created, or reset the lock only after confirming no issue exists. This recovery is not automated yet. Once promoted, merging a source idea is disabled.

## Tests

`npm test` covers admin access, origin isolation, consent, merge preservation, deduplication, opt-outs, release eligibility, missing integrations, rate limits, body size and SQL-injection-shaped text. It does not substitute for a real D1 deployment test.

## References checked during implementation

- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/workers/static-assets/binding/
- https://developers.cloudflare.com/d1/get-started/
- https://linear.app/developers/graphql

## Brand

The full user-supplied artwork is in `public/mib-logo.jpg`. The compact launcher uses the MIB lettermark in text for legibility. Black/white branding with a restrained green accent, consistent across hosts. No external fonts or tracking.
