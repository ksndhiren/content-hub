import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { TopBar } from "./TopBar";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-10 max-w-[1400px] w-full mx-auto">
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
