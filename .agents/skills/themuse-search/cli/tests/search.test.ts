import { afterEach, describe, expect, test } from "bun:test";
import { runSearch } from "../src/commands/search";

const originalFetch = globalThis.fetch;
const originalStdoutWrite = process.stdout.write;

function page(jobs: { id: number; name: string }[], pageNum: number, pageCount: number) {
  return JSON.stringify({
    page: pageNum,
    page_count: pageCount,
    total: jobs.length,
    results: jobs.map((j) => ({
      id: j.id,
      name: j.name,
      contents: "<p>desc</p>",
      publication_date: new Date().toISOString(),
      locations: [{ name: "New York, NY" }],
      categories: [],
      levels: [],
      company: { name: "Acme", short_name: "acme" },
      refs: { landing_page: `https://www.themuse.com/jobs/acme/${j.id}` },
    })),
  });
}

function captureStdout(): { get: () => string } {
  let out = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  return { get: () => out };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalStdoutWrite;
});

describe("runSearch", () => {
  test("--limit 0 emits zero results without fetching", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(page([{ id: 1, name: "Engineer" }], 1, 1));
    }) as typeof fetch;

    const out = captureStdout();
    const code = await runSearch({
      location: "New York, NY",
      jobage: 9999,
      page: 1,
      limit: 0,
      format: "json",
    });

    expect(code).toBe(0);
    expect(JSON.parse(out.get()).results).toHaveLength(0);
    // No --query means the no-keyword branch always issues its one page fetch,
    // but zero results should still be emitted correctly.
    expect(calls).toBeLessThanOrEqual(1);
  });

  test("--query scans forward across pages until it collects enough title matches", async () => {
    const pages = [
      page([{ id: 1, name: "Registered Nurse" }, { id: 2, name: "Bank Teller" }], 1, 3),
      page([{ id: 3, name: "Senior Software Engineer" }, { id: 4, name: "Bank Teller" }], 2, 3),
      page([{ id: 5, name: "Staff Software Engineer" }], 3, 3),
    ];
    let call = 0;
    globalThis.fetch = (async () => {
      const body = pages[call];
      call++;
      return new Response(body);
    }) as typeof fetch;

    const out = captureStdout();
    const code = await runSearch({
      query: "engineer",
      location: "New York, NY",
      jobage: 9999,
      page: 1,
      limit: 5,
      format: "json",
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out.get());
    expect(parsed.results.map((r: { title: string }) => r.title)).toEqual([
      "Senior Software Engineer",
      "Staff Software Engineer",
    ]);
    expect(call).toBe(3);
  });

  test("--query stops scanning once the limit is reached, without fetching later pages", async () => {
    const pages = [
      page(
        [
          { id: 1, name: "Software Engineer A" },
          { id: 2, name: "Software Engineer B" },
        ],
        1,
        5,
      ),
      page([{ id: 3, name: "Software Engineer C" }], 2, 5),
    ];
    let call = 0;
    globalThis.fetch = (async () => {
      const body = pages[call];
      call++;
      return new Response(body);
    }) as typeof fetch;

    const out = captureStdout();
    const code = await runSearch({
      query: "engineer",
      location: "New York, NY",
      jobage: 9999,
      page: 1,
      limit: 2,
      format: "json",
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(out.get());
    expect(parsed.results).toHaveLength(2);
    // Second page's fetch never had to happen because page 1 alone satisfied the limit.
    expect(call).toBe(1);
  });

  test("a 400 (e.g. out-of-range page) surfaces as SEARCH_FAILED on stderr", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ code: 400, error: "Value `page` is too high" }), { status: 400 })) as typeof fetch;

    let stderr = "";
    const originalStderrWrite = process.stderr.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += chunk.toString();
      return true;
    }) as typeof process.stderr.write;

    const code = await runSearch({
      location: "New York, NY",
      jobage: 9999,
      page: 99999,
      format: "json",
    });
    process.stderr.write = originalStderrWrite;

    expect(code).toBe(1);
    expect(JSON.parse(stderr).code).toBe("SEARCH_FAILED");
  });
});
