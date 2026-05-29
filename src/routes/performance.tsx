import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { useApp } from "@/lib/app-store";
import { buildPerformance, buildEngagementTrend, buildContentTypes, platformIconColor, statusColor } from "@/lib/mock-data";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, PieChart, Pie, Cell,
} from "recharts";

export const Route = createFileRoute("/performance")({
  head: () => ({ meta: [{ title: "Performance — Graphic Studio" }] }),
  component: PerformancePage,
});

function PerformancePage() {
  const { selectedBrand, selectedBrandId, graphics } = useApp();

  const metrics = useMemo(() => buildPerformance(selectedBrandId), [selectedBrandId]);
  const trend = useMemo(() => buildEngagementTrend(selectedBrandId), [selectedBrandId]);
  const contentTypes = useMemo(() => buildContentTypes(selectedBrandId), [selectedBrandId]);

  const platformCompare = metrics.map((m) => ({ name: m.platform.split(" ")[0], engagement: m.engagement, reach: m.reach }));

  const topKeywords = [
    { keyword: "career advice", value: 92 },
    { keyword: "interview prep", value: 78 },
    { keyword: "cv tips", value: 71 },
    { keyword: "graduate scheme", value: 64 },
    { keyword: "first internship", value: 53 },
  ];

  const recent = graphics.filter((g) => g.brandId === selectedBrandId).slice(0, 8);

  const chartColors = ["#5b8def", "#42b883", "#f5a524", "#a855f7", "#ef4444"];

  return (
    <AppLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Performance</h1>
          <p className="text-sm text-muted-foreground mt-1">How {selectedBrand.name} is performing across channels.</p>
        </div>

        <section className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          {metrics.map((m) => (
            <div key={m.platform} className="rounded-xl border border-border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", platformIconColor[m.platform])}>{m.platform}</span>
                <span className={cn("text-xs inline-flex items-center gap-0.5 font-medium", m.growth >= 0 ? "text-emerald-600" : "text-rose-600")}>
                  {m.growth >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {m.growth >= 0 ? "+" : ""}{m.growth}%
                </span>
              </div>
              <div className="text-2xl font-semibold tracking-tight">{m.followers.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Followers</div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border text-xs">
                <Stat label="Reach" value={m.reach.toLocaleString()} />
                <Stat label="Impr." value={m.impressions.toLocaleString()} />
                <Stat label="Engage" value={m.engagement.toLocaleString()} />
                <Stat label="Rate" value={`${m.engagementRate}%`} />
                <Stat label="Clicks" value={m.clicks.toLocaleString()} />
              </div>
              <div className="text-[10px] text-muted-foreground pt-1 border-t border-border">Best: {m.bestPost}</div>
            </div>
          ))}
        </section>

        <section className="grid lg:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
            <h3 className="text-sm font-semibold mb-3">Weekly engagement trend</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.93 0.006 250)" />
                  <XAxis dataKey="week" stroke="oklch(0.5 0.01 256)" fontSize={11} />
                  <YAxis stroke="oklch(0.5 0.01 256)" fontSize={11} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.93 0.006 250)" }} />
                  <Line type="monotone" dataKey="engagement" stroke="#5b8def" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="reach" stroke="#42b883" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-3">Content types</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={contentTypes} dataKey="value" nameKey="type" innerRadius={45} outerRadius={80} paddingAngle={2}>
                    {contentTypes.map((_, i) => <Cell key={i} fill={chartColors[i]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.93 0.006 250)" }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="grid lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-3">Platform comparison</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={platformCompare}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.93 0.006 250)" />
                  <XAxis dataKey="name" stroke="oklch(0.5 0.01 256)" fontSize={11} />
                  <YAxis stroke="oklch(0.5 0.01 256)" fontSize={11} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.93 0.006 250)" }} />
                  <Bar dataKey="engagement" fill="#5b8def" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-3">Top keywords by performance</h3>
            <ul className="space-y-3">
              {topKeywords.map((k) => (
                <li key={k.keyword}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium">{k.keyword}</span>
                    <span className="text-muted-foreground">{k.value}</span>
                  </div>
                  <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${k.value}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold">Post performance</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Post</th>
                  <th className="text-left font-medium px-4 py-3">Platform</th>
                  <th className="text-left font-medium px-4 py-3">Published</th>
                  <th className="text-right font-medium px-4 py-3">Reach</th>
                  <th className="text-right font-medium px-4 py-3">Engage</th>
                  <th className="text-right font-medium px-4 py-3">Clicks</th>
                  <th className="text-right font-medium px-4 py-3">Saves</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((g, i) => (
                  <tr key={g.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={cn("h-9 w-9 rounded-md shrink-0", g.gradient)} />
                        <span className="font-medium">{g.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", platformIconColor[g.platforms[0]])}>{g.platforms[0]}</span></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{2 + i}d ago</td>
                    <td className="px-4 py-3 text-right">{(2000 + i * 730).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{(120 + i * 38).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{(40 + i * 17).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{(8 + i * 3).toLocaleString()}</td>
                    <td className="px-4 py-3"><Badge className={cn("text-[10px] border-0", statusColor[g.status])}>{g.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
