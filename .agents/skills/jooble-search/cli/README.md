# jooble-cli

CLI for searching jobs on the **Jooble** aggregator API, for the **US job market**
(plus remote), across any sector. Jooble pulls from many smaller job boards and
company sites, complementing broader aggregators like Adzuna.

**Data source**: Jooble REST API (`POST jooble.org/api/<key>`).
**Authentication**: Free `JOOBLE_API_KEY` required — register at https://jooble.org/api/about.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

Live-verified against the real API — see `../url-reference.md` for the confirmed response
shape and quirks (including a 19-digit job-ID precision fix).

## Installation

```bash
cd .agents/skills/jooble-search/cli
bun install   # optional — only installs TypeScript dev types
```

## Setup

1. Register for a free API key at https://jooble.org/api/about
2. Add to the repo-root `.env`:
   ```
   JOOBLE_API_KEY=your-key-here
   ```

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (`--location` required) |

No `detail` command — Jooble's API has no separate job-detail endpoint; `url` in each
result links to the live posting.

## Quick examples

```bash
# Software engineer roles in New York, last 14 days
bun run src/cli.ts search -q "software engineer" -l "New York, NY" --jobage 14 --format table

# Data analyst roles in Austin, $80k+ minimum
bun run src/cli.ts search -q "data analyst" -l "Austin, TX" --salary 80000 --format table

# Any role, remote
bun run src/cli.ts search -l "Remote" --format table
```

See `../SKILL.md` for the full flag reference and design notes; see `../url-reference.md`
for the raw endpoint documentation and confirmed quirks.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--location` | `-l` | **Required.** e.g. `"New York, NY"`, `"Austin, TX"`, `"Remote"`. |
| `--query` | `-q` | Keywords (title / skill / role) — server-side. Recommended; omitting it returns unfiltered generic listings for the location. |
| `--jobage` | | Posted within N days (client-side filter). |
| `--salary` | | Minimum salary threshold (server-side). |
| `--radius` | | Search radius in km: `0, 4, 8, 16, 26, 40, 80`. |
| `--page` | | 1-indexed page. |
| `--limit` | `-n` | Results per page (maps to Jooble's `ResultOnPage`). Default 20. |
| `--format` | | `json` \| `table` \| `plain`. |

Missing `JOOBLE_API_KEY` fails fast with `{"error": "...", "code": "MISSING_CREDENTIALS"}`.
