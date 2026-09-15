# COI Hero

Collect, organize, and track **certificates of insurance**.

You get a COI PDF in an email from a vendor. Instead of dropping it in a folder
and forgetting it, drop it into COI Hero: it stores the original, reads the
carriers / policy numbers / limits / dates off the form, and adds a row to a
searchable table. It then tracks expirations and checks each vendor and contract
against your required limits.

## What it does

- **Ingest**: drag-and-drop or file-picker upload of one or many COI PDFs
  (also PNG/JPG scans). Email ingestion is planned; `source` is already a
  first-class field.
- **Extract**: sends each file to the Anthropic API and pulls out structured
  fields (ACORD 25 and similar): producer, insured, holder, insurers (A to F
  plus NAIC), description of operations, and per-line coverage type / carrier /
  policy # / effective + expiration / limits / additional-insured / waiver of
  subrogation / primary & non-contributory / per-project aggregate / notice-of-
  cancellation days. Plus your-side fields you fill in: contract/project
  reference, internal owner, date received. No key? Files are still stored and
  you fill in the fields on the review screen (inline, beside the PDF).
- **Organize**: one searchable, sortable table with two views,
  _by coverage line_ (every policy's dates at a glance) and _by certificate_.
  Filter by vendor, coverage type, and status, or just click any status badge /
  coverage / endorsement pill to filter by it (click again to clear). Select
  rows for bulk actions (mark reviewed, assign vendor, delete). **Export CSV**
  (one row per coverage line). Every row links to the original PDF.
- **Track**: per-coverage status badges (active / expiring soon / expired);
  the "expiring soon" window is configurable. The dashboard rolls up what's
  lapsing.
- **Vendors**: certificates group under a vendor (auto-matched from the
  "insured" name). The vendor page shows current coverage on file and
  compliance.
- **Contracts**: create a contract (title, counterparty, term), give it its
  own insurance requirements (optionally on top of the global set), link the
  certificates you collected for it, and see a live "compliant with this
  contract" flag. Certificates can be linked from the certificate editor too.
- **Compliance**: global required limits (seeded with common defaults) plus
  per-vendor and per-contract overrides. Vendors and contracts are flagged
  where coverage is missing, expired, under-limit, or missing additional-insured
  / waiver-of-subrogation.
- **Dashboard**: a blue "needs review" bar over three columns (Expired / red,
  Expiring soon / amber, Active / green), then vendors and contracts needing
  attention.

## Setup

```bash
cd coi-hero
npm install
cp .env.local.example .env.local   # then paste your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3100.

### Demo it without an API key

Go to **/demo** (or the empty-state button on the dashboard) and click
**Load sample data**: about 10 vendors, 12 certificates, and 3 contracts with
generated stand-in PDFs and a full spread of statuses (active / expiring /
expired / under-limit / missing coverage), one vendor with requirement
overrides, one with a pending renewal request, plus an unassigned and an
unreviewed certificate.

To also demo the upload-then-review flow offline, add `COI_DEMO_MODE=1` to
`.env.local` and restart: any PDF you drop in gets realistic *mock* extracted
fields (from the file name, not a real reading). `/demo` also has **Reset** and
**Clear all data**.

### The API key

COI Hero calls the Anthropic API server-side to read each PDF. Get a key at
<https://console.anthropic.com/> and put it in `coi-hero/.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
COI_EXTRACT_MODEL=claude-sonnet-5   # optional; claude-opus-5 for messy scans
```

Restart `npm run dev` after changing `.env.local`. Without a key the app runs
fine: uploads are stored and extraction is skipped so you enter fields by hand
(or add a key later and hit **Re-run extraction** on each certificate).

## Where things live

| Thing | Location |
|---|---|
| Database (SQLite) | `coi-hero/data/coi-hero.db` |
| Original PDFs | `coi-hero/data/files/` |
| Everything in `data/` | git-ignored; delete it to reset |

## Stack

Next.js (App Router), TypeScript, Tailwind, better-sqlite3, `@anthropic-ai/sdk`.
Single process, no external services. Pages read SQLite directly; the browser
calls JSON API routes under `/api` for writes.

### Layout

```
src/
  app/
    page.tsx                    Dashboard
    certificates/               Table (both views) + per-cert editor
    vendors/                    List + vendor detail
    contracts/                  List + contract detail (requirements, links, compliance)
    requirements/               Global + per-vendor limit rules
    upload/                     Drag-and-drop ingest
    demo/                       Sample-data controls
    api/
      certificates/             POST upload+extract, PATCH, DELETE, /reextract, /bulk, /export
      contracts/                CRUD, /[id]/certificates linking
      files/[id]/               Streams the stored PDF back
      vendors/  requirements/   CRUD
      demo/                     Seed / reset / wipe
  lib/
    db.ts          SQLite access + schema + migrations + seed
    extract.ts     Anthropic call + result normalization + demo-mode fake
    compliance.ts  status + vendor/contract requirement evaluation
    dates.ts       loose-date parsing, status calc
    ingest.ts      store file, create row, extract
    demoData.ts    sample vendors / certificates / contracts
    demoSeed.ts    build the sample dataset
    samplePdf.ts   zero-dependency PDF writer for the sample COIs
```

## Notes / next steps

- Email ingestion (forward a COI to an inbox, it lands in the table).
- Auth: currently single-user / local only.
- Renewal reminder digests and per-vendor "request updated COI" email drafts.
- Per-certificate compliance view; check the endorsement fields (P&NC,
  per-project aggregate, minimum notice days) in the compliance engine.
