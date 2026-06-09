import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import type { WeeklyPlan } from "./types";

// All plans live under <project-root>/data/plans/<brand>-<safeWeek>.json.
// One file per (brand, week) pair so re-planning the same week overwrites cleanly.

function plansDir(): string {
  return path.join(process.cwd(), "data", "plans");
}

function safeName(s: string): string {
  return s.replace(/[^a-z0-9_-]+/gi, "_").replace(/_+/g, "_").toLowerCase();
}

function planPath(brandId: string, week: string): string {
  return path.join(plansDir(), `${safeName(brandId)}-${safeName(week)}.json`);
}

export const savePlan = createServerFn({ method: "POST" })
  .inputValidator(z.object({ plan: z.any() }))
  .handler(async ({ data }): Promise<{ ok: true; path: string; savedAt: string }> => {
    const plan = data.plan as WeeklyPlan;
    if (!plan?.brandId || !plan?.week) throw new Error("Plan missing brandId or week");
    await mkdir(plansDir(), { recursive: true });
    const file = planPath(plan.brandId, plan.week);
    const savedAt = new Date().toISOString();
    await writeFile(file, JSON.stringify({ ...plan, savedAt }, null, 2), "utf8");
    return { ok: true, path: file, savedAt };
  });

export const loadPlan = createServerFn({ method: "GET" })
  .inputValidator(z.object({ brandId: z.string().min(1), week: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ plan: WeeklyPlan | null; savedAt?: string }> => {
    try {
      const raw = await readFile(planPath(data.brandId, data.week), "utf8");
      const parsed = JSON.parse(raw) as WeeklyPlan & { savedAt?: string };
      const { savedAt, ...plan } = parsed;
      return { plan: plan as WeeklyPlan, savedAt };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return { plan: null };
      throw e;
    }
  });

export const listPlans = createServerFn({ method: "GET" })
  .inputValidator(z.object({ brandId: z.string().min(1).optional() }).optional())
  .handler(
    async ({
      data,
    }): Promise<{ items: Array<{ brandId: string; week: string; savedAt: string }> }> => {
      try {
        const files = await readdir(plansDir());
        const wanted = data?.brandId ? safeName(data.brandId) : null;
        const items: Array<{ brandId: string; week: string; savedAt: string }> = [];
        for (const f of files) {
          if (!f.endsWith(".json")) continue;
          if (wanted && !f.startsWith(`${wanted}-`)) continue;
          try {
            const raw = await readFile(path.join(plansDir(), f), "utf8");
            const parsed = JSON.parse(raw) as WeeklyPlan & { savedAt?: string };
            const s = await stat(path.join(plansDir(), f));
            items.push({
              brandId: parsed.brandId,
              week: parsed.week,
              savedAt: parsed.savedAt ?? s.mtime.toISOString(),
            });
          } catch {
            // skip bad files
          }
        }
        items.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
        return { items };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return { items: [] };
        throw e;
      }
    },
  );
