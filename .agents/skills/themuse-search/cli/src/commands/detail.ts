import { JOBS_URL, cleanDescription, jsonFetch, normalizeJob, writeError, type MuseJob } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  if (!/^\d+$/.test(opts.id)) {
    writeError(
      `"${opts.id}" is not a valid Muse job ID — pass the numeric "id" field from a search result (Muse job URLs don't embed the ID)`,
      "BAD_ID",
    )
    return 1
  }
  try {
    const data = await jsonFetch<MuseJob>(`${JOBS_URL}/${opts.id}`)
    if (!data) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = normalizeJob(data)
    const description = data.contents ? cleanDescription(data.contents) : null
    const categories = (data.categories ?? []).map((c) => c.name)
    const full = { ...job, description, categories }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.level ? `Level: ${job.level}` : "",
        categories.length ? `Categories: ${categories.join(", ")}` : "",
        "",
        description || "(no description)",
        "",
        `URL: ${job.url}`,
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(full, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
