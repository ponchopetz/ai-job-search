#!/usr/bin/env bun
// Self-contained CLI for searching jobs on The Muse's public Jobs API
// (https://www.themuse.com/api/public/jobs), for the US job market (and remote).
// No external CLI framework, so it runs anywhere `bun` is available with zero
// install beyond the repo clone.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

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

const HELP = `themuse-cli — search jobs on The Muse (US job market, plus remote)

USAGE
  bun run src/cli.ts search --location "<city, ST>" [flags]
  bun run src/cli.ts detail <id> [--format json|plain]

SEARCH FLAGS
  --location, -l <text>   Location to search. REQUIRED. e.g. "New York, NY",
                          "Seattle, WA", "Austin, TX", "Boston, MA", "Chicago, IL",
                          or "Flexible / Remote".
  --query, -q <text>      Keywords matched against job titles (client-side —
                          Muse's API has no free-text search param). Recommended.
  --jobage <days>         Posted within N days. Default: all.
  --page <n>              1-indexed page (20 results/page upstream). Default 1.
  --limit, -n <n>         Cap results emitted. Default 20.
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "software engineer" -l "New York, NY" --jobage 14 --format table
  bun run src/cli.ts search -q "data analyst" -l "Austin, TX" --format table
  bun run src/cli.ts search -l "Flexible / Remote" --format table
  bun run src/cli.ts detail 21370777 --format plain
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
          error: 'the --location/-l flag is required (e.g. -l "New York, NY", -l "Austin, TX", or -l "Flexible / Remote")',
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
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(JSON.stringify({ error: "detail requires an <id>", code: "NO_ID" }) + "\n")
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main().then((code) => process.exit(code))
