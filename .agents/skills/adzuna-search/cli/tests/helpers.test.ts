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
