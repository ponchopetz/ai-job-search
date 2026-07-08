---
name: remoteok-search
version: 1.0.0
description: >
  Make sure to use this skill whenever the user wants to find remote jobs, remote-friendly
  tech positions, or work-from-anywhere roles — even if they don't mention RemoteOK
  explicitly. Focused on tech/startup roles that can be done fully remote. Trigger phrases
  include: remote job, remote developer job, remote engineer job, work from home job, work
  from anywhere, remote tech job, remote startup job, fully remote position, remoteok,
  remote python job, remote react job, digital nomad job, remote software job, telecommute
  job, distributed team job, remote-first company jobs.
context: fork
allowed-tools: Bash(bun run skills/remoteok-search/cli/src/cli.ts *)
---

# RemoteOK Search Skill

Search live remote-first tech job listings from the [RemoteOK](https://remoteok.com) API.
No authentication needed. Skews toward software engineering, product, and startup roles.

## When to use this skill

Invoke this skill when the user wants to:

- Find remote-friendly tech jobs by keyword or tag (e.g. `python`, `react`, `devops`)
- Explore what remote roles are currently open without a location constraint

## Commands

### Search for jobs

```bash
bun run skills/remoteok-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--keyword <text>` — matches against title, company, or description
- `--tag <tag>` — matches an exact tag, e.g. `python`, `react`
- `--limit <n>` — cap the number of results
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

No signup, no `bun install` — works immediately, zero external dependencies.

## Notes

- RemoteOK has no server-side search — this tool fetches the full public listing and filters
  client-side by keyword/tag.
- Skews heavily toward software/tech/startup roles; not a general-purpose US job board.
