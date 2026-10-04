// Reading certificates on the page: pdf.js pulls the text (and, where Claude
// accepts pictures, page images) out of the file, then the viewer's own
// Claude reads it using the same rules and schema as the server app.
import {
  CERTIFICATE_SCHEMA,
  EXTRACTION_RULES,
  normalize,
} from "@/lib/extractShared";
import type { ExtractionResult } from "@/lib/types";
import { useCapability } from "./store";

/* eslint-disable @typescript-eslint/no-explicit-any */
const pdfjs = (): any => (window as any).pdfjsLib ?? null;

export interface ReaderSupport {
  /** The page can ask Claude at all. */
  claude: boolean;
  /** Claude accepts page pictures here (needed for scans and photos). */
  images: boolean;
  maxImages: number;
  /** pdf.js loaded, so PDFs can be opened. */
  pdf: boolean;
}

let sampleFn: any = null;
let support: ReaderSupport | null = null;

export async function readerSupport(): Promise<ReaderSupport> {
  if (support) return support;
  sampleFn = await useCapability("sample");
  let images = false;
  let maxImages = 0;
  if (sampleFn && typeof sampleFn.limits === "function") {
    try {
      const lim = await sampleFn.limits();
      images = !!lim?.images;
      maxImages = lim?.images?.maxCount ?? 0;
    } catch {
      images = false;
    }
  }
  support = { claude: !!sampleFn, images, maxImages, pdf: !!pdfjs() };
  return support;
}

/** Text lines rebuilt from pdf.js text items, top to bottom. */
function linesFromItems(items: any[]): string {
  const rows: { y: number; parts: { x: number; s: string }[] }[] = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) < 3);
    if (!row) rows.push((row = { y, parts: [] }));
    row.parts.push({ x, s: it.str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows
    .map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join("  "))
    .join("\n");
}

export interface OpenedFile {
  pages: number;
  text: string;
  /** True when the file has little or no text: a scan or a photo. */
  looksScanned: boolean;
  images: Blob[];
}

async function renderPage(page: any, maxPixels: number): Promise<HTMLCanvasElement> {
  const vp1 = page.getViewport({ scale: 1 });
  const scale = Math.min(3, Math.sqrt(maxPixels / (vp1.width * vp1.height)));
  const vp = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return canvas;
}

export async function openFile(file: Blob, isImage: boolean, wantImages: number): Promise<OpenedFile> {
  if (isImage) return { pages: 1, text: "", looksScanned: true, images: [file] };
  const lib = pdfjs();
  if (!lib) throw new Error("The PDF reader didn't load. Reload the page and try again.");
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const texts: string[] = [];
  const images: Blob[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    texts.push(linesFromItems((await page.getTextContent()).items));
    if (i <= wantImages) {
      const canvas = await renderPage(page, 1_500_000);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
      if (blob) images.push(blob);
    }
  }
  const text = texts.join("\n\n--- next page ---\n\n");
  return {
    pages: doc.numPages,
    text,
    looksScanned: text.replace(/\s/g, "").length < 150,
    images,
  };
}

/** Draw each page of a stored PDF into the given element. */
export async function showPdf(file: Blob, into: HTMLElement): Promise<void> {
  const lib = pdfjs();
  if (!lib) throw new Error("The PDF reader didn't load.");
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  into.replaceChildren();
  for (let i = 1; i <= doc.numPages; i++) {
    const canvas = await renderPage(await doc.getPage(i), 2_500_000);
    canvas.className = "pdf-page";
    canvas.setAttribute("aria-label", `Page ${i}`);
    into.append(canvas);
  }
}

function prompt(source: string): string {
  return [
    EXTRACTION_RULES,
    "",
    "Reply with only one JSON object that matches this JSON schema:",
    JSON.stringify(CERTIFICATE_SCHEMA),
    "",
    source,
  ].join("\n");
}

/** Instructions a person can paste into any Claude chat along with a certificate. */
export function chatInstructions(): string {
  return prompt(
    "Read the certificate of insurance attached to this message. Reply with the JSON object in one ```json code block and nothing else.",
  );
}

export class ReadError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  not_granted: "Reading was not allowed. Allow this page to use Claude, or enter the details yourself.",
  rate_limited: "Claude is busy with your other files. Wait a minute, then click Read again.",
  prompt_too_large: "This file has too much text to send in one go. Enter the details yourself.",
  invalid_json: "Claude answered, but not in a form COI Hero could use. Try Read again.",
  images_unavailable: "This page can't send pictures to Claude here.",
  image_rejected: "Claude couldn't use the page pictures.",
  cancelled: "Stopped.",
};

/** Ask the viewer's Claude to read one opened file. */
export async function readWithClaude(
  opened: OpenedFile,
  opts: { signal?: AbortSignal; onProgress?: (msg: string) => void } = {},
): Promise<{ result: ExtractionResult; method: "text" | "pictures" }> {
  const s = await readerSupport();
  if (!s.claude) throw new ReadError("unavailable", "This page can't ask Claude here.");
  const usePictures = opened.looksScanned;
  if (usePictures && !(s.images && opened.images.length)) {
    throw new ReadError(
      "scanned",
      "This looks like a scan or photo, which this page can't send to Claude. Drop it into your Claude chat instead, or enter the details yourself.",
    );
  }
  const input = usePictures
    ? prompt("The attached images are the pages of the certificate.")
    : prompt(
        "The certificate's text, taken from the PDF line by line:\n<<<\n" +
          opened.text.slice(0, 120_000) +
          "\n>>>",
      );
  try {
    const raw = await sampleFn.json(input, {
      signal: opts.signal,
      images: usePictures ? opened.images.slice(0, s.maxImages || 1) : undefined,
      onText: () => opts.onProgress?.("Claude is writing…"),
    });
    if (!raw || typeof raw !== "object") throw new ReadError("invalid_json", MESSAGES.invalid_json);
    return { result: normalize(raw as Record<string, unknown>), method: usePictures ? "pictures" : "text" };
  } catch (e: any) {
    if (e instanceof ReadError) throw e;
    const code = e?.code ?? "unknown";
    throw new ReadError(code, MESSAGES[code] ?? "Claude couldn't read this file. Try again, or enter the details yourself.");
  }
}

/** Accept data pasted from a Claude chat: a JSON object in the same schema. */
export function parsePasted(text: string): ExtractionResult {
  const t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("That isn't the certificate data. Paste the whole block Claude gave you, including the { and }.");
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as any).coverages)) {
    throw new Error("That data has no coverage lines. Ask Claude for the COI Hero format again.");
  }
  return normalize(parsed as Record<string, unknown>);
}
