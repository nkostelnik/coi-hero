// The COI Hero screens for the Claude page. Status, compliance and digest
// come from the shared src/lib code, so answers match the server app.
import { h, render } from "preact";
import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import htm from "htm";
import {
  evaluateVendorCompliance,
  formatMoney,
  headlineLimit,
} from "@/lib/compliance";
import { coverageStatus, formatDate } from "@/lib/dates";
import { buildDigest, describeDays, digestCsv } from "@/lib/digest";
import { COVERAGE_TYPES } from "@/lib/types";
import type {
  CertificateWithRelations,
  Coverage,
  CoverageStatus,
  CoverageType,
  LimitLine,
  Requirement,
  Vendor,
} from "@/lib/types";
import {
  applyExtraction,
  defaultRequirements,
  emptyData,
  findVendor,
  makeCertificate,
  makeCoverage,
  makeRequirement,
  makeVendor,
  sampleData,
  withRelations,
} from "./model";
import type { PageCertificate, PageData } from "./model";
import {
  openFile,
  parsePasted,
  readWithClaude,
  readerSupport,
  showPdf,
  ReadError,
} from "./reader";
import type { ReaderSupport } from "./reader";
import { Store, files, useCapability } from "./store";
import type { StorageMode } from "./store";

/* eslint-disable @typescript-eslint/no-explicit-any */
const html = htm.bind(h);
const REPO_URL = "https://github.com/nkostelnik/coi-hero";

type Route =
  | { name: "dashboard" | "add" | "certificates" | "vendors" | "digest" | "requirements" | "data" }
  | { name: "certificate"; id: number };

const TABS: Array<{ name: Route["name"]; label: string }> = [
  { name: "dashboard", label: "Dashboard" },
  { name: "add", label: "Add certificates" },
  { name: "certificates", label: "Certificates" },
  { name: "vendors", label: "Vendors" },
  { name: "digest", label: "Digest" },
  { name: "requirements", label: "Requirements" },
  { name: "data", label: "Your data" },
];

const STATUS_LABEL: Record<CoverageStatus, string> = {
  active: "Active",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  unknown: "No date",
};

const store = new Store();
let goTo: (r: Route) => void = () => {};
let toast: (msg: string) => void = () => {};

const safeLocal = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* not kept; fine */
    }
  },
};

/* ------------------------------ shared bits ------------------------------ */

function StatusBadge({ status }: { status: CoverageStatus }) {
  return html`<span class=${"badge s-" + status}>${STATUS_LABEL[status]}</span>`;
}

function Pill({ tone, children }: { tone: "red" | "amber" | "green" | "grey" | "blue"; children: ComponentChildren }) {
  return html`<span class=${"pill p-" + tone}>${children}</span>`;
}

function Link({ to, children, cls }: { to: Route; children: ComponentChildren; cls?: string }) {
  return html`<button type="button" class=${"linkish " + (cls ?? "")} onClick=${() => goTo(to)}>${children}</button>`;
}

function certName(c: CertificateWithRelations | PageCertificate, vendors?: Vendor[]): string {
  const v =
    "vendor" in c && c.vendor
      ? c.vendor
      : vendors?.find((x) => x.id === c.vendor_id);
  return v?.name ?? c.insured_name ?? c.original_file_name;
}

/** Saves the starting requirements the first time anything is written. */
async function ensureInitialized() {
  const d = store.data;
  if (d.settings.initialized) return;
  await store.saveSettings({ ...d.settings, initialized: true });
  for (const r of d.requirements) await store.save("requirement", r);
}

async function saveCertificate(cert: PageCertificate) {
  await ensureInitialized();
  await store.save("certificate", { ...cert, updated_at: new Date().toISOString() });
}

async function vendorForInsured(name: string | null): Promise<number | null> {
  if (!name) return null;
  const existing = findVendor(store.data.vendors, name);
  if (existing) return existing.id;
  const v = makeVendor(name);
  await store.save("vendor", v);
  return v.id;
}

/* -------------------------------- shell -------------------------------- */

function StorageBanner({ mode }: { mode: StorageMode }) {
  const where =
    mode === "account"
      ? "Saved in your Claude account. Only you can see it."
      : mode === "browser"
        ? "Saved in this browser only. Clearing browser data erases it."
        : "Not saved: this browser is blocking storage, so data is lost when you close the page.";
  return html`<div class="banner" role="note">
    <strong>Demo</strong>
    <span>${where}</span>
    <${Link} to=${{ name: "data" }}>Not for company records</${Link}>
  </div>`;
}

function Intro() {
  const [hidden, setHidden] = useState(safeLocal.get("coi-hero:intro") === "hidden");
  if (hidden) return null;
  return html`<section class="card intro" aria-labelledby="intro-h">
    <h2 id="intro-h">How this demo works</h2>
    <ul>
      <li>Drop in certificates of insurance (PDFs). Your Claude reads them, using your Claude plan. COI Hero never sees your files or data.</li>
      <li>Records are saved privately for you. The original PDFs stay in this browser.</li>
      <li>This is a demo for trying COI Hero on your own files. It has no backups, team access or audit trail, so don't use it as your company's system of record. To run COI Hero properly, a technical person can set it up from the <a href=${REPO_URL} target="_blank" rel="noreferrer">GitHub project</a>.</li>
    </ul>
    <div class="row">
      <button type="button" class="btn ghost" onClick=${() => {
        safeLocal.set("coi-hero:intro", "hidden");
        setHidden(true);
      }}>Got it</button>
    </div>
  </section>`;
}

/* ------------------------------ dashboard ------------------------------ */

interface Line {
  cert: CertificateWithRelations;
  coverage: Coverage;
  status: CoverageStatus;
}

function linesOf(certs: CertificateWithRelations[], soonDays: number): Line[] {
  return certs.flatMap((cert) =>
    cert.coverages.map((coverage) => ({
      cert,
      coverage,
      status: coverageStatus(coverage.expiration_date, soonDays),
    })),
  );
}

const byExp = (a: Line, b: Line) =>
  (a.coverage.expiration_date ?? "9999").localeCompare(b.coverage.expiration_date ?? "9999");

function Dashboard({ data, certs }: { data: PageData; certs: CertificateWithRelations[] }) {
  const soon = data.settings.soonDays;
  const lines = linesOf(certs, soon);
  const expired = lines.filter((l) => l.status === "expired").sort((a, b) => -byExp(a, b));
  const expiring = lines.filter((l) => l.status === "expiring_soon").sort(byExp);
  const active = lines.filter((l) => l.status === "active").sort(byExp);
  const needsReview = certs.filter((c) => !c.reviewed);
  const attention = data.vendors
    .map((v) => ({
      vendor: v,
      result: evaluateVendorCompliance({
        vendorId: v.id,
        certs: certs.filter((c) => c.vendor_id === v.id),
        requirements: data.requirements,
        soonDays: soon,
      }),
    }))
    .filter((x) => x.result.status === "non_compliant" || x.result.status === "no_coi");

  return html`<div class="stack">
    <div class="pagehead">
      <h1>Dashboard</h1>
      <p class="muted">${certs.length} certificates · ${data.vendors.length} vendors · “expiring soon” means within ${soon} days</p>
    </div>
    <${Intro} />
    ${certs.length === 0 &&
    html`<section class="card empty">
      <h2>No certificates yet</h2>
      <p>Add your own certificates, or load a sample set to look around first.</p>
      <div class="row center">
        <button type="button" class="btn" onClick=${() => goTo({ name: "add" })}>Add certificates</button>
        <button type="button" class="btn ghost" onClick=${() => goTo({ name: "data" })}>Load sample data</button>
      </div>
    </section>`}
    ${needsReview.length > 0 &&
    html`<button type="button" class="review-bar" onClick=${() => goTo({ name: "certificates" })}>
      <span class="count">${needsReview.length}</span>
      <span><strong>Needs review</strong><br /><span class="muted">Not yet checked. Confirm carriers, limits and dates against each PDF.</span></span>
    </button>`}
    <div class="columns">
      <${StatusColumn} title="Expired" tone="red" lines=${expired} empty="Nothing expired." />
      <${StatusColumn} title="Expiring soon" tone="amber" lines=${expiring} empty=${`Nothing expiring in the next ${soon} days.`} />
      <${StatusColumn} title="Active" tone="green" lines=${active} empty="No active coverage yet." />
    </div>
    <section class="card">
      <div class="sechead"><h2>Vendors needing attention</h2><${Link} to=${{ name: "vendors" }}>All vendors</${Link}></div>
      ${attention.length === 0
        ? html`<p class="muted">${data.vendors.length ? "Every vendor meets its requirements." : "No vendors yet."}</p>`
        : html`<ul class="list">${attention.slice(0, 12).map(
            ({ vendor, result }) => html`<li>
              <div class="spread"><strong>${vendor.name}</strong>
                <${Pill} tone=${result.status === "no_coi" ? "amber" : "red"}>${result.status === "no_coi" ? "No COI" : "Not compliant"}</${Pill}></div>
              ${result.issues.slice(0, 2).map((i) => html`<div class="small muted">${i.message}</div>`)}
            </li>`,
          )}</ul>`}
    </section>
  </div>`;
}

function StatusColumn({ title, tone, lines, empty }: { title: string; tone: string; lines: Line[]; empty: string }) {
  return html`<section class=${"col c-" + tone} aria-label=${title}>
    <div class="colhead"><span>${title}</span><span class="colcount">${lines.length}</span></div>
    <ul class="collist">
      ${lines.map(
        ({ cert, coverage }) => html`<li>
          <${Link} to=${{ name: "certificate", id: cert.id }} cls="strong">${certName(cert)}</${Link}>
          <div class="small muted">${coverage.coverage_type} · expires ${formatDate(coverage.expiration_date)}</div>
        </li>`,
      )}
      ${lines.length === 0 && html`<li class="muted small">${empty}</li>`}
    </ul>
  </section>`;
}

/* ---------------------------- add certificates ---------------------------- */

interface QueueItem {
  key: number;
  name: string;
  state: "working" | "done" | "needs-you" | "failed";
  message: string;
  certId?: number;
}

function AddCertificates({ support }: { support: ReaderSupport | null }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [over, setOver] = useState(false);
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(Promise.resolve());

  const update = (key: number, patch: Partial<QueueItem>) =>
    setQueue((q) => q.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  async function process(file: File, key: number) {
    const isImage = file.type.startsWith("image/");
    let cert = makeCertificate({
      original_file_name: file.name,
      content_type: file.type || "application/pdf",
      file_size: file.size,
      has_file: true,
    });
    await files.put(cert.id, file);
    await saveCertificate(cert);
    update(key, { certId: cert.id, message: "Opening the file…" });
    try {
      const s = await readerSupport();
      const opened = await openFile(file, isImage, s.images ? s.maxImages : 0);
      if (!s.claude) {
        cert = { ...cert, extraction_status: "manual" };
        await saveCertificate(cert);
        update(key, { state: "needs-you", message: "This page can't ask Claude here. Open it to enter the details." });
        return;
      }
      update(key, { message: "Claude is reading it (usually 10–60 seconds)…" });
      const { result, method } = await readWithClaude(opened, {
        onProgress: (m) => update(key, { message: m }),
      });
      cert = applyExtraction(cert, result, method === "pictures" ? "claude (page pictures)" : "claude (PDF text)");
      cert.vendor_id = await vendorForInsured(result.insured.name);
      await saveCertificate(cert);
      update(key, {
        state: "done",
        message: `Read ${result.coverages.length} coverage line${result.coverages.length === 1 ? "" : "s"}${result.insured.name ? " for " + result.insured.name : ""}. Check it against the PDF.`,
      });
    } catch (e: any) {
      const scanned = e instanceof ReadError && e.code === "scanned";
      cert = {
        ...cert,
        extraction_status: scanned ? "skipped" : "failed",
        extraction_error: e?.message ?? String(e),
      };
      await saveCertificate(cert);
      update(key, { state: scanned ? "needs-you" : "failed", message: e?.message ?? String(e) });
    }
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const accepted = [...list].filter((f) => /pdf|png|jpe?g|webp/i.test(f.type) || /\.pdf$/i.test(f.name));
    const items = accepted.map((f, i) => ({
      key: Date.now() + i,
      name: f.name,
      state: "working" as const,
      message: "Waiting…",
    }));
    setQueue((q) => [...items, ...q]);
    accepted.forEach((f, i) => {
      busy.current = busy.current.then(() => process(f, items[i].key)).catch(() => {});
    });
  }

  async function addPasted() {
    setPasteError("");
    try {
      const result = parsePasted(pasted);
      let cert = makeCertificate({
        original_file_name: (result.insured.name ?? "Certificate") + " (from Claude chat)",
        source: "upload",
      });
      cert = applyExtraction(cert, result, "claude (chat)");
      cert.vendor_id = await vendorForInsured(result.insured.name);
      await saveCertificate(cert);
      setPasted("");
      goTo({ name: "certificate", id: cert.id });
    } catch (e: any) {
      setPasteError(e?.message ?? String(e));
    }
  }

  const readingNote = !support
    ? "Checking what this page can do…"
    : !support.claude
      ? "This page can't ask Claude here (open it inside Claude to have certificates read). You can still add files and enter the details yourself."
      : support.images
        ? "Claude reads each file, scans and photos included."
        : "Claude reads PDFs that contain text, which is most PDFs a broker sends. Scans and photos can't be read on this page: drop those into your Claude chat instead (see below).";

  return html`<div class="stack">
    <div class="pagehead">
      <h1>Add certificates</h1>
      <p class="muted">${readingNote}</p>
    </div>
    <section class="card">
      <div
        class=${"drop" + (over ? " over" : "")}
        tabindex="0"
        role="button"
        aria-label="Choose certificate files"
        onClick=${() => input.current?.click()}
        onKeyDown=${(e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver=${(e: DragEvent) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave=${() => setOver(false)}
        onDrop=${(e: DragEvent) => {
          e.preventDefault();
          setOver(false);
          addFiles(e.dataTransfer?.files ?? null);
        }}
      >
        <strong>Drop certificates here</strong>
        <span class="muted">or click to choose · PDF, PNG or JPG · several at once is fine</span>
      </div>
      <input id="file-input" ref=${input} type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" hidden
        onChange=${(e: Event) => {
          const t = e.currentTarget as HTMLInputElement;
          addFiles(t.files);
          t.value = "";
        }} />
      ${queue.length > 0 &&
      html`<ul class="list queue" aria-live="polite">
        ${queue.map(
          (q) => html`<li class=${"q-" + q.state}>
            <div class="spread">
              <strong class="wrap">${q.name}</strong>
              ${q.certId && q.state !== "working"
                ? html`<${Link} to=${{ name: "certificate", id: q.certId }}>${q.state === "done" ? "Review" : "Open"}</${Link}>`
                : html`<span class="small muted">${q.state === "working" ? "Working" : ""}</span>`}
            </div>
            <div class="small">${q.message}</div>
          </li>`,
        )}
      </ul>`}
    </section>
    <section class="card" aria-labelledby="paste-h">
      <h2 id="paste-h">Add a scan or photo from your Claude chat</h2>
      <p class="muted">Drop the scan into your Claude chat and say “Read this COI for COI Hero.” Claude replies with a block of data. Paste it here.</p>
      <label class="field">
        <span>Data from Claude</span>
        <textarea id="paste-data" rows="5" value=${pasted} onInput=${(e: Event) => setPasted((e.currentTarget as HTMLTextAreaElement).value)} placeholder='{"insured": {"name": …}, "coverages": […]}'></textarea>
      </label>
      ${pasteError && html`<p class="error">${pasteError}</p>`}
      <div class="row"><button type="button" class="btn" disabled=${!pasted.trim()} onClick=${addPasted}>Add certificate</button></div>
    </section>
  </div>`;
}

/* ------------------------------ certificates ------------------------------ */

function Certificates({ data, certs, vendorFilter }: { data: PageData; certs: CertificateWithRelations[]; vendorFilter: number | null }) {
  const [status, setStatus] = useState<CoverageStatus | "all">("all");
  const [vendor, setVendor] = useState<string>(vendorFilter ? String(vendorFilter) : "all");
  const [q, setQ] = useState("");
  const soon = data.settings.soonDays;
  const needle = q.trim().toLowerCase();

  const rows = certs
    .filter((c) => vendor === "all" || String(c.vendor_id) === vendor)
    .flatMap((c) =>
      c.coverages.length
        ? c.coverages.map((cov) => ({ c, cov: cov as Coverage | null, st: coverageStatus(cov.expiration_date, soon) }))
        : [{ c, cov: null as Coverage | null, st: "unknown" as CoverageStatus }],
    )
    .filter((r) => status === "all" || r.st === status)
    .filter(
      (r) =>
        !needle ||
        [certName(r.c), r.c.insured_name, r.cov?.insurer_name, r.cov?.policy_number, r.cov?.coverage_type]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(needle)),
    )
    .sort((a, b) => (a.cov?.expiration_date ?? "9999").localeCompare(b.cov?.expiration_date ?? "9999"));

  return html`<div class="stack">
    <div class="pagehead"><h1>Certificates</h1><p class="muted">Every coverage line on file, earliest expiration first.</p></div>
    <div class="filters">
      <label class="field inline"><span>Search</span>
        <input id="cert-search" type="search" value=${q} onInput=${(e: Event) => setQ((e.currentTarget as HTMLInputElement).value)} placeholder="Vendor, carrier, policy #" /></label>
      <label class="field inline"><span>Vendor</span>
        <select id="cert-vendor" value=${vendor} onChange=${(e: Event) => setVendor((e.currentTarget as HTMLSelectElement).value)}>
          <option value="all">All vendors</option>
          ${data.vendors.slice().sort((a, b) => a.name.localeCompare(b.name)).map((v) => html`<option value=${String(v.id)}>${v.name}</option>`)}
        </select></label>
      <div class="chips" role="group" aria-label="Status">
        ${(["all", "expired", "expiring_soon", "active", "unknown"] as const).map(
          (s) => html`<button type="button" class=${"chip" + (status === s ? " on" : "")} aria-pressed=${status === s} onClick=${() => setStatus(s)}>
            ${s === "all" ? "All" : STATUS_LABEL[s]}</button>`,
        )}
      </div>
    </div>
    <div class="card flush scroll">
      <table>
        <thead><tr><th>Vendor</th><th>Coverage</th><th>Carrier</th><th>Policy #</th><th>Limit</th><th>Expires</th><th>Status</th><th>Checked</th></tr></thead>
        <tbody>
          ${rows.map(({ c, cov, st }) => {
            const lim = cov ? headlineLimit(cov.limits) : null;
            return html`<tr>
              <td><${Link} to=${{ name: "certificate", id: c.id }} cls="strong">${certName(c)}</${Link}></td>
              <td>${cov?.coverage_type ?? html`<span class="muted">No coverage lines</span>`}</td>
              <td>${cov?.insurer_name ?? "–"}</td>
              <td class="mono">${cov?.policy_number ?? "–"}</td>
              <td class="num">${lim ? formatMoney(lim.amount) : "–"}</td>
              <td class="num">${formatDate(cov?.expiration_date ?? null)}</td>
              <td><${StatusBadge} status=${st} /></td>
              <td>${c.reviewed ? "Yes" : html`<${Pill} tone="blue">Review</${Pill}>`}</td>
            </tr>`;
          })}
          ${rows.length === 0 && html`<tr><td colspan="8" class="muted center">No certificates match.</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;
}

/* --------------------------- certificate detail --------------------------- */

const triValue = (v: 0 | 1 | null) => (v === 1 ? "yes" : v === 0 ? "no" : "");
const fromTri = (s: string): 0 | 1 | null => (s === "yes" ? 1 : s === "no" ? 0 : null);
const val = (e: Event) => (e.currentTarget as HTMLInputElement).value;

function TextField({ id, label, value, onChange, type = "text" }: { id: string; label: string; value: string | null; onChange: (v: string | null) => void; type?: string }) {
  return html`<label class="field"><span>${label}</span>
    <input id=${id} type=${type} value=${value ?? ""} onInput=${(e: Event) => onChange(val(e).trim() ? val(e) : null)} /></label>`;
}

function CertificateDetail({ id, data, support }: { id: number; data: PageData; support: ReaderSupport | null }) {
  const saved = data.certificates.find((c) => c.id === id);
  const [draft, setDraft] = useState<PageCertificate | null>(saved ?? null);
  const [vendorName, setVendorName] = useState("");
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pdfState, setPdfState] = useState<"hidden" | "loading" | "shown" | "missing">("hidden");
  const [rereading, setRereading] = useState(false);
  const pdfBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dirty) setDraft(saved ?? null);
  }, [saved]);

  if (!draft) {
    return html`<div class="stack"><p>That certificate no longer exists.</p><${Link} to=${{ name: "certificates" }}>Back to certificates</${Link}></div>`;
  }
  const set = (patch: Partial<PageCertificate>) => {
    setDraft({ ...draft, ...patch });
    setDirty(true);
  };
  const setCov = (i: number, patch: Partial<Coverage>) =>
    set({ coverages: draft.coverages.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  async function save(reviewed?: boolean) {
    let next = { ...draft!, reviewed: reviewed ? (1 as const) : draft!.reviewed };
    if (vendorName.trim()) {
      const existing = findVendor(store.data.vendors, vendorName);
      const v = existing ?? makeVendor(vendorName);
      if (!existing) await store.save("vendor", v);
      next = { ...next, vendor_id: v.id };
      setVendorName("");
    }
    await saveCertificate(next);
    setDraft(next);
    setDirty(false);
    toast(reviewed ? "Marked as checked." : "Saved.");
  }

  async function remove() {
    await store.remove("certificate", draft!.id);
    await files.remove(draft!.id);
    toast("Certificate deleted.");
    goTo({ name: "certificates" });
  }

  async function togglePdf() {
    if (pdfState === "shown") {
      setPdfState("hidden");
      return;
    }
    setPdfState("loading");
    const blob = await files.get(draft!.id);
    if (!blob) {
      setPdfState("missing");
      return;
    }
    setPdfState("shown");
    requestAnimationFrame(async () => {
      if (!pdfBox.current) return;
      try {
        if (draft!.content_type?.startsWith("image/")) {
          const img = document.createElement("img");
          img.src = URL.createObjectURL(blob);
          img.alt = "Original certificate";
          img.className = "pdf-page";
          pdfBox.current.replaceChildren(img);
        } else {
          await showPdf(blob, pdfBox.current);
        }
      } catch {
        setPdfState("missing");
      }
    });
  }

  async function reread() {
    const blob = await files.get(draft!.id);
    if (!blob) {
      toast("The original file isn't in this browser, so it can't be read again here.");
      return;
    }
    setRereading(true);
    try {
      const s = await readerSupport();
      const opened = await openFile(blob, !!draft!.content_type?.startsWith("image/"), s.images ? s.maxImages : 0);
      const { result, method } = await readWithClaude(opened);
      let next = applyExtraction(draft!, result, method === "pictures" ? "claude (page pictures)" : "claude (PDF text)");
      if (next.vendor_id == null) next = { ...next, vendor_id: await vendorForInsured(result.insured.name) };
      await saveCertificate(next);
      setDraft(next);
      setDirty(false);
      toast("Read again. Check the values against the PDF.");
    } catch (e: any) {
      toast(e?.message ?? String(e));
    } finally {
      setRereading(false);
    }
  }

  const soon = data.settings.soonDays;
  return html`<div class="stack">
    <div class="pagehead">
      <${Link} to=${{ name: "certificates" }}>← Certificates</${Link}>
      <h1>${certName(draft, data.vendors)}</h1>
      <p class="muted">${draft.original_file_name} · ${draft.reviewed ? "Checked" : "Not yet checked"}${draft.extraction_model ? " · read by " + draft.extraction_model : ""}</p>
    </div>
    ${draft.extraction_error && html`<p class="notice">${draft.extraction_error}</p>`}
    <div class="row">
      <button type="button" class="btn" onClick=${() => save(true)}>${draft.reviewed ? "Save" : "Save and mark checked"}</button>
      ${dirty && html`<button type="button" class="btn ghost" onClick=${() => save()}>Save without checking</button>`}
      ${draft.has_file && html`<button type="button" class="btn ghost" onClick=${togglePdf}>${pdfState === "shown" ? "Hide original" : "Show original"}</button>`}
      ${draft.has_file && support?.claude && html`<button type="button" class="btn ghost" disabled=${rereading} onClick=${reread}>${rereading ? "Reading…" : "Read again with Claude"}</button>`}
      <span class="grow"></span>
      ${confirmDelete
        ? html`<span class="confirm">Delete this certificate? <button type="button" class="btn danger" onClick=${remove}>Delete</button> <button type="button" class="btn ghost" onClick=${() => setConfirmDelete(false)}>Keep</button></span>`
        : html`<button type="button" class="btn ghost danger-text" onClick=${() => setConfirmDelete(true)}>Delete</button>`}
    </div>
    ${pdfState === "missing" && html`<p class="notice">The original file isn't in this browser. It stays on the computer where it was added.</p>`}
    ${(pdfState === "shown" || pdfState === "loading") && html`<div class="card pdfbox" ref=${pdfBox}><p class="muted">Loading…</p></div>`}

    <section class="card">
      <h2>Certificate</h2>
      <div class="grid2">
        <label class="field"><span>Vendor</span>
          <select id="cert-vendor-select" value=${draft.vendor_id == null ? "" : String(draft.vendor_id)} onChange=${(e: Event) => set({ vendor_id: val(e) ? Number(val(e)) : null })}>
            <option value="">No vendor</option>
            ${data.vendors.slice().sort((a, b) => a.name.localeCompare(b.name)).map((v) => html`<option value=${String(v.id)}>${v.name}</option>`)}
          </select></label>
        <label class="field"><span>Or a new vendor</span>
          <input id="cert-new-vendor" type="text" value=${vendorName} placeholder="Vendor name" onInput=${(e: Event) => {
            setVendorName(val(e));
            setDirty(true);
          }} /></label>
        <${TextField} id="f-insured" label="Insured" value=${draft.insured_name} onChange=${(v: string | null) => set({ insured_name: v })} />
        <${TextField} id="f-insured-addr" label="Insured address" value=${draft.insured_address} onChange=${(v: string | null) => set({ insured_address: v })} />
        <${TextField} id="f-producer" label="Producer (broker)" value=${draft.producer_name} onChange=${(v: string | null) => set({ producer_name: v })} />
        <${TextField} id="f-holder" label="Certificate holder" value=${draft.certificate_holder_name} onChange=${(v: string | null) => set({ certificate_holder_name: v })} />
        <${TextField} id="f-date" label="Certificate date" type="date" value=${draft.certificate_date} onChange=${(v: string | null) => set({ certificate_date: v })} />
        <${TextField} id="f-received" label="Date received" type="date" value=${draft.date_received} onChange=${(v: string | null) => set({ date_received: v })} />
      </div>
      <label class="field"><span>Description of operations</span>
        <textarea id="f-desc" rows="3" value=${draft.description_of_operations ?? ""} onInput=${(e: Event) => set({ description_of_operations: val(e) || null })}></textarea></label>
      <label class="field"><span>Notes</span>
        <textarea id="f-notes" rows="2" value=${draft.notes ?? ""} onInput=${(e: Event) => set({ notes: val(e) || null })}></textarea></label>
    </section>

    <section class="card">
      <div class="sechead"><h2>Coverage lines</h2>
        <button type="button" class="btn ghost" onClick=${() => set({ coverages: [...draft.coverages, makeCoverage(draft.id, { sort_order: draft.coverages.length })] })}>Add coverage line</button></div>
      ${draft.coverages.length === 0 && html`<p class="muted">No coverage lines yet. Add one for each line on the certificate.</p>`}
      ${draft.coverages.map(
        (c, i) => html`<div class="coverage">
          <div class="spread">
            <strong>${c.coverage_type}</strong>
            <span class="row tight"><${StatusBadge} status=${coverageStatus(c.expiration_date, soon)} />
              <button type="button" class="btn ghost small danger-text" onClick=${() => set({ coverages: draft.coverages.filter((_, j) => j !== i) })}>Remove</button></span>
          </div>
          <div class="grid3">
            <label class="field"><span>Coverage type</span>
              <select id=${"c-type-" + c.id} value=${c.coverage_type} onChange=${(e: Event) => setCov(i, { coverage_type: val(e) as CoverageType })}>
                ${COVERAGE_TYPES.map((t) => html`<option value=${t}>${t}</option>`)}
              </select></label>
            <${TextField} id=${"c-carrier-" + c.id} label="Carrier" value=${c.insurer_name} onChange=${(v: string | null) => setCov(i, { insurer_name: v })} />
            <${TextField} id=${"c-policy-" + c.id} label="Policy #" value=${c.policy_number} onChange=${(v: string | null) => setCov(i, { policy_number: v })} />
            <${TextField} id=${"c-eff-" + c.id} label="Effective" type="date" value=${c.effective_date} onChange=${(v: string | null) => setCov(i, { effective_date: v })} />
            <${TextField} id=${"c-exp-" + c.id} label="Expires" type="date" value=${c.expiration_date} onChange=${(v: string | null) => setCov(i, { expiration_date: v })} />
            <div class="grid2 tight">
              <label class="field"><span>Additional insured</span>
                <select id=${"c-ai-" + c.id} value=${triValue(c.additional_insured)} onChange=${(e: Event) => setCov(i, { additional_insured: fromTri(val(e)) })}>
                  <option value="">Not shown</option><option value="yes">Yes</option><option value="no">No</option></select></label>
              <label class="field"><span>Waiver of subrogation</span>
                <select id=${"c-wos-" + c.id} value=${triValue(c.subrogation_waived)} onChange=${(e: Event) => setCov(i, { subrogation_waived: fromTri(val(e)) })}>
                  <option value="">Not shown</option><option value="yes">Yes</option><option value="no">No</option></select></label>
            </div>
          </div>
          <${LimitsEditor} id=${c.id} limits=${c.limits} onChange=${(limits: LimitLine[]) => setCov(i, { limits })} />
        </div>`,
      )}
    </section>
  </div>`;
}

function LimitsEditor({ id, limits, onChange }: { id: number; limits: LimitLine[]; onChange: (l: LimitLine[]) => void }) {
  const setAt = (i: number, patch: Partial<LimitLine>) => onChange(limits.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return html`<div class="limits">
    <span class="label">Limits</span>
    ${limits.map(
      (l, i) => html`<div class="limitrow">
        <input id=${`l-label-${id}-${i}`} aria-label="Limit name" type="text" value=${l.label} onInput=${(e: Event) => setAt(i, { label: val(e) })} />
        <input id=${`l-amt-${id}-${i}`} aria-label="Amount in dollars" class="num" type="number" min="0" step="1000" value=${l.amount ?? ""}
          onInput=${(e: Event) => setAt(i, { amount: val(e) ? Number(val(e)) : null, amount_raw: val(e) || null })} />
        <button type="button" class="btn ghost small" aria-label="Remove limit" onClick=${() => onChange(limits.filter((_, j) => j !== i))}>×</button>
      </div>`,
    )}
    <button type="button" class="btn ghost small" onClick=${() => onChange([...limits, { label: "Each Occurrence", amount: null, amount_raw: null }])}>Add limit</button>
  </div>`;
}

/* -------------------------------- vendors -------------------------------- */

function Vendors({ data, certs, onShowVendor }: { data: PageData; certs: CertificateWithRelations[]; onShowVendor: (id: number) => void }) {
  const [confirm, setConfirm] = useState<number | null>(null);
  const rows = data.vendors
    .map((v) => {
      const vc = certs.filter((c) => c.vendor_id === v.id);
      return {
        v,
        count: vc.length,
        result: evaluateVendorCompliance({ vendorId: v.id, certs: vc, requirements: data.requirements, soonDays: data.settings.soonDays }),
      };
    })
    .sort((a, b) => a.v.name.localeCompare(b.v.name));
  const tone = (s: string) => (s === "compliant" ? "green" : s === "non_compliant" ? "red" : s === "no_coi" ? "amber" : "grey");
  const label = (s: string) => (s === "compliant" ? "Compliant" : s === "non_compliant" ? "Not compliant" : s === "no_coi" ? "No COI" : "No requirements");

  async function removeVendor(id: number) {
    for (const c of store.data.certificates.filter((c) => c.vendor_id === id)) {
      await store.save("certificate", { ...c, vendor_id: null });
    }
    for (const r of store.data.requirements.filter((r) => r.vendor_id === id)) await store.remove("requirement", r.id);
    await store.remove("vendor", id);
    setConfirm(null);
    toast("Vendor removed. Its certificates are kept, without a vendor.");
  }

  return html`<div class="stack">
    <div class="pagehead"><h1>Vendors</h1><p class="muted">Each vendor's current coverage checked against your requirements.</p></div>
    ${rows.length === 0 && html`<p class="muted">No vendors yet. They're created from the insured name when certificates are read.</p>`}
    <ul class="list cards">
      ${rows.map(
        ({ v, count, result }) => html`<li class="card">
          <div class="spread"><h2 class="h3">${v.name}</h2><${Pill} tone=${tone(result.status)}>${label(result.status)}</${Pill}></div>
          <p class="small muted">${count} certificate${count === 1 ? "" : "s"} · checked against ${result.evaluated_against === "vendor" ? "this vendor's own rules" : result.evaluated_against === "global" ? "your standard requirements" : "no requirements"}</p>
          ${result.issues.length > 0 && html`<ul class="issues">${result.issues.map((i) => html`<li class=${i.severity}>${i.message}</li>`)}</ul>`}
          <div class="row">
            ${count > 0 && html`<button type="button" class="btn ghost small" onClick=${() => onShowVendor(v.id)}>Show certificates</button>`}
            ${confirm === v.id
              ? html`<span class="confirm small">Remove ${v.name}? <button type="button" class="btn danger small" onClick=${() => removeVendor(v.id)}>Remove</button> <button type="button" class="btn ghost small" onClick=${() => setConfirm(null)}>Keep</button></span>`
              : html`<button type="button" class="btn ghost small danger-text" onClick=${() => setConfirm(v.id)}>Remove vendor</button>`}
          </div>
        </li>`,
      )}
    </ul>
  </div>`;
}

/* --------------------------------- digest --------------------------------- */

function Digest({ data, certs }: { data: PageData; certs: CertificateWithRelations[] }) {
  const soon = data.settings.soonDays;
  const digest = useMemo(
    () => buildDigest({ certs, vendors: data.vendors, requirements: data.requirements, soonDays: soon }),
    [certs, data.vendors, data.requirements, soon],
  );
  const lineCount = digest.reduce((n, g) => n + g.lines.length, 0);
  const gapCount = digest.reduce((n, g) => n + g.gaps.length, 0);

  async function download() {
    const dl = await useCapability("downloads");
    if (!dl) {
      toast("Downloads aren't available here.");
      return;
    }
    try {
      await dl.save({ filename: `coi-hero-digest-${new Date().toISOString().slice(0, 10)}.csv`, data: digestCsv(digest) });
    } catch (e: any) {
      if (e?.code !== "declined") toast("The download didn't start. Try again in a moment.");
    }
  }

  return html`<div class="stack">
    <div class="pagehead spread wraprow">
      <div><h1>Expiration digest</h1>
        <p class="muted">Coverage expired or expiring within ${soon} days, plus compliance gaps, by vendor, earliest expiration first. ${lineCount} coverage lines · ${gapCount} gaps · ${digest.length} vendors.</p></div>
      <button type="button" class="btn ghost" onClick=${download}>Download digest</button>
    </div>
    ${digest.length === 0 && html`<section class="card empty"><h2>Nothing needs attention</h2><p class="muted">No coverage is expired or expiring in the next ${soon} days, and every vendor meets its requirements.</p></section>`}
    ${digest.map(
      (g) => html`<section class="card">
        <div class="spread"><h2 class="h3">${g.name}</h2>${g.earliestExpiration && html`<span class="small muted">Earliest: ${formatDate(g.earliestExpiration)}</span>`}</div>
        ${g.lines.length > 0 &&
        html`<div class="scroll"><table>
          <thead><tr><th>Coverage</th><th>Carrier</th><th>Policy #</th><th>Expires</th><th>When</th><th>Status</th><th></th></tr></thead>
          <tbody>${g.lines.map(
            ({ certificate, coverage, status, days }) => html`<tr>
              <td>${coverage.coverage_type}</td><td>${coverage.insurer_name ?? "–"}</td><td class="mono">${coverage.policy_number ?? "–"}</td>
              <td class="num">${formatDate(coverage.expiration_date)}</td>
              <td class=${"num strong " + (days < 0 ? "t-red" : "t-amber")}>${describeDays(days)}</td>
              <td><${StatusBadge} status=${status} /></td>
              <td><${Link} to=${{ name: "certificate", id: certificate.id }}>Certificate</${Link}></td>
            </tr>`,
          )}</tbody></table></div>`}
        ${g.gaps.length > 0 &&
        html`<div><h3 class="label">Compliance gaps</h3><ul class="list">${g.gaps.map(
          ({ issue, certificate }) => html`<li class="spread">
            <span class="row tight"><${Pill} tone=${issue.severity === "error" ? "red" : "amber"}>${issue.severity === "error" ? "Gap" : "Verify"}</${Pill}> <span>${issue.message}</span></span>
            ${certificate && html`<${Link} to=${{ name: "certificate", id: certificate.id }}>Certificate</${Link}>`}
          </li>`,
        )}</ul></div>`}
      </section>`,
    )}
  </div>`;
}

/* ------------------------------ requirements ------------------------------ */

function Requirements({ data }: { data: PageData }) {
  const [soon, setSoon] = useState(String(data.settings.soonDays));
  const rules = data.requirements.slice().sort((a, b) => (a.scope === b.scope ? a.coverage_type.localeCompare(b.coverage_type) : a.scope === "global" ? -1 : 1));

  async function saveSoon() {
    const n = Math.round(Number(soon));
    if (!Number.isFinite(n) || n < 1 || n > 365) {
      toast("Enter a number of days between 1 and 365.");
      return;
    }
    await ensureInitialized();
    await store.saveSettings({ ...store.data.settings, soonDays: n });
    toast("Saved.");
  }
  async function addRule() {
    await ensureInitialized();
    await store.save("requirement", makeRequirement({ coverage_type: "Commercial General Liability" }));
  }

  return html`<div class="stack">
    <div class="pagehead"><h1>Requirements</h1><p class="muted">The minimum coverage you expect. A vendor's own rule replaces the standard rule for that coverage type.</p></div>
    <section class="card">
      <h2>“Expiring soon” window</h2>
      <div class="row">
        <label class="field inline"><span>Days</span><input id="soon-days" class="num short" type="number" min="1" max="365" value=${soon} onInput=${(e: Event) => setSoon(val(e))} /></label>
        <button type="button" class="btn ghost" onClick=${saveSoon}>Save</button>
      </div>
    </section>
    <section class="card">
      <div class="sechead"><h2>Rules</h2><button type="button" class="btn ghost" onClick=${addRule}>Add rule</button></div>
      ${rules.map((r) => html`<${RuleEditor} key=${r.id} rule=${r} vendors=${data.vendors} />`)}
      ${rules.length === 0 && html`<p class="muted">No rules. Add one, or restore the standard set from Your data.</p>`}
    </section>
  </div>`;
}

function RuleEditor({ rule, vendors }: { rule: Requirement; vendors: Vendor[] }) {
  const [d, setD] = useState(rule);
  const [dirty, setDirty] = useState(false);
  const set = (patch: Partial<Requirement>) => {
    setD({ ...d, ...patch });
    setDirty(true);
  };
  const money = (k: "min_each_occurrence" | "min_aggregate" | "min_combined_single_limit", label: string) =>
    html`<label class="field"><span>${label}</span><input id=${`${k}-${d.id}`} class="num" type="number" min="0" step="100000" value=${d[k] ?? ""}
      onInput=${(e: Event) => set({ [k]: val(e) ? Number(val(e)) : null })} /></label>`;
  const scopeValue = d.scope === "vendor" && d.vendor_id != null ? String(d.vendor_id) : "global";
  return html`<div class="rule">
    <div class="grid3">
      <label class="field"><span>Applies to</span>
        <select id=${"r-scope-" + d.id} value=${scopeValue} onChange=${(e: Event) => {
          const v = val(e);
          set(v === "global" ? { scope: "global", vendor_id: null } : { scope: "vendor", vendor_id: Number(v) });
        }}>
          <option value="global">All vendors (standard)</option>
          ${vendors.slice().sort((a, b) => a.name.localeCompare(b.name)).map((v) => html`<option value=${String(v.id)}>${v.name} only</option>`)}
        </select></label>
      <label class="field"><span>Coverage type</span>
        <select id=${"r-type-" + d.id} value=${d.coverage_type} onChange=${(e: Event) => set({ coverage_type: val(e) as CoverageType })}>
          ${COVERAGE_TYPES.map((t) => html`<option value=${t}>${t}</option>`)}
        </select></label>
      <label class="field"><span>Required?</span>
        <select id=${"r-req-" + d.id} value=${d.required ? "1" : "0"} onChange=${(e: Event) => set({ required: val(e) === "1" ? 1 : 0 })}>
          <option value="1">Required</option><option value="0">Optional (not checked)</option></select></label>
      ${money("min_each_occurrence", "Minimum each occurrence ($)")}
      ${money("min_aggregate", "Minimum aggregate ($)")}
      ${money("min_combined_single_limit", "Minimum combined single limit ($)")}
    </div>
    <div class="row">
      <label class="check"><input id=${"r-ai-" + d.id} type="checkbox" checked=${!!d.require_additional_insured} onChange=${(e: Event) => set({ require_additional_insured: (e.currentTarget as HTMLInputElement).checked ? 1 : 0 })} /> Additional insured required</label>
      <label class="check"><input id=${"r-wos-" + d.id} type="checkbox" checked=${!!d.require_waiver_of_subrogation} onChange=${(e: Event) => set({ require_waiver_of_subrogation: (e.currentTarget as HTMLInputElement).checked ? 1 : 0 })} /> Waiver of subrogation required</label>
      <span class="grow"></span>
      ${dirty && html`<button type="button" class="btn small" onClick=${async () => {
        await ensureInitialized();
        await store.save("requirement", d);
        setDirty(false);
        toast("Rule saved.");
      }}>Save rule</button>`}
      <button type="button" class="btn ghost small danger-text" onClick=${async () => {
        await ensureInitialized();
        await store.remove("requirement", d.id);
      }}>Delete</button>
    </div>
  </div>`;
}

/* -------------------------------- your data -------------------------------- */

function YourData({ data, mode }: { data: PageData; mode: StorageMode }) {
  const [confirm, setConfirm] = useState<"" | "sample" | "delete" | "import">("");
  const [pendingImport, setPendingImport] = useState<PageData | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const hasData = data.certificates.length > 0 || data.vendors.length > 0;

  async function loadSample() {
    const { data: sample, files: pdfs } = sampleData();
    await files.clear();
    for (const [id, bytes] of pdfs) await files.put(id, new Blob([bytes as BlobPart], { type: "application/pdf" }));
    await store.replaceAll(sample);
    setConfirm("");
    toast("Sample data loaded.");
    goTo({ name: "dashboard" });
  }
  async function deleteAll() {
    await files.clear();
    const fresh = emptyData();
    fresh.requirements = defaultRequirements();
    await store.replaceAll(fresh);
    setConfirm("");
    toast("All your COI Hero data is deleted.");
  }
  async function exportBackup() {
    const dl = await useCapability("downloads");
    if (!dl) {
      toast("Downloads aren't available here.");
      return;
    }
    const body = JSON.stringify({ format: "coi-hero-backup", version: 1, exported_at: new Date().toISOString(), data: store.data }, null, 2);
    try {
      await dl.save({ filename: `coi-hero-backup-${new Date().toISOString().slice(0, 10)}.json`, data: body });
    } catch (e: any) {
      if (e?.code !== "declined") toast("The download didn't start. Try again in a moment.");
    }
  }
  async function readImport(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      const d = parsed?.format === "coi-hero-backup" ? parsed.data : null;
      if (!d || !Array.isArray(d.certificates) || !Array.isArray(d.vendors) || !Array.isArray(d.requirements)) {
        throw new Error("bad");
      }
      setPendingImport({ ...emptyData(), ...d, settings: { ...emptyData().settings, ...d.settings, initialized: true } });
      setConfirm("import");
    } catch {
      toast("That file isn't a COI Hero backup.");
    }
  }
  async function doImport() {
    if (!pendingImport) return;
    await store.replaceAll({
      ...pendingImport,
      certificates: pendingImport.certificates.map((c) => ({ ...c, has_file: false })),
    });
    setPendingImport(null);
    setConfirm("");
    toast("Backup restored. Original PDFs aren't part of a backup.");
  }

  const where =
    mode === "account"
      ? "Your records are saved in your Claude account, in a private space only you can see. They follow you to other computers when you open this page while signed in."
      : mode === "browser"
        ? "Your records are saved in this browser only. Clearing your browser data, using a private window or switching computers means they're gone, so export a backup now and then."
        : "This browser is blocking storage for this page, so nothing is saved. Export a backup before you close the page.";

  return html`<div class="stack">
    <div class="pagehead"><h1>Your data</h1></div>
    <section class="card prose">
      <h2>Where it's kept</h2>
      <p>${where}</p>
      <p>Original PDFs stay in this browser and are never uploaded to COI Hero. When Claude reads a certificate, its text (or page pictures) goes to Claude under your account and your account's data settings.</p>
      <p class="muted small">${data.certificates.length} certificates · ${data.vendors.length} vendors · ${data.requirements.length} rules</p>
    </section>
    <section class="card prose">
      <h2>This is a demo</h2>
      <p>COI Hero here is for trying the idea on your own certificates. It has no backups you don't make yourself, no shared team access, no audit trail and no security review, so it won't meet a company IT department's standards as it is.</p>
      <p>The full app is open source. A technical person can run it on your company's own systems and add sign-in, backups and access controls: <a href=${REPO_URL} target="_blank" rel="noreferrer">${REPO_URL.replace("https://", "")}</a></p>
    </section>
    <section class="card">
      <h2>Sample data</h2>
      <p class="muted">About 10 made-up vendors and 12 certificates with a spread of expired, expiring, under-limit and missing coverage.</p>
      <div class="row">
        ${confirm === "sample"
          ? html`<span class="confirm">This replaces your current data. <button type="button" class="btn danger" onClick=${loadSample}>Replace with sample data</button> <button type="button" class="btn ghost" onClick=${() => setConfirm("")}>Cancel</button></span>`
          : html`<button type="button" class="btn" onClick=${() => (hasData ? setConfirm("sample") : loadSample())}>Load sample data</button>`}
      </div>
    </section>
    <section class="card">
      <h2>Backups</h2>
      <p class="muted">A backup file holds your records, not the original PDFs.</p>
      <div class="row">
        <button type="button" class="btn ghost" onClick=${exportBackup}>Export backup</button>
        <button type="button" class="btn ghost" onClick=${() => importInput.current?.click()}>Restore a backup</button>
        <input id="import-file" ref=${importInput} type="file" accept="application/json,.json" hidden onChange=${(e: Event) => {
          const t = e.currentTarget as HTMLInputElement;
          if (t.files?.[0]) readImport(t.files[0]);
          t.value = "";
        }} />
      </div>
      ${confirm === "import" && html`<p class="confirm">Restoring replaces your current data with the backup's ${pendingImport?.certificates.length ?? 0} certificates.
        <button type="button" class="btn danger" onClick=${doImport}>Restore</button> <button type="button" class="btn ghost" onClick=${() => setConfirm("")}>Cancel</button></p>`}
    </section>
    <section class="card">
      <h2>Delete everything</h2>
      <p class="muted">Removes all certificates, vendors and rules, and the PDFs kept in this browser. Requirements go back to the standard set.</p>
      ${confirm === "delete"
        ? html`<p class="confirm">This can't be undone. <button type="button" class="btn danger" onClick=${deleteAll}>Delete all my data</button> <button type="button" class="btn ghost" onClick=${() => setConfirm("")}>Cancel</button></p>`
        : html`<div class="row"><button type="button" class="btn ghost danger-text" onClick=${() => setConfirm("delete")}>Delete all my data</button></div>`}
    </section>
  </div>`;
}

/* ---------------------------------- app ---------------------------------- */

function readHash(): Route {
  try {
    const t = location.hash.replace(/^#/, "");
    if (TABS.some((x) => x.name === t)) return { name: t } as Route;
  } catch {
    /* ignore */
  }
  return { name: "dashboard" };
}

function App() {
  const [data, setData] = useState<PageData>(store.data);
  const [mode, setMode] = useState<StorageMode>(store.mode);
  const [ready, setReady] = useState(false);
  const [route, setRoute] = useState<Route>(readHash());
  const [vendorFilter, setVendorFilter] = useState<number | null>(null);
  const [support, setSupport] = useState<ReaderSupport | null>(null);
  const [message, setMessage] = useState("");

  goTo = (r) => {
    if (r.name !== "certificates") setVendorFilter(null);
    setRoute(r);
    try {
      if (r.name !== "certificate") history.replaceState(null, "", "#" + r.name);
    } catch {
      /* ignore */
    }
    try {
      window.scrollTo({ top: 0 });
    } catch {
      /* ignore */
    }
  };
  toast = (m) => {
    setMessage(m);
    setTimeout(() => setMessage((cur) => (cur === m ? "" : cur)), 5000);
  };

  useEffect(() => {
    store.onChange = (d) => {
      setData(d);
      setMode(store.mode);
    };
    store.onNotice = (m) => toast(m);
    store.open().then(() => {
      if (!store.data.settings.initialized && store.data.requirements.length === 0) {
        store.data.requirements = defaultRequirements();
        setData({ ...store.data });
      }
      setMode(store.mode);
      setReady(true);
    });
    readerSupport().then(setSupport);
  }, []);

  const certs = useMemo(() => withRelations(data), [data]);
  const active = route.name === "certificate" ? "certificates" : route.name;

  let body;
  if (!ready) body = html`<p class="muted">Opening your COI Hero data…</p>`;
  else if (route.name === "dashboard") body = html`<${Dashboard} data=${data} certs=${certs} />`;
  else if (route.name === "add") body = html`<${AddCertificates} support=${support} />`;
  else if (route.name === "certificates") body = html`<${Certificates} key=${"v" + vendorFilter} data=${data} certs=${certs} vendorFilter=${vendorFilter} />`;
  else if (route.name === "certificate") body = html`<${CertificateDetail} key=${route.id} id=${route.id} data=${data} support=${support} />`;
  else if (route.name === "vendors")
    body = html`<${Vendors} data=${data} certs=${certs} onShowVendor=${(id: number) => {
      goTo({ name: "certificates" });
      setVendorFilter(id);
    }} />`;
  else if (route.name === "digest") body = html`<${Digest} data=${data} certs=${certs} />`;
  else if (route.name === "requirements") body = html`<${Requirements} key=${data.settings.soonDays} data=${data} />`;
  else body = html`<${YourData} data=${data} mode=${mode} />`;

  return html`<div class="app">
    <header class="top">
      <div class="brand"><span class="mark" aria-hidden="true">C</span><span>COI Hero</span></div>
      <nav class="tabs" aria-label="Sections">
        ${TABS.map((t) => html`<button type="button" class=${"tab" + (active === t.name ? " on" : "")} aria-current=${active === t.name ? "page" : undefined} onClick=${() => goTo({ name: t.name } as Route)}>${t.label}</button>`)}
      </nav>
    </header>
    ${ready && html`<${StorageBanner} mode=${mode} />`}
    <main>${body}</main>
    <div class="toast" role="status" aria-live="polite" hidden=${!message}>${message}</div>
  </div>`;
}

export function mount(el: HTMLElement) {
  render(html`<${App} />`, el);
}
