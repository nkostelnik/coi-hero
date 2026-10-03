"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CertificateWithRelations, Vendor } from "@/lib/types";
import { formatDate } from "@/lib/dates";
import CertificateEditor from "./CertificateEditor";

export default function Uploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CertificateWithRelations[]>([]);
  const [queued, setQueued] = useState<string[]>([]);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [demo, setDemo] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => {
        setHasApiKey(c.hasApiKey);
        setDemo(!!c.demoMode);
      })
      .catch(() => setHasApiKey(null));
    fetch("/api/vendors")
      .then((r) => r.json())
      .then((d) => setVendors(d.vendors ?? []))
      .catch(() => setVendors([]));
  }, []);

  const upload = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setBusy(true);
      setError(null);
      setQueued(files.map((f) => f.name));
      const form = new FormData();
      for (const f of files) form.append("files", f);
      try {
        const res = await fetch("/api/certificates", {
          method: "POST",
          body: form,
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Upload failed");
        setResults((prev) => [...body.certificates, ...prev]);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
        setQueued([]);
      }
    },
    [router],
  );

  return (
    <div className="space-y-6">
      {demo && (
        <div className="card border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
          <strong>Demo mode.</strong> Uploads get realistic <em>mock</em> fields
          generated from the file name, not a real reading of the PDF. Turn it
          off by removing <code>COI_DEMO_MODE=1</code> from <code>.env.local</code>.
        </div>
      )}
      {hasApiKey === false && !demo && (
        <div className="card border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No <code>ANTHROPIC_API_KEY</code> set. Files will be stored, but you’ll
          enter the fields by hand. Add a key to <code>.env.local</code> and
          restart to enable automatic extraction.
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          upload(Array.from(e.dataTransfer.files));
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors ${
          dragOver
            ? "border-brand-500 bg-brand-50"
            : "border-slate-300 bg-white hover:border-brand-400"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            upload(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <p className="text-sm font-semibold text-slate-700">
          {busy ? "Processing…" : "Drop COI files here, or click to browse"}
        </p>
        <p className="text-xs text-slate-400">PDF, PNG, or JPG</p>
      </div>

      {busy && queued.length > 0 && (
        <div className="card p-4 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <Spinner /> Reading {queued.length} file
            {queued.length === 1 ? "" : "s"}. This can take about 10 to 20s each.
          </div>
          <ul className="mt-2 list-disc pl-6 text-xs text-slate-500">
            {queued.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold">
            Added {results.length}, review each one
          </h2>
          {results.map((cert) => (
            <ResultCard
              key={cert.id}
              cert={cert}
              vendors={vendors}
              expanded={expandedId === cert.id}
              onToggle={() =>
                setExpandedId((id) => (id === cert.id ? null : cert.id))
              }
            />
          ))}
          <Link href="/certificates" className="btn-ghost">
            Go to certificates table →
          </Link>
        </div>
      )}
    </div>
  );
}

function ResultCard({
  cert,
  vendors,
  expanded,
  onToggle,
}: {
  cert: CertificateWithRelations;
  vendors: Vendor[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const failed = cert.extraction_status === "failed";
  const skipped = cert.extraction_status === "skipped";
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-medium">
            {cert.insured_name ?? cert.original_file_name}
          </p>
          <p className="text-xs text-slate-500">
            {cert.vendor ? `Vendor: ${cert.vendor.name} · ` : ""}
            Cert date {formatDate(cert.certificate_date)} ·{" "}
            {cert.coverages.length} coverage line
            {cert.coverages.length === 1 ? "" : "s"}
          </p>
          {failed && (
            <p className="mt-1 text-xs text-red-600">
              Extraction failed: {cert.extraction_error}. Enter fields manually.
            </p>
          )}
          {skipped && (
            <p className="mt-1 text-xs text-amber-700">
              Stored without extraction. Enter fields manually.
            </p>
          )}
          {cert.coverages.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {cert.coverages.map((c) => (
                <span
                  key={c.id}
                  className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
                >
                  {c.coverage_type} → {formatDate(c.expiration_date)}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <a
            href={`/api/files/${cert.id}`}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost"
          >
            PDF
          </a>
          <button className="btn-primary" onClick={onToggle}>
            {expanded ? "Close" : "Review"}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <CertificateEditor certificate={cert} vendors={vendors} />
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
  );
}
