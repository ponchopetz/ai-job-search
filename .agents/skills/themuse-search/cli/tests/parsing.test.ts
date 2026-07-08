import { describe, test, expect } from "bun:test";
import { cleanDescription, normalizeJob, titleMatches, withinJobAge, type MuseJob } from "../src/helpers";

describe("cleanDescription", () => {
  test("strips tags and keeps paragraph breaks as newlines", () => {
    const html = "<p>First paragraph.</p><p>Second paragraph.</p>";
    expect(cleanDescription(html)).toBe("First paragraph.\nSecond paragraph.");
  });

  test("converts <br> to newlines", () => {
    expect(cleanDescription("Line one<br>Line two")).toBe("Line one\nLine two");
  });

  test("decodes hexadecimal numeric entities (&#xE9;)", () => {
    expect(cleanDescription("<p>Caf&#xE9; Manager</p>")).toBe("Café Manager");
  });

  test("decodes decimal numeric entities (&#233;)", () => {
    expect(cleanDescription("<p>Caf&#233; Lead</p>")).toBe("Café Lead");
  });

  test("decodes supplementary-plane code points (&#128512;)", () => {
    expect(cleanDescription("<p>Growth &#128512;</p>")).toBe("Growth 😀");
  });

  test("collapses 3+ consecutive newlines to a single blank line", () => {
    expect(cleanDescription("<p>A</p><br><br><br><p>B</p>")).toBe("A\n\nB");
  });
});

describe("titleMatches", () => {
  test("matches a single-word query case-insensitively", () => {
    expect(titleMatches("Senior Software Engineer", "engineer")).toBe(true);
    expect(titleMatches("Senior Software Engineer", "ENGINEER")).toBe(true);
  });

  test("requires every word in a multi-word query to appear", () => {
    expect(titleMatches("Senior Software Engineer", "software engineer")).toBe(true);
    expect(titleMatches("Senior Product Manager", "software engineer")).toBe(false);
  });

  test("empty query matches everything", () => {
    expect(titleMatches("Anything", "")).toBe(true);
  });

  test("does not match when the word is absent", () => {
    expect(titleMatches("Registered Nurse", "engineer")).toBe(false);
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

describe("normalizeJob", () => {
  function museJob(overrides: Partial<MuseJob> = {}): MuseJob {
    return {
      id: 123,
      name: "Software Engineer",
      contents: "<p>desc</p>",
      publication_date: "2026-01-01T00:00:00Z",
      locations: [{ name: "New York, NY" }],
      categories: [{ name: "Software Engineering" }],
      levels: [{ name: "Mid Level", short_name: "mid" }],
      company: { name: "Acme", short_name: "acme" },
      refs: { landing_page: "https://www.themuse.com/jobs/acme/software-engineer" },
      ...overrides,
    };
  }

  test("maps fields to the shared Job shape", () => {
    const job = normalizeJob(museJob());
    expect(job).toEqual({
      id: "123",
      title: "Software Engineer",
      company: "Acme",
      location: "New York, NY",
      date: "2026-01-01T00:00:00Z",
      url: "https://www.themuse.com/jobs/acme/software-engineer",
      level: "Mid Level",
    });
  });

  test("falls back to null/constructed values when arrays are empty", () => {
    const job = normalizeJob(
      museJob({ locations: [], categories: [], levels: [], refs: { landing_page: "" } }),
    );
    expect(job.location).toBeNull();
    expect(job.level).toBeNull();
    expect(job.url).toBe("https://www.themuse.com/jobs/123");
  });
});
