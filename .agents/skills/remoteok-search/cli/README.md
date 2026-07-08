# remoteok-cli

CLI for the [RemoteOK](https://remoteok.com) remote-jobs API.

**Base URL**: `https://remoteok.com/api`
**Authentication**: none required, but requests need a realistic `User-Agent` header — a
bare request without one gets a `403`. The CLI sets this automatically.
**Format**: JSON responses; CLI output supports `json` (default), `table`, `plain`.

## Commands

### `search` — search for remote jobs

RemoteOK's API has no server-side query parameters — this command fetches the full listing
and filters client-side.

```bash
bun run src/cli.ts search [flags]
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--keyword` | string | — | Matches against title, company, or description |
| `--tag` | string | — | Matches an exact tag, e.g. `python`, `react` |
| `--limit` | number | — | Cap the number of results returned |
| `--format` | string | `json` | `json`, `table`, or `plain` |

### Example

```bash
bun run src/cli.ts search --tag python --limit 5 --format table
```

## Error handling

All errors are written to **stderr** as JSON and exit with code `1`:

```json
{ "error": "API request failed: 500 Internal Server Error", "code": "UNEXPECTED_ERROR" }
```

## Notes

- The raw API response's first element is a legal/metadata notice, not a job — the CLI drops
  any entry without an `id` field rather than assuming it's always at index 0.
- No `bun install` is required — this CLI has zero external dependencies.
