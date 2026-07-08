#!/usr/bin/env bun
import { CliError, formatOutput, parseFlags, searchJobs, writeError } from "./helpers"

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)
  const flags = parseFlags(rest)
  const format = flags.format ?? "json"

  if (command !== "search") {
    writeError(`Unknown command: ${command ?? "(none)"}`, "UNKNOWN_COMMAND")
    process.exit(1)
    return
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
