import {
  JOBS_URL,
  jsonFetch,
  normalizeJob,
  titleMatches,
  withinJobAge,
  writeError,
  type Job,
  type MuseJobsResponse,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location: string
  jobage: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

// Cap on how many pages a --query scan will fetch before giving up (see
// url-reference.md "No free-text keyword parameter" for why scanning exists).
const SCAN_MAX_PAGES = 25

function buildUrl(location: string, page: number): string {
  const params = new URLSearchParams()
  params.set("page", String(page))
  if (location) params.set("location", location)
  return `${JOBS_URL}?${params.toString()}`
}

function renderTable(jobs: Job[]): string {
  if (jobs.length === 0) return "No results."
  const rows = jobs.map((j) => {
    const title = j.title.slice(0, 42).padEnd(42)
    const company = (j.company || "—").slice(0, 26).padEnd(26)
    const loc = (j.location || "—").slice(0, 20).padEnd(20)
    const date = (j.date || "—").slice(0, 10)
    return `${j.id.padEnd(11)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(11) + " " + "TITLE".padEnd(42) + " " + "COMPANY".padEnd(26) + " " + "LOCATION".padEnd(20) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const wantLimit = opts.limit ?? 20
    const jobs: Job[] = []

    if (!opts.query) {
      // No keyword filter: one page maps 1:1 to Muse's own pagination.
      const data = await jsonFetch<MuseJobsResponse>(buildUrl(opts.location, opts.page))
      for (const r of data?.results ?? []) {
        const job = normalizeJob(r)
        if (withinJobAge(job.date, opts.jobage)) jobs.push(job)
      }
    } else {
      // Scan forward from --page, filtering titles client-side, until we have
      // enough matches or hit the scan cap.
      for (let i = 0; i < SCAN_MAX_PAGES && jobs.length < wantLimit; i++) {
        const page = opts.page + i
        const data = await jsonFetch<MuseJobsResponse>(buildUrl(opts.location, page))
        if (!data || data.results.length === 0) break
        for (const r of data.results) {
          const job = normalizeJob(r)
          if (titleMatches(job.title, opts.query) && withinJobAge(job.date, opts.jobage)) {
            jobs.push(job)
            if (jobs.length >= wantLimit) break
          }
        }
        if (page >= data.page_count) break
      }
    }

    const results = jobs.slice(0, wantLimit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(results) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        results
          .map(
            (j) =>
              `${j.title}\n  ${j.company || "—"} · ${j.location || "—"} · ${j.date || "—"}\n  id: ${j.id}\n  ${j.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: results.length, page: opts.page }, results }, null, 2) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
