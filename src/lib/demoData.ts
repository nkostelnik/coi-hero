import type { CoverageType } from "./types";

export interface DemoLimit {
  label: string;
  amount: number;
}
export interface DemoCoverage {
  coverage_type: CoverageType;
  carrier: string;
  policy_number: string;
  eff_offset: number; // days from today
  exp_offset: number;
  limits: DemoLimit[];
  additional_insured?: boolean;
  subrogation_waived?: boolean;
  primary_noncontributory?: boolean;
  per_project_aggregate?: boolean;
  notice_of_cancellation_days?: number;
}
export interface DemoCert {
  vendor: string | null;
  aliases?: string[];
  producer: string;
  insured_name: string;
  insured_address: string;
  holder: string;
  holder_address: string;
  cert_date_offset: number;
  date_received_offset: number;
  contract_reference?: string;
  internal_owner?: string;
  description?: string;
  reviewed: boolean;
  original_file_name: string;
  coverages: DemoCoverage[];
}

const HOLDER = "Meridian Property Group";
const HOLDER_ADDR = "400 Market Street, Suite 1200, San Francisco, CA 94105";

const gl = (o: Partial<DemoCoverage> & Pick<DemoCoverage, "carrier" | "policy_number" | "exp_offset">): DemoCoverage => ({
  coverage_type: "Commercial General Liability",
  eff_offset: o.exp_offset - 365,
  limits: [
    { label: "Each Occurrence", amount: 1_000_000 },
    { label: "General Aggregate", amount: 2_000_000 },
    { label: "Products-Comp/Op Agg", amount: 2_000_000 },
    { label: "Personal & Adv Injury", amount: 1_000_000 },
  ],
  additional_insured: true,
  subrogation_waived: true,
  primary_noncontributory: true,
  notice_of_cancellation_days: 30,
  ...o,
});

const auto = (o: Partial<DemoCoverage> & Pick<DemoCoverage, "carrier" | "policy_number" | "exp_offset">): DemoCoverage => ({
  coverage_type: "Automobile Liability",
  eff_offset: o.exp_offset - 365,
  limits: [{ label: "Combined Single Limit", amount: 1_000_000 }],
  additional_insured: true,
  subrogation_waived: true,
  ...o,
});

const wc = (o: Partial<DemoCoverage> & Pick<DemoCoverage, "carrier" | "policy_number" | "exp_offset">): DemoCoverage => ({
  coverage_type: "Workers Compensation & Employers Liability",
  eff_offset: o.exp_offset - 365,
  limits: [
    { label: "EL Each Accident", amount: 1_000_000 },
    { label: "EL Disease - Each Employee", amount: 1_000_000 },
    { label: "EL Disease - Policy Limit", amount: 1_000_000 },
  ],
  subrogation_waived: true,
  ...o,
});

export const DEMO_CERTS: DemoCert[] = [
  {
    vendor: "Skyline Steel Erectors",
    aliases: ["Skyline Steel Erectors, Inc."],
    producer: "Marsh McLennan Agency",
    insured_name: "Skyline Steel Erectors, Inc.",
    insured_address: "1877 Industrial Pkwy, Oakland, CA 94607",
    holder: HOLDER,
    holder_address: HOLDER_ADDR,
    cert_date_offset: -40,
    date_received_offset: -39,
    contract_reference: "MSA-2025-088 / Tower B structural steel",
    internal_owner: "J. Rivera (Construction PM)",
    description:
      "General Liability includes blanket additional insured and primary & non-contributory wording per endorsement CG2010/CG2037. Waiver of subrogation applies. Umbrella follows form.",
    reviewed: true,
    original_file_name: "Skyline-Steel-COI-2025.pdf",
    coverages: [
      gl({ carrier: "Travelers", policy_number: "6809K221144", exp_offset: 300, per_project_aggregate: true }),
      auto({ carrier: "Travelers", policy_number: "BA-6809K221145", exp_offset: 300 }),
      wc({ carrier: "Travelers", policy_number: "UB-6809K221146", exp_offset: 300 }),
    ],
  },
  {
    vendor: "Copperline Electric Co.",
    producer: "HUB International",
    insured_name: "Copperline Electric Co.",
    insured_address: "55 Wattage Way, San Jose, CA 95112",
    holder: HOLDER,
    holder_address: HOLDER_ADDR,
    cert_date_offset: -330,
    date_received_offset: -328,
    contract_reference: "PO-4471 / Lobby lighting retrofit",
    internal_owner: "D. Okafor (Facilities)",
    reviewed: true,
    original_file_name: "Copperline-Electric-COI.pdf",
    coverages: [
      gl({ carrier: "The Hartford", policy_number: "21SBAAB1234", exp_offset: 18 }),
      auto({ carrier: "The Hartford", policy_number: "21UENAB5678", exp_offset: 120 }),
      wc({ carrier: "The Hartford", policy_number: "21WECAB9012", exp_offset: 120 }),
    ],
  },
  {
    vendor: "Delta Mechanical Services",
    producer: "Gallagher",
    insured_name: "Delta Mechanical Services LLC",
    insured_address: "9 Boiler Rd, Fremont, CA 94538",
    holder: HOLDER,
    holder_address: HOLDER_ADDR,
    cert_date_offset: -380,
    date_received_offset: -377,
    contract_reference: "MSA-2024-031 / HVAC maintenance",
    internal_owner: "D. Okafor (Facilities)",
    description:
      "Certificate provided for annual HVAC preventive-maintenance agreement. No automobile schedule attached.",
    reviewed: true,
    original_file_name: "Delta-Mechanical-COI-2024.pdf",
    coverages: [
      gl({ carrier: "Liberty Mutual", policy_number: "TB2-641-004512-014", exp_offset: -15 }),
      wc({ carrier: "Liberty Mutual", policy_number: "WA7-64D-004512-024", exp_offset: 210 }),
    ],
  },
  {
    vendor: "Harbor Point Landscaping",
    producer: "Brown & Brown",
    insured_name: "Harbor Point Landscaping & Grounds",
    insured_address: "12 Meadow Ln, San Rafael, CA 94901",
    holder: HOLDER,
    holder_address: HOLDER_ADDR,
    cert_date_offset: -110,
    date_received_offset: -108,
    contract_reference: "PO-5120 / Grounds keeping",
    internal_owner: "M. Chen (Property Mgmt)",
    reviewed: true,
    original_file_name: "HarborPoint-Landscaping-COI.pdf",
    coverages: [
      gl({
        carrier: "Nationwide",
        policy_number: "ACP-GL-7781203",
        exp_offset: 250,
        limits: [
          { label: "Each Occurrence", amount: 500_000 },
          { label: "General Aggregate", amount: 1_000_000 },
        ],
        primary_noncontributory: false,
      }),
      auto({ carrier: "Nationwide", policy_number: "ACP-BA-7781204", exp_offset: 250 }),
    ],
  },
  {
    vendor: "Ironclad Security Services",
    producer: "Lockton Companies",
    insured_name: "Ironclad Security Services, Inc.",
    insured_address: "700 Sentinel Blvd, San Francisco, CA 94103",
    holder: HOLDER,
    holder_address: HOLDER_ADDR,
    cert_date_offset: -400,
    date_received_offset: -398,
    contract_reference: "MSA-2023-014 / Site security",
    internal_owner: "P. Nowak (Security)",
    description: "SUPERSEDED. Retained for history. Replaced by 2025 renewal certificate.",
    reviewed: true,
    original_file_name: "Ironclad-Security-COI-2024.pdf",
    coverages: [
      gl({ carrier: "CNA", policy_number: "6041288371", exp_offset: -35 }),
      auto({ carrier: "CNA", policy_number: "6041288372", exp_offset: -35 }),
      wc({ carrier: "CNA", policy_number: "6041288373", exp_offset: -35 }),
    ],
  },
  {
    vendor: "Ironclad Security Services",
    producer: "Lockton Companies",
    insured_name: "Ironclad Security Services, Inc.",
    insured_address: "700 Sentinel Blvd, San Francisco, CA 94103",
    holder: HOLDER,
    holder_address: HOLDER_ADDR,
    cert_date_offset: -25,
    date_received_offset: -24,
    contract_reference: "MSA-2023-014 / Site security (2025 renewal)",
    internal_owner: "P. Nowak (Security)",
    description:
      "2025 renewal. Blanket additional insured and waiver of subrogation in favor of the certificate holder. Umbrella is follow-form over GL, Auto and Employers Liability.",
    reviewed: true,
    original_file_name: "Ironclad-Security-COI-2025.pdf",
    coverages: [
      gl({ carrier: "Chubb", policy_number: "3599-72-14 GL", exp_offset: 330, per_project_aggregate: true }),
      auto({ carrier: "Chubb", policy_number: "7359-21-88 CA", exp_offset: 330 }),
      wc({ carrier: "Chubb", policy_number: "7160-05-42 WC", exp_offset: 330 }),
      {
        coverage_type: "Umbrella / Excess Liability",
        carrier: "Chubb",
        policy_number: "9977-31-05 XS",
        eff_offset: 330 - 365,
        exp_offset: 330,
        limits: [
          { label: "Each Occurrence", amount: 5_000_000 },
          { label: "Aggregate", amount: 5_000_000 },
        ],
        additional_insured: true,
      },
    ],
  },
  {
    vendor: "Nimbus IT Consultants",
    producer: "Woodruff Sawyer",
    insured_name: "Nimbus IT Consultants LLC",
    insured_address: "88 Cloud Ave, Palo Alto, CA 94301",
    holder: HOLDER,
    holder_address: HOLDER_ADDR,
    cert_date_offset: -60,
    date_received_offset: -58,
    contract_reference: "SOW-2025-201 / ERP integration",
    internal_owner: "R. Patel (IT)",
    description:
      "Professional services engagement. Technology E&O and Cyber Liability written on a claims-made basis. General Liability includes the holder as additional insured.",
    reviewed: true,
    original_file_name: "Nimbus-IT-COI.pdf",
    coverages: [
      gl({ carrier: "Hiscox", policy_number: "UDC-2211887-24", exp_offset: 280, per_project_aggregate: false }),
      {
        coverage_type: "Professional Liability / E&O",
        carrier: "Hiscox",
        policy_number: "MPL-5541902-24",
        eff_offset: 280 - 365,
        exp_offset: 280,
        limits: [
          { label: "Each Claim", amount: 2_000_000 },
          { label: "Aggregate", amount: 2_000_000 },
        ],
      },
      {
        coverage_type: "Cyber Liability",
        carrier: "Beazley",
        policy_number: "W312A5-24",
        eff_offset: 280 - 365,
        exp_offset: 280,
        limits: [{ label: "Aggregate Limit", amount: 3_000_000 }],
      },
    ],
  },
  {
    vendor: "Riverside Freight Lines",
    producer: "AON Risk Services",
    insured_name: "Riverside Freight Lines Inc.",
    insured_address: "2400 Dock St, Richmond, CA 94804",
    holder: HOLDER,
    holder_address: HOLDER_ADDR,
    cert_date_offset: -150,
    date_received_offset: -148,
    contract_reference: "MSA-2025-066 / Inbound freight",
    internal_owner: "L. Gomez (Logistics)",
    reviewed: true,
    original_file_name: "Riverside-Freight-COI.pdf",
    coverages: [
      auto({
        carrier: "Zurich American",
        policy_number: "BAP-9981245-03",
        exp_offset: 200,
        limits: [{ label: "Combined Single Limit", amount: 1_000_000 }],
        primary_noncontributory: true,
      }),
      gl({ carrier: "Zurich American", policy_number: "GLO-9981245-01", exp_offset: 200 }),
      wc({ carrier: "Zurich American", policy_number: "WC-9981245-04", exp_offset: 200 }),
    ],
  },
  {
    vendor: "Apex Roofing & Waterproofing",
    producer: "USI Insurance Services",
    insured_name: "Apex Roofing & Waterproofing Co.",
    insured_address: "31 Shingle Ct, Hayward, CA 94544",
    holder: HOLDER,
    holder_address: HOLDER_ADDR,
    cert_date_offset: -420,
    date_received_offset: -418,
    contract_reference: "PO-3980 / Roof replacement Bldg C",
    internal_owner: "J. Rivera (Construction PM)",
    description:
      "Roofing contractor. NOTE: all lines lapsed; renewal certificate requested from broker.",
    reviewed: true,
    original_file_name: "Apex-Roofing-COI-2024.pdf",
    coverages: [
      gl({ carrier: "AmTrust", policy_number: "GLP-2299104", exp_offset: -60 }),
      auto({ carrier: "AmTrust", policy_number: "CAP-2299105", exp_offset: -60 }),
      wc({ carrier: "AmTrust", policy_number: "WCP-2299106", exp_offset: -60 }),
    ],
  },
  {
    vendor: "Greenfield Environmental",
    producer: "Alliant Insurance",
    insured_name: "Greenfield Environmental Remediation LLC",
    insured_address: "14 Aquifer Rd, Vallejo, CA 94590",
    holder: HOLDER,
    holder_address: HOLDER_ADDR,
    cert_date_offset: -70,
    date_received_offset: -68,
    contract_reference: "SOW-2025-140 / Soil remediation, parking level",
    internal_owner: "M. Chen (Property Mgmt)",
    description:
      "Contractors pollution liability provided for environmental remediation scope. No owned autos; employees use personal vehicles.",
    reviewed: true,
    original_file_name: "Greenfield-Environmental-COI.pdf",
    coverages: [
      gl({ carrier: "Great American", policy_number: "PAC-7781-55", exp_offset: 90 }),
      {
        coverage_type: "Pollution / Environmental Liability",
        carrier: "Great American",
        policy_number: "CPL-7781-56",
        eff_offset: 90 - 365,
        exp_offset: 90,
        limits: [
          { label: "Each Occurrence", amount: 2_000_000 },
          { label: "Aggregate", amount: 4_000_000 },
        ],
        additional_insured: true,
      },
    ],
  },
  {
    vendor: "Boreal HVAC",
    producer: "The Hartford Agency",
    insured_name: "Boreal HVAC & Controls Inc.",
    insured_address: "6 Chiller Way, Concord, CA 94520",
    holder: HOLDER,
    holder_address: HOLDER_ADDR,
    cert_date_offset: -10,
    date_received_offset: -9,
    contract_reference: "MSA-2025-102 / Chiller plant service",
    internal_owner: "D. Okafor (Facilities)",
    reviewed: false,
    original_file_name: "Boreal-HVAC-COI-new.pdf",
    coverages: [
      gl({ carrier: "Berkshire Hathaway GUARD", policy_number: "GLABX338201", exp_offset: 310 }),
      auto({ carrier: "Berkshire Hathaway GUARD", policy_number: "BABX338202", exp_offset: 310 }),
      wc({ carrier: "Berkshire Hathaway GUARD", policy_number: "WCBX338203", exp_offset: 310 }),
    ],
  },
  {
    vendor: null,
    producer: "Travelers Independent Agency",
    insured_name: "Weathervane Contracting LLC",
    insured_address: "205 Gable St, Berkeley, CA 94710",
    holder: HOLDER,
    holder_address: HOLDER_ADDR,
    cert_date_offset: -6,
    date_received_offset: -5,
    internal_owner: "unassigned, needs triage",
    reviewed: false,
    original_file_name: "scan_0192.pdf",
    coverages: [
      gl({ carrier: "Travelers", policy_number: "6810H55921", exp_offset: 150 }),
      auto({ carrier: "Travelers", policy_number: "BA-6810H55922", exp_offset: 150 }),
    ],
  },
];

/** Vendor-scoped requirements so one vendor demonstrates the override path. */
export const DEMO_VENDOR_REQUIREMENTS: Array<{
  vendor: string;
  coverage_type: CoverageType;
  min_each_occurrence?: number;
  min_aggregate?: number;
  require_additional_insured?: boolean;
  required?: boolean;
}> = [
  {
    vendor: "Nimbus IT Consultants",
    coverage_type: "Commercial General Liability",
    min_each_occurrence: 1_000_000,
    min_aggregate: 2_000_000,
    require_additional_insured: true,
  },
  {
    vendor: "Nimbus IT Consultants",
    coverage_type: "Professional Liability / E&O",
    min_each_occurrence: 2_000_000,
  },
  {
    vendor: "Nimbus IT Consultants",
    coverage_type: "Cyber Liability",
    min_each_occurrence: 1_000_000,
  },
];

/** Vendors that have an outstanding "please send an updated COI" request. */
export const DEMO_RENEWAL_REQUESTS: Array<{ vendor: string; days_ago: number }> = [
  { vendor: "Apex Roofing & Waterproofing", days_ago: 18 },
];

export interface DemoContractReq {
  coverage_type: CoverageType;
  min_each_occurrence?: number;
  min_aggregate?: number;
  min_combined_single_limit?: number;
  require_additional_insured?: boolean;
  require_waiver_of_subrogation?: boolean;
}

export interface DemoContract {
  title: string;
  counterparty: string;
  vendor: string; // link all of this vendor's certificates
  reference: string;
  effective_offset: number;
  expiration_offset: number;
  status?: "active" | "expired" | "terminated";
  owner?: string;
  notes?: string;
  inherit_global_requirements?: boolean;
  requirements: DemoContractReq[];
}

export const DEMO_CONTRACTS: DemoContract[] = [
  {
    title: "MSA - Skyline Steel Erectors",
    counterparty: "Skyline Steel Erectors, Inc.",
    vendor: "Skyline Steel Erectors",
    reference: "MSA-2025-088",
    effective_offset: -400,
    expiration_offset: 330,
    owner: "J. Rivera (Construction PM)",
    requirements: [
      {
        coverage_type: "Commercial General Liability",
        min_each_occurrence: 1_000_000,
        min_aggregate: 2_000_000,
        require_additional_insured: true,
      },
      {
        coverage_type: "Automobile Liability",
        min_combined_single_limit: 1_000_000,
      },
      {
        coverage_type: "Workers Compensation & Employers Liability",
        min_each_occurrence: 1_000_000,
      },
    ],
  },
  {
    title: "Roof Replacement - Building C",
    counterparty: "Apex Roofing & Waterproofing Co.",
    vendor: "Apex Roofing & Waterproofing",
    reference: "PO-3980",
    effective_offset: -430,
    expiration_offset: -30,
    status: "expired",
    owner: "J. Rivera (Construction PM)",
    notes: "Contractor's insurance lapsed before final completion; chase renewal.",
    requirements: [
      {
        coverage_type: "Commercial General Liability",
        min_each_occurrence: 2_000_000,
        min_aggregate: 4_000_000,
        require_additional_insured: true,
      },
      {
        coverage_type: "Workers Compensation & Employers Liability",
        min_each_occurrence: 1_000_000,
      },
    ],
  },
  {
    title: "ERP Integration - Statement of Work",
    counterparty: "Nimbus IT Consultants LLC",
    vendor: "Nimbus IT Consultants",
    reference: "SOW-2025-201",
    effective_offset: -120,
    expiration_offset: 240,
    owner: "R. Patel (IT)",
    inherit_global_requirements: false,
    requirements: [
      {
        coverage_type: "Professional Liability / E&O",
        min_each_occurrence: 2_000_000,
      },
      { coverage_type: "Cyber Liability", min_each_occurrence: 1_000_000 },
      {
        coverage_type: "Commercial General Liability",
        min_each_occurrence: 1_000_000,
        require_additional_insured: true,
      },
    ],
  },
];
