---
name: jooble-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in the US job market via
  Jooble — a broad job aggregator that pulls listings from many smaller job boards and
  company career sites, complementing Adzuna's coverage. Invoke for open positions,
  vacancies, and hiring across any sector or role (software, data, design, marketing,
  finance, legal, operations, etc.) in US cities like New York, Seattle, Austin, Boston,
  Chicago, or remote. Trigger phrases: find a job, job search, search for jobs, job
  openings, vacancies, hiring, positions open, remote jobs, "are there any X jobs in <US
  city>", Jooble.
context: fork
allowed-tools: Bash(bun run .agents/skills/jooble-search/cli/src/cli.ts *)
---

# Jooble Search Skill

Search live job listings from the Jooble aggregator API for the **US market** (plus
remote). Requires a free API key from https://jooble.org/api/about, stored in the
repo-root `.env` as `JOOBLE_API_KEY`. Zero runtime dependencies otherwise — it runs
with just `bun`.

Live-verified against the real API during this skill's build (2026-07-08) — see
`url-reference.md` for the confirmed response shape and quirks found along the way
(including a 19-digit job-ID precision bug that's already fixed in the CLI).

## When to use this skill

- Search for job openings in a specific US city (or remotely), especially to catch
  smaller employers and regional postings that broader boards like Adzuna may miss
- Filter by recency (posted within N days) or minimum salary

## Commands

### Search job listings

```bash
bun run .agents/skills/jooble-search/cli/src/cli.ts search --location "<city, ST>" [flags]
```

Key flags:
- `--location <text>` / `-l <text>` — **required.** e.g. `"New York, NY"`, `"Austin, TX"`,
  or `"Remote"`.
- `--query <text>` / `-q <text>` — keywords (job title, skill, or role). Maps to Jooble's
  `keywords` parameter (server-side). **Strongly recommended** — omitting it returns
  unfiltered generic listings for the location (confirmed live: an empty query for
  "New York, NY" returned dentist and medical-office postings, not software roles).
- `--jobage <days>` — posted within N days (filtered client-side against each job's
  `updated` field; Jooble has no documented server-side posting-age parameter).
- `--salary <amount>` — minimum salary threshold (server-side).
- `--radius <km>` — search radius in km: `0, 4, 8, 16, 26, 40, 80`.
- `--page <n>` — 1-indexed page number.
- `--limit <n>` / `-n <n>` — results per page (maps to Jooble's `ResultOnPage`, with a
  client-side cap as a safety net).
- `--format json|table|plain` — default `json`.

No `detail` command — Jooble's API has no separate job-detail endpoint (same situation as
this fork's `adzuna-search`); `url` in each result links to the live posting.

## Usage examples

```bash
# Software engineer roles in New York, last 14 days
bun run .agents/skills/jooble-search/cli/src/cli.ts search -q "software engineer" -l "New York, NY" --jobage 14 --format table

# Data analyst roles in Austin, $80k+ minimum
bun run .agents/skills/jooble-search/cli/src/cli.ts search -q "data analyst" -l "Austin, TX" --salary 80000 --format table

# Any role, remote
bun run .agents/skills/jooble-search/cli/src/cli.ts search -l "Remote" --format table
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use |
| `table` | Quick human-readable scanning |
| `plain` | Readable key/value dump per job |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Setup

1. Register for a free API key at https://jooble.org/api/about
2. Add `JOOBLE_API_KEY` to the repo-root `.env` file

No `bun install` is required beyond dev types — the CLI has zero runtime dependencies.

## Notes

- All data is from the Jooble REST API (`POST jooble.org/api/<key>`).
- The CLI retries 429/5xx with exponential backoff.
- Missing `JOOBLE_API_KEY` fails fast with `{"error": "...", "code": "MISSING_CREDENTIALS"}`
  rather than surfacing a raw fetch failure.
