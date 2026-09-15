"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Contract, Vendor } from "@/lib/types";

export default function ContractEditor({
  contract,
  vendors,
}: {
  contract: Contract;
  vendors: Vendor[];
}) {
  const router = useRouter();
  const [f, setF] = useState({
    title: contract.title,
    counterparty: contract.counterparty ?? "",
    vendor_id: contract.vendor_id ? String(contract.vendor_id) : "",
    reference: contract.reference ?? "",
    effective_date: contract.effective_date ?? "",
    expiration_date: contract.expiration_date ?? "",
    status: contract.status,
    owner: contract.owner ?? "",
    notes: contract.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof f, v: string) =>
    setF((p) => ({ ...p, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    await fetch(`/api/contracts/${contract.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, vendor_id: f.vendor_id || null }),
    });
    setBusy(false);
    setSaved(true);
    router.refresh();
  }

  async function remove() {
    if (!confirm("Delete this contract? Linked COIs stay; the links are removed."))
      return;
    await fetch(`/api/contracts/${contract.id}`, { method: "DELETE" });
    router.push("/contracts");
  }

  return (
    <form onSubmit={save} className="card grid gap-3 p-5 sm:grid-cols-2">
      <h2 className="font-semibold sm:col-span-2">Contract details</h2>
      <div className="sm:col-span-2">
        <label className="label">Title</label>
        <input
          className="input"
          value={f.title}
          onChange={(e) => set("title", e.target.value)}
        />
      </div>
      <div>
        <label className="label">Counterparty</label>
        <input
          className="input"
          value={f.counterparty}
          onChange={(e) => set("counterparty", e.target.value)}
        />
      </div>
      <div>
        <label className="label">Linked vendor</label>
        <select
          className="input"
          value={f.vendor_id}
          onChange={(e) => set("vendor_id", e.target.value)}
        >
          <option value="">(none)</option>
          {vendors.map((v) => (
            <option key={v.id} value={String(v.id)}>
              {v.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Reference #</label>
        <input
          className="input"
          value={f.reference}
          onChange={(e) => set("reference", e.target.value)}
        />
      </div>
      <div>
        <label className="label">Status</label>
        <select
          className="input"
          value={f.status}
          onChange={(e) => set("status", e.target.value)}
        >
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="terminated">Terminated</option>
        </select>
      </div>
      <div>
        <label className="label">Effective</label>
        <input
          type="date"
          className="input"
          value={f.effective_date}
          onChange={(e) => set("effective_date", e.target.value)}
        />
      </div>
      <div>
        <label className="label">Expiration</label>
        <input
          type="date"
          className="input"
          value={f.expiration_date}
          onChange={(e) => set("expiration_date", e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Internal owner</label>
        <input
          className="input"
          value={f.owner}
          onChange={(e) => set("owner", e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Notes</label>
        <textarea
          className="input"
          rows={3}
          value={f.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-sm text-emerald-600">Saved</span>}
        <button type="button" className="btn-danger ml-auto" onClick={remove}>
          Delete contract
        </button>
      </div>
    </form>
  );
}
