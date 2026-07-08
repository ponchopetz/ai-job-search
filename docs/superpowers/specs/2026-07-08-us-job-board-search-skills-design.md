# US Job Board Search Skills (replacing Danish tools)

## Problem

The repo shipped four job-portal search skills under `.agents/skills/` — `jobbank-search`,
`jobdanmark-search`, `jobindex-search`, `jobnet-search` — all specific to the Danish job
market. The user is job searching in the US and ran the quick-start `bun install` steps for
these by mistake. They also tried a `linkedin-search` skill from the quick-start guide that
doesn't exist in this repo.

There is no existing US-market equivalent to install. This design covers building two new
job-board search skills for the US market and removing the four Danish ones. (USAJobs.gov was
considered but dropped — federal-only listings are too narrow for general job search.)

## Goals

- Remove the four Danish job-portal skills (source + installed dependencies) entirely.
- Add two working, independently-verified CLI-based search skills for the US market:
  Adzuna, RemoteOK.
- Match the existing skill-invocation convention (standalone `context: fork` skills triggered
  by user message phrasing, `bun run .../cli.ts <command> --flags`, `--format json|table|plain`,
  errors as `{error, code}` JSON on stderr) so Claude Code's invocation pattern doesn't change.
- Each new tool must actually run end-to-end (verified via a live smoke test), unlike the
  Danish tools as shipped.

## Non-goals

- Not wiring these into `/scrape` (`job-scraper` skill) — it does its own `WebSearch`/`WebFetch`
  today and doesn't call the Danish CLI tools either. Standalone skills only.
- Not building a LinkedIn integration — no public job-search API exists without a partnership;
  building one would mean scraping, which violates LinkedIn's Terms of Service.
- Not attempting to fix or preserve the Danish tools' broken `commands/` structure.

## Background: why not copy the existing pattern verbatim

The four Danish tools' committed `cli.ts` files import from a `./commands/*.js` directory that
was never committed to git. Confirmed by running `jobbank-search`'s CLI directly:

```
error: Cannot find module './commands/search.js' from '.../jobbank-search/cli/src/cli.ts'
```

They also depend on `@bunli/core`, a framework whose actual command-registration API wasn't
verified as part of this design. Rather than propagate an unverified pattern, the new tools use
a single self-contained `cli.ts` per skill with manual `process.argv` parsing and a `switch`
dispatch — no `@bunli/core` dependency. External shape (invocation, flags, output formats, error
JSON) stays identical so it's a drop-in match for how Claude Code invokes these skills.

## Architecture

```
.agents/skills/
├── adzuna-search/
│   ├── SKILL.md
│   └── cli/
│       ├── package.json
│       ├── src/cli.ts
│       ├── src/helpers.ts
│       ├── tests/helpers.test.ts
│       └── README.md
└── remoteok-search/
    └── ... (same shape)
```

Each `SKILL.md` follows the existing frontmatter convention: `name`, `version`, `description`
(with US-specific trigger phrases — job titles, US city/state names, "federal jobs", "remote
jobs" — written fresh, not translated Danish phrasing), `context: fork`, `allowed-tools:
Bash(bun run skills/<name>/cli/src/cli.ts *)`.

## Per-source specifics

### 1. Adzuna (`adzuna-search`) — broad private-sector aggregator

- **Auth**: free `app_id` + `app_key` from developer.adzuna.com, passed as query params (not
  headers).
- **Endpoint**: `GET https://api.adzuna.com/v1/api/jobs/us/search/{page}?app_id=...&app_key=...&what=...&where=...&results_per_page=...`
- **Commands**: `search` only — Adzuna's public API has no separate single-job detail endpoint;
  `redirect_url` in search results links to the live posting.
- **Response shape**: array of jobs with `title`, `company.display_name`,
  `location.display_name`/`area`, `redirect_url`, `salary_min`/`salary_max`, `description`
  (snippet), `created` (ISO timestamp), `contract_type`.

### 2. RemoteOK (`remoteok-search`) — remote-first tech jobs

- **Auth**: none required, but a bare request 403s (confirmed by direct test) — needs a
  realistic `User-Agent` header to succeed.
- **Endpoint**: `GET https://remoteok.com/api` — returns a JSON array where element `[0]` is a
  legal/metadata notice, not a job.
- **Commands**: `search` only — no server-side query params exist; the CLI fetches the full
  listing and filters client-side by keyword/tag.
- **Response shape** (from element `[1]` onward): `id`, `position`, `company`, `tags[]`,
  `location`, `url`, `date`, `salary_min`/`salary_max`, `description`.

## Credential storage

A single root-level `.env` (gitignored, real values never committed) holds:

```
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
```

A `.env.example` ships with the same blank keys and an inline comment pointing to the
registration page. `helpers.ts` in `adzuna-search` reads via `process.env` and fails fast with
a clear error (e.g. `{error: "Missing ADZUNA_APP_ID - register at https://developer.adzuna.com", code: "MISSING_CREDENTIALS"}`)
rather than surfacing a raw fetch failure. RemoteOK needs no credentials.

## Shared implementation details

`helpers.ts` per skill provides:

- `apiFetch<T>()` — retry with exponential backoff + jitter on `429`/`5xx` responses (same
  pattern as the one working piece of the Danish `jobnet-search` helper); throws on other
  non-OK statuses.
- `writeError(error, code)` — writes `{error, code}` JSON to stderr, exits process with code 1.
- `formatOutput(data, format)` — shared `json`/`table`/`plain` rendering so both tools
  behave identically from Claude's perspective.

`cli.ts` per skill: manual `process.argv` parsing into a flag → value map, dispatch to a
`search`/`detail` function, catch-all error handler routing to `writeError`.

## Testing

- `cli/tests/helpers.test.ts` per skill: real unit tests for `formatOutput`, RemoteOK's
  first-element filtering, and backoff timing (mocked clock) — not the placeholder-only test
  file the Danish tools shipped.
- Live smoke test per skill (a real `search` call against the actual API) before considering
  that skill done. This is the verification bar the Danish tools failed to meet.

## Rollout order

Built and verified one at a time, so working tools are never removed before their replacement
exists:

1. **Adzuna** — broadest coverage, query-param auth, key already in `.env`.
2. **RemoteOK** — no auth, but has the one genuinely different piece (client-side filtering).
3. **Danish removal + README/docs updates** — done last, after both replacements are
   verified working.

The Adzuna key is already collected in `.env`; the live smoke test for that skill can run as
soon as it's built.

## Cleanup scope (Danish removal)

- Delete `.agents/skills/{jobbank,jobdanmark,jobindex,jobnet}-search/` entirely, including
  installed `node_modules`.
- Update `README.md`: remove the four `bun install` lines from Quick Start step 2, replace with
  the two new US tools; update the "Job search tools" section and file-structure tree to
  describe the US skills instead of the Danish ones.
