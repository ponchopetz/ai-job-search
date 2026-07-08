# The Muse Jobs API — URL Reference

Public, unauthenticated JSON API. Confirmed live during skill build (2026-07-08).

## Search

```
GET https://www.themuse.com/api/public/jobs
```

Query params:

| Param | Meaning | Example |
|-------|---------|---------|
| `page` | 1-indexed page (20 results/page) | `1` |
| `location` | Exact place string | `New York, NY` · `Austin, TX` · `Flexible / Remote` |
| `category` | Muse's internal taxonomy tag (loose — see Quirks) | `Software Engineering` |
| `level` | Experience level | `Entry Level` · `Mid Level` · `Senior Level` · `management` · `Internship` |
| `company` | Filter by company name | `Bank of America` |
| `descending` | Sort order (boolean) | `true` |

Response shape:

```json
{
  "page": 1,
  "page_count": 751,
  "items_per_page": 20,
  "total": 15015,
  "results": [
    {
      "id": 21370777,
      "name": "Staff Software Engineer, Frontend",
      "contents": "<p>...</p>",
      "publication_date": "2026-06-24T18:34:01Z",
      "locations": [{ "name": "New York, NY" }],
      "categories": [{ "name": "Software Engineering" }],
      "levels": [{ "name": "Senior Level", "short_name": "senior" }],
      "company": { "id": 15000202, "short_name": "glossgenius", "name": "GlossGenius" },
      "refs": { "landing_page": "https://www.themuse.com/jobs/glossgenius/staff-software-engineer-frontend-35be0b" }
    }
  ]
}
```

Out-of-range `page` returns HTTP 400 `{"code": 400, "error": "Value \`page\` is too high"}` rather than an
empty page — the CLI surfaces this as a thrown error.

## Detail

```
GET https://www.themuse.com/api/public/jobs/<id>
```

Returns a single job object in the same shape as one `results[]` entry. A bogus ID returns a real HTTP 404.

## Confirmed working `location` values for this fork's target cities

`New York, NY` · `Seattle, WA` · `Austin, TX` · `Boston, MA` · `Chicago, IL` · `Flexible / Remote`
(all verified live with nonzero `total` counts in the 10k–15k range per city).

## Quirks

- **No free-text keyword parameter.** The only content filter is `category`, which is a loose
  taxonomy tag assigned by recruiters — testing `category=Software Engineering` in New York
  returned non-engineering roles (e.g. "Exhibition Registrar", "Product Counsel") mixed in with
  real matches. Guessing further taxonomy strings live (`Data Science`, `Marketing`, `Finance`,
  `Legal`, `Human Resources`, etc.) turned up mostly `0` or single-digit totals — the exact
  taxonomy isn't discoverable via any metadata endpoint (`/api/public/categories` and
  `/api/public/jobs/categories` both 404). Because of this, the CLI does **not** send `category`
  at all — `--query` instead scans forward through `location`-filtered pages and matches job
  titles client-side (confirmed live: scanning 300 NYC jobs surfaced 45 titles containing
  "engineer"). This trades a few extra requests for accuracy instead of relying on unverifiable
  taxonomy strings.
- **No posting-age server parameter.** `--jobage` is filtered client-side against `publication_date`.
- **Detail only accepts the bare numeric ID**, not the landing-page URL — `refs.landing_page` uses a
  company/title slug (`/jobs/glossgenius/staff-software-engineer-frontend-35be0b`) that does not embed
  the numeric ID anywhere, unlike LinkedIn's URL pattern.
- **Requires a browser `User-Agent` header** — a bare request (no UA, e.g. plain `curl`) gets HTTP 403
  `{"code": 403, "error": "Request includes unexpected headers."}`.
- **No authentication required** for personal-search volume: 500 requests/hour unregistered. A free
  `api_key` (register at themuse.com/developers) raises this to 3600/hour but isn't needed here.
- **Multi-location jobs display only their first tagged location.** A posting open to several
  cities (e.g. `["Chicago, IL", "New York, NY", "Flexible / Remote"]`) matches a `location`
  filter on any of its tags, but the CLI's `location` output field always shows `locations[0]`
  — confirmed live: searching `Austin, TX` surfaced a job displayed as `Flexible / Remote`
  because that tag happened to be listed first. This is a display simplification, not a
  matching bug; the job did match the requested city.
