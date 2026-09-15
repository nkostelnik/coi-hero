"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface LinkableCert {
  id: number;
  vendor: string | null;
  insured: string | null;
  file: string;
  certDate: string | null;
}

export default function ContractCertLinker({
  contractId,
  certs,
  linkedIds,
}: {
  contractId: number;
  certs: LinkableCert[];
  linkedIds: number[];
}) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<number>>(new Set(linkedIds));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = useMemo(() => {
    if (sel.size !== linkedIds.length) return true;
    return linkedIds.some((id) => !sel.has(id));
  }, [sel, linkedIds]);

  const filtered = certs.filter((c) => {
    const n = q.trim().toLowerCase();
    if (!n) return true;
    return [c.vendor, c.insured, c.file].some((x) =>
      (x ?? "").toLowerCase().includes(n),
    );
  });

  function toggle(id: number) {
    setSel((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    await fetch(`/api/contracts/${contractId}/certificates`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ certificate_ids: [...sel] }),
    });
    setBusy(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input
          className="input max-w-xs"
          placeholder="Filter certificates…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="btn-primary"
          disabled={busy || !dirty}
          onClick={save}
        >
          {busy ? "Saving…" : "Save links"}
        </button>
        {saved && !dirty && (
          <span className="text-sm text-emerald-600">Saved</span>
        )}
      </div>
      <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
        {filtered.map((c) => (
          <label
            key={c.id}
            className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50"
          >
            <input
              type="checkbox"
              checked={sel.has(c.id)}
              onChange={() => toggle(c.id)}
            />
            <span className="min-w-0 flex-1">
              <span className="font-medium">
                {c.vendor ?? c.insured ?? c.file}
              </span>
              <span className="ml-2 text-xs text-slate-400">
                {c.insured && c.vendor ? `${c.insured} · ` : ""}
                {c.file}
                {c.certDate ? ` · ${c.certDate}` : ""}
              </span>
            </span>
          </label>
        ))}
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-slate-400">
            No certificates match.
          </p>
        )}
      </div>
    </div>
  );
}
