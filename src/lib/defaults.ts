// Starting rules for a new COI Hero database, shared by the server app and
// the Claude page.
import type { Requirement } from "./types";

/** Default "expiring soon" window, in days. */
export const DEFAULT_SOON_DAYS = 30;

export const DEFAULT_GLOBAL_REQUIREMENTS: Array<Partial<Requirement>> = [
  {
    coverage_type: "Commercial General Liability",
    min_each_occurrence: 1_000_000,
    min_aggregate: 2_000_000,
    require_additional_insured: 1,
    require_waiver_of_subrogation: 0,
    required: 1,
  },
  {
    coverage_type: "Automobile Liability",
    min_combined_single_limit: 1_000_000,
    required: 1,
  },
  {
    coverage_type: "Workers Compensation & Employers Liability",
    min_each_occurrence: 1_000_000,
    required: 1,
  },
  {
    coverage_type: "Umbrella / Excess Liability",
    min_each_occurrence: 5_000_000,
    required: 0,
  },
];
