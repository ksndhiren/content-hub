import { useState } from "react";
import { useApp } from "@/lib/app-store";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sparkles, Menu, Loader2, User2, LogOut, Settings as SettingsIcon } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { navItems } from "./Sidebar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function TopBar() {
  const { brands, selectedBrandId, setSelectedBrandId, weeks, selectedWeek, setSelectedWeek, selectedBrand } = useApp();
  const [generating, setGenerating] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const generate = async () => {
    setGenerating(true);
    toast.loading("Generating weekly batch...", { id: "gen" });
    await new Promise((r) => setTimeout(r, 1600));
    setGenerating(false);
    toast.success(`New batch ready for ${selectedBrand.name}`, { id: "gen", description: "7 graphics added to review queue." });
  };

  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur border-b border-border">
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-6 h-16">
        {/* Mobile menu */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <div className="px-5 h-16 flex items-center gap-2 border-b">
              <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground grid place-items-center">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="font-semibold text-sm">Graphic Studio</div>
            </div>
            <nav className="p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.to;
                return (
                  <Link key={item.to} to={item.to} className={cn("flex items-center gap-3 px-3 py-2 rounded-lg text-sm", active ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/60")}>
                    <Icon className="h-4 w-4" /> {item.label}
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>

        <Link to="/" className="lg:hidden flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-primary text-primary-foreground grid place-items-center">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
          <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
            <SelectTrigger className="h-9 w-[160px] sm:w-[220px] bg-surface border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  <div className="flex items-center gap-2">
                    <div className={cn("h-5 w-5 rounded text-[10px] font-semibold text-white grid place-items-center", b.gradient)}>
                      {b.initials}
                    </div>
                    {b.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedWeek} onValueChange={setSelectedWeek}>
            <SelectTrigger className="h-9 w-[140px] sm:w-[210px] bg-surface border-border hidden sm:flex">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {weeks.map((w) => (
                <SelectItem key={w} value={w}>
                  {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={generate} disabled={generating} className="h-9 gap-2">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <SparkIcon className="h-4 w-4" />}
          <span className="hidden sm:inline">{generating ? "Generating..." : "Generate Weekly Batch"}</span>
          <span className="sm:hidden">{generating ? "..." : "Generate"}</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-9 w-9 rounded-full bg-surface border border-border grid place-items-center text-xs font-semibold">
              JS
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Jamie Smith</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem><User2 className="h-4 w-4 mr-2" /> Profile</DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings"><SettingsIcon className="h-4 w-4 mr-2" /> Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem><LogOut className="h-4 w-4 mr-2" /> Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
