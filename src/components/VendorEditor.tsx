"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Vendor } from "@/lib/types";

export default function VendorEditor({ vendor }: { vendor: Vendor }) {
  const router = useRouter();
  const [name, setName] = useState(vendor.name);
  const [contactName, setContactName] = useState(vendor.contact_name ?? "");
  const [contactEmail, setContactEmail] = useState(vendor.contact_email ?? "");
  const [aliases, setAliases] = useState((vendor.aliases ?? []).join(", "));
  const [notes, setNotes] = useState(vendor.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    await fetch(`/api/vendors/${vendor.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        contact_name: contactName || null,
        contact_email: contactEmail || null,
        notes: notes || null,
        aliases: aliases
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
      }),
    });
    setBusy(false);
    setSaved(true);
    router.refresh();
  }

  async function markRequested(clear: boolean) {
    setBusy(true);
    await fetch(`/api/vendors/${vendor.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: clear
        ? JSON.stringify({ update_requested_on: null })
        : JSON.stringify({ mark_update_requested: true }),
    });
    setBusy(false);
    router.refresh();
  }

  async function remove() {
    if (
      !confirm(
        "Delete this vendor? Its certificates stay, but become unassigned.",
      )
    )
      return;
    await fetch(`/api/vendors/${vendor.id}`, { method: "DELETE" });
    router.push("/vendors");
  }

  return (
    <form onSubmit={save} className="card space-y-3 p-5">
      <h2 className="font-semibold">Vendor details</h2>
      <div>
        <label className="label">Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label">Also known as (comma-separated)</label>
        <input
          className="input"
          value={aliases}
          placeholder="Acme Inc, Acme LLC"
          onChange={(e) => setAliases(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-400">
          Used to auto-match the “insured” name on future uploads.
        </p>
      </div>
      <div>
        <label className="label">Contact name</label>
        <input
          className="input"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Contact email</label>
        <input
          className="input"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Notes</label>
        <textarea
          className="input"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="rounded-md bg-slate-50 p-3 text-sm">
        <div className="label">Renewal follow-up</div>
        {vendor.update_requested_on ? (
          <p>
            Updated COI requested on{" "}
            <strong>{vendor.update_requested_on}</strong>.{" "}
            <button
              type="button"
              className="text-brand-700 hover:underline"
              onClick={() => markRequested(false)}
            >
              Reset to today
            </button>{" "}
            ·{" "}
            <button
              type="button"
              className="text-slate-500 hover:underline"
              onClick={() => markRequested(true)}
            >
              Clear
            </button>
          </p>
        ) : (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => markRequested(false)}
          >
            Mark “requested updated COI” today
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-sm text-emerald-600">Saved</span>}
        <button type="button" className="btn-danger ml-auto" onClick={remove}>
          Delete vendor
        </button>
      </div>
    </form>
  );
}
