import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getString, setString, deleteKey, listKeys, deletePrefix } from "../storage.server";
import type { GraphicAgentOutput } from "./types";

// Graphics live at graphics/<brandId>/<safeWeek>/<slideKey>.json.
// slideKey on disk replaces ':' with '_' (postId_index), and is restored on read.

function safeName(s: string): string {
  return s.replace(/[^a-z0-9_-]+/gi, "_").replace(/_+/g, "_").toLowerCase();
}

function weekDir(brandId: string, week: string): string {
  return `graphics/${safeName(brandId)}/${safeName(week)}`;
}

function graphicKey(brandId: string, week: string, slideKey: string): string {
  return `${weekDir(brandId, week)}/${safeName(slideKey)}.json`;
}

export const saveGraphic = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      brandId: z.string().min(1),
      week: z.string().min(1),
      slideKey: z.string().min(1),
      graphic: z.any(),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: true; savedAt: string }> => {
    const savedAt = new Date().toISOString();
    await setString(
      graphicKey(data.brandId, data.week, data.slideKey),
      JSON.stringify({ ...(data.graphic as GraphicAgentOutput), savedAt }, null, 2),
    );
    return { ok: true, savedAt };
  });

export const loadGraphicsForPlan = createServerFn({ method: "POST" })
  .inputValidator(z.object({ brandId: z.string().min(1), week: z.string().min(1) }))
  .handler(
    async ({
      data,
    }): Promise<{ graphics: Record<string, GraphicAgentOutput> }> => {
      const prefix = `${weekDir(data.brandId, data.week)}/`;
      const keys = await listKeys(prefix);
      const out: Record<string, GraphicAgentOutput> = {};
      for (const k of keys) {
        if (!k.endsWith(".json")) continue;
        try {
          const raw = await getString(k);
          if (!raw) continue;
          const parsed = JSON.parse(raw) as GraphicAgentOutput & { savedAt?: string };
          const fileName = k.slice(prefix.length).replace(/\.json$/, "");
          const restoredKey = restoreSlideKey(fileName);
          const { savedAt, ...g } = parsed;
          void savedAt;
          out[restoredKey] = g as GraphicAgentOutput;
        } catch (e) {
          console.warn("Skipping malformed graphic file:", k, e);
        }
      }
      return { graphics: out };
    },
  );

/** Delete every saved graphic for a single post (used when replacing it). */
export const dropGraphicsForPost = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      brandId: z.string().min(1),
      week: z.string().min(1),
      postId: z.string().min(1),
    }),
  )
  .handler(async ({ data }): Promise<{ deleted: number }> => {
    const prefix = `${weekDir(data.brandId, data.week)}/`;
    const keys = await listKeys(prefix);
    const wanted = `${safeName(data.postId)}_`;
    let count = 0;
    for (const k of keys) {
      const fileName = k.slice(prefix.length);
      if (fileName.startsWith(wanted) && fileName.endsWith(".json")) {
        await deleteKey(k);
        count++;
      }
    }
    return { deleted: count };
  });

/** Wipe every graphic for a (brand, week). Used when re-planning. */
export const dropAllGraphicsForWeek = createServerFn({ method: "POST" })
  .inputValidator(z.object({ brandId: z.string().min(1), week: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await deletePrefix(`${weekDir(data.brandId, data.week)}/`);
    return { ok: true };
  });

/** Filename on disk replaces ':' with '_'. Restore the original key. */
function restoreSlideKey(diskName: string): string {
  const m = diskName.match(/^(.+)_(\d+)$/);
  return m ? `${m[1]}:${m[2]}` : diskName;
}
