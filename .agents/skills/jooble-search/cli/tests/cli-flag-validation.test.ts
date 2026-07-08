import { describe, test, expect } from "bun:test";
import { runCLI } from "./helpers";

const LOCATION = "New York, NY";
// Flag validation happens before any network call, so these run with no API key set —
// exercising that path is itself covered by the MISSING_CREDENTIALS test below.
const NO_KEY_ENV = { JOOBLE_API_KEY: "" };

function parsedStderr(stderr: string): { error?: string; code?: string } {
  try {
    return JSON.parse(stderr);
  } catch {
    return {};
  }
}

describe("Jooble CLI flag validation", () => {
  describe("--jobage NaN validation", () => {
    test("non-numeric string exits 1 with BAD_ARG", async () => {
      const result = await runCLI(["search", "-l", LOCATION, "--jobage", "foo"], NO_KEY_ENV);
      expect(result.exitCode).not.toBe(0);
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("BAD_ARG");
      expect(err.error).toMatch(/jobage/);
    });
  });

  describe("--salary NaN validation", () => {
    test("non-numeric string exits 1 with BAD_ARG", async () => {
      const result = await runCLI(["search", "-l", LOCATION, "--salary", "lots"], NO_KEY_ENV);
      expect(result.exitCode).not.toBe(0);
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("BAD_ARG");
      expect(err.error).toMatch(/salary/);
    });
  });

  describe("--page NaN validation", () => {
    test("non-numeric string exits 1 with BAD_ARG", async () => {
      const result = await runCLI(["search", "-l", LOCATION, "--page", "abc"], NO_KEY_ENV);
      expect(result.exitCode).not.toBe(0);
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("BAD_ARG");
      expect(err.error).toMatch(/page/);
    });
  });

  describe("--limit NaN validation", () => {
    test("non-numeric string exits 1 with BAD_ARG", async () => {
      const result = await runCLI(["search", "-l", LOCATION, "--limit", "xyz"], NO_KEY_ENV);
      expect(result.exitCode).not.toBe(0);
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("BAD_ARG");
      expect(err.error).toMatch(/limit/);
    });
  });

  describe("missing --location", () => {
    test("exits 1 with NO_LOCATION", async () => {
      const result = await runCLI(["search"], NO_KEY_ENV);
      expect(result.exitCode).not.toBe(0);
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("NO_LOCATION");
    });
  });

  describe("unknown command", () => {
    test("exits 1 with BAD_CMD", async () => {
      const result = await runCLI(["bogus"], NO_KEY_ENV);
      expect(result.exitCode).not.toBe(0);
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("BAD_CMD");
    });
  });

  describe("missing JOOBLE_API_KEY", () => {
    test("valid flags but no key exits 1 with MISSING_CREDENTIALS, not BAD_ARG", async () => {
      const result = await runCLI(["search", "-l", LOCATION, "--jobage", "7", "--page", "1"], NO_KEY_ENV);
      expect(result.exitCode).not.toBe(0);
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("MISSING_CREDENTIALS");
    });
  });
});
