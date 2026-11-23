# Format Shift

[Open Format Shift](https://coolcode.ca/formatshift/) · [MusicBrainz](https://musicbrainz.org/)

Explore the physical and digital editions of music: an artist's releases, every loaded edition of an album, or one exact release. Compare formats, reported dates, country, catalogue numbers and individual media. No audio or artwork is loaded.

<!-- coolcode:guide -->
Search any artist name, choose the matching MusicBrainz artist, and load additional pages as needed. You can also paste a **release** or **release-group** UUID or MusicBrainz link. A release is one edition; a release group joins editions of the same album. Format filters, date filters, a decade chart and two-edition comparison work on the records loaded into the page. Counts describe recorded editions, not sales, popularity, availability or the entire music industry.

The opening view contains eight real selected Rush *Moving Pictures* editions, with capture time and source links. They are selected records rather than a complete discography. Fetch all album editions or search another artist to expand. **Save receipt** exports the current collection; **Import receipt** opens that JSON locally; **Export visible CSV** exports the filtered view. Imported files never leave the browser. Source failures preserve the current collection. The owner can also run the **Music metadata · Collect a receipt** workflow for any artist, release group or release UUID, then import its downloadable JSON.

**Expand or customize:** edit `web/config.json`: `presets` changes example artists, `opening.releaseIds` changes retained editions, `opening.title` and `opening.releaseGroupId` describe that selection, and `pageSize` / `maxLoadedReleases` control browsing. Commit an edit to `web/config.json` on `main` and the Pages workflow automatically fetches the configured opening editions, records a successful API receipt in `web/data/opening.json`, and publishes it. A source failure keeps the last good receipt. You can also run `python3 scripts/collect.py` locally, review the JSON and commit it. New entries require no UI source changes. `apiBase` can point to the optional identified server adapter documented below. No MusicBrainz account or API key is needed for public reads; the hosted API's free use is for noncommercial applications.
<!-- /coolcode:guide -->

## What the dates mean

`date` is the MusicBrainz edition's reported release date. A year or year/month remains a partial date, never an invented January 1. Missing dates are excluded from the chart and stay visible in the edition list until a year filter is used. `capturedAt` is when this collection was assembled or fetched, not when the edition or source record changed. With paged live browsing, it is the last successful page retrieval time. Country `XW` means worldwide; absent countries remain unknown.

The bootstrap `web/data/opening.json` was transcribed from **core bibliographic fields** in the [official Moving Pictures release-group table](https://musicbrainz.org/release-group/40e30dc1-55ac-33e1-85d3-1f1508140bfc) on 2026-11-23. Its method explicitly records this; it is **not** represented as an API response. The main-branch config-change workflow replaces that bootstrap with a genuine API-derived receipt only after all configured edition lookups succeed. Inspect `method` and `capturedAt` in the retained JSON to distinguish the two. Core metadata is [CC0](https://musicbrainz.org/doc/About/Data_License). Community data can contain erroneous or incomplete dates; original source records are linked for checking. Ratings, user tags, lyrics, biographies and cover art are not collected.

Each edition is counted once for each format family it contains. A nine-medium box is one edition, not nine editions. A CD-plus-vinyl box appears once in each corresponding family; coloured bar segments can therefore sum to more than the number of editions. CD variants are grouped for the chart while exact source formats remain in edition details. No assumption of worldwide format adoption is made. API browse order is provider-defined; early pages are not promised to be chronological or representative.

## Public API, identity and deployment

The [official API documentation](https://musicbrainz.org/doc/MusicBrainz_API) states that public metadata reads need no API key and that hosted API use is free for **noncommercial** applications. CoolCode's personal, free noncommercial use is the intended use here. Revisit the provider's commercial plans if the service becomes commercial; publishing a personal tool does not itself require disabling it.

[Rate rules](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting) require at most one request per second and a meaningful application User-Agent. Both collector and optional server adapter send:

```text
CoolCodeFormatShift/1.0 (https://coolcode.ca/formatshift/)
```

The browser serializes requests at 1.2-second intervals, caches up to 80 results for this session, and uses Web Locks plus a namespaced last-request timestamp to coordinate tabs where available. It makes no requests to MusicBrainz on page load. Browsers sharing an IP can still hit a provider limit. No automatic retry storm or background polling is used. No credentials are sent.

**Native browser requests:** Chromium does not reliably permit page JavaScript to replace its User-Agent, so this app uses the browser's native identity, normal Origin/Referer behaviour, explicit user actions and the 1.2-second queue. It does not pretend to set a header Chromium removes or claim that `client=` satisfies GET identification (that parameter is documented for POST submissions). MetaBrainz's own [ListenBrainz frontend](https://github.com/metabrainz/listenbrainz-server/blob/master/frontend/js/src/utils/utils.tsx), in `fetchMusicBrainzGenres`, makes a direct native-browser `fetch` to the MusicBrainz API without a custom User-Agent and caches the response. A [MetaBrainz maintainer's browser-JavaScript guidance](https://community.metabrainz.org/t/best-way-to-get-cover-art-when-only-a-recordingid-is-known/357666) also directs the developer to use GET. These first-party examples support the inference that ordinary browser reads are an expected use, **not an explicit blanket exemption** from the general identification wording. The correctly identified collector and optional server adapter send the application User-Agent above; the adapter is available if a deployment needs that explicit server-side identity. Neither noncommercial use nor browser support removes the rate limit.

### Optional identified adapter

`server/musicbrainz-proxy.mjs` is a narrow Node 22+ server, with no packages or keys. It permits only the artist search and bounded release/artist/release-group lookups this app needs. It fixes the upstream to `https://musicbrainz.org`, rejects arbitrary targets/unknown parameters, queues requests at 1.2-second intervals and caches successful responses for one hour. It accepts browser origins `https://coolcode.ca` and `https://jsdyer.github.io`; it is not a general-purpose CORS proxy. Origin checks are not authentication; the queue is capped at 25 jobs. Keep **one instance**, or add a shared limiter before scaling it.

```bash
node server/musicbrainz-proxy.mjs
```

It binds to `127.0.0.1:8789` by default (`PORT` is optional). Put it behind your own HTTPS reverse proxy. Change `web/config.json` `apiBase` to `https://YOUR-HOST/ws/2/`, keeping the trailing slash, then build/publish. No Cloudflare or hosting configuration is silently changed by this repository.

### Owner-run receipts

In GitHub Actions choose **Music metadata · Collect a receipt**, then:

- `opening`: fetch every edition listed in `web/config.json`.
- `artist`: paste any MusicBrainz artist UUID.
- `release-group`: paste an album's release-group UUID.
- `release`: paste one edition UUID.

The completed workflow provides `formatshift-receipt.json` as an artifact retained for 30 days. Download it and choose **Import receipt**. This workflow does not silently change the published opening view. To change that view, commit reviewed receipt JSON at `web/data/opening.json` (and keep the opening config in sync).

Local equivalents:

```bash
python3 scripts/collect.py
python3 scripts/collect.py --mode artist --id 534ee493-bfac-4575-a44a-0ae41e2c3fe4 --limit 200 --output rush-receipt.json
python3 scripts/collect.py --mode release-group --id 40e30dc1-55ac-33e1-85d3-1f1508140bfc --limit 100 --output album-receipt.json
```

All fetches must succeed before an output file is replaced. Main pushes that change `web/config.json` run this identified collection in the Pages workflow, validate the result, commit only `web/data/opening.json`, and build that receipt into the site. A non-forced push prevents overwriting concurrent repository updates; if persistence is refused, the build restores its previous receipt and retains the successful API result as a downloadable `collection-checks` artifact. The workflow summary states whether the API collection succeeded. API failure produces a warning without replacing the existing receipt. The automated receipt commit uses the workflow token and does not start another collection loop. Other code-only pushes build offline without polling.

No polling schedule is installed: MusicBrainz specifically advises against polling metadata for changes. Refresh manually when you want a new collection.

## Privacy and recovery

Artist names and IDs go to the configured API only after an explicit search/load action. Filters, comparisons and imported files remain local. This tool does not retain search or receipt history; only a namespaced pacing timestamp may be stored. Receipt files are limited to 5 MB / 2,000 records. External text is rendered through text nodes. CSV exports protect leading spreadsheet formula characters.

If a request is blocked or the service is busy, the existing collection remains usable and the status explains the failure. Open the official record/search or import a saved/owner-collected receipt. This does not bypass access controls or make a third-party challenge disappear.

Implementation checks on 2026-11-23: the official documentation and public release-group records were accessible through the research browser. Direct API requests from the development executor were stopped by its own egress layer (`x-openai-site-blocked: true`, HTTP 403), so this is **not evidence of an upstream MusicBrainz denial** or an end-to-end live API pass. The initial receipt's provenance is deliberately explicit. Browser CI uses controlled source responses to check failure handling; it does not claim to test a live provider.

## Development

No runtime build dependencies. Relative assets work under `/formatshift/`; no custom-domain `CNAME` is created.

```bash
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -v
python3 scripts/build.py
```

`web/model.mjs` holds normalization, paging, chart aggregation, receipt validation and the queue. `web/app.mjs` handles the interface. `tests/browser_smoke.py` is the Chromium CI check. The Pages workflow tests, builds and publishes initialized main-branch updates. The offline build never depends on a live API.
