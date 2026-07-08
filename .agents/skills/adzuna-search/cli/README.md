# adzuna-cli

CLI for the [Adzuna](https://www.adzuna.com) job search API (US market).

**Base URL**: `https://api.adzuna.com/v1/api/jobs/us/search/{page}`
**Authentication**: free `app_id` + `app_key` from https://developer.adzuna.com, read from
the repo-root `.env` as `ADZUNA_APP_ID` / `ADZUNA_APP_KEY`.
**Format**: JSON responses; CLI output supports `json` (default), `table`, `plain`.

## Commands

### `search` — search for jobs

```bash
bun run src/cli.ts search [flags]
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--what` | string | — | Job title or keywords, e.g. `"data scientist"` |
| `--where` | string | — | City, state, or zip, e.g. `"Austin, TX"` |
| `--salary-min` | number | — | Minimum salary floor |
| `--full-time` | flag | — | Only full-time positions |
| `--page` | number | `1` | Page number |
| `--results-per-page` | number | `10` | Results per page |
| `--format` | string | `json` | `json`, `table`, or `plain` |

### Example

```bash
bun run src/cli.ts search --what "backend engineer" --where "Remote" --format table
```

## Error handling

All errors are written to **stderr** as JSON and exit with code `1`:

```json
{ "error": "Missing ADZUNA_APP_ID/ADZUNA_APP_KEY - register at https://developer.adzuna.com", "code": "MISSING_CREDENTIALS" }
{ "error": "API request failed: 500 Internal Server Error", "code": "UNEXPECTED_ERROR" }
```

## Notes

- Adzuna has no separate job-detail endpoint — the `url` field in each result links directly
  to the live posting.
- `--where` accepts free text; Adzuna resolves city/state/zip server-side.
- No `bun install` is required — this CLI has zero external dependencies.
