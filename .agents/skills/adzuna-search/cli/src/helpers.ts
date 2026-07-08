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
