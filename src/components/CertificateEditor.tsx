"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { COVERAGE_TYPES } from "@/lib/types";
import type {
  CertificateWithRelations,
  Contract,
  Coverage,
  Vendor,
} from "@/lib/types";
import { coverageStatus } from "@/lib/dates";
import { StatusBadge } from "./ui";

type Tri = "yes" | "no" | "unknown";

interface EditLimit {
  key: string;
  label: string;
  amount: string;
}
interface EditCoverage {
  key: string;
  coverage_type: string;
  insurer_name: string;
  policy_number: string;
  effective_date: string;
  expiration_date: string;
  additional_insured: Tri;
  subrogation_waived: Tri;
  primary_noncontributory: Tri;
  per_project_aggregate: Tri;
  notice_of_cancellation_days: string;
  limits: EditLimit[];
}

const uid = () => Math.random().toString(36).slice(2);
const triFrom = (v: 0 | 1 | null): Tri =>
  v === 1 ? "yes" : v === 0 ? "no" : "unknown";
const triTo = (t: Tri): boolean | null =>
  t === "yes" ? true : t === "no" ? false : null;

function toEditCoverage(c: Coverage): EditCoverage {
  return {
    key: uid(),
    coverage_type: c.coverage_type,
    insurer_name: c.insurer_name ?? "",
    policy_number: c.policy_number ?? "",
    effective_date: c.effective_date ?? "",
    expiration_date: c.expiration_date ?? "",
    additional_insured: triFrom(c.additional_insured),
    subrogation_waived: triFrom(c.subrogation_waived),
    primary_noncontributory: triFrom(c.primary_noncontributory),
    per_project_aggregate: triFrom(c.per_project_aggregate),
    notice_of_cancellation_days:
      c.notice_of_cancellation_days != null
        ? String(c.notice_of_cancellation_days)
        : "",
    limits: (c.limits ?? []).map((l) => ({
      key: uid(),
      label: l.label,
      amount: l.amount != null ? String(l.amount) : (l.amount_raw ?? ""),
    })),
  };
}

export default function CertificateEditor({
  certificate,
  vendors,
  contracts = [],
}: {
  certificate: CertificateWithRelations;
  vendors: Vendor[];
  contracts?: Contract[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    certificate_date: certificate.certificate_date ?? "",
    insured_name: certificate.insured_name ?? "",
    insured_address: certificate.insured_address ?? "",
    certificate_holder_name: certificate.certificate_holder_name ?? "",
    certificate_holder_address: certificate.certificate_holder_address ?? "",
    producer_name: certificate.producer_name ?? "",
    producer_email: certificate.producer_email ?? "",
    description_of_operations: certificate.description_of_operations ?? "",
    contract_reference: certificate.contract_reference ?? "",
    internal_owner: certificate.internal_owner ?? "",
    date_received: certificate.date_received ?? "",
    notes: certificate.notes ?? "",
  });
  const [vendorText, setVendorText] = useState(certificate.vendor?.name ?? "");
  const [contractIds, setContractIds] = useState<number[]>(
    certificate.contracts.map((c) => c.id),
  );
  const [coverages, setCoverages] = useState<EditCoverage[]>(
    certificate.coverages.map(toEditCoverage),
  );
  const [busy, setBusy] = useState<null | "save" | "review" | "extract" | "delete">(
    null,
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const patchCoverage = (key: string, patch: Partial<EditCoverage>) =>
    setCoverages((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  function resolveVendor() {
    const text = vendorText.trim();
    if (!text) return { vendor_id: null };
    const match = vendors.find(
      (v) => v.name.toLowerCase() === text.toLowerCase(),
    );
    return match ? { vendor_id: match.id } : { vendor_name: text };
  }

  function payload(extra: Record<string, unknown> = {}) {
    return {
      ...form,
      ...resolveVendor(),
      contract_ids: contractIds,
      coverages: coverages.map((c) => ({
        coverage_type: c.coverage_type,
        insurer_name: c.insurer_name || null,
        policy_number: c.policy_number || null,
        effective_date: c.effective_date || null,
        expiration_date: c.expiration_date || null,
        additional_insured: triTo(c.additional_insured),
        subrogation_waived: triTo(c.subrogation_waived),
        primary_noncontributory: triTo(c.primary_noncontributory),
        per_project_aggregate: triTo(c.per_project_aggregate),
        notice_of_cancellation_days: c.notice_of_cancellation_days || null,
        limits: c.limits
          .filter((l) => l.label.trim())
          .map((l) => ({ label: l.label.trim(), amount: l.amount || null })),
      })),
      ...extra,
    };
  }

  async function save(markReviewed: boolean) {
    setBusy(markReviewed ? "review" : "save");
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/certificates/${certificate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(markReviewed ? { reviewed: true } : {})),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "Save failed");
      }
      setMsg(markReviewed ? "Saved and marked reviewed." : "Saved.");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function reExtract() {
    if (
      !confirm(
        "Re-run extraction? This overwrites the fields below with a fresh reading of the PDF.",
      )
    )
      return;
    setBusy("extract");
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/certificates/${certificate.id}/reextract`,
        { method: "POST" },
      );
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error ?? "Extraction failed");
      router.refresh();
      setMsg("Re-extracted. Reloading…");
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm("Delete this certificate and its file? This cannot be undone."))
      return;
    setBusy("delete");
    await fetch(`/api/certificates/${certificate.id}`, { method: "DELETE" });
    router.push("/certificates");
  }

  const statusNote = useMemo(() => {
    switch (certificate.extraction_status) {
      case "failed":
        return `Extraction failed: ${certificate.extraction_error ?? "unknown error"}`;
      case "skipped":
        return "Stored without extraction (no API key). Fill in the fields below.";
      case "ok":
        return certificate.reviewed
          ? `Extracted by ${certificate.extraction_model ?? "model"} · reviewed`
          : `Extracted by ${certificate.extraction_model ?? "model"} · not yet reviewed`;
      case "manual":
        return "Entered manually.";
      default:
        return "Pending.";
    }
  }, [certificate]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* PDF */}
      <div className="space-y-2 lg:sticky lg:top-4 lg:self-start">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{certificate.original_file_name}</h2>
          <a
            href={`/api/files/${certificate.id}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-brand-700 hover:underline"
          >
            Open in new tab
          </a>
        </div>
        <iframe
          src={`/api/files/${certificate.id}`}
          className="h-[78vh] w-full rounded-lg border border-slate-200 bg-white"
          title="Certificate PDF"
        />
      </div>

      {/* Form */}
      <div className="space-y-5">
        <div className="card p-3 text-sm text-slate-600">{statusNote}</div>

        {err && (
          <div className="card border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        )}
        {msg && (
          <div className="card border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {msg}
          </div>
        )}

        <section className="card space-y-3 p-4">
          <h3 className="font-semibold">Certificate</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vendor">
              <input
                className="input"
                list="vendor-list"
                value={vendorText}
                onChange={(e) => setVendorText(e.target.value)}
                placeholder="Type to match or create"
              />
              <datalist id="vendor-list">
                {vendors.map((v) => (
                  <option key={v.id} value={v.name} />
                ))}
              </datalist>
            </Field>
            <Field label="Certificate date">
              <input
                type="date"
                className="input"
                value={form.certificate_date}
                onChange={(e) => set("certificate_date", e.target.value)}
              />
            </Field>
            <Field label="Insured (vendor on the COI)">
              <input
                className="input"
                value={form.insured_name}
                onChange={(e) => set("insured_name", e.target.value)}
              />
            </Field>
            <Field label="Insured address">
              <input
                className="input"
                value={form.insured_address}
                onChange={(e) => set("insured_address", e.target.value)}
              />
            </Field>
            <Field label="Certificate holder">
              <input
                className="input"
                value={form.certificate_holder_name}
                onChange={(e) =>
                  set("certificate_holder_name", e.target.value)
                }
              />
            </Field>
            <Field label="Holder address">
              <input
                className="input"
                value={form.certificate_holder_address}
                onChange={(e) =>
                  set("certificate_holder_address", e.target.value)
                }
              />
            </Field>
            <Field label="Producer / broker">
              <input
                className="input"
                value={form.producer_name}
                onChange={(e) => set("producer_name", e.target.value)}
              />
            </Field>
            <Field label="Producer email">
              <input
                className="input"
                value={form.producer_email}
                onChange={(e) => set("producer_email", e.target.value)}
              />
            </Field>
            <Field label="Date received">
              <input
                type="date"
                className="input"
                value={form.date_received}
                onChange={(e) => set("date_received", e.target.value)}
              />
            </Field>
            <Field label="Contract / project reference">
              <input
                className="input"
                value={form.contract_reference}
                onChange={(e) => set("contract_reference", e.target.value)}
                placeholder="MSA-2026-014 / Tower B fit-out"
              />
            </Field>
            <Field label="Requested by (internal owner)">
              <input
                className="input"
                value={form.internal_owner}
                onChange={(e) => set("internal_owner", e.target.value)}
                placeholder="who needs this COI"
              />
            </Field>
          </div>
          <Field label="Description of operations">
            <textarea
              className="input"
              rows={2}
              value={form.description_of_operations}
              onChange={(e) =>
                set("description_of_operations", e.target.value)
              }
            />
          </Field>
          <Field label="Internal notes">
            <textarea
              className="input"
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
        </section>

        <section className="card space-y-2 p-4">
          <h3 className="font-semibold">Linked contracts</h3>
          {contracts.length === 0 ? (
            <p className="text-sm text-slate-500">
              No contracts yet.{" "}
              <a href="/contracts" className="text-brand-700 hover:underline">
                Create one
              </a>{" "}
              to link this certificate to it.
            </p>
          ) : (
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {contracts.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={contractIds.includes(c.id)}
                    onChange={(e) =>
                      setContractIds((ids) =>
                        e.target.checked
                          ? [...ids, c.id]
                          : ids.filter((x) => x !== c.id),
                      )
                    }
                  />
                  {c.title}
                  {c.counterparty ? (
                    <span className="text-xs text-slate-400">
                      · {c.counterparty}
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400">
            Saved with the certificate. Contract compliance is shown on the
            contract’s page.
          </p>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">
              Coverage lines ({coverages.length})
            </h3>
            <button
              className="btn-ghost"
              onClick={() =>
                setCoverages((cs) => [
                  ...cs,
                  {
                    key: uid(),
                    coverage_type: "Commercial General Liability",
                    insurer_name: "",
                    policy_number: "",
                    effective_date: "",
                    expiration_date: "",
                    additional_insured: "unknown",
                    subrogation_waived: "unknown",
                    primary_noncontributory: "unknown",
                    per_project_aggregate: "unknown",
                    notice_of_cancellation_days: "",
                    limits: [],
                  },
                ])
              }
            >
              + Add coverage
            </button>
          </div>

          {coverages.map((c, i) => (
            <div key={c.key} className="card space-y-3 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-slate-400">
                  Line {i + 1}
                </span>
                <div className="flex items-center gap-2">
                  {c.expiration_date && (
                    <StatusBadge
                      status={coverageStatus(c.expiration_date, 30)}
                    />
                  )}
                  <button
                    className="text-sm text-red-600 hover:underline"
                    onClick={() =>
                      setCoverages((cs) => cs.filter((x) => x.key !== c.key))
                    }
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Coverage type">
                  <select
                    className="input"
                    value={c.coverage_type}
                    onChange={(e) =>
                      patchCoverage(c.key, { coverage_type: e.target.value })
                    }
                  >
                    {COVERAGE_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Carrier">
                  <input
                    className="input"
                    value={c.insurer_name}
                    onChange={(e) =>
                      patchCoverage(c.key, { insurer_name: e.target.value })
                    }
                  />
                </Field>
                <Field label="Policy number">
                  <input
                    className="input font-mono"
                    value={c.policy_number}
                    onChange={(e) =>
                      patchCoverage(c.key, { policy_number: e.target.value })
                    }
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Effective">
                    <input
                      type="date"
                      className="input"
                      value={c.effective_date}
                      onChange={(e) =>
                        patchCoverage(c.key, { effective_date: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Expiration">
                    <input
                      type="date"
                      className="input"
                      value={c.expiration_date}
                      onChange={(e) =>
                        patchCoverage(c.key, {
                          expiration_date: e.target.value,
                        })
                      }
                    />
                  </Field>
                </div>
                <Field label="Additional insured">
                  <TriSelect
                    value={c.additional_insured}
                    onChange={(v) =>
                      patchCoverage(c.key, { additional_insured: v })
                    }
                  />
                </Field>
                <Field label="Waiver of subrogation">
                  <TriSelect
                    value={c.subrogation_waived}
                    onChange={(v) =>
                      patchCoverage(c.key, { subrogation_waived: v })
                    }
                  />
                </Field>
                <Field label="Primary & non-contributory">
                  <TriSelect
                    value={c.primary_noncontributory}
                    onChange={(v) =>
                      patchCoverage(c.key, { primary_noncontributory: v })
                    }
                  />
                </Field>
                <Field label="Per-project / per-location aggregate">
                  <TriSelect
                    value={c.per_project_aggregate}
                    onChange={(v) =>
                      patchCoverage(c.key, { per_project_aggregate: v })
                    }
                  />
                </Field>
                <Field label="Notice of cancellation (days)">
                  <input
                    className="input"
                    inputMode="numeric"
                    placeholder="30"
                    value={c.notice_of_cancellation_days}
                    onChange={(e) =>
                      patchCoverage(c.key, {
                        notice_of_cancellation_days: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="label mb-0">Limits</span>
                  <button
                    className="text-xs text-brand-700 hover:underline"
                    onClick={() =>
                      patchCoverage(c.key, {
                        limits: [
                          ...c.limits,
                          { key: uid(), label: "", amount: "" },
                        ],
                      })
                    }
                  >
                    + Add limit
                  </button>
                </div>
                <div className="space-y-2">
                  {c.limits.map((l) => (
                    <div key={l.key} className="flex gap-2">
                      <input
                        className="input flex-1"
                        placeholder="Each Occurrence"
                        value={l.label}
                        onChange={(e) =>
                          patchCoverage(c.key, {
                            limits: c.limits.map((x) =>
                              x.key === l.key
                                ? { ...x, label: e.target.value }
                                : x,
                            ),
                          })
                        }
                      />
                      <input
                        className="input w-40"
                        inputMode="numeric"
                        placeholder="1000000"
                        value={l.amount}
                        onChange={(e) =>
                          patchCoverage(c.key, {
                            limits: c.limits.map((x) =>
                              x.key === l.key
                                ? { ...x, amount: e.target.value }
                                : x,
                            ),
                          })
                        }
                      />
                      <button
                        className="btn-danger"
                        onClick={() =>
                          patchCoverage(c.key, {
                            limits: c.limits.filter((x) => x.key !== l.key),
                          })
                        }
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {c.limits.length === 0 && (
                    <p className="text-xs text-slate-400">No limits recorded.</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </section>

        <div className="sticky bottom-0 flex flex-wrap gap-3 border-t border-slate-200 bg-slate-50 py-3">
          <button
            className="btn-primary"
            disabled={busy !== null}
            onClick={() => save(false)}
          >
            {busy === "save" ? "Saving…" : "Save"}
          </button>
          <button
            className="btn-primary"
            disabled={busy !== null}
            onClick={() => save(true)}
          >
            {busy === "review" ? "Saving…" : "Save & mark reviewed"}
          </button>
          <button
            className="btn-ghost"
            disabled={busy !== null}
            onClick={reExtract}
          >
            {busy === "extract" ? "Re-extracting…" : "Re-run extraction"}
          </button>
          <button
            className="btn-danger ml-auto"
            disabled={busy !== null}
            onClick={remove}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function TriSelect({
  value,
  onChange,
}: {
  value: Tri;
  onChange: (v: Tri) => void;
}) {
  return (
    <select
      className="input"
      value={value}
      onChange={(e) => onChange(e.target.value as Tri)}
    >
      <option value="yes">Yes</option>
      <option value="no">No</option>
      <option value="unknown">Unknown</option>
    </select>
  );
}
