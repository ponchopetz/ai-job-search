// Data source: Jooble REST API (POST https://jooble.org/api/<key>). Requires a free
// key from https://jooble.org/api/about, read from JOOBLE_API_KEY. Shapes here come
// from Jooble's published docs and have NOT been live-verified — see ../url-reference.md
// for the exact gaps to confirm on first real run.

export class CliError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

/** POST JSON with exponential backoff on 429/5xx. */
export async function apiFetch<T>(
  url: string,
  body: unknown,
  options?: { maxRetries?: number; baseDelayMs?: number },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 6
  let delay = options?.baseDelayMs ?? 500

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((resolve) => setTimeout(resolve, delay + jitter))
      delay = Math.min(delay * 2, 5000)
      continue
    }

    if (response.status === 403) {
      throw new CliError("Access denied - invalid JOOBLE_API_KEY", "INVALID_CREDENTIALS")
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => "")
      throw new Error(`API request failed: ${response.status} ${response.statusText}${errBody ? ` - ${errBody}` : ""}`)
    }

    // Jooble job IDs are 19-digit integers that exceed Number.MAX_SAFE_INTEGER —
    // response.json() silently rounds them (confirmed live: 8433364895618047713
    // parsed as 8433364895618048000). Quote the bare numeric `id` token before
    // parsing so it survives as an exact string instead of a lossy JS number.
    const text = await response.text()
    const safe = text.replace(/"id":(-?\d+)/g, '"id":"$1"')
    return JSON.parse(safe) as T
  }

  throw new Error("API request failed after max retries")
}

export interface JoobleRawJob {
  id: string
  title: string
  location: string
  snippet: string
  salary?: string
  source?: string
  type?: string
  link: string
  company: string
  updated?: string
}

export interface JoobleResponse {
  totalCount: number
  jobs: JoobleRawJob[]
}

export interface Job {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  salary: string | null
  type: string | null
  description: string | null
}

export function normalizeJob(raw: JoobleRawJob): Job {
  return {
    id: raw.id,
    title: raw.title,
    company: raw.company ?? null,
    location: raw.location ?? null,
    date: raw.updated ?? null,
    url: raw.link,
    salary: raw.salary ?? null,
    type: raw.type ?? null,
    description: raw.snippet ?? null,
  }
}

/** True if `date` (ISO-ish timestamp) is within `days` of now. `days` <= 0 or >= 9999 means unfiltered. */
export function withinJobAge(date: string | null, days: number): boolean {
  if (!days || days <= 0 || days >= 9999) return true
  if (!date) return false
  const posted = new Date(date).getTime()
  if (isNaN(posted)) return false
  const cutoff = Date.now() - days * 86400000
  return posted >= cutoff
}

export interface SearchParams {
  query?: string
  location: string
  jobage: number
  salary?: number
  radius?: string
  page: number
  limit?: number
}

export async function searchJobs(params: SearchParams): Promise<{ jobs: Job[]; totalCount: number }> {
  const apiKey = process.env.JOOBLE_API_KEY
  if (!apiKey) {
    throw new CliError("Missing JOOBLE_API_KEY - register at https://jooble.org/api/about", "MISSING_CREDENTIALS")
  }

  const body: Record<string, unknown> = {
    keywords: params.query ?? "",
    location: params.location,
    page: params.page,
  }
  if (params.salary !== undefined) body.salary = params.salary
  if (params.radius !== undefined) body.radius = params.radius
  if (params.limit !== undefined) body.ResultOnPage = params.limit

  const data = await apiFetch<JoobleResponse>(`https://jooble.org/api/${apiKey}`, body)
  const jobs = (data.jobs ?? [])
    .map(normalizeJob)
    .filter((job) => withinJobAge(job.date, params.jobage))
  const limited = params.limit !== undefined ? jobs.slice(0, params.limit) : jobs
  return { jobs: limited, totalCount: data.totalCount }
}
