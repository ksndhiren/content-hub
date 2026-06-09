import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Images,
  Type,
  Workflow,
  BarChart3,
  Building2,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/graphics", label: "Weekly Graphics", icon: Images },
  { to: "/captions", label: "Captions", icon: Type },
  { to: "/workflow", label: "AI Workflow", icon: Workflow },
  { to: "/performance", label: "Performance", icon: BarChart3 },
  { to: "/brands", label: "Brands", icon: Building2 },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <aside className="hidden lg:flex w-64 flex-col border-r border-border bg-sidebar h-screen sticky top-0">
      <div className="px-5 h-16 flex items-center gap-2 border-b border-border">
        <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground grid place-items-center">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Content Hub</div>
          <div className="text-[11px] text-muted-foreground">AI content workspace</div>
        </div>
      </div>
      <nav className="p-3 flex-1 space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.to;
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-border">
        <div className="rounded-lg bg-surface p-3 text-xs text-muted-foreground">
          <div className="font-medium text-foreground mb-1">Weekly batch ready</div>
          7 graphics waiting for review.
        </div>
      </div>
    </aside>
  );
}
