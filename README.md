# GLITCHED

**[Play the live game](https://glitched-party.braceface-ceno.chatgpt.site)**

A live, anonymous, 3–12 player social deduction browser game.

## Run locally

Requires Node.js 22.13+ and npm. Install with `npm ci`. Use `npm run db:generate` only after editing the schema. Run `npm run build`, then apply pending SQL migrations to the local database:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_glorious_shaman.sql
npm run dev
```

Do not replay applied migrations. Development and built preview share `.wrangler/state`. `npm start` previews the production Worker locally.

## Architecture

- `app/page.tsx`: mobile-first React client; authoritative state is polled every second (3 seconds in hidden tabs).
- `app/api/game/route.ts`: session authentication, input validation, rate limiting, presence and compare-and-swap room persistence.
- `lib/server/engine.ts`: game state machine and per-player response projection.
- `lib/server/prompts.ts`: 120 server-only prompt pairs. Never import into client components.
- `lib/packs.ts`: public pack descriptions and default settings.
- `db/schema.ts`: D1 tables; generated immutable migrations are in `drizzle/`.

Room JSON is committed with an atomic `UPDATE ... WHERE version=?`, retried on conflicts. All gameplay changes, including scoring, are in that document, so no partial score transaction is possible. Presence lives separately. GET polls may advance an expired phase; the first successful version update wins. Reads use the D1 primary database. A SHA-256 digest of each cryptographically random guest cookie is stored with its player. The opaque cookie is HttpOnly, SameSite=Strict, and Secure on HTTPS. Room codes are not authentication. No account or AI API key is needed.

Responses never contain another player's private prompt, early answers, early votes, role identity, session digests, or the pre-reveal answer-author mapping. Post-reveal only aggregate vote counts are public. Answers and names render as text. The client bundle excludes all prompt pairs.

Active tabs have a presence lease. A second tab must explicitly take control or wait eight seconds after the previous tab stops polling. Offline host reassignment happens after thirty seconds. A missing submission gets twenty seconds of grace; the host can extend time. If still incomplete, the round is voided. Completed rounds are scored once. Skipped rounds do not consume the configured round count.

Rooms expire after 24 hours without activity. Expired room/presence/rate data is lazily deleted on subsequent room creation. Prompt history resets on a rematch. Browser storage holds only display-name preference, last-room reference, and local answer drafts.

## Add content

Append a `[standard, alternate]` pair to an existing category in `lib/server/prompts.ts`. Existing IDs depend on array order: append pairs without reordering existing entries. To add a pack, add an ID and description to `lib/packs.ts` and a matching category in the server module. Update UI counts if pack sizes differ. Use the same answer format, comparable specificity, and overlapping plausible answers. Keep After Hours opt-in. Validate every pair and playtest ambiguity with real people.

## Tests

```sh
node -e 'require("esbuild").buildSync({entryPoints:["tests/engine.test.ts"],outfile:"work/engine.test.mjs",bundle:true,platform:"node",format:"esm"})'
node --test work/engine.test.mjs
node tests/integration.mjs
node node_modules/typescript/bin/tsc --noEmit
```

Integration tests target `http://localhost:5173`; set `TEST_BASE` for a different local preview. They create disposable rooms and run full three-round games for 3, 6, and 12 independent cookie sessions. Never run load tests against production without explicitly authorizing that scope.

## Hosting

Sites owns production hosting, the D1 binding `DB`, and migration application. `.openai/hosting.json` preserves the registered project identity. Build through the bundled Sites workflow, push source, save its matching archive, and deploy the saved version. Public access is intentional: no platform login is required. Never publish local databases, guest cookies, `.env` files, or credentials. Schema changes must be additive migrations; do not modify applied migrations. The current state shape should be kept backward-compatible during deployments with active rooms.

## Limits

Polling is appropriate for small party groups, not an unbounded high-traffic service. Voice/chat, persistent account profiles, cross-device seat recovery, custom packs in the UI, and spectator mode are outside this version. Browser emulation is not a substitute for real iOS/Android testing. An adversary can join multiple guest seats or share prompts verbally; no-account games cannot fully prevent that. Prompt fairness benefits from additional human playtesting.
