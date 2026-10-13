/**
 * Light / Dark theme (prototype control in the demo bar). Puts the `dark`
 * class on <html>; app/globals.css swaps the colour tokens under it, so every
 * screen follows. Saved per browser under emts-theme. Light by default.
 */
"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { safeStorage } from "@/features/lib/store";

export type Theme = "light" | "dark";

export const useTheme = create<{ theme: Theme; setTheme: (t: Theme) => void }>()(
  persist((set) => ({ theme: "light", setTheme: (theme) => set({ theme }) }), { name: "emts-theme", storage: createJSONStorage(() => safeStorage) }),
);

/** Mount once: keeps <html class="dark"> in step with the saved theme. */
export function ThemeSync() {
  const theme = useTheme((s) => s.theme);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  return null;
}
