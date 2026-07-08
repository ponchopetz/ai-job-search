# themuse-cli

CLI for searching jobs on **The Muse**'s public Jobs API, for the **US job market**
(plus remote), across any sector.

**Data source**: The Muse `api/public/jobs` endpoints (`jobs` search and `jobs/<id>` detail).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

## Installation

```bash
cd .agents/skills/themuse-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (`--location` required) |
| `detail` | Fetch full detail for a single job listing (numeric ID only) |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Software engineer roles in New York, last 14 days
bun run src/cli.ts search -q "software engineer" -l "New York, NY" --jobage 14 --format table

# Data analyst roles in Austin
bun run src/cli.ts search -q "data analyst" -l "Austin, TX" --format table

# Any role, fully remote
bun run src/cli.ts search -l "Flexible / Remote" --format table

# Full detail for one job
bun run src/cli.ts detail 21370777 --format plain
```

See `../SKILL.md` for the full flag reference and design notes; see `../url-reference.md`
for the raw endpoint documentation and quirks.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--location` | `-l` | **Required.** Exact place string, e.g. `"New York, NY"`, `"Austin, TX"`, `"Flexible / Remote"`. |
| `--query` | `-q` | Keywords matched against job titles (client-side scan — see Notes in `SKILL.md`). |
| `--jobage` | | Posted within N days (client-side filter). |
| `--page` | | 1-indexed page (20 results/page upstream). |
| `--limit` | `-n` | Cap results emitted. Default 20. |
| `--format` | | `json` \| `table` \| `plain`. |
