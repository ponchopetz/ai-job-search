// Data source: The Muse public Jobs API (https://www.themuse.com/api/public/jobs).
// No authentication required (500 req/hr unregistered — plenty for personal search).
// Requests without a browser User-Agent get a 403 ("unexpected headers"), so every
// request sends one. See ../url-reference.md for endpoint details and quirks.

export const JOBS_URL = "https://www.themuse.com/api/public/jobs"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

/** Fetch JSON with exponential backoff on 429/5xx. Returns null on a 404. */
export async function jsonFetch<T>(url: string): Promise<T | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
      },
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return null
    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new Error(`Request failed: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`)
    }
    return (await response.json()) as T
  }
  throw new Error("Request failed after max retries")
}

export interface MuseJob {
  id: number
  name: string
  contents: string
  publication_date: string
  locations: { name: string }[]
  categories: { name: string }[]
  levels: { name: string; short_name?: string }[]
  company: { name: string; short_name: string }
  refs: { landing_page: string }
}

export interface MuseJobsResponse {
  page: number
  page_count: number
  total: number
  results: MuseJob[]
}

export interface Job {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  level: string | null
}

export interface JobDetail extends Job {
  description: string | null
  categories: string[]
}

export function normalizeJob(j: MuseJob): Job {
  return {
    id: String(j.id),
    title: j.name,
    company: j.company?.name ?? null,
    location: j.locations?.[0]?.name ?? null,
    date: j.publication_date ?? null,
    url: j.refs?.landing_page || `https://www.themuse.com/jobs/${j.id}`,
    level: j.levels?.[0]?.name ?? null,
  }
}

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not
 * `fromCharCode`) so supplementary-plane code points (e.g. emoji, U+1F600)
 * decode correctly, and drops out-of-range values instead of throwing.
 */
function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

/** Strip HTML from a job's `contents` field, keeping paragraph breaks as newlines. */
export function cleanDescription(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  return decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, ""))
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** True if every word in `query` appears in `title`, case-insensitive. */
export function titleMatches(title: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = title.toLowerCase()
  return words.every((w) => haystack.includes(w))
}

/** True if `date` (ISO timestamp) is within `days` of now. `days` <= 0 or >= 9999 means unfiltered. */
export function withinJobAge(date: string | null, days: number): boolean {
  if (!days || days <= 0 || days >= 9999) return true
  if (!date) return false
  const posted = new Date(date).getTime()
  if (isNaN(posted)) return false
  const cutoff = Date.now() - days * 86400000
  return posted >= cutoff
}
