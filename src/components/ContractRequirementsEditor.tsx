"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COVERAGE_TYPES } from "@/lib/types";
import type { Requirement } from "@/lib/types";

export default function ContractRequirementsEditor({
  contractId,
  rows,
  inheritGlobal,
}: {
  contractId: number;
  rows: Requirement[];
  inheritGlobal: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setInherit(value: boolean) {
    setBusy(true);
    await fetch(`/api/contracts/${contractId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inherit_global_requirements: value }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={inheritGlobal}
          disabled={busy}
          onChange={(e) => setInherit(e.target.checked)}
        />
        Also apply the <strong>global</strong> requirements to this contract
        (contract-specific rows below override the global one for the same
        coverage type).
      </label>

      {rows.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Coverage type</th>
                <th className="th">Each occ.</th>
                <th className="th">Aggregate</th>
                <th className="th">Comb. single</th>
                <th className="th">AI</th>
                <th className="th">WoS</th>
                <th className="th">Req.</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <Row key={r.id} row={r} onChange={() => router.refresh()} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddRow contractId={contractId} onAdded={() => router.refresh()} />
    </div>
  );
}

function Row({ row, onChange }: { row: Requirement; onChange: () => void }) {
  const [d, setD] = useState(row);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(row);
  const numOr = (v: string) => (v ? Number(v) : null);

  async function save() {
    setBusy(true);
    await fetch(`/api/requirements/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        coverage_type: d.coverage_type,
        min_each_occurrence: d.min_each_occurrence,
        min_aggregate: d.min_aggregate,
        min_combined_single_limit: d.min_combined_single_limit,
        require_additional_insured: d.require_additional_insured,
        require_waiver_of_subrogation: d.require_waiver_of_subrogation,
        required: d.required,
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
          value={d.coverage_type}
          onChange={(e) =>
            setD({ ...d, coverage_type: e.target.value as Requirement["coverage_type"] })
          }
        >
          {COVERAGE_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </td>
      {(
        [
          "min_each_occurrence",
          "min_aggregate",
          "min_combined_single_limit",
        ] as const
      ).map((k) => (
        <td className="td" key={k}>
          <input
            className="input w-28"
            inputMode="numeric"
            value={d[k] == null ? "" : String(d[k])}
            onChange={(e) => setD({ ...d, [k]: numOr(e.target.value) })}
          />
        </td>
      ))}
      <td className="td text-center">
        <input
          type="checkbox"
          checked={!!d.require_additional_insured}
          onChange={(e) =>
            setD({ ...d, require_additional_insured: e.target.checked ? 1 : 0 })
          }
        />
      </td>
      <td className="td text-center">
        <input
          type="checkbox"
          checked={!!d.require_waiver_of_subrogation}
          onChange={(e) =>
            setD({
              ...d,
              require_waiver_of_subrogation: e.target.checked ? 1 : 0,
            })
          }
        />
      </td>
      <td className="td text-center">
        <input
          type="checkbox"
          checked={!!d.required}
          onChange={(e) => setD({ ...d, required: e.target.checked ? 1 : 0 })}
        />
      </td>
      <td className="td whitespace-nowrap">
        <button className="btn-primary" disabled={!dirty || busy} onClick={save}>
          Save
        </button>
        <button className="btn-danger ml-2" onClick={remove}>
          ✕
        </button>
      </td>
    </tr>
  );
}

function AddRow({
  contractId,
  onAdded,
}: {
  contractId: number;
  onAdded: () => void;
}) {
  const [type, setType] = useState<string>(COVERAGE_TYPES[0]);
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
        contract_id: contractId,
        coverage_type: type,
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
    <div className="card flex flex-wrap items-end gap-3 p-4">
      <div>
        <label className="label">Add requirement</label>
        <select
          className="input"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {COVERAGE_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Each occ.</label>
        <input
          className="input w-28"
          inputMode="numeric"
          placeholder="1000000"
          value={eachOcc}
          onChange={(e) => setEachOcc(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Aggregate</label>
        <input
          className="input w-28"
          inputMode="numeric"
          value={agg}
          onChange={(e) => setAgg(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Comb. single</label>
        <input
          className="input w-28"
          inputMode="numeric"
          value={csl}
          onChange={(e) => setCsl(e.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} />
        AI
      </label>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input
          type="checkbox"
          checked={wos}
          onChange={(e) => setWos(e.target.checked)}
        />
        WoS
      </label>
      <button className="btn-primary" disabled={busy} onClick={add}>
        {busy ? "Adding…" : "Add"}
      </button>
    </div>
  );
}
