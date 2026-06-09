import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  initialBrands,
  weeks,
  type Brand,
  type Graphic,
  type SocialAccount,
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
  setGraphics: (g: Graphic[]) => void;
  updateGraphic: (id: string, patch: Partial<Graphic>) => void;

  socialAccounts: SocialAccount[];
  setSocialAccounts: (a: SocialAccount[]) => void;
}

const Ctx = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [selectedBrandId, setSelectedBrandId] = useState<string>(initialBrands[0].id);
  const [selectedWeek, setSelectedWeek] = useState<string>(weeks[0]);
  const [graphics, setGraphics] = useState<Graphic[]>([]);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([]);

  const selectedBrand = useMemo(
    () => initialBrands.find((b) => b.id === selectedBrandId) ?? initialBrands[0],
    [selectedBrandId],
  );

  const graphicsForView = useMemo(
    () => graphics.filter((g) => g.brandId === selectedBrandId && g.week === selectedWeek),
    [graphics, selectedBrandId, selectedWeek],
  );

  const updateGraphic = (id: string, patch: Partial<Graphic>) => {
    setGraphics((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };

  const value: AppContextValue = {
    brands: initialBrands,
    selectedBrandId,
    setSelectedBrandId,
    selectedBrand,
    weeks,
    selectedWeek,
    setSelectedWeek,
    graphics,
    graphicsForView,
    setGraphics,
    updateGraphic,
    socialAccounts,
    setSocialAccounts,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppProvider");
  return v;
}
