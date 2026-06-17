// Unified key/value storage for plans, graphics, and competitor lists.
// On Cloudflare Pages → reads/writes the bound R2 bucket `DATA`.
// On local Node/Bun → falls back to the on-disk `data/` directory.
// Same API both ways so the store files don't need to care.

import { mkdir, readFile, writeFile, readdir, unlink, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { getRequest } from "@tanstack/start-server-core";

// Minimal subset of the R2Bucket interface we use. Avoids a hard dep on
// @cloudflare/workers-types in non-Cloudflare environments.
interface R2ObjectBody { text(): Promise<string> }
interface R2ListResult {
  objects: { key: string }[];
  truncated: boolean;
  cursor?: string;
}
interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(key: string, value: string | ArrayBuffer | ReadableStream): Promise<unknown>;
  delete(key: string | string[]): Promise<void>;
  list(opts?: { prefix?: string; cursor?: string; limit?: number }): Promise<R2ListResult>;
}

function isR2(x: unknown): x is R2Bucket {
  return !!x && typeof x === "object" && typeof (x as R2Bucket).put === "function";
}

function getR2Binding(): R2Bucket | undefined {
  // Cloudflare Pages: Nitro attaches the worker env to the request object as
  // request.runtime.cloudflare.env. We read it from the current request scope.
  try {
    const req = getRequest() as unknown as {
      runtime?: { cloudflare?: { env?: Record<string, unknown> } };
    };
    const cfEnv = req?.runtime?.cloudflare?.env;
    if (cfEnv && isR2(cfEnv.DATA)) return cfEnv.DATA;
  } catch {
    // not inside a request scope, fall through
  }
  // Fallback: some Nitro presets (and `wrangler dev`) expose bindings here.
  const fallback =
    (globalThis as unknown as { DATA?: unknown }).DATA ??
    (process.env as unknown as { DATA?: unknown }).DATA;
  if (isR2(fallback)) return fallback;
  return undefined;
}

function fsRoot(): string {
  return path.join(process.cwd(), "data");
}

function fsPath(key: string): string {
  // Treat the key as a posix path under data/.
  return path.join(fsRoot(), ...key.split("/"));
}

/** Get a string by key, returns null if not found. */
export async function getString(key: string): Promise<string | null> {
  const r2 = getR2Binding();
  if (r2) {
    const obj = await r2.get(key);
    return obj ? await obj.text() : null;
  }
  try {
    return await readFile(fsPath(key), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/** Write a string at key. Creates parent dirs locally; R2 is flat. */
export async function setString(key: string, value: string): Promise<void> {
  const r2 = getR2Binding();
  if (r2) {
    await r2.put(key, value);
    return;
  }
  const filePath = fsPath(key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

/** Delete a single key. No-op when missing. */
export async function deleteKey(key: string): Promise<void> {
  const r2 = getR2Binding();
  if (r2) {
    await r2.delete(key);
    return;
  }
  try {
    await unlink(fsPath(key));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}

/** List all keys under a prefix (recursive). */
export async function listKeys(prefix: string): Promise<string[]> {
  const r2 = getR2Binding();
  if (r2) {
    const out: string[] = [];
    let cursor: string | undefined;
    do {
      const res = await r2.list({ prefix, cursor, limit: 1000 });
      for (const o of res.objects) out.push(o.key);
      cursor = res.truncated ? res.cursor : undefined;
    } while (cursor);
    return out;
  }
  const dir = fsPath(prefix);
  try {
    const entries = await readdir(dir);
    const keys: string[] = [];
    for (const e of entries) {
      const full = path.join(dir, e);
      const s = await stat(full);
      if (s.isFile()) keys.push(`${prefix}${prefix.endsWith("/") ? "" : "/"}${e}`);
    }
    return keys;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

/** Delete every key under a prefix. Returns count deleted. */
export async function deletePrefix(prefix: string): Promise<number> {
  const r2 = getR2Binding();
  if (r2) {
    const keys = await listKeys(prefix);
    if (!keys.length) return 0;
    // R2 supports batched delete (up to 1000 per call).
    for (let i = 0; i < keys.length; i += 1000) {
      await r2.delete(keys.slice(i, i + 1000));
    }
    return keys.length;
  }
  try {
    await rm(fsPath(prefix), { recursive: true, force: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  return 1;
}
