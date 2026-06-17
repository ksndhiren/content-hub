import { getString, setString } from "../storage.server";
import { initialBrands } from "../mock-data";
import type { SpottedBrand } from "./types";

const MAX_COMPETITORS = 6;

function listKey(brandId: string): string {
  return `brands/${brandId}.competitors.json`;
}

export interface PersistedCompetitor {
  name: string;
  domain: string;
  /** When this competitor was first added to the list. */
  addedAt: string;
  /** Whether they came from the static seed or were spotted by the agent. */
  source: "seed" | "spotted";
  /** Optional reason captured when the agent spotted them. */
  reason?: string;
}

/** Load the persisted competitor list for a brand. Falls back to seeding from
 *  mock-data the first time the file doesn't exist (and writes the seed file). */
export async function loadCompetitorList(brandId: string): Promise<PersistedCompetitor[]> {
  const raw = await getString(listKey(brandId));
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { items: PersistedCompetitor[] };
      if (Array.isArray(parsed.items)) return parsed.items.slice(0, MAX_COMPETITORS);
    } catch {
      // fall through to re-seed
    }
  }
  const brand = initialBrands.find((b) => b.id === brandId);
  const now = new Date().toISOString();
  const seeded: PersistedCompetitor[] = (brand?.competitors ?? []).map((c) => ({
    name: c.name, domain: c.domain, addedAt: now, source: "seed",
  }));
  await writeList(brandId, seeded);
  return seeded;
}

/** Persist a list (overwrites). */
async function writeList(brandId: string, items: PersistedCompetitor[]): Promise<void> {
  await setString(
    listKey(brandId),
    JSON.stringify({ items, updatedAt: new Date().toISOString() }, null, 2),
  );
}

/** Merge newly-spotted brands into the persisted list. Dedupes by domain
 *  (case-insensitive). Caps at MAX_COMPETITORS; when full, evicts the oldest
 *  "spotted" entry (never an explicitly-seeded one).
 *
 *  Returns the updated list AND the entries that were actually added (for telemetry). */
export async function mergeSpottedBrands(
  brandId: string,
  spotted: SpottedBrand[],
): Promise<{ list: PersistedCompetitor[]; added: PersistedCompetitor[] }> {
  if (!spotted.length) {
    const list = await loadCompetitorList(brandId);
    return { list, added: [] };
  }
  const current = await loadCompetitorList(brandId);
  const seenDomains = new Set(current.map((c) => c.domain.toLowerCase()));
  const brand = initialBrands.find((b) => b.id === brandId);
  const brandOwnDomain = brand?.website?.toLowerCase().replace(/^www\./, "");

  const added: PersistedCompetitor[] = [];
  const now = new Date().toISOString();
  for (const s of spotted) {
    const domain = s.domain.toLowerCase();
    if (seenDomains.has(domain)) continue;
    if (brandOwnDomain && domain.endsWith(brandOwnDomain)) continue;
    seenDomains.add(domain);
    added.push({ name: s.name, domain, addedAt: now, source: "spotted", reason: s.reason });
  }
  if (!added.length) return { list: current, added: [] };

  let next = [...current, ...added];
  while (next.length > MAX_COMPETITORS) {
    const oldestSpottedIdx = next
      .map((c, i) => ({ c, i }))
      .filter((x) => x.c.source === "spotted")
      .sort((a, b) => a.c.addedAt.localeCompare(b.c.addedAt))[0]?.i;
    if (oldestSpottedIdx === undefined) break;
    next = next.filter((_, i) => i !== oldestSpottedIdx);
  }
  await writeList(brandId, next);
  return { list: next, added };
}
