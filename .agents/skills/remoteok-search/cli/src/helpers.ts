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
