# US Job Board Search Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four Denmark-only job search skills under `.agents/skills/` with two working US-market equivalents (Adzuna, RemoteOK), each independently verified against the live API before the Danish tools are removed.

**Architecture:** Two standalone Claude Code skills (`adzuna-search`, `remoteok-search`), each a `SKILL.md` + a dependency-free Bun/TypeScript CLI (`cli/src/helpers.ts` for all testable logic, `cli/src/cli.ts` as a thin argv-parsing entry point). No `@bunli/core` (the existing Danish tools depend on it but ship a `cli.ts` that imports a `./commands/` directory that was never committed — confirmed broken by direct execution). Follows the design in `docs/superpowers/specs/2026-07-08-us-job-board-search-skills-design.md`.

**Tech Stack:** Bun (runtime + test runner), TypeScript (no compilation step — Bun executes `.ts` directly), zero npm dependencies (only Bun/Node built-ins: `bun:test`, `node:fs`, `node:path`, global `fetch`).

## Global Constraints

- Output formats: every CLI command supports `--format json|table|plain` (default `json`).
- Errors: written to stderr as `{"error": "...", "code": "..."}` JSON, process exits with code `1`.
- No new npm dependencies — use only Bun/Node built-ins and global `fetch`.
- Each skill's `SKILL.md` uses `context: fork` and `allowed-tools: Bash(bun run skills/<name>/cli/src/cli.ts *)`, matching the existing (Danish) skills' invocation convention exactly.
- Danish skills (`jobbank-search`, `jobdanmark-search`, `jobindex-search`, `jobnet-search`) must not be deleted until both replacements are built and live-verified (Task 6 runs last).
- Real API credentials never get written into any file under version control other than `.env` (gitignored) — `.env.example` holds only blank placeholders.

---

### Task 1: Root credential scaffolding

**Files:**
- Create: `.env.example`
- Verify (no changes expected): `.env`, `.gitignore`

**Interfaces:** None — this task only sets up files consumed by Task 2/3's `searchJobs`, which reads `process.env.ADZUNA_APP_ID` / `process.env.ADZUNA_APP_KEY`.

- [ ] **Step 1: Confirm `.env` is gitignored and holds the real Adzuna credentials**

Run: `git check-ignore -v .env && cat .env`
Expected: prints `.gitignore:<N>:.env	.env` followed by two lines starting `ADZUNA_APP_ID=` and `ADZUNA_APP_KEY=` with non-empty values. If `.env` is missing or empty, stop and ask the user for their Adzuna `app_id`/`app_key` (they registered at https://developer.adzuna.com per an earlier conversation) before continuing.

- [ ] **Step 2: Create `.env.example`**

```
# Adzuna job search API — register for free at https://developer.adzuna.com
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
```

- [ ] **Step 3: Verify `.gitignore` excludes `.env`**

Run: `grep -n "^\.env$" .gitignore`
Expected: one matching line. If absent, add a `.env` entry under a `# Secrets` heading.

- [ ] **Step 4: Commit**

```bash
git add .env.example .gitignore
git commit -m "chore: add .env.example for job search API credentials"
```

---

### Task 2: `adzuna-search` — helpers module (TDD)

**Files:**
- Create: `.agents/skills/adzuna-search/cli/package.json`
- Create: `.agents/skills/adzuna-search/cli/src/helpers.ts`
- Test: `.agents/skills/adzuna-search/cli/tests/helpers.test.ts`

**Interfaces:**
- Produces (consumed by Task 3's `cli.ts`):
  - `parseFlags(args: string[]): Record<string, string>`
  - `formatOutput(data: unknown, format: string): string` (throws `Error` on unknown format)
  - `apiFetch<T>(url: string, init?: RequestInit, options?: { maxRetries?: number; baseDelayMs?: number }): Promise<T>`
  - `writeError(error: string, code: string): void`
  - `class CliError extends Error { code: string }`
  - `interface Job { title: string; company: string; location: string; url: string; salaryMin?: number; salaryMax?: number; posted: string; contractType?: string; description: string }`
  - `searchJobs(flags: Record<string, string>): Promise<Job[]>` — rejects with `CliError` (code `MISSING_CREDENTIALS`) if `ADZUNA_APP_ID`/`ADZUNA_APP_KEY` are unset.

- [ ] **Step 1: Create the package manifest**

```json
{
  "name": "adzuna-cli",
  "version": "1.0.0",
  "description": "CLI for the Adzuna job search API (US market)",
  "type": "module",
  "scripts": {
    "test": "bun test"
  }
}
```

Save as `.agents/skills/adzuna-search/cli/package.json`.

- [ ] **Step 2: Write the failing tests**

Create `.agents/skills/adzuna-search/cli/tests/helpers.test.ts`:

```ts
import { describe, expect, mock, test } from "bun:test"
import {
  CliError,
  apiFetch,
  formatOutput,
  normalizeJob,
  parseFlags,
  searchJobs,
  writeError,
} from "../src/helpers"

describe("parseFlags", () => {
  test("parses --key value pairs", () => {
    expect(parseFlags(["--what", "engineer", "--where", "Austin"])).toEqual({
      what: "engineer",
      where: "Austin",
    })
  })

  test("treats a flag with no following value as boolean true", () => {
    expect(parseFlags(["--full-time"])).toEqual({ "full-time": "true" })
  })

  test("treats a flag followed by another flag as boolean true", () => {
    expect(parseFlags(["--full-time", "--page", "2"])).toEqual({
      "full-time": "true",
      page: "2",
    })
  })

  test("returns an empty object for no args", () => {
    expect(parseFlags([])).toEqual({})
  })
})

describe("formatOutput", () => {
  test("json format pretty-prints the data", () => {
    expect(formatOutput({ a: 1 }, "json")).toBe(JSON.stringify({ a: 1 }, null, 2))
  })

  test("table format renders a header, separator, and row for an array", () => {
    const result = formatOutput([{ title: "Engineer", company: "Acme" }], "table")
    const lines = result.split("\n")
    expect(lines[0]).toContain("title")
    expect(lines[0]).toContain("company")
    expect(lines[2]).toContain("Engineer")
    expect(lines[2]).toContain("Acme")
  })

  test("table format handles an empty array", () => {
    expect(formatOutput([], "table")).toBe("(no results)")
  })

  test("plain format renders key: value lines", () => {
    expect(formatOutput({ title: "Engineer", company: "Acme" }, "plain")).toBe(
      "title: Engineer\ncompany: Acme"
    )
  })

  test("throws on an unknown format", () => {
    expect(() => formatOutput({}, "xml")).toThrow("Unknown format: xml")
  })
})

describe("apiFetch", () => {
  test("returns parsed JSON on a 200 response", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as unknown as typeof fetch

    const result = await apiFetch<{ ok: boolean }>("https://example.com")
    expect(result).toEqual({ ok: true })
  })

  test("retries on 429 and succeeds once the server recovers", async () => {
    let calls = 0
    globalThis.fetch = mock(async () => {
      calls += 1
      if (calls < 3) return new Response("", { status: 429 })
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as unknown as typeof fetch

    const result = await apiFetch<{ ok: boolean }>("https://example.com", undefined, { baseDelayMs: 1 })
    expect(result).toEqual({ ok: true })
    expect(calls).toBe(3)
  })

  test("throws after exhausting retries against a persistent 500", async () => {
    globalThis.fetch = mock(async () => new Response("", { status: 500, statusText: "Internal Server Error" })) as unknown as typeof fetch

    await expect(
      apiFetch("https://example.com", undefined, { maxRetries: 2, baseDelayMs: 1 })
    ).rejects.toThrow("API request failed: 500")
  })

  test("throws immediately on a non-retryable 4xx", async () => {
    globalThis.fetch = mock(async () => new Response("", { status: 404, statusText: "Not Found" })) as unknown as typeof fetch

    await expect(apiFetch("https://example.com")).rejects.toThrow("API request failed: 404 Not Found")
  })
})

describe("writeError", () => {
  test("writes an {error, code} JSON line to stderr", () => {
    const chunks: string[] = []
    const original = process.stderr.write.bind(process.stderr)
    process.stderr.write = ((chunk: string) => {
      chunks.push(chunk)
      return true
    }) as typeof process.stderr.write

    writeError("Something broke", "TEST_ERROR")
    process.stderr.write = original

    expect(JSON.parse(chunks[0])).toEqual({ error: "Something broke", code: "TEST_ERROR" })
  })
})

describe("normalizeJob", () => {
  test("maps Adzuna's raw shape to the flat Job shape", () => {
    const raw = {
      title: "Backend Engineer",
      company: { display_name: "Acme Corp" },
      location: { display_name: "Austin, TX" },
      redirect_url: "https://adzuna.com/job/123",
      salary_min: 90000,
      salary_max: 130000,
      created: "2026-06-01T00:00:00Z",
      description: "Build things.",
      contract_type: "permanent",
    }

    expect(normalizeJob(raw)).toEqual({
      title: "Backend Engineer",
      company: "Acme Corp",
      location: "Austin, TX",
      url: "https://adzuna.com/job/123",
      salaryMin: 90000,
      salaryMax: 130000,
      posted: "2026-06-01T00:00:00Z",
      contractType: "permanent",
      description: "Build things.",
    })
  })
})

describe("searchJobs", () => {
  test("rejects with a CliError when credentials are missing", async () => {
    delete process.env.ADZUNA_APP_ID
    delete process.env.ADZUNA_APP_KEY

    await expect(searchJobs({})).rejects.toThrow(CliError)
  })

  test("builds the request URL from flags and normalizes results", async () => {
    process.env.ADZUNA_APP_ID = "test-id"
    process.env.ADZUNA_APP_KEY = "test-key"

    let capturedUrl = ""
    globalThis.fetch = mock(async (url: string) => {
      capturedUrl = url
      return new Response(
        JSON.stringify({
          results: [
            {
              title: "Data Scientist",
              company: { display_name: "Acme Corp" },
              location: { display_name: "Remote" },
              redirect_url: "https://adzuna.com/job/456",
              created: "2026-06-02T00:00:00Z",
              description: "Analyze data.",
            },
          ],
          count: 1,
        }),
        { status: 200 }
      )
    }) as unknown as typeof fetch

    const jobs = await searchJobs({ what: "data scientist", where: "Remote", page: "2" })

    expect(jobs).toEqual([
      {
        title: "Data Scientist",
        company: "Acme Corp",
        location: "Remote",
        url: "https://adzuna.com/job/456",
        salaryMin: undefined,
        salaryMax: undefined,
        posted: "2026-06-02T00:00:00Z",
        contractType: undefined,
        description: "Analyze data.",
      },
    ])
    expect(capturedUrl).toContain("/v1/api/jobs/us/search/2")
    expect(capturedUrl).toContain("app_id=test-id")
    expect(capturedUrl).toContain("app_key=test-key")
    expect(capturedUrl).toContain("what=data+scientist")

    delete process.env.ADZUNA_APP_ID
    delete process.env.ADZUNA_APP_KEY
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd .agents/skills/adzuna-search/cli && bun test`
Expected: FAIL — `Cannot find module '../src/helpers'` (the file doesn't exist yet).

- [ ] **Step 4: Write the implementation**

Create `.agents/skills/adzuna-search/cli/src/helpers.ts`:

```ts
export class CliError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

export async function apiFetch<T>(
  url: string,
  init?: RequestInit,
  options?: { maxRetries?: number; baseDelayMs?: number }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 6
  let delay = options?.baseDelayMs ?? 500

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, init)

    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((resolve) => setTimeout(resolve, delay + jitter))
      delay = Math.min(delay * 2, 5000)
      continue
    }

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`)
    }

    return response.json() as Promise<T>
  }

  throw new Error("API request failed after max retries")
}

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

export function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith("--")) {
      const key = arg.slice(2)
      const next = args[i + 1]
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next
        i++
      } else {
        flags[key] = "true"
      }
    }
  }
  return flags
}

export function formatOutput(data: unknown, format: string): string {
  if (format === "json") return JSON.stringify(data, null, 2)
  if (format === "table") return formatTable(data)
  if (format === "plain") return formatPlain(data)
  throw new Error(`Unknown format: ${format}`)
}

function asRows(data: unknown): Array<Record<string, unknown>> {
  return (Array.isArray(data) ? data : [data]) as Array<Record<string, unknown>>
}

function formatTable(data: unknown): string {
  const rows = asRows(data)
  if (rows.length === 0) return "(no results)"
  const columns = Object.keys(rows[0])
  const widths = columns.map((col) => Math.max(col.length, ...rows.map((row) => String(row[col] ?? "").length)))
  const headerLine = columns.map((col, i) => col.padEnd(widths[i])).join("  ")
  const separator = widths.map((w) => "-".repeat(w)).join("  ")
  const dataLines = rows.map((row) => columns.map((col, i) => String(row[col] ?? "").padEnd(widths[i])).join("  "))
  return [headerLine, separator, ...dataLines].join("\n")
}

function formatPlain(data: unknown): string {
  const rows = asRows(data)
  return rows.map((row) => Object.entries(row).map(([key, value]) => `${key}: ${value}`).join("\n")).join("\n\n")
}

export interface Job {
  title: string
  company: string
  location: string
  url: string
  salaryMin?: number
  salaryMax?: number
  posted: string
  contractType?: string
  description: string
}

interface AdzunaRawJob {
  title: string
  company: { display_name: string }
  location: { display_name: string }
  redirect_url: string
  salary_min?: number
  salary_max?: number
  created: string
  description: string
  contract_type?: string
}

interface AdzunaResponse {
  results: AdzunaRawJob[]
  count: number
}

export function normalizeJob(raw: AdzunaRawJob): Job {
  return {
    title: raw.title,
    company: raw.company.display_name,
    location: raw.location.display_name,
    url: raw.redirect_url,
    salaryMin: raw.salary_min,
    salaryMax: raw.salary_max,
    posted: raw.created,
    contractType: raw.contract_type,
    description: raw.description,
  }
}

export async function searchJobs(flags: Record<string, string>): Promise<Job[]> {
  const appId = process.env.ADZUNA_APP_ID
  const appKey = process.env.ADZUNA_APP_KEY
  if (!appId || !appKey) {
    throw new CliError(
      "Missing ADZUNA_APP_ID/ADZUNA_APP_KEY - register at https://developer.adzuna.com",
      "MISSING_CREDENTIALS"
    )
  }

  const page = flags.page ?? "1"
  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: flags["results-per-page"] ?? "10",
  })
  if (flags.what) params.set("what", flags.what)
  if (flags.where) params.set("where", flags.where)
  if (flags["salary-min"]) params.set("salary_min", flags["salary-min"])
  if (flags["full-time"]) params.set("full_time", "1")

  const url = `https://api.adzuna.com/v1/api/jobs/us/search/${page}?${params.toString()}`
  const response = await apiFetch<AdzunaResponse>(url)
  return response.results.map(normalizeJob)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd .agents/skills/adzuna-search/cli && bun test`
Expected: PASS — all tests in `tests/helpers.test.ts` green, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add .agents/skills/adzuna-search/cli/package.json .agents/skills/adzuna-search/cli/src/helpers.ts .agents/skills/adzuna-search/cli/tests/helpers.test.ts
git commit -m "feat: add adzuna-search CLI helpers with tests"
```

---

### Task 3: `adzuna-search` — entry point, skill docs, live smoke test

**Files:**
- Create: `.agents/skills/adzuna-search/cli/src/cli.ts`
- Create: `.agents/skills/adzuna-search/cli/README.md`
- Create: `.agents/skills/adzuna-search/SKILL.md`

**Interfaces:**
- Consumes from Task 2's `helpers.ts`: `CliError`, `formatOutput`, `parseFlags`, `searchJobs`, `writeError`.
- Produces: a runnable CLI at `bun run .agents/skills/adzuna-search/cli/src/cli.ts search [flags]`.

- [ ] **Step 1: Write the CLI entry point**

Create `.agents/skills/adzuna-search/cli/src/cli.ts`:

```ts
#!/usr/bin/env bun
import { CliError, formatOutput, parseFlags, searchJobs, writeError } from "./helpers"

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)
  const flags = parseFlags(rest)
  const format = flags.format ?? "json"

  if (command !== "search") {
    writeError(`Unknown command: ${command ?? "(none)"}`, "UNKNOWN_COMMAND")
    process.exit(1)
  }

  try {
    const jobs = await searchJobs(flags)
    console.log(formatOutput(jobs, format))
  } catch (err) {
    if (err instanceof CliError) {
      writeError(err.message, err.code)
    } else {
      writeError(err instanceof Error ? err.message : String(err), "UNEXPECTED_ERROR")
    }
    process.exit(1)
  }
}

main()
```

- [ ] **Step 2: Write the CLI README**

Create `.agents/skills/adzuna-search/cli/README.md`:

````markdown
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
````

- [ ] **Step 3: Write the skill definition**

Create `.agents/skills/adzuna-search/SKILL.md`:

````markdown
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
````

- [ ] **Step 4: Live smoke test against the real Adzuna API**

Run:
```bash
cd .agents/skills/adzuna-search/cli
set -a && source ../../../../.env && set +a
bun run src/cli.ts search --what "software engineer" --where "Remote" --results-per-page 3 --format table
```
Expected: a table of 3 real job listings with `title`, `company`, `location`, `url`, etc. columns and no error output. If it prints a `{"error": ...}` JSON line instead, stop and diagnose (e.g. `MISSING_CREDENTIALS` means `.env` wasn't sourced or is empty; a 4xx from Adzuna usually means the key isn't active yet).

- [ ] **Step 5: Commit**

```bash
git add .agents/skills/adzuna-search/cli/src/cli.ts .agents/skills/adzuna-search/cli/README.md .agents/skills/adzuna-search/SKILL.md
git commit -m "feat: add adzuna-search CLI entry point and skill definition"
```

---

### Task 4: `remoteok-search` — helpers module (TDD)

**Files:**
- Create: `.agents/skills/remoteok-search/cli/package.json`
- Create: `.agents/skills/remoteok-search/cli/src/helpers.ts`
- Test: `.agents/skills/remoteok-search/cli/tests/helpers.test.ts`

**Interfaces:**
- Produces (consumed by Task 5's `cli.ts`):
  - `parseFlags`, `formatOutput`, `apiFetch`, `writeError`, `CliError` — identical signatures to Task 2 (duplicated per-skill; these skills are standalone and don't share code, matching the existing Danish-tools pattern of one self-contained CLI per skill).
  - `interface Job { id: string; title: string; company: string; tags: string[]; location: string; url: string; posted: string; salaryMin?: number; salaryMax?: number; description: string }`
  - `filterJobs(jobs: Job[], flags: Record<string, string>): Job[]`
  - `searchJobs(flags: Record<string, string>): Promise<Job[]>` — no credentials required.

- [ ] **Step 1: Create the package manifest**

```json
{
  "name": "remoteok-cli",
  "version": "1.0.0",
  "description": "CLI for the RemoteOK remote-jobs API",
  "type": "module",
  "scripts": {
    "test": "bun test"
  }
}
```

Save as `.agents/skills/remoteok-search/cli/package.json`.

- [ ] **Step 2: Write the failing tests**

Create `.agents/skills/remoteok-search/cli/tests/helpers.test.ts`:

```ts
import { describe, expect, mock, test } from "bun:test"
import { filterJobs, normalizeJob, parseFlags, formatOutput, searchJobs } from "../src/helpers"

describe("parseFlags", () => {
  test("parses --key value pairs", () => {
    expect(parseFlags(["--keyword", "python", "--tag", "backend"])).toEqual({
      keyword: "python",
      tag: "backend",
    })
  })
})

describe("formatOutput", () => {
  test("plain format renders key: value lines", () => {
    expect(formatOutput({ title: "Engineer" }, "plain")).toBe("title: Engineer")
  })
})

describe("normalizeJob", () => {
  test("maps RemoteOK's raw shape to the flat Job shape", () => {
    const raw = {
      id: "123",
      position: "Frontend Engineer",
      company: "Acme Remote",
      tags: ["react", "typescript"],
      location: "Worldwide",
      url: "https://remoteok.com/remote-jobs/123",
      date: "2026-06-01T00:00:00Z",
      salary_min: 100000,
      salary_max: 140000,
      description: "Build UI.",
    }

    expect(normalizeJob(raw)).toEqual({
      id: "123",
      title: "Frontend Engineer",
      company: "Acme Remote",
      tags: ["react", "typescript"],
      location: "Worldwide",
      url: "https://remoteok.com/remote-jobs/123",
      posted: "2026-06-01T00:00:00Z",
      salaryMin: 100000,
      salaryMax: 140000,
      description: "Build UI.",
    })
  })

  test("defaults location to Remote and description to empty string when absent", () => {
    const raw = {
      id: "124",
      position: "Backend Engineer",
      company: "Acme Remote",
      url: "https://remoteok.com/remote-jobs/124",
      date: "2026-06-01T00:00:00Z",
    }

    const job = normalizeJob(raw)
    expect(job.location).toBe("Remote")
    expect(job.description).toBe("")
    expect(job.tags).toEqual([])
  })
})

describe("filterJobs", () => {
  const jobs = [
    {
      id: "1",
      title: "Backend Engineer",
      company: "Acme",
      tags: ["python", "django"],
      location: "Remote",
      url: "https://remoteok.com/1",
      posted: "2026-06-01T00:00:00Z",
      description: "Work on our Python API.",
    },
    {
      id: "2",
      title: "Marketing Manager",
      company: "Widgets Inc",
      tags: ["marketing"],
      location: "Remote",
      url: "https://remoteok.com/2",
      posted: "2026-06-01T00:00:00Z",
      description: "Grow our brand.",
    },
  ]

  test("filters by keyword across title, company, and description", () => {
    expect(filterJobs(jobs, { keyword: "python" }).map((j) => j.id)).toEqual(["1"])
  })

  test("filters by tag", () => {
    expect(filterJobs(jobs, { tag: "marketing" }).map((j) => j.id)).toEqual(["2"])
  })

  test("returns all jobs when no filters are given", () => {
    expect(filterJobs(jobs, {}).map((j) => j.id)).toEqual(["1", "2"])
  })
})

describe("searchJobs", () => {
  test("drops the legal-notice element and sends a User-Agent header", async () => {
    let capturedInit: RequestInit | undefined
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      capturedInit = init
      return new Response(
        JSON.stringify([
          { legal: "https://remoteok.com/terms" },
          {
            id: "1",
            position: "Backend Engineer",
            company: "Acme",
            tags: ["python"],
            location: "Remote",
            url: "https://remoteok.com/1",
            date: "2026-06-01T00:00:00Z",
            description: "Work on our Python API.",
          },
        ]),
        { status: 200 }
      )
    }) as unknown as typeof fetch

    const jobs = await searchJobs({})
    expect(jobs).toHaveLength(1)
    expect(jobs[0].title).toBe("Backend Engineer")
    expect((capturedInit?.headers as Record<string, string>)["User-Agent"]).toContain("ai-job-search")
  })

  test("applies --limit after filtering", async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify([
          { legal: "https://remoteok.com/terms" },
          { id: "1", position: "A", company: "X", date: "2026-06-01T00:00:00Z", url: "https://remoteok.com/1" },
          { id: "2", position: "B", company: "X", date: "2026-06-01T00:00:00Z", url: "https://remoteok.com/2" },
        ]),
        { status: 200 }
      )
    ) as unknown as typeof fetch

    const jobs = await searchJobs({ limit: "1" })
    expect(jobs).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd .agents/skills/remoteok-search/cli && bun test`
Expected: FAIL — `Cannot find module '../src/helpers'`.

- [ ] **Step 4: Write the implementation**

Create `.agents/skills/remoteok-search/cli/src/helpers.ts`:

```ts
export class CliError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

export async function apiFetch<T>(
  url: string,
  init?: RequestInit,
  options?: { maxRetries?: number; baseDelayMs?: number }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 6
  let delay = options?.baseDelayMs ?? 500

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, init)

    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((resolve) => setTimeout(resolve, delay + jitter))
      delay = Math.min(delay * 2, 5000)
      continue
    }

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`)
    }

    return response.json() as Promise<T>
  }

  throw new Error("API request failed after max retries")
}

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

export function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith("--")) {
      const key = arg.slice(2)
      const next = args[i + 1]
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next
        i++
      } else {
        flags[key] = "true"
      }
    }
  }
  return flags
}

export function formatOutput(data: unknown, format: string): string {
  if (format === "json") return JSON.stringify(data, null, 2)
  if (format === "table") return formatTable(data)
  if (format === "plain") return formatPlain(data)
  throw new Error(`Unknown format: ${format}`)
}

function asRows(data: unknown): Array<Record<string, unknown>> {
  return (Array.isArray(data) ? data : [data]) as Array<Record<string, unknown>>
}

function formatTable(data: unknown): string {
  const rows = asRows(data)
  if (rows.length === 0) return "(no results)"
  const columns = Object.keys(rows[0])
  const widths = columns.map((col) => Math.max(col.length, ...rows.map((row) => String(row[col] ?? "").length)))
  const headerLine = columns.map((col, i) => col.padEnd(widths[i])).join("  ")
  const separator = widths.map((w) => "-".repeat(w)).join("  ")
  const dataLines = rows.map((row) => columns.map((col, i) => String(row[col] ?? "").padEnd(widths[i])).join("  "))
  return [headerLine, separator, ...dataLines].join("\n")
}

function formatPlain(data: unknown): string {
  const rows = asRows(data)
  return rows.map((row) => Object.entries(row).map(([key, value]) => `${key}: ${value}`).join("\n")).join("\n\n")
}

export interface Job {
  id: string
  title: string
  company: string
  tags: string[]
  location: string
  url: string
  posted: string
  salaryMin?: number
  salaryMax?: number
  description: string
}

interface RemoteOkRawJob {
  id: string
  position: string
  company: string
  tags?: string[]
  location?: string
  url: string
  date: string
  salary_min?: number
  salary_max?: number
  description?: string
}

const USER_AGENT = "Mozilla/5.0 (compatible; ai-job-search-remoteok-cli/1.0)"

export function normalizeJob(raw: RemoteOkRawJob): Job {
  return {
    id: raw.id,
    title: raw.position,
    company: raw.company,
    tags: raw.tags ?? [],
    location: raw.location ?? "Remote",
    url: raw.url,
    posted: raw.date,
    salaryMin: raw.salary_min,
    salaryMax: raw.salary_max,
    description: raw.description ?? "",
  }
}

export function filterJobs(jobs: Job[], flags: Record<string, string>): Job[] {
  let results = jobs

  if (flags.keyword) {
    const needle = flags.keyword.toLowerCase()
    results = results.filter(
      (job) =>
        job.title.toLowerCase().includes(needle) ||
        job.company.toLowerCase().includes(needle) ||
        job.description.toLowerCase().includes(needle)
    )
  }

  if (flags.tag) {
    const tag = flags.tag.toLowerCase()
    results = results.filter((job) => job.tags.some((t) => t.toLowerCase() === tag))
  }

  return results
}

// RemoteOK's API returns a metadata/legal-notice object as the first array
// element (it has no `id` field). Filtering on the presence of `id` — rather
// than slicing off index 0 — keeps this working if the API ever reorders or
// adds more non-job entries.
export async function searchJobs(flags: Record<string, string>): Promise<Job[]> {
  const raw = await apiFetch<unknown[]>("https://remoteok.com/api", {
    headers: { "User-Agent": USER_AGENT },
  })

  const jobs = raw
    .filter((entry): entry is RemoteOkRawJob => typeof entry === "object" && entry !== null && "id" in entry)
    .map(normalizeJob)

  const filtered = filterJobs(jobs, flags)
  const limit = flags.limit ? Number(flags.limit) : undefined
  return limit !== undefined ? filtered.slice(0, limit) : filtered
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd .agents/skills/remoteok-search/cli && bun test`
Expected: PASS — all tests in `tests/helpers.test.ts` green, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add .agents/skills/remoteok-search/cli/package.json .agents/skills/remoteok-search/cli/src/helpers.ts .agents/skills/remoteok-search/cli/tests/helpers.test.ts
git commit -m "feat: add remoteok-search CLI helpers with tests"
```

---

### Task 5: `remoteok-search` — entry point, skill docs, live smoke test

**Files:**
- Create: `.agents/skills/remoteok-search/cli/src/cli.ts`
- Create: `.agents/skills/remoteok-search/cli/README.md`
- Create: `.agents/skills/remoteok-search/SKILL.md`

**Interfaces:**
- Consumes from Task 4's `helpers.ts`: `formatOutput`, `parseFlags`, `searchJobs`, `writeError`.
- Produces: a runnable CLI at `bun run .agents/skills/remoteok-search/cli/src/cli.ts search [flags]`.

- [ ] **Step 1: Write the CLI entry point**

Create `.agents/skills/remoteok-search/cli/src/cli.ts`:

```ts
#!/usr/bin/env bun
import { formatOutput, parseFlags, searchJobs, writeError } from "./helpers"

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)
  const flags = parseFlags(rest)
  const format = flags.format ?? "json"

  if (command !== "search") {
    writeError(`Unknown command: ${command ?? "(none)"}`, "UNKNOWN_COMMAND")
    process.exit(1)
  }

  try {
    const jobs = await searchJobs(flags)
    console.log(formatOutput(jobs, format))
  } catch (err) {
    writeError(err instanceof Error ? err.message : String(err), "UNEXPECTED_ERROR")
    process.exit(1)
  }
}

main()
```

- [ ] **Step 2: Write the CLI README**

Create `.agents/skills/remoteok-search/cli/README.md`:

````markdown
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
````

- [ ] **Step 3: Write the skill definition**

Create `.agents/skills/remoteok-search/SKILL.md`:

````markdown
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
````

- [ ] **Step 4: Live smoke test against the real RemoteOK API**

Run:
```bash
cd .agents/skills/remoteok-search/cli
bun run src/cli.ts search --tag python --limit 3 --format table
```
Expected: a table of up to 3 real remote job listings with `title`, `company`, `tags`, `url`,
etc. columns and no error output. If it prints a `403`-related error, verify the `User-Agent`
header is actually being sent (re-check `searchJobs` in `helpers.ts`).

- [ ] **Step 5: Commit**

```bash
git add .agents/skills/remoteok-search/cli/src/cli.ts .agents/skills/remoteok-search/cli/README.md .agents/skills/remoteok-search/SKILL.md
git commit -m "feat: add remoteok-search CLI entry point and skill definition"
```

---

### Task 6: Remove Danish job search skills and update docs

**Files:**
- Delete: `.agents/skills/jobbank-search/`, `.agents/skills/jobdanmark-search/`, `.agents/skills/jobindex-search/`, `.agents/skills/jobnet-search/`
- Modify: `README.md`
- Modify: `SETUP.md`

**Interfaces:** None — this is a deletion + documentation task with no code dependencies from other tasks. Must run last (both replacement skills already live-verified in Tasks 3 and 5).

- [ ] **Step 1: Delete the four Danish skill directories**

```bash
rm -rf .agents/skills/jobbank-search .agents/skills/jobdanmark-search .agents/skills/jobindex-search .agents/skills/jobnet-search
```

- [ ] **Step 2: Verify only the two US skills remain**

Run: `ls .agents/skills/`
Expected: exactly `adzuna-search` and `remoteok-search`.

- [ ] **Step 3: Update `README.md` — "What this is" section**

Find this line:
```
A structured workflow that turns Claude Code into a full-stack job application assistant. The core workflow (self-profiling, fit evaluation, and the drafter-reviewer application pipeline) is **language- and country-agnostic**. The job portal search skills are built for the Danish market (Jobindex, Jobnet, Akademikernes Jobbank, etc.), but the pattern is designed to be swapped for your local job boards.
```

Replace with:
```
A structured workflow that turns Claude Code into a full-stack job application assistant. The core workflow (self-profiling, fit evaluation, and the drafter-reviewer application pipeline) is **language- and country-agnostic**. The job portal search skills included are built for the US market (Adzuna, RemoteOK), but the pattern is designed to be swapped for your local job boards.
```

- [ ] **Step 4: Update `README.md` — Prerequisites**

Find:
```
- [Bun](https://bun.sh) (for Danish job search CLI tools)
```

Replace with:
```
- [Bun](https://bun.sh) (for job search CLI tools)
```

- [ ] **Step 5: Update `README.md` — Quick start step 2**

Find:
````
### 2. Install job search tools

```bash
cd .agents/skills/jobbank-search/cli && bun install && cd ../../../..
cd .agents/skills/jobdanmark-search/cli && bun install && cd ../../../..
cd .agents/skills/jobindex-search/cli && bun install && cd ../../../..
cd .agents/skills/jobnet-search/cli && bun install && cd ../../../..
```
````

Replace with:
````
### 2. Set up job search tools

Both `adzuna-search` and `remoteok-search` are dependency-free — no `bun install` needed.
`adzuna-search` needs a free API key:

```bash
cp .env.example .env
# Register at https://developer.adzuna.com, then fill in .env:
#   ADZUNA_APP_ID=...
#   ADZUNA_APP_KEY=...
```

`remoteok-search` works immediately with no signup.
````

- [ ] **Step 6: Update `README.md` — Quick start step 5 example URL**

Find:
```
/apply https://jobindex.dk/job/1234567
```

Replace with:
```
/apply https://www.indeed.com/viewjob?jk=1234567
```

- [ ] **Step 7: Update `README.md` — file structure tree**

Find:
```
├── .agents/skills/                    # Job portal CLI tools (Denmark)
│   ├── jobbank-search/                # Akademikernes Jobbank
│   ├── jobdanmark-search/             # Jobdanmark.dk
│   ├── jobindex-search/               # Jobindex.dk
│   └── jobnet-search/                 # Jobnet.dk (government portal)
```

Replace with:
```
├── .agents/skills/                    # Job portal CLI tools (US)
│   ├── adzuna-search/                 # Adzuna job aggregator (broad US private-sector)
│   └── remoteok-search/               # RemoteOK (remote-first tech jobs)
```

- [ ] **Step 8: Update `README.md` — "Job search tools" customization section**

Find:
```
### Job search tools

The four CLI tools in `.agents/skills/` are specific to the **Danish job market** (Jobbank, Jobdanmark, Jobindex, Jobnet). They demonstrate the pattern for building job portal integrations. If you're in a different country, you can build equivalent tools for your local job portals using the same structure.
```

Replace with:
```
### Job search tools

The two CLI tools in `.agents/skills/` target the **US job market**: `adzuna-search` (broad
private-sector aggregator, needs a free API key) and `remoteok-search` (remote-first tech
jobs, no auth). They demonstrate the pattern for building job portal integrations. If you're
in a different country or want another US board, you can build equivalent tools for your
local job portals using the same structure — see
`docs/superpowers/specs/2026-07-08-us-job-board-search-skills-design.md` for the design
rationale.
```

- [ ] **Step 9: Update `SETUP.md` — Bun prerequisite**

Find:
```
### Bun (for job search tools)

The Danish job portal CLIs are written in TypeScript and run with Bun:
```

Replace with:
```
### Bun (for job search tools)

The job portal CLIs are written in TypeScript and run with Bun:
```

- [ ] **Step 10: Update `SETUP.md` — install step**

Find:
````
## 3. Install job search CLI dependencies

```bash
for tool in jobbank-search jobdanmark-search jobindex-search jobnet-search; do
  cd .agents/skills/$tool/cli && bun install && cd ../../../..
done
```
````

Replace with:
````
## 3. Set up job search tools

Both CLIs are dependency-free — no `bun install` needed. `adzuna-search` needs a free API key:

```bash
cp .env.example .env
# Register at https://developer.adzuna.com, then fill in .env:
#   ADZUNA_APP_ID=...
#   ADZUNA_APP_KEY=...
```

`remoteok-search` works immediately with no signup.
````

- [ ] **Step 11: Update `SETUP.md` — example apply URL**

Find:
```
/apply https://jobindex.dk/job/1234567
```

Replace with:
```
/apply https://www.indeed.com/viewjob?jk=1234567
```

- [ ] **Step 12: Verify no stale references remain**

Run: `grep -rn "Danish\|jobbank-search\|jobdanmark-search\|jobindex-search\|jobnet-search" README.md SETUP.md CLAUDE.md`
Expected: no output.

- [ ] **Step 13: Commit**

```bash
git add -A .agents README.md SETUP.md
git commit -m "chore: remove Danish job search skills, document US job search setup"
```

---

## Post-plan verification

- [ ] `cd .agents/skills/adzuna-search/cli && bun test` passes
- [ ] `cd .agents/skills/remoteok-search/cli && bun test` passes
- [ ] `ls .agents/skills/` shows only `adzuna-search` and `remoteok-search`
- [ ] `grep -rn "Danish\|jobbank\|jobdanmark\|jobindex\|jobnet" README.md SETUP.md` returns nothing
- [ ] `.env` still holds real credentials and is still gitignored (`git check-ignore .env`)
