// Shared types for COI Hero.

export const COVERAGE_TYPES = [
  "Commercial General Liability",
  "Automobile Liability",
  "Umbrella / Excess Liability",
  "Workers Compensation & Employers Liability",
  "Professional Liability / E&O",
  "Cyber Liability",
  "Pollution / Environmental Liability",
  "Property",
  "Other",
] as const;

export type CoverageType = (typeof COVERAGE_TYPES)[number];

export type ExtractionStatus =
  | "pending"
  | "ok"
  | "failed"
  | "manual"
  | "skipped";

export type CoverageStatus =
  | "active"
  | "expiring_soon"
  | "expired"
  | "unknown";

export interface Vendor {
  id: number;
  name: string;
  aliases: string[];
  contact_name: string | null;
  contact_email: string | null;
  notes: string | null;
  update_requested_on: string | null;
  created_at: string;
}

export interface LimitLine {
  label: string;
  amount: number | null;
  amount_raw: string | null;
}

export interface Insurer {
  letter: string | null;
  name: string | null;
  naic: string | null;
}

export interface Coverage {
  id: number;
  certificate_id: number;
  coverage_type: CoverageType;
  coverage_type_raw: string | null;
  insurer_name: string | null;
  insurer_letter: string | null;
  naic: string | null;
  policy_number: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  additional_insured: 0 | 1 | null;
  subrogation_waived: 0 | 1 | null;
  primary_noncontributory: 0 | 1 | null;
  per_project_aggregate: 0 | 1 | null;
  notice_of_cancellation_days: number | null;
  limits: LimitLine[];
  sort_order: number;
}

export interface Certificate {
  id: number;
  vendor_id: number | null;
  file_name: string;
  original_file_name: string;
  file_size: number | null;
  content_type: string | null;
  source: "upload" | "email";
  source_meta: Record<string, unknown> | null;
  certificate_date: string | null;
  producer_name: string | null;
  producer_contact: string | null;
  producer_phone: string | null;
  producer_email: string | null;
  insured_name: string | null;
  insured_address: string | null;
  certificate_holder_name: string | null;
  certificate_holder_address: string | null;
  description_of_operations: string | null;
  contract_reference: string | null;
  internal_owner: string | null;
  date_received: string | null;
  insurers: Insurer[];
  raw_extraction_json: unknown;
  extraction_status: ExtractionStatus;
  extraction_error: string | null;
  extraction_model: string | null;
  reviewed: 0 | 1;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contract {
  id: number;
  title: string;
  counterparty: string | null;
  vendor_id: number | null;
  reference: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  status: "active" | "expired" | "terminated";
  owner: string | null;
  notes: string | null;
  inherit_global_requirements: 0 | 1;
  created_at: string;
}

export interface CertificateWithRelations extends Certificate {
  vendor: Vendor | null;
  coverages: Coverage[];
  contracts: Contract[];
}

export interface Requirement {
  id: number;
  scope: "global" | "vendor" | "contract";
  vendor_id: number | null;
  contract_id: number | null;
  coverage_type: CoverageType;
  min_each_occurrence: number | null;
  min_aggregate: number | null;
  min_combined_single_limit: number | null;
  require_additional_insured: 0 | 1;
  require_waiver_of_subrogation: 0 | 1;
  required: 0 | 1;
  notes: string | null;
  created_at: string;
}

export interface ComplianceIssue {
  coverage_type: CoverageType;
  severity: "error" | "warning";
  message: string;
}

export interface VendorCompliance {
  vendor_id: number;
  status: "compliant" | "non_compliant" | "no_coi" | "unknown";
  issues: ComplianceIssue[];
  evaluated_against: "vendor" | "global" | "none";
}

export interface ContractCompliance {
  contract_id: number;
  status: "compliant" | "non_compliant" | "no_coi" | "unknown";
  issues: ComplianceIssue[];
  evaluated_against: "contract" | "contract+global" | "global" | "none";
}

// Shape returned by the extraction model.
export interface ExtractionResult {
  certificate_date: string | null;
  producer: {
    name: string | null;
    contact_name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
  insured: { name: string | null; address: string | null };
  certificate_holder: { name: string | null; address: string | null };
  description_of_operations: string | null;
  insurers: Insurer[];
  coverages: Array<{
    coverage_type: CoverageType;
    coverage_type_raw: string | null;
    insurer_letter: string | null;
    insurer_name: string | null;
    policy_number: string | null;
    effective_date: string | null;
    expiration_date: string | null;
    additional_insured: boolean | null;
    subrogation_waived: boolean | null;
    primary_noncontributory: boolean | null;
    per_project_aggregate: boolean | null;
    notice_of_cancellation_days: number | null;
    limits: LimitLine[];
  }>;
  notes: string | null;
}
