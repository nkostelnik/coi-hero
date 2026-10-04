// Extraction rules, output schema and cleanup shared by the server
// extractor (extract.ts) and the Claude page (src/claude-page).
import { toIsoDate } from "./dates";
import { COVERAGE_TYPES } from "./types";
import type { CoverageType, ExtractionResult, LimitLine } from "./types";

export const EXTRACTION_RULES = `You read Certificates of Insurance (COIs), most often the ACORD 25 "Certificate of Liability Insurance" form, and return their data as structured fields.

Rules:
- Transcribe only what the document shows. Do not infer or fill gaps. Use null for anything not present or not legible.
- Dates: return as YYYY-MM-DD.
- Money limits: return the numeric value with no symbols or commas (1000000, not "$1,000,000"). Keep the printed text in amount_raw.
- One entry in "coverages" per coverage line shown on the form (GENERAL LIABILITY, AUTOMOBILE LIABILITY, UMBRELLA/EXCESS, WORKERS COMPENSATION, and any others such as professional, cyber, pollution, property).
- additional_insured / subrogation_waived: true only if the row's ADDL INSD / SUBR WVD box is clearly marked yes; false if clearly marked no; null if blank or unclear.
- primary_noncontributory: true if the Description of Operations / endorsements state this coverage is primary and non-contributory; false if explicitly not; null if not mentioned.
- per_project_aggregate: true if a "per project" or "per location" aggregate endorsement is indicated for that coverage; null if not mentioned.
- notice_of_cancellation_days: the number of days' notice of cancellation stated for that coverage / the certificate (e.g. 30); null if only the ACORD boilerplate is present.
- Put anything notable (expired policy, handwritten edits, "see attached", non-standard form) in "notes".`;

/** JSON schema for one extracted certificate (the record_certificate tool input). */
export const CERTIFICATE_SCHEMA = {
  type: "object",
  properties: {
    certificate_date: {
      type: ["string", "null"],
      description: "The date the certificate was issued (top right of ACORD 25).",
    },
    producer: {
      type: "object",
      properties: {
        name: { type: ["string", "null"] },
        contact_name: { type: ["string", "null"] },
        phone: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
        address: { type: ["string", "null"] },
      },
    },
    insured: {
      type: "object",
      properties: {
        name: { type: ["string", "null"] },
        address: { type: ["string", "null"] },
      },
    },
    certificate_holder: {
      type: "object",
      properties: {
        name: { type: ["string", "null"] },
        address: { type: ["string", "null"] },
      },
    },
    description_of_operations: { type: ["string", "null"] },
    insurers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          letter: {
            type: ["string", "null"],
            description: "INSURER A / B / C ... label",
          },
          name: { type: ["string", "null"] },
          naic: { type: ["string", "null"] },
        },
      },
    },
    coverages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          coverage_type: {
            type: "string",
            description:
              "One of: " + COVERAGE_TYPES.join(", ") + ". Use 'Other' if none fit.",
          },
          coverage_type_raw: {
            type: ["string", "null"],
            description: "The coverage label exactly as printed.",
          },
          insurer_letter: { type: ["string", "null"] },
          insurer_name: { type: ["string", "null"] },
          policy_number: { type: ["string", "null"] },
          effective_date: { type: ["string", "null"] },
          expiration_date: { type: ["string", "null"] },
          additional_insured: { type: ["boolean", "null"] },
          subrogation_waived: { type: ["boolean", "null"] },
          primary_noncontributory: { type: ["boolean", "null"] },
          per_project_aggregate: { type: ["boolean", "null"] },
          notice_of_cancellation_days: { type: ["number", "null"] },
          limits: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: {
                  type: "string",
                  description:
                    "e.g. 'Each Occurrence', 'General Aggregate', 'Combined Single Limit', 'EL Each Accident'",
                },
                amount: { type: ["number", "null"] },
                amount_raw: { type: ["string", "null"] },
              },
              required: ["label"],
            },
          },
        },
        required: ["coverage_type"],
      },
    },
    notes: { type: ["string", "null"] },
  },
  required: ["coverages"],
} as const;

/* ------------------------- normalization ------------------------- */

export function normalizeCoverageType(raw: unknown): CoverageType {
  const s = String(raw ?? "").toLowerCase();
  if ((COVERAGE_TYPES as readonly string[]).includes(String(raw)))
    return raw as CoverageType;
  if (/pollution|environmental/.test(s)) return "Pollution / Environmental Liability";
  if (/cyber|privacy|data breach/.test(s)) return "Cyber Liability";
  if (/professional|errors|omissions|e&o|e & o|malpractice/.test(s))
    return "Professional Liability / E&O";
  if (/umbrella|excess/.test(s)) return "Umbrella / Excess Liability";
  if (/workers.?comp|workman|employers.? liability|\bwc\b/.test(s))
    return "Workers Compensation & Employers Liability";
  if (/auto|vehicle|garage/.test(s)) return "Automobile Liability";
  if (/general liability|\bcgl\b|\bgl\b|premises|liability - general/.test(s))
    return "Commercial General Liability";
  if (/propert|building|contents|inland marine/.test(s)) return "Property";
  return "Other";
}

function parseAmount(value: unknown, raw: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? raw ?? "").replace(/[^0-9.]/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeLimits(input: unknown): LimitLine[] {
  const arr = Array.isArray(input)
    ? input
    : input && typeof input === "object"
      ? Object.entries(input).map(([label, amount]) => ({ label, amount }))
      : [];
  return arr
    .map((l): LimitLine | null => {
      const rec = (l ?? {}) as Record<string, unknown>;
      const label = String(rec.label ?? "").trim();
      if (!label) return null;
      return {
        label,
        amount: parseAmount(rec.amount, rec.amount_raw),
        amount_raw:
          rec.amount_raw != null
            ? String(rec.amount_raw)
            : rec.amount != null
              ? String(rec.amount)
              : null,
      };
    })
    .filter((l): l is LimitLine => l !== null);
}

function str(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim();
  return s ? s : null;
}

function bool(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  const s = String(v ?? "").toLowerCase().trim();
  if (["y", "yes", "true", "x", "1"].includes(s)) return true;
  if (["n", "no", "false", "0"].includes(s)) return false;
  return null;
}

export function normalize(input: Record<string, unknown>): ExtractionResult {
  const producer = (input.producer ?? {}) as Record<string, unknown>;
  const insured = (input.insured ?? {}) as Record<string, unknown>;
  const holder = (input.certificate_holder ?? {}) as Record<string, unknown>;
  const insurers = Array.isArray(input.insurers) ? input.insurers : [];
  const coverages = Array.isArray(input.coverages) ? input.coverages : [];

  return {
    certificate_date: toIsoDate(str(input.certificate_date)),
    producer: {
      name: str(producer.name),
      contact_name: str(producer.contact_name),
      phone: str(producer.phone),
      email: str(producer.email),
      address: str(producer.address),
    },
    insured: { name: str(insured.name), address: str(insured.address) },
    certificate_holder: {
      name: str(holder.name),
      address: str(holder.address),
    },
    description_of_operations: str(input.description_of_operations),
    insurers: insurers.map((i) => {
      const rec = (i ?? {}) as Record<string, unknown>;
      return {
        letter: str(rec.letter),
        name: str(rec.name),
        naic: str(rec.naic),
      };
    }),
    coverages: coverages.map((c) => {
      const rec = (c ?? {}) as Record<string, unknown>;
      return {
        coverage_type: normalizeCoverageType(rec.coverage_type),
        coverage_type_raw: str(rec.coverage_type_raw) ?? str(rec.coverage_type),
        insurer_letter: str(rec.insurer_letter),
        insurer_name: str(rec.insurer_name),
        policy_number: str(rec.policy_number),
        effective_date: toIsoDate(str(rec.effective_date)),
        expiration_date: toIsoDate(str(rec.expiration_date)),
        additional_insured: bool(rec.additional_insured),
        subrogation_waived: bool(rec.subrogation_waived),
        primary_noncontributory: bool(rec.primary_noncontributory),
        per_project_aggregate: bool(rec.per_project_aggregate),
        notice_of_cancellation_days:
          rec.notice_of_cancellation_days == null
            ? null
            : Number(
                String(rec.notice_of_cancellation_days).replace(/[^0-9]/g, ""),
              ) || null,
        limits: normalizeLimits(rec.limits),
      };
    }),
    notes: str(input.notes),
  };
}
