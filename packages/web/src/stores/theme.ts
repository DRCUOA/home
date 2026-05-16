import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  /** The resolved mode actually being rendered (system → light/dark). */
  resolved: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

function resolve(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

/**
 * Apply the theme to <html>.
 *  - toggles `.dark` (drives our semantic token scopes in app.css)
 *  - sets `color-scheme` (themes native scrollbars / form controls)
 *  - briefly adds `.theme-transitioning` so non-initial paints animate
 *    smoothly between modes.
 */
function applyTheme(theme: Theme, animate: boolean) {
  const root = document.documentElement;
  const resolved = resolve(theme);
  const wasDark = root.classList.contains("dark");
  const willChange = wasDark !== (resolved === "dark");

  if (animate && willChange) {
    root.classList.add("theme-transitioning");
    // Remove the transition class after the animation completes so steady-state
    // styles aren't subject to the heavy `* { transition }` selector.
    window.setTimeout(() => {
      root.classList.remove("theme-transitioning");
    }, 280);
  }

  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "system",
      resolved: typeof window !== "undefined" ? resolve("system") : "light",
      setTheme: (theme) => {
        applyTheme(theme, true);
        set({ theme, resolved: resolve(theme) });
      },
    }),
    {
      name: "hcc-theme",
      partialize: (s) => ({ theme: s.theme }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // No animation on the initial rehydrate — we want the FOUC-prevention
          // script's choice to be authoritative without a flash.
          applyTheme(state.theme, false);
          state.resolved = resolve(state.theme);
        }
      },
    }
  )
);

/** Keep `theme: "system"` in sync with the OS preference. */
function onSystemThemeChange() {
  const { theme } = useThemeStore.getState();
  if (theme === "system") {
    applyTheme("system", true);
    useThemeStore.setState({ resolved: resolve("system") });
  }
}

if (typeof window !== "undefined") {
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", onSystemThemeChange);
}
