import { afterEach, describe, test, expect } from "bun:test";
import { CliError, normalizeJob, searchJobs, withinJobAge, type JoobleRawJob } from "../src/helpers";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.JOOBLE_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.JOOBLE_API_KEY;
  else process.env.JOOBLE_API_KEY = originalApiKey;
});

describe("normalizeJob", () => {
  function rawJob(overrides: Partial<JoobleRawJob> = {}): JoobleRawJob {
    return {
      id: "123",
      title: "Software Engineer",
      location: "New York, NY",
      snippet: "Great role...",
      salary: "$100,000 - $130,000",
      source: "example.com",
      type: "Full-time",
      link: "https://jooble.org/desc/123",
      company: "Acme",
      updated: "2026-01-01T00:00:00Z",
      ...overrides,
    };
  }

  test("maps every field to the shared Job shape", () => {
    expect(normalizeJob(rawJob())).toEqual({
      id: "123",
      title: "Software Engineer",
      company: "Acme",
      location: "New York, NY",
      date: "2026-01-01T00:00:00Z",
      url: "https://jooble.org/desc/123",
      salary: "$100,000 - $130,000",
      type: "Full-time",
      description: "Great role...",
    });
  });

  test("falls back to null for optional fields when absent", () => {
    const job = normalizeJob(rawJob({ salary: undefined, type: undefined, updated: undefined }));
    expect(job.salary).toBeNull();
    expect(job.type).toBeNull();
    expect(job.date).toBeNull();
  });
});

describe("withinJobAge", () => {
  const now = Date.now();
  const daysAgo = (n: number) => new Date(now - n * 86400000).toISOString();

  test("9999 (default sentinel) means unfiltered", () => {
    expect(withinJobAge(daysAgo(400), 9999)).toBe(true);
  });

  test("0 or negative means unfiltered", () => {
    expect(withinJobAge(daysAgo(400), 0)).toBe(true);
    expect(withinJobAge(daysAgo(400), -5)).toBe(true);
  });

  test("a post within the window passes", () => {
    expect(withinJobAge(daysAgo(3), 7)).toBe(true);
  });

  test("a post older than the window fails", () => {
    expect(withinJobAge(daysAgo(30), 7)).toBe(false);
  });

  test("a null date fails a real filter", () => {
    expect(withinJobAge(null, 7)).toBe(false);
  });
});

describe("searchJobs credentials", () => {
  test("throws MISSING_CREDENTIALS when JOOBLE_API_KEY is unset", async () => {
    delete process.env.JOOBLE_API_KEY;
    await expect(
      searchJobs({ location: "New York, NY", jobage: 9999, page: 1 }),
    ).rejects.toThrow(CliError);
    try {
      await searchJobs({ location: "New York, NY", jobage: 9999, page: 1 });
    } catch (e) {
      expect((e as CliError).code).toBe("MISSING_CREDENTIALS");
    }
  });
});

describe("searchJobs with a mocked API response", () => {
  test("normalizes jobs and applies the client-side jobage filter", async () => {
    process.env.JOOBLE_API_KEY = "fake-key-for-testing";
    const now = new Date().toISOString();
    const old = new Date(Date.now() - 60 * 86400000).toISOString();

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          totalCount: 2,
          jobs: [
            { id: "1", title: "Recent Job", location: "New York, NY", snippet: "", link: "https://x/1", company: "A", updated: now },
            { id: "2", title: "Old Job", location: "New York, NY", snippet: "", link: "https://x/2", company: "B", updated: old },
          ],
        }),
      )) as typeof fetch;

    const { jobs, totalCount } = await searchJobs({
      location: "New York, NY",
      jobage: 7,
      page: 1,
    });

    expect(totalCount).toBe(2);
    expect(jobs.map((j) => j.title)).toEqual(["Recent Job"]);
  });

  test("preserves 19-digit job IDs exactly instead of rounding via JS number precision", async () => {
    process.env.JOOBLE_API_KEY = "fake-key-for-testing";
    const bigId = "8433364895618047713"; // exceeds Number.MAX_SAFE_INTEGER (2^53-1)
    // Raw text with an unquoted numeric id token, exactly as Jooble's API returns it —
    // NOT built via JSON.stringify(), since that would already have rounded the number.
    const rawText = `{"totalCount":1,"jobs":[{"id":${bigId},"title":"Engineer","location":"New York, NY","snippet":"","link":"https://jooble.org/jdp/${bigId}","company":"Acme"}]}`;

    globalThis.fetch = (async () => new Response(rawText)) as typeof fetch;

    const { jobs } = await searchJobs({ location: "New York, NY", jobage: 9999, page: 1 });
    expect(jobs[0].id).toBe(bigId);
    expect(typeof jobs[0].id).toBe("string");
  });

  test("a 403 response throws CliError with INVALID_CREDENTIALS", async () => {
    process.env.JOOBLE_API_KEY = "fake-key-for-testing";
    globalThis.fetch = (async () => new Response("", { status: 403 })) as typeof fetch;

    await expect(searchJobs({ location: "New York, NY", jobage: 9999, page: 1 })).rejects.toThrow(CliError);
  });
});
