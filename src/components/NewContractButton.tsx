"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Vendor } from "@/lib/types";

export default function NewContractButton({ vendors }: { vendors: Vendor[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    counterparty: "",
    vendor_id: "",
    reference: "",
    effective_date: "",
    expiration_date: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        vendor_id: form.vendor_id || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Could not create contract");
      return;
    }
    const { contract } = await res.json();
    setOpen(false);
    router.push(`/contracts/${contract.id}`);
  }

  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        + New contract
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card grid gap-3 p-4 shadow-md sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Contract title</label>
        <input
          className="input"
          autoFocus
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Master Services Agreement - Acme Corp"
          required
        />
      </div>
      <div>
        <label className="label">Counterparty</label>
        <input
          className="input"
          value={form.counterparty}
          onChange={(e) => set("counterparty", e.target.value)}
        />
      </div>
      <div>
        <label className="label">Linked vendor (optional)</label>
        <select
          className="input"
          value={form.vendor_id}
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
          value={form.reference}
          onChange={(e) => set("reference", e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Effective</label>
          <input
            type="date"
            className="input"
            value={form.effective_date}
            onChange={(e) => set("effective_date", e.target.value)}
          />
        </div>
        <div>
          <label className="label">Expiration</label>
          <input
            type="date"
            className="input"
            value={form.expiration_date}
            onChange={(e) => set("expiration_date", e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn-primary" disabled={busy || !form.title.trim()}>
          {busy ? "Creating…" : "Create contract"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Cancel
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}
