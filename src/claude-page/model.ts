// Records the Claude page keeps, shaped like the server app's types so the
// shared status, compliance and digest code in src/lib runs on them as-is.
import { DEFAULT_GLOBAL_REQUIREMENTS, DEFAULT_SOON_DAYS } from "@/lib/defaults";
import { DEMO_CERTS, DEMO_VENDOR_REQUIREMENTS } from "@/lib/demoData";
import { renderCertificatePdf } from "@/lib/samplePdf";
import type {
  Certificate,
  CertificateWithRelations,
  Coverage,
  CoverageType,
  ExtractionResult,
  Requirement,
  Vendor,
} from "@/lib/types";

/** A certificate with its coverage lines, as stored by the page. */
export interface PageCertificate extends Certificate {
  coverages: Coverage[];
  /** True when the original file is kept in this browser. */
  has_file: boolean;
}

export interface PageSettings {
  soonDays: number;
  /** Set once the starting requirements have been saved. */
  initialized?: boolean;
}

export interface PageData {
  vendors: Vendor[];
  certificates: PageCertificate[];
  requirements: Requirement[];
  settings: PageSettings;
}

export const emptyData = (): PageData => ({
  vendors: [],
  certificates: [],
  requirements: [],
  settings: { soonDays: DEFAULT_SOON_DAYS },
});

let lastId = 0;
/** Unique numeric ids (the shared code compares ids as numbers). */
export function newId(): number {
  const id = Date.now() * 100 + Math.floor(Math.random() * 100);
  lastId = id > lastId ? id : lastId + 1;
  return lastId;
}

const nowIso = () => new Date().toISOString();
export const todayIso = () => new Date().toISOString().slice(0, 10);

export function isoOffset(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function makeVendor(name: string, aliases: string[] = []): Vendor {
  return {
    id: newId(),
    name: name.trim(),
    aliases,
    contact_name: null,
    contact_email: null,
    notes: null,
    update_requested_on: null,
    created_at: nowIso(),
  };
}

export function makeCertificate(
  fields: Partial<PageCertificate> & { original_file_name: string },
): PageCertificate {
  const t = nowIso();
  return {
    id: newId(),
    vendor_id: null,
    file_name: fields.original_file_name,
    file_size: null,
    content_type: null,
    source: "upload",
    source_meta: null,
    certificate_date: null,
    producer_name: null,
    producer_contact: null,
    producer_phone: null,
    producer_email: null,
    insured_name: null,
    insured_address: null,
    certificate_holder_name: null,
    certificate_holder_address: null,
    description_of_operations: null,
    contract_reference: null,
    internal_owner: null,
    date_received: todayIso(),
    insurers: [],
    raw_extraction_json: null,
    extraction_status: "pending",
    extraction_error: null,
    extraction_model: null,
    reviewed: 0,
    notes: null,
    created_at: t,
    updated_at: t,
    coverages: [],
    has_file: false,
    ...fields,
  };
}

export function makeCoverage(
  certificateId: number,
  fields: Partial<Coverage> = {},
): Coverage {
  return {
    id: newId(),
    certificate_id: certificateId,
    coverage_type: "Commercial General Liability",
    coverage_type_raw: null,
    insurer_name: null,
    insurer_letter: null,
    naic: null,
    policy_number: null,
    effective_date: null,
    expiration_date: null,
    additional_insured: null,
    subrogation_waived: null,
    primary_noncontributory: null,
    per_project_aggregate: null,
    notice_of_cancellation_days: null,
    limits: [],
    sort_order: 0,
    ...fields,
  };
}

export function makeRequirement(fields: Partial<Requirement> & { coverage_type: CoverageType }): Requirement {
  return {
    id: newId(),
    scope: "global",
    vendor_id: null,
    contract_id: null,
    min_each_occurrence: null,
    min_aggregate: null,
    min_combined_single_limit: null,
    require_additional_insured: 0,
    require_waiver_of_subrogation: 0,
    required: 1,
    notes: null,
    created_at: nowIso(),
    ...fields,
  };
}

export function defaultRequirements(): Requirement[] {
  return DEFAULT_GLOBAL_REQUIREMENTS.map((r) =>
    makeRequirement({
      coverage_type: r.coverage_type!,
      min_each_occurrence: r.min_each_occurrence ?? null,
      min_aggregate: r.min_aggregate ?? null,
      min_combined_single_limit: r.min_combined_single_limit ?? null,
      require_additional_insured: r.require_additional_insured ?? 0,
      require_waiver_of_subrogation: r.require_waiver_of_subrogation ?? 0,
      required: r.required ?? 1,
    }),
  );
}

const tri = (v: boolean | null | undefined): 0 | 1 | null =>
  v == null ? null : v ? 1 : 0;

/** Same matching rule as the server app: exact name, then an alias. */
export function findVendor(vendors: Vendor[], rawName: string): Vendor | null {
  const lc = rawName.trim().toLowerCase();
  if (!lc) return null;
  return (
    vendors.find((v) => v.name.trim().toLowerCase() === lc) ??
    vendors.find((v) => v.aliases.some((a) => a.trim().toLowerCase() === lc)) ??
    null
  );
}

/** Copy an extraction onto a certificate, replacing its coverage lines. */
export function applyExtraction(
  cert: PageCertificate,
  r: ExtractionResult,
  model: string,
): PageCertificate {
  return {
    ...cert,
    certificate_date: r.certificate_date,
    producer_name: r.producer.name,
    producer_contact: r.producer.contact_name,
    producer_phone: r.producer.phone,
    producer_email: r.producer.email,
    insured_name: r.insured.name,
    insured_address: r.insured.address,
    certificate_holder_name: r.certificate_holder.name,
    certificate_holder_address: r.certificate_holder.address,
    description_of_operations: r.description_of_operations,
    insurers: r.insurers,
    notes: r.notes,
    extraction_status: "ok",
    extraction_error: null,
    extraction_model: model,
    reviewed: 0,
    updated_at: nowIso(),
    coverages: r.coverages.map((c, i) =>
      makeCoverage(cert.id, {
        coverage_type: c.coverage_type,
        coverage_type_raw: c.coverage_type_raw,
        insurer_letter: c.insurer_letter,
        insurer_name: c.insurer_name,
        policy_number: c.policy_number,
        effective_date: c.effective_date,
        expiration_date: c.expiration_date,
        additional_insured: tri(c.additional_insured),
        subrogation_waived: tri(c.subrogation_waived),
        primary_noncontributory: tri(c.primary_noncontributory),
        per_project_aggregate: tri(c.per_project_aggregate),
        notice_of_cancellation_days: c.notice_of_cancellation_days,
        limits: c.limits,
        sort_order: i,
      }),
    ),
  };
}

/** Certificates joined to their vendor, in the shape src/lib expects. */
export function withRelations(data: PageData): CertificateWithRelations[] {
  const byId = new Map(data.vendors.map((v) => [v.id, v]));
  return data.certificates.map((c) => ({
    ...c,
    vendor: c.vendor_id != null ? (byId.get(c.vendor_id) ?? null) : null,
    contracts: [],
  }));
}

/* ----------------------------- sample data ----------------------------- */

function usDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}
const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/**
 * The server app's demo dataset (src/lib/demoData.ts) as page records, plus
 * a generated stand-in PDF for each certificate.
 */
export function sampleData(): { data: PageData; files: Map<number, Uint8Array> } {
  const data = emptyData();
  data.settings.initialized = true;
  data.requirements = defaultRequirements();
  const files = new Map<number, Uint8Array>();

  const vendorFor = (name: string, aliases?: string[]) => {
    let v = findVendor(data.vendors, name);
    if (!v) {
      v = makeVendor(name, aliases ?? []);
      data.vendors.push(v);
    }
    return v;
  };

  for (const spec of DEMO_CERTS) {
    const certDate = isoOffset(spec.cert_date_offset);
    const vendor = spec.vendor ? vendorFor(spec.vendor, spec.aliases) : null;
    const carriers = [...new Set(spec.coverages.map((c) => c.carrier))];
    const cert = makeCertificate({
      original_file_name: spec.original_file_name,
      content_type: "application/pdf",
      vendor_id: vendor?.id ?? null,
      certificate_date: certDate,
      producer_name: spec.producer,
      insured_name: spec.insured_name,
      insured_address: spec.insured_address,
      certificate_holder_name: spec.holder,
      certificate_holder_address: spec.holder_address,
      description_of_operations: spec.description ?? null,
      contract_reference: spec.contract_reference ?? null,
      internal_owner: spec.internal_owner ?? null,
      date_received: isoOffset(spec.date_received_offset),
      insurers: carriers.map((name, i) => ({
        letter: String.fromCharCode(65 + i),
        name,
        naic: null,
      })),
      extraction_status: "ok",
      extraction_model: "sample",
      reviewed: spec.reviewed ? 1 : 0,
      notes: "Sample data: a generated example, not a real certificate.",
      has_file: true,
    });
    cert.coverages = spec.coverages.map((c, i) =>
      makeCoverage(cert.id, {
        coverage_type: c.coverage_type,
        insurer_name: c.carrier,
        policy_number: c.policy_number,
        effective_date: isoOffset(c.eff_offset),
        expiration_date: isoOffset(c.exp_offset),
        additional_insured: tri(c.additional_insured),
        subrogation_waived: tri(c.subrogation_waived),
        primary_noncontributory: tri(c.primary_noncontributory),
        per_project_aggregate: tri(c.per_project_aggregate),
        notice_of_cancellation_days: c.notice_of_cancellation_days ?? null,
        limits: c.limits.map((l) => ({
          label: l.label,
          amount: l.amount,
          amount_raw: money(l.amount),
        })),
        sort_order: i,
      }),
    );
    data.certificates.push(cert);

    const pdf = renderCertificatePdf({
      certificateDate: usDate(certDate),
      producer: spec.producer,
      insured: `${spec.insured_name}, ${spec.insured_address}`,
      holder: `${spec.holder}, ${spec.holder_address}`,
      description: spec.description ?? null,
      coverages: cert.coverages.map((c, i) => ({
        label: c.coverage_type,
        carrier: c.insurer_name ?? "",
        policyNumber: c.policy_number ?? "",
        effective: usDate(c.effective_date!),
        expiration: usDate(c.expiration_date!),
        limits: spec.coverages[i].limits.map((l) => ({
          label: l.label,
          amount: money(l.amount),
        })),
        addlInsured: !!spec.coverages[i].additional_insured,
        subrWaived: !!spec.coverages[i].subrogation_waived,
      })),
    });
    const bytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i);
    files.set(cert.id, bytes);
  }

  for (const r of DEMO_VENDOR_REQUIREMENTS) {
    data.requirements.push(
      makeRequirement({
        scope: "vendor",
        vendor_id: vendorFor(r.vendor).id,
        coverage_type: r.coverage_type,
        min_each_occurrence: r.min_each_occurrence ?? null,
        min_aggregate: r.min_aggregate ?? null,
        require_additional_insured: r.require_additional_insured ? 1 : 0,
        required: r.required === false ? 0 : 1,
        notes: "Sample data",
      }),
    );
  }
  return { data, files };
}
