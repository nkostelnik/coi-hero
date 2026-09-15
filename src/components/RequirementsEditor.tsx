"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COVERAGE_TYPES } from "@/lib/types";
import type { Requirement, Vendor } from "@/lib/types";

interface Props {
  requirements: Requirement[];
  vendors: Vendor[];
  soonDays: number;
}

export default function RequirementsEditor({
  requirements,
  vendors,
  soonDays,
}: Props) {
  const router = useRouter();
  const global = requirements.filter((r) => r.scope === "global");
  const vendorReqs = requirements.filter((r) => r.scope === "vendor");

  return (
    <div className="space-y-8">
      <SoonDays initial={soonDays} onSaved={() => router.refresh()} />

      <section className="space-y-3">
        <h2 className="font-semibold">Global requirements</h2>
        <RequirementTable
          rows={global}
          vendors={vendors}
          onChange={() => router.refresh()}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Vendor-specific requirements</h2>
        {vendorReqs.length === 0 ? (
          <p className="text-sm text-slate-500">
            None yet. Add one below and pick a vendor to override the global rule
            for that coverage type.
          </p>
        ) : (
          <RequirementTable
            rows={vendorReqs}
            vendors={vendors}
            onChange={() => router.refresh()}
          />
        )}
      </section>

      <AddRequirement vendors={vendors} onAdded={() => router.refresh()} />
    </div>
  );
}

function SoonDays({
  initial,
  onSaved,
}: {
  initial: number;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(String(initial));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <div className="card flex flex-wrap items-end gap-3 p-4">
      <div>
        <label className="label">“Expiring soon” window (days)</label>
        <input
          className="input w-28"
          type="number"
          min={1}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
        />
      </div>
      <button
        className="btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await fetch("/api/requirements", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expiring_soon_days: Number(value) }),
          });
          setBusy(false);
          setSaved(true);
          onSaved();
        }}
      >
        Save
      </button>
      {saved && <span className="text-sm text-emerald-600">Saved</span>}
      <p className="w-full text-xs text-slate-400">
        Coverage expiring within this many days is flagged amber on the dashboard
        and certificates table.
      </p>
    </div>
  );
}

function RequirementTable({
  rows,
  vendors,
  onChange,
}: {
  rows: Requirement[];
  vendors: Vendor[];
  onChange: () => void;
}) {
  return (
    <div className="card overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="th">Coverage type</th>
            {rows.some((r) => r.scope === "vendor") && <th className="th">Vendor</th>}
            <th className="th">Each occurrence</th>
            <th className="th">Aggregate</th>
            <th className="th">Combined single</th>
            <th className="th">AI</th>
            <th className="th">WoS</th>
            <th className="th">Required</th>
            <th className="th"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <RequirementRow
              key={r.id}
              row={r}
              vendors={vendors}
              showVendor={rows.some((x) => x.scope === "vendor")}
              onChange={onChange}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RequirementRow({
  row,
  vendors,
  showVendor,
  onChange,
}: {
  row: Requirement;
  vendors: Vendor[];
  showVendor: boolean;
  onChange: () => void;
}) {
  const [draft, setDraft] = useState(row);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(row);

  const money = (v: number | null) => (v == null ? "" : String(v));

  async function save() {
    setBusy(true);
    await fetch(`/api/requirements/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        coverage_type: draft.coverage_type,
        min_each_occurrence: draft.min_each_occurrence,
        min_aggregate: draft.min_aggregate,
        min_combined_single_limit: draft.min_combined_single_limit,
        require_additional_insured: draft.require_additional_insured,
        require_waiver_of_subrogation: draft.require_waiver_of_subrogation,
        required: draft.required,
      }),
    });
    setBusy(false);
    onChange();
  }

  async function remove() {
    if (!confirm("Delete this requirement?")) return;
    await fetch(`/api/requirements/${row.id}`, { method: "DELETE" });
    onChange();
  }

  return (
    <tr>
      <td className="td">
        <select
          className="input"
          value={draft.coverage_type}
          onChange={(e) =>
            setDraft({ ...draft, coverage_type: e.target.value as Requirement["coverage_type"] })
          }
        >
          {COVERAGE_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </td>
      {showVendor && (
        <td className="td text-xs text-slate-500">
          {vendors.find((v) => v.id === row.vendor_id)?.name ?? "-"}
        </td>
      )}
      <td className="td">
        <input
          className="input w-32"
          inputMode="numeric"
          value={money(draft.min_each_occurrence)}
          onChange={(e) =>
            setDraft({
              ...draft,
              min_each_occurrence: e.target.value ? Number(e.target.value) : null,
            })
          }
        />
      </td>
      <td className="td">
        <input
          className="input w-32"
          inputMode="numeric"
          value={money(draft.min_aggregate)}
          onChange={(e) =>
            setDraft({
              ...draft,
              min_aggregate: e.target.value ? Number(e.target.value) : null,
            })
          }
        />
      </td>
      <td className="td">
        <input
          className="input w-32"
          inputMode="numeric"
          value={money(draft.min_combined_single_limit)}
          onChange={(e) =>
            setDraft({
              ...draft,
              min_combined_single_limit: e.target.value
                ? Number(e.target.value)
                : null,
            })
          }
        />
      </td>
      <td className="td text-center">
        <input
          type="checkbox"
          checked={!!draft.require_additional_insured}
          onChange={(e) =>
            setDraft({
              ...draft,
              require_additional_insured: e.target.checked ? 1 : 0,
            })
          }
        />
      </td>
      <td className="td text-center">
        <input
          type="checkbox"
          checked={!!draft.require_waiver_of_subrogation}
          onChange={(e) =>
            setDraft({
              ...draft,
              require_waiver_of_subrogation: e.target.checked ? 1 : 0,
            })
          }
        />
      </td>
      <td className="td text-center">
        <input
          type="checkbox"
          checked={!!draft.required}
          onChange={(e) =>
            setDraft({ ...draft, required: e.target.checked ? 1 : 0 })
          }
        />
      </td>
      <td className="td whitespace-nowrap">
        <button
          className="btn-primary"
          disabled={!dirty || busy}
          onClick={save}
        >
          Save
        </button>
        <button className="btn-danger ml-2" onClick={remove}>
          ✕
        </button>
      </td>
    </tr>
  );
}

function AddRequirement({
  vendors,
  onAdded,
}: {
  vendors: Vendor[];
  onAdded: () => void;
}) {
  const [coverageType, setCoverageType] = useState<string>(COVERAGE_TYPES[0]);
  const [vendorId, setVendorId] = useState<string>("");
  const [eachOcc, setEachOcc] = useState("");
  const [agg, setAgg] = useState("");
  const [csl, setCsl] = useState("");
  const [ai, setAi] = useState(false);
  const [wos, setWos] = useState(false);
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    await fetch("/api/requirements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        coverage_type: coverageType,
        vendor_id: vendorId || null,
        min_each_occurrence: eachOcc || null,
        min_aggregate: agg || null,
        min_combined_single_limit: csl || null,
        require_additional_insured: ai,
        require_waiver_of_subrogation: wos,
      }),
    });
    setBusy(false);
    setEachOcc("");
    setAgg("");
    setCsl("");
    setAi(false);
    setWos(false);
    onAdded();
  }

  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-semibold">Add a requirement</h2>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Coverage type</label>
          <select
            className="input"
            value={coverageType}
            onChange={(e) => setCoverageType(e.target.value)}
          >
            {COVERAGE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Scope</label>
          <select
            className="input"
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
          >
            <option value="">Global (all vendors)</option>
            {vendors.map((v) => (
              <option key={v.id} value={String(v.id)}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Each occurrence</label>
          <input
            className="input w-32"
            inputMode="numeric"
            placeholder="1000000"
            value={eachOcc}
            onChange={(e) => setEachOcc(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Aggregate</label>
          <input
            className="input w-32"
            inputMode="numeric"
            value={agg}
            onChange={(e) => setAgg(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Combined single</label>
          <input
            className="input w-32"
            inputMode="numeric"
            value={csl}
            onChange={(e) => setCsl(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={ai}
            onChange={(e) => setAi(e.target.checked)}
          />
          Additional insured
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={wos}
            onChange={(e) => setWos(e.target.checked)}
          />
          Waiver of subrogation
        </label>
        <button className="btn-primary" disabled={busy} onClick={add}>
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
    </section>
  );
}
