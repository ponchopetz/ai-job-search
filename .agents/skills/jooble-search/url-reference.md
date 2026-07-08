# Jooble REST API — URL Reference

Public REST API, gated by a free API key (register at https://jooble.org/api/about).
Confirmed live during skill build (2026-07-08).

## Search

```
POST https://jooble.org/api/<api_key>
Content-Type: application/json
```

Request body (JSON):

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `keywords` | string | no | Job title / keywords. Empty string returns unfiltered results for the location. |
| `location` | string | yes | City, state, or region, e.g. `"New York, NY"`, `"Austin, TX"`, `"Remote"` |
| `radius` | string | no | Search radius in km: `0, 4, 8, 16, 26, 40, 80` |
| `salary` | integer | no | Minimum salary threshold |
| `page` | integer | no | 1-indexed page number |
| `ResultOnPage` | integer | no | Results per page |
| `SearchMode` | integer | no | Default `0` |
| `companysearch` | boolean | no | `true` = search company names instead of titles/descriptions |

Response (JSON), confirmed live with a `keywords: "software engineer"`,
`location: "New York, NY"` search (`totalCount: 2807`):

```json
{
  "totalCount": 2807,
  "jobs": [
    {
      "id": 8433364895618047713,
      "title": "Fullstack Software Engineer - Incubations",
      "location": "New York, NY",
      "snippet": "...Sei Labs is looking for a Fullstack Engineer...",
      "salary": "",
      "source": "decentrajobs.com",
      "type": "Full-time",
      "link": "https://jooble.org/jdp/8433364895618047713",
      "company": "Sei Network",
      "updated": "2026-05-15T00:00:00.0000000"
    }
  ]
}
```

## Errors

| Status | Meaning |
|--------|---------|
| 403 | Access denied — invalid API key |
| 404 | Resource unavailable |

## Quirks (confirmed live)

- **`id` is a 19-20 digit signed integer that exceeds `Number.MAX_SAFE_INTEGER`** (2^53-1).
  Parsing the response with `response.json()` silently rounds it — confirmed live:
  `8433364895618047713` came back as `8433364895618048000`. The CLI's `apiFetch` reads the
  raw response text and quotes the numeric `id` token with a regex
  (`"id":(-?\d+)` → `"id":"$1"`) before calling `JSON.parse`, so it survives as an exact
  string. This also fixed a real crash: the table renderer originally assumed ~10-digit IDs
  and called `.padEnd()` on what was — before the fix — a runtime `number`, not a `string`
  (`j.id.padEnd is not a function`).
- **No detail endpoint.** Only a search endpoint exists — same situation as this fork's
  `adzuna-search`. `link` (shape `https://jooble.org/jdp/<id>` or `.../away/<id>?...`)
  points to the live posting or an outbound redirect.
- **No posting-age (job-age) parameter.** `updated` is populated (ISO-ish timestamp,
  e.g. `"2026-07-03T12:36:31.4300000"` — 7 fractional-second digits, more precision than
  JS `Date` needs but parses fine) and the CLI filters `--jobage` against it client-side.
- **`salary` and `type` are opaque display strings, often empty.** Observed values:
  `"$30 per hour"`, `"$250k"`, `""`. `type` observed as `"Full-time"` or `""`. Don't rely on
  either being present or in a fixed format.
- **Omitting `keywords` returns unfiltered results for the location** (confirmed: an empty
  search for `"New York, NY"` returned generic listings — dentists, medical roles — not
  software jobs), so `--query` is effectively required for a targeted search even though the
  API itself doesn't require it.
