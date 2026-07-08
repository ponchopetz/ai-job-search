---
name: themuse-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in the US job market via
  The Muse — a curated US-heavy job board covering real companies (not just startups)
  with culture/benefits data. Invoke for open positions, vacancies, and hiring across
  any sector or role (software, data, design, marketing, finance, legal, operations,
  etc.) in US cities like New York, Seattle, Austin, Boston, Chicago, or remote. Trigger
  phrases: find a job, job search, search for jobs, job openings, vacancies, hiring,
  positions open, remote jobs, "are there any X jobs in <US city>", look up this job
  posting, The Muse.
context: fork
allowed-tools: Bash(bun run .agents/skills/themuse-search/cli/src/cli.ts *)
---

# The Muse Search Skill

Search live job listings from The Muse's public Jobs API for the **US market** (plus
remote). No authentication, no API key, and **zero runtime dependencies** — it runs
with just `bun`.

## When to use this skill

- Search for job openings in a specific US city (or remotely)
- Filter by recency (posted within N days)
- Get the full description of a specific job listing

## Commands

### Search job listings

```bash
bun run .agents/skills/themuse-search/cli/src/cli.ts search --location "<city, ST>" [flags]
```

Key flags:
- `--location <text>` / `-l <text>` — **required.** An exact Muse place string, e.g.
  `"New York, NY"`, `"Seattle, WA"`, `"Austin, TX"`, `"Boston, MA"`, `"Chicago, IL"`, or
  `"Flexible / Remote"`.
- `--query <text>` / `-q <text>` — keyword matched against job titles. Recommended.
  **Note:** Muse's API has no free-text search parameter, so this filters client-side —
  the CLI scans forward through location-filtered pages looking for title matches (see
  Notes below).
- `--jobage <days>` — posted within N days (filtered client-side; Muse has no server-side
  posting-age parameter). Omit for all postings.
- `--page <n>` — page number (1-indexed, 20 results/page upstream; with `--query`, scanning
  starts from this page).
- `--limit <n>` / `-n <n>` — cap total results emitted. Default 20.
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/themuse-search/cli/src/cli.ts detail <id> [--format json|plain]
```

`id` is the numeric job ID from `search` results (e.g. `21370777`). Unlike LinkedIn, Muse's
landing-page URLs don't embed the ID, so only the bare numeric ID is accepted — copy it from
search output.

## Usage examples

```bash
# Software engineer roles in New York, last 14 days
bun run .agents/skills/themuse-search/cli/src/cli.ts search -q "software engineer" -l "New York, NY" --jobage 14 --format table

# Data analyst roles in Austin
bun run .agents/skills/themuse-search/cli/src/cli.ts search -q "data analyst" -l "Austin, TX" --format table

# Any role, fully remote
bun run .agents/skills/themuse-search/cli/src/cli.ts search -l "Flexible / Remote" --format table

# Full details for a specific job
bun run .agents/skills/themuse-search/cli/src/cli.ts detail 21370777 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from The Muse's public `api/public/jobs` endpoints — no credentials required
  (500 requests/hour unregistered, which is plenty for personal search volume).
- `--location` must match Muse's exact place strings (`"City, ST"` — see examples above).
  A typo'd or unsupported city silently returns zero results rather than an error.
- `--query` scans forward through pages rather than filtering server-side, because Muse's
  only content filter (`category`) is a loosely-applied taxonomy tag, not a keyword match —
  see `url-reference.md` for what was tested and why this design was chosen. This means
  `--query` searches can take a few seconds and issue several requests per call; keep
  `--limit` reasonable.
- The CLI retries 429/5xx with exponential backoff.
