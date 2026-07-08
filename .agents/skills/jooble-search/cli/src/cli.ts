#!/usr/bin/env bun
// Self-contained CLI for searching jobs on the Jooble aggregator API
// (https://jooble.org/api/<key>), for the US job market (and remote). No external
// CLI framework, so it runs anywhere `bun` is available with zero install beyond
// the repo clone (plus a free JOOBLE_API_KEY — see SKILL.md Setup).

import { runSearch, type SearchOpts } from "./commands/search.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `jooble-cli — search jobs on Jooble (US job market, plus remote)

USAGE
  bun run src/cli.ts search --location "<city, ST>" [flags]

SEARCH FLAGS
  --location, -l <text>   Location to search. REQUIRED. e.g. "New York, NY",
                          "Austin, TX", or "Remote".
  --query, -q <text>      Keywords (job title, skill, or role). Maps to Jooble's
                          "keywords" parameter server-side.
  --jobage <days>         Posted within N days (client-side filter). Default: all.
  --salary <amount>       Minimum salary threshold (server-side).
  --radius <km>           Search radius in km: 0, 4, 8, 16, 26, 40, 80.
  --page <n>              1-indexed page. Default 1.
  --limit, -n <n>         Results per page (maps to Jooble's ResultOnPage). Default 20.
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "software engineer" -l "New York, NY" --jobage 14 --format table
  bun run src/cli.ts search -q "data analyst" -l "Austin, TX" --salary 80000 --format table
  bun run src/cli.ts search -l "Remote" --format table

Requires a free JOOBLE_API_KEY in the repo-root .env — register at https://jooble.org/api/about
`

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd === "search") {
    const location = typeof flags.location === "string" ? flags.location : undefined
    if (!location) {
      process.stderr.write(
        JSON.stringify({
          error: 'the --location/-l flag is required (e.g. -l "New York, NY", -l "Austin, TX", or -l "Remote")',
          code: "NO_LOCATION",
        }) + "\n",
      )
      return 1
    }
    const fmt = (flags.format as string) || "json"

    const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
      const val = parseInt(raw as string, 10)
      if (isNaN(val)) {
        process.stderr.write(JSON.stringify({ error: `--${name} must be a number, got "${raw}"`, code: "BAD_ARG" }) + "\n")
        return null
      }
      return val
    }

    if (flags.jobage !== undefined) {
      const v = parseIntFlag("jobage", flags.jobage)
      if (v === null) return 1
      flags.jobage = String(v)
    }
    if (flags.salary !== undefined) {
      const v = parseIntFlag("salary", flags.salary)
      if (v === null) return 1
      flags.salary = String(v)
    }
    if (flags.page !== undefined) {
      const v = parseIntFlag("page", flags.page)
      if (v === null) return 1
      flags.page = String(v)
    }
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      flags.limit = String(v)
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location,
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : 9999,
      salary: flags.salary ? parseInt(flags.salary as string, 10) : undefined,
      radius: typeof flags.radius === "string" ? flags.radius : undefined,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : 20,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main().then((code) => process.exit(code))
