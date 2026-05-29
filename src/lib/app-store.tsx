import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  initialBrands,
  initialGraphics,
  initialAgents,
  initialSocialAccounts,
  weeks,
  type Brand,
  type Graphic,
  type Agent,
  type SocialAccount,
  type PostStatus,
} from "./mock-data";

interface AppContextValue {
  brands: Brand[];
  selectedBrandId: string;
  setSelectedBrandId: (id: string) => void;
  selectedBrand: Brand;
  weeks: string[];
  selectedWeek: string;
  setSelectedWeek: (w: string) => void;

  graphics: Graphic[];
  graphicsForView: Graphic[];
  updateGraphic: (id: string, patch: Partial<Graphic>) => void;
  regenerateGraphic: (id: string) => Promise<void>;

  agents: Agent[];
  socialAccounts: SocialAccount[];
  setSocialAccounts: (a: SocialAccount[]) => void;

  addBrand: (b: Omit<Brand, "id" | "gradient" | "initials" | "status"> & { status?: "Active" | "Paused" }) => void;
}

const Ctx = createContext<AppContextValue | null>(null);

const gradientPool = ["gradient-1", "gradient-2", "gradient-3", "gradient-4", "gradient-5", "gradient-6"];

export function AppProvider({ children }: { children: ReactNode }) {
  const [brands, setBrands] = useState<Brand[]>(initialBrands);
  const [selectedBrandId, setSelectedBrandId] = useState<string>(initialBrands[0].id);
  const [selectedWeek, setSelectedWeek] = useState<string>(weeks[0]);
  const [graphics, setGraphics] = useState<Graphic[]>(initialGraphics);
  const [agents] = useState<Agent[]>(initialAgents);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>(initialSocialAccounts);

  const selectedBrand = useMemo(
    () => brands.find((b) => b.id === selectedBrandId) ?? brands[0],
    [brands, selectedBrandId]
  );

  const graphicsForView = useMemo(
    () => graphics.filter((g) => g.brandId === selectedBrandId && g.week === selectedWeek),
    [graphics, selectedBrandId, selectedWeek]
  );

  const updateGraphic = (id: string, patch: Partial<Graphic>) => {
    setGraphics((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };

  const regenerateGraphic = async (id: string) => {
    const newGrad = gradientPool[Math.floor(Math.random() * gradientPool.length)];
    await new Promise((r) => setTimeout(r, 1100));
    updateGraphic(id, { gradient: newGrad, lastEdited: "just now" });
  };

  const addBrand: AppContextValue["addBrand"] = (b) => {
    const id = b.name.toLowerCase().replace(/\s+/g, "-");
    const newBrand: Brand = {
      ...b,
      id,
      status: b.status ?? "Active",
      gradient: gradientPool[brands.length % gradientPool.length],
      initials: b.name
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    };
    setBrands((prev) => [...prev, newBrand]);
  };

  const value: AppContextValue = {
    brands,
    selectedBrandId,
    setSelectedBrandId,
    selectedBrand,
    weeks,
    selectedWeek,
    setSelectedWeek,
    graphics,
    graphicsForView,
    updateGraphic,
    regenerateGraphic,
    agents,
    socialAccounts,
    setSocialAccounts,
    addBrand,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppProvider");
  return v;
}

export function statusBadgeUpdate(_status: PostStatus) {
  // utility placeholder, kept for future
  return _status;
}
