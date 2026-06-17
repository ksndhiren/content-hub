import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { useApp } from "@/lib/app-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Globe, Users, Volume2, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { platformIconColor } from "@/lib/mock-data";

export const Route = createFileRoute("/brands")({
  head: () => ({ meta: [{ title: "Brands | Content Hub" }] }),
  component: BrandsPage,
});

function BrandsPage() {
  const { brands, setSelectedBrandId } = useApp();

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Brands</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Brand workspaces are provisioned via the backend. Contact an admin to onboard a new brand.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {brands.map((b) => (
            <div key={b.id} className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
              <div className="h-24 relative" style={{ backgroundColor: b.colors?.[0] ?? "#1e3a8a" }}>
                <div className="absolute inset-0 p-4 flex items-start justify-between">
                  {b.iconUrl ? (
                    <img src={b.iconUrl} alt="" className="h-12 w-12 rounded-xl bg-white object-contain p-2 shadow-sm" />
                  ) : (
                    <div className="h-12 w-12 rounded-xl bg-white/95 text-foreground font-semibold grid place-items-center shadow-sm">{b.initials}</div>
                  )}
                  <Badge className="bg-white/90 text-foreground border-0">{b.status}</Badge>
                </div>
              </div>
              <div className="p-5 flex-1 flex flex-col gap-3">
                <div>
                  <div className="font-semibold">{b.name}</div>
                  <div className="text-xs text-muted-foreground">{b.industry}</div>
                </div>
                <ul className="text-xs text-muted-foreground space-y-1.5">
                  <li className="flex items-center gap-2"><Users className="h-3.5 w-3.5" /> {b.audience}</li>
                  <li className="flex items-center gap-2"><Volume2 className="h-3.5 w-3.5" /> {b.tone}</li>
                  <li className="flex items-center gap-2"><Layers className="h-3.5 w-3.5" /> {b.weeklyVolume} posts / week</li>
                  {b.website && <li className="flex items-center gap-2"><Globe className="h-3.5 w-3.5" /> {b.website}</li>}
                </ul>
                <div className="flex flex-wrap gap-1 mt-1">
                  {b.platforms.map((p) => (
                    <span key={p} className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", platformIconColor[p])}>{p}</span>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="mt-auto" onClick={() => setSelectedBrandId(b.id)}>Open workspace</Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
