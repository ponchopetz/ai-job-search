import { CliError, searchJobs, writeError, type Job, type SearchParams } from "../helpers.js"

export interface SearchOpts extends SearchParams {
  format: "json" | "table" | "plain"
}

// Jooble IDs are 19-20 char signed integers (e.g. "-6073774550394611867"), unlike the
// ~10-digit IDs other portal skills' tables were sized for — confirmed live.
const ID_WIDTH = 20

function renderTable(jobs: Job[]): string {
  if (jobs.length === 0) return "No results."
  const rows = jobs.map((j) => {
    const title = j.title.slice(0, 42).padEnd(42)
    const company = (j.company || "—").slice(0, 26).padEnd(26)
    const loc = (j.location || "—").slice(0, 20).padEnd(20)
    const date = (j.date || "—").slice(0, 10)
    return `${j.id.padEnd(ID_WIDTH)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(ID_WIDTH) +
    " " +
    "TITLE".padEnd(42) +
    " " +
    "COMPANY".padEnd(26) +
    " " +
    "LOCATION".padEnd(20) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const { jobs, totalCount } = await searchJobs(opts)

    if (opts.format === "table") {
      process.stdout.write(renderTable(jobs) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        jobs
          .map(
            (j) =>
              `${j.title}\n  ${j.company || "—"} · ${j.location || "—"} · ${j.date || "—"}\n  id: ${j.id}\n  ${j.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: jobs.length, page: opts.page, totalCount }, results: jobs }, null, 2) + "\n",
      )
    }
    return 0
  } catch (e) {
    if (e instanceof CliError) {
      writeError(e.message, e.code)
    } else {
      writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    }
    return 1
  }
}
