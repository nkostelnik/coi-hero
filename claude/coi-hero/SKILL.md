---
name: coi-hero
description: Opens COI Hero, a tracker for certificates of insurance (COIs). The user drags COI PDFs onto it, their Claude reads them, and it shows expirations, compliance gaps against their requirements, and an expiration digest. Use when the user wants to track, organize or check certificates of insurance, vendor insurance, COI expirations or COI compliance, or asks for COI Hero. Also use when the user drops a scanned or photographed COI into the chat to add it to COI Hero.
---

# COI Hero

COI Hero is a single page, `coi-hero.html` in this skill's folder. It runs as
the user's own private artifact. The page asks the user's Claude to read each
certificate (the `sample` capability, on the user's own plan) and saves their
records in their private space in the artifact's database.

## Opening COI Hero

1. Check whether the user already has a COI Hero artifact: list their
   artifacts and look for one titled "COI Hero". Their records live with that
   artifact, so a new copy would start empty.
   - **Found:** open it. Don't publish a new one.
   - **Not found:** publish `coi-hero.html` from this skill's folder as a new
     artifact, exactly as it is (don't edit, shorten or restyle it), with:
     - capabilities: `{"sample": {}, "db": {}, "user": {}, "downloads": true}`
     - icon: `shield`
     - description: "Tracks certificates of insurance: expirations, compliance gaps and a digest."
2. Tell the user, in two or three sentences:
   - Drag COI PDFs onto **Add certificates**. Their Claude reads each one,
     which uses their Claude plan.
   - Check each certificate against its PDF and mark it checked.
   - Scans and phone photos can't be read on the page. They can drop those
     into this chat instead.

Only republish the user's existing COI Hero artifact (by its URL, with this
skill's `coi-hero.html`) when they ask to update COI Hero. Their records are
kept across republishes.

## Scans and photos dropped into the chat

The page can only read PDFs that contain text. When the user drops a scanned
or photographed certificate into the chat for COI Hero:

1. Read the certificate following the rules in
   [extraction-format.md](extraction-format.md).
2. Reply with one JSON object in that format, in a single ```json code block,
   and nothing else inside the block.
3. Tell the user: on COI Hero's **Add certificates** tab, paste the block into
   "Add a scan or photo from your Claude chat" and click **Add certificate**,
   then check the values against the scan.

Transcribe only what the document shows. Use null for anything missing or
illegible rather than guessing.

## What to tell users about COI Hero

- It's a demo for trying COI Hero on their own certificates, not a company
  system of record: no team access, audit trail or automatic backups.
- Records are saved privately in their Claude account. Original PDFs stay in
  the browser they were added from.
- The full app is open source at https://github.com/nkostelnik/coi-hero for a
  technical person to run with sign-in, backups and access controls.
