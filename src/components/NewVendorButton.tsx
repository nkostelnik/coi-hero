"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewVendorButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, contact_email: email || null }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not create vendor");
      return;
    }
    setName("");
    setEmail("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn-ghost" onClick={() => setOpen(true)}>
        + New vendor
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="card flex flex-wrap items-end gap-3 p-3 shadow-md"
    >
      <div>
        <label className="label">Vendor name</label>
        <input
          className="input"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="label">Contact email (optional)</label>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <button className="btn-primary" disabled={busy || !name.trim()}>
        {busy ? "Saving…" : "Save"}
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
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
