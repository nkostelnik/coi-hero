// Where the page keeps its records. In order of preference:
//   account: the viewer's private space in this page's Claude database
//            (data/users/<id>), so it follows them to other computers;
//   browser: localStorage, for viewers who can't write to the database;
//   memory:  nothing persists (storage blocked), so the page says so.
// Original files are never sent to the database; they stay in this browser.
import type { Requirement, Vendor } from "@/lib/types";
import type { PageCertificate, PageData, PageSettings } from "./model";
import { emptyData } from "./model";

export type StorageMode = "account" | "browser" | "memory";

type Kind = "vendor" | "certificate" | "requirement";
const PREFIX: Record<Kind, string> = { vendor: "v-", certificate: "c-", requirement: "r-" };
const LIST: Record<Kind, keyof Omit<PageData, "settings">> = {
  vendor: "vendors",
  certificate: "certificates",
  requirement: "requirements",
};
type RecordOf<K extends Kind> = K extends "vendor"
  ? Vendor
  : K extends "certificate"
    ? PageCertificate
    : Requirement;

/* eslint-disable @typescript-eslint/no-explicit-any */
type ClaudeRuntime = { use(name: string): Promise<any> };
const runtime = (): ClaudeRuntime | null => {
  const c = (window as any).claude;
  return c && typeof c.use === "function" ? c : null;
};

export async function useCapability<T = any>(name: string): Promise<T | null> {
  const c = runtime();
  if (!c) return null;
  try {
    return await c.use(name);
  } catch {
    return null;
  }
}

/* ------------------------------ backends ------------------------------ */

interface Backend {
  mode: StorageMode;
  load(): Promise<PageData | null>;
  put(id: string, kind: Kind | "settings", record: object): Promise<void>;
  remove(id: string): Promise<void>;
  clear(data: PageData): Promise<void>;
}

/** Retry a database call that hit a rate limit or a passing outage. */
async function retrying<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const transient = e?.code === "resource_exhausted" || e?.code === "unavailable";
      if (!transient || attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 800 * 2 ** attempt + Math.random() * 400));
    }
  }
}

class AccountBackend implements Backend {
  mode: StorageMode = "account";
  constructor(private col: any) {}
  async load(): Promise<PageData | null> {
    const snap = await this.col.limit(1000).get();
    if (snap.empty) return null;
    const data = emptyData();
    for (const doc of snap.docs) {
      const d = doc.data() as { kind?: string; record?: any } | undefined;
      if (!d?.record) continue;
      if (d.kind === "settings") data.settings = { ...data.settings, ...d.record };
      else if (d.kind && d.kind in LIST) data[LIST[d.kind as Kind]].push(d.record);
    }
    return data;
  }
  put(id: string, kind: string, record: object) {
    const body = { kind, record: JSON.parse(JSON.stringify(record)) };
    return retrying<void>(() => this.col.doc(id).set(body));
  }
  remove(id: string) {
    return retrying<void>(() => this.col.doc(id).delete());
  }
  async clear() {
    const snap = await retrying(() => this.col.limit(1000).get());
    for (const doc of (snap as any).docs) await this.remove(doc.id);
  }
}

const LOCAL_KEY = "coi-hero:data:v1";
class BrowserBackend implements Backend {
  mode: StorageMode = "browser";
  private data: PageData = emptyData();
  async load() {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    this.data = { ...emptyData(), ...JSON.parse(raw) };
    return this.data;
  }
  private flush() {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(this.data));
  }
  /** The browser copy is rewritten whole, so it tracks the page's data. */
  track(data: PageData) {
    this.data = data;
  }
  async put() {
    this.flush();
  }
  async remove() {
    this.flush();
  }
  async clear(data: PageData) {
    this.data = data;
    localStorage.removeItem(LOCAL_KEY);
  }
}

class MemoryBackend implements Backend {
  mode: StorageMode = "memory";
  async load() {
    return null;
  }
  async put() {}
  async remove() {}
  async clear() {}
}

function browserStorageWorks(): boolean {
  try {
    localStorage.setItem("coi-hero:probe", "1");
    localStorage.removeItem("coi-hero:probe");
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------- store -------------------------------- */

export class Store {
  data: PageData = emptyData();
  private backend: Backend = new MemoryBackend();
  private queue: Promise<unknown> = Promise.resolve();
  onChange: (data: PageData) => void = () => {};
  onNotice: (message: string) => void = () => {};

  get mode(): StorageMode {
    return this.backend.mode;
  }

  /** Pick a backend and load whatever it holds. */
  async open(): Promise<void> {
    const [db, user] = await Promise.all([useCapability("db"), useCapability("user")]);
    let uid: string | null = null;
    if (db && user) {
      try {
        uid = await user.id();
      } catch {
        uid = null;
      }
    }
    if (db && uid) {
      const account = new AccountBackend(db.collection("data/users/" + uid));
      try {
        const loaded = await account.load();
        this.backend = account;
        this.setData(loaded ?? emptyData());
        return;
      } catch {
        // fall through to the browser
      }
    }
    await this.useBrowser();
  }

  private async useBrowser(keep?: PageData) {
    if (browserStorageWorks()) {
      const b = new BrowserBackend();
      let loaded: PageData | null = null;
      try {
        loaded = await b.load();
      } catch {
        loaded = null;
      }
      const data = keep ?? loaded ?? emptyData();
      b.track(data);
      this.backend = b;
      this.setData(data);
      if (keep) await b.put();
    } else {
      this.backend = new MemoryBackend();
      this.setData(keep ?? emptyData());
    }
  }

  private setData(data: PageData) {
    this.data = data;
    if (this.backend instanceof BrowserBackend) this.backend.track(data);
    this.onChange(data);
  }

  /** Writes run one at a time. A refused account write moves to the browser. */
  private write(fn: (b: Backend) => Promise<void>): Promise<void> {
    const run = this.queue.then(async () => {
      try {
        await fn(this.backend);
      } catch (e: any) {
        if (this.backend.mode === "account") {
          const code = e?.code as string | undefined;
          if (code === "quota_exceeded") {
            this.onNotice("Your COI Hero storage in Claude is full. Delete some certificates to save more.");
            return;
          }
          if (code === "resource_exhausted" || code === "unavailable") {
            this.onNotice("Claude's storage is busy, so the last change wasn't saved. Make the change again in a minute.");
            return;
          }
          this.onNotice(
            "This page can't save to your Claude account here, so your data is now kept in this browser only.",
          );
          await this.useBrowser(this.data);
        } else {
          this.onNotice("Couldn't save. Your browser may be blocking storage for this page.");
        }
      }
    });
    this.queue = run.catch(() => {});
    return run;
  }

  private replace<K extends Kind>(kind: K, record: RecordOf<K>) {
    const list = this.data[LIST[kind]] as unknown as RecordOf<K>[];
    const i = list.findIndex((r) => r.id === record.id);
    const next = i >= 0 ? list.map((r, j) => (j === i ? record : r)) : [...list, record];
    this.setData({ ...this.data, [LIST[kind]]: next });
  }

  save<K extends Kind>(kind: K, record: RecordOf<K>): Promise<void> {
    this.replace(kind, record);
    return this.write((b) => b.put(PREFIX[kind] + record.id, kind, record));
  }

  remove(kind: Kind, id: number): Promise<void> {
    const key = LIST[kind];
    const list = this.data[key] as Array<{ id: number }>;
    this.setData({ ...this.data, [key]: list.filter((r) => r.id !== id) });
    return this.write((b) => b.remove(PREFIX[kind] + id));
  }

  saveSettings(settings: PageSettings): Promise<void> {
    this.setData({ ...this.data, settings });
    return this.write((b) => b.put("settings", "settings", settings));
  }

  /** Replace everything (sample data, a restored backup, or nothing). */
  async replaceAll(data: PageData): Promise<void> {
    const old = this.data;
    this.setData(data);
    await this.write(async (b) => {
      await b.clear(old);
      if (b instanceof BrowserBackend) {
        b.track(data);
        return b.put();
      }
      await b.put("settings", "settings", data.settings);
      for (const v of data.vendors) await b.put(PREFIX.vendor + v.id, "vendor", v);
      for (const r of data.requirements) await b.put(PREFIX.requirement + r.id, "requirement", r);
      for (const c of data.certificates) await b.put(PREFIX.certificate + c.id, "certificate", c);
    });
  }
}

/* ------------------------- original files (PDFs) ------------------------- */

const memoryFiles = new Map<number, Blob>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function filesDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open("coi-hero-files", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("files");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await filesDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction("files", mode).objectStore("files"));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export const files = {
  async put(id: number, blob: Blob): Promise<void> {
    memoryFiles.set(id, blob);
    await tx("readwrite", (s) => s.put(blob, id));
  },
  async get(id: number): Promise<Blob | null> {
    const stored = await tx<Blob>("readonly", (s) => s.get(id));
    return stored ?? memoryFiles.get(id) ?? null;
  },
  async remove(id: number): Promise<void> {
    memoryFiles.delete(id);
    await tx("readwrite", (s) => s.delete(id));
  },
  async clear(): Promise<void> {
    memoryFiles.clear();
    await tx("readwrite", (s) => s.clear());
  },
};
