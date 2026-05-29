import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  delta?: number;
  icon?: LucideIcon;
  accent?: string;
}

export function StatCard({ label, value, hint, delta, icon: Icon, accent }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        {Icon && (
          <div className={cn("h-8 w-8 rounded-lg grid place-items-center bg-surface text-muted-foreground", accent)}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {(hint || typeof delta === "number") && (
        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          {typeof delta === "number" && (
            <span className={cn("inline-flex items-center gap-0.5 font-medium", delta >= 0 ? "text-emerald-600" : "text-rose-600")}>
              {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {delta >= 0 ? "+" : ""}{delta}%
            </span>
          )}
          {hint}
        </div>
      )}
    </div>
  );
}
