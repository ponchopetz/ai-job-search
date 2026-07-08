import { describe, expect, mock, test } from "bun:test"
import { filterJobs, normalizeJob, parseFlags, formatOutput, searchJobs } from "../src/helpers"

describe("parseFlags", () => {
  test("parses --key value pairs", () => {
    expect(parseFlags(["--keyword", "python", "--tag", "backend"])).toEqual({
      keyword: "python",
      tag: "backend",
    })
  })
})

describe("formatOutput", () => {
  test("plain format renders key: value lines", () => {
    expect(formatOutput({ title: "Engineer" }, "plain")).toBe("title: Engineer")
  })
})

describe("normalizeJob", () => {
  test("maps RemoteOK's raw shape to the flat Job shape", () => {
    const raw = {
      id: "123",
      position: "Frontend Engineer",
      company: "Acme Remote",
      tags: ["react", "typescript"],
      location: "Worldwide",
      url: "https://remoteok.com/remote-jobs/123",
      date: "2026-06-01T00:00:00Z",
      salary_min: 100000,
      salary_max: 140000,
      description: "Build UI.",
    }

    expect(normalizeJob(raw)).toEqual({
      id: "123",
      title: "Frontend Engineer",
      company: "Acme Remote",
      tags: ["react", "typescript"],
      location: "Worldwide",
      url: "https://remoteok.com/remote-jobs/123",
      posted: "2026-06-01T00:00:00Z",
      salaryMin: 100000,
      salaryMax: 140000,
      description: "Build UI.",
    })
  })

  test("defaults location to Remote and description to empty string when absent", () => {
    const raw = {
      id: "124",
      position: "Backend Engineer",
      company: "Acme Remote",
      url: "https://remoteok.com/remote-jobs/124",
      date: "2026-06-01T00:00:00Z",
    }

    const job = normalizeJob(raw)
    expect(job.location).toBe("Remote")
    expect(job.description).toBe("")
    expect(job.tags).toEqual([])
  })
})

describe("filterJobs", () => {
  const jobs = [
    {
      id: "1",
      title: "Backend Engineer",
      company: "Acme",
      tags: ["python", "django"],
      location: "Remote",
      url: "https://remoteok.com/1",
      posted: "2026-06-01T00:00:00Z",
      description: "Work on our Python API.",
    },
    {
      id: "2",
      title: "Marketing Manager",
      company: "Widgets Inc",
      tags: ["marketing"],
      location: "Remote",
      url: "https://remoteok.com/2",
      posted: "2026-06-01T00:00:00Z",
      description: "Grow our brand.",
    },
  ]

  test("filters by keyword across title, company, and description", () => {
    expect(filterJobs(jobs, { keyword: "python" }).map((j) => j.id)).toEqual(["1"])
  })

  test("filters by tag", () => {
    expect(filterJobs(jobs, { tag: "marketing" }).map((j) => j.id)).toEqual(["2"])
  })

  test("returns all jobs when no filters are given", () => {
    expect(filterJobs(jobs, {}).map((j) => j.id)).toEqual(["1", "2"])
  })
})

describe("searchJobs", () => {
  test("drops the legal-notice element and sends a User-Agent header", async () => {
    let capturedInit: RequestInit | undefined
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      capturedInit = init
      return new Response(
        JSON.stringify([
          { legal: "https://remoteok.com/terms" },
          {
            id: "1",
            position: "Backend Engineer",
            company: "Acme",
            tags: ["python"],
            location: "Remote",
            url: "https://remoteok.com/1",
            date: "2026-06-01T00:00:00Z",
            description: "Work on our Python API.",
          },
        ]),
        { status: 200 }
      )
    }) as unknown as typeof fetch

    const jobs = await searchJobs({})
    expect(jobs).toHaveLength(1)
    expect(jobs[0].title).toBe("Backend Engineer")
    expect((capturedInit?.headers as Record<string, string>)["User-Agent"]).toContain("ai-job-search")
  })

  test("applies --limit after filtering", async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify([
          { legal: "https://remoteok.com/terms" },
          { id: "1", position: "A", company: "X", date: "2026-06-01T00:00:00Z", url: "https://remoteok.com/1" },
          { id: "2", position: "B", company: "X", date: "2026-06-01T00:00:00Z", url: "https://remoteok.com/2" },
        ]),
        { status: 200 }
      )
    ) as unknown as typeof fetch

    const jobs = await searchJobs({ limit: "1" })
    expect(jobs).toHaveLength(1)
  })
})
