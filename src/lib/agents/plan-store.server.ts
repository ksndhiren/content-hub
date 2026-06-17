import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getString, setString, listKeys } from "../storage.server";
import type { WeeklyPlan, CompetitorScanOutput } from "./types";

// Plans live at plans/<brand>-<safeWeek>.json
// Competitor scans at plans/<brand>-<safeWeek>.competitors.json

function safeName(s: string): string {
  return s.replace(/[^a-z0-9_-]+/gi, "_").replace(/_+/g, "_").toLowerCase();
}

function planKey(brandId: string, week: string): string {
  return `plans/${safeName(brandId)}-${safeName(week)}.json`;
}

function competitorKey(brandId: string, week: string): string {
  return `plans/${safeName(brandId)}-${safeName(week)}.competitors.json`;
}

export const saveCompetitorScan = createServerFn({ method: "POST" })
  .inputValidator(z.object({ scan: z.any(), week: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ ok: true; savedAt: string }> => {
    const scan = data.scan as CompetitorScanOutput;
    if (!scan?.brandId) throw new Error("scan missing brandId");
    const savedAt = new Date().toISOString();
    await setString(competitorKey(scan.brandId, data.week), JSON.stringify({ ...scan, savedAt }, null, 2));
    return { ok: true, savedAt };
  });

export const loadCompetitorScan = createServerFn({ method: "POST" })
  .inputValidator(z.object({ brandId: z.string().min(1), week: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ scan: CompetitorScanOutput | null; savedAt?: string }> => {
    const raw = await getString(competitorKey(data.brandId, data.week));
    if (!raw) return { scan: null };
    const parsed = JSON.parse(raw) as CompetitorScanOutput & { savedAt?: string };
    const { savedAt, ...scan } = parsed;
    return { scan: scan as CompetitorScanOutput, savedAt };
  });

export const savePlan = createServerFn({ method: "POST" })
  .inputValidator(z.object({ plan: z.any() }))
  .handler(async ({ data }): Promise<{ ok: true; path: string; savedAt: string }> => {
    const plan = data.plan as WeeklyPlan;
    if (!plan?.brandId || !plan?.week) throw new Error("Plan missing brandId or week");
    const key = planKey(plan.brandId, plan.week);
    const savedAt = new Date().toISOString();
    await setString(key, JSON.stringify({ ...plan, savedAt }, null, 2));
    return { ok: true, path: key, savedAt };
  });

export const loadPlan = createServerFn({ method: "POST" })
  .inputValidator(z.object({ brandId: z.string().min(1), week: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ plan: WeeklyPlan | null; savedAt?: string }> => {
    const raw = await getString(planKey(data.brandId, data.week));
    if (!raw) return { plan: null };
    const parsed = JSON.parse(raw) as WeeklyPlan & { savedAt?: string };
    const { savedAt, ...plan } = parsed;
    return { plan: plan as WeeklyPlan, savedAt };
  });

export const listPlans = createServerFn({ method: "POST" })
  .inputValidator(z.object({ brandId: z.string().min(1).optional() }).optional())
  .handler(
    async ({
      data,
    }): Promise<{ items: Array<{ brandId: string; week: string; savedAt: string }> }> => {
      const wantedPrefix = data?.brandId ? `plans/${safeName(data.brandId)}-` : "plans/";
      const keys = await listKeys("plans/");
      const items: Array<{ brandId: string; week: string; savedAt: string }> = [];
      for (const k of keys) {
        if (!k.endsWith(".json")) continue;
        if (k.endsWith(".competitors.json")) continue;
        if (!k.startsWith(wantedPrefix)) continue;
        try {
          const raw = await getString(k);
          if (!raw) continue;
          const parsed = JSON.parse(raw) as WeeklyPlan & { savedAt?: string };
          items.push({
            brandId: parsed.brandId,
            week: parsed.week,
            savedAt: parsed.savedAt ?? new Date(0).toISOString(),
          });
        } catch {
          // skip bad entries
        }
      }
      items.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      return { items };
    },
  );
