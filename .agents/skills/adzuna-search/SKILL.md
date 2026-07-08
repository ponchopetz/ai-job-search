---
name: adzuna-search
version: 1.0.0
description: >
  Make sure to use this skill whenever the user wants to search for jobs in the United
  States, find US job listings, look up open positions by title/company/location, or asks
  about the US job market broadly — even if they don't mention Adzuna explicitly. Covers
  general private-sector hiring across all industries and any US city or state. Trigger
  phrases include: find me a job, job search, job listings, job openings, jobs near me,
  jobs in [city], jobs in [state], remote jobs, full time jobs, part time jobs, software
  engineer jobs, data scientist jobs, marketing jobs, sales jobs, nurse jobs, jobs hiring
  now, salary for [role], entry level jobs, senior [role] jobs, adzuna, us jobs, american
  job market, job vacancies usa, hiring in [city], open positions [company/industry].
context: fork
allowed-tools: Bash(bun run skills/adzuna-search/cli/src/cli.ts *)
---

# Adzuna Search Skill

Search live US job listings from the [Adzuna](https://www.adzuna.com) job aggregator API.
Covers broad private-sector hiring across all industries and every US city/state. Requires
a free `app_id` + `app_key` from developer.adzuna.com, stored in the repo-root `.env` as
`ADZUNA_APP_ID` and `ADZUNA_APP_KEY`.

## When to use this skill

Invoke this skill when the user wants to:

- Search for job openings in the US by keyword, title, or company
- Filter jobs by location, salary floor, or full-time status
- Get a broad view of what's currently hiring in a given city, state, or industry

## Commands

### Search for jobs

```bash
bun run skills/adzuna-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--what <keywords>` — job title or keywords, e.g. `"data scientist"`
- `--where <location>` — city, state, or zip, e.g. `"Austin, TX"`
- `--salary-min <amount>` — minimum salary floor
- `--full-time` — only full-time positions
- `--page <n>` / `--results-per-page <n>`
- `--format json|table|plain`

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, data processing |
| `table` | Quick human-readable overviews and comparisons |
| `plain` | Readable key/value dump per job |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process
exits with code `1`.

## Setup

1. Register for a free API key at https://developer.adzuna.com
2. Add `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` to the repo-root `.env` file

No `bun install` is required — the CLI has zero external dependencies.

## Notes

- Adzuna has no separate job-detail endpoint — `url` in each result links to the live posting.
- All data is from the public Adzuna Jobs API (`api.adzuna.com/v1/api/jobs/us/search`).
