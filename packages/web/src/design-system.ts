/**
 * Homelhar Design System — single source of truth.
 *
 * This module is the one place to review or change the visual design of the
 * desktop app. Every surface, spacing value, color, radius, shadow, type
 * ramp, layout dimension, and motion curve used in the UI should trace back
 * here. Changes made here propagate to:
 *
 *   1. Tailwind (via the CSS custom properties emitted by `cssVariables`
 *      which `app.css` consumes inside its `@theme` block).
 *   2. Any component that imports the typed `designSystem` object directly
 *      (e.g. for inline styles, JS-driven values, or responsive logic).
 *
 * Design direction (desktop-first, >=1024px):
 *   • Retain brand "Homelhar green" primary palette and Nunito display font.
 *   • Dense, information-rich layouts built around a 12-column content grid.
 *   • Pro-tool density comparable to Linear / Height / modern SaaS desktop
 *     apps — not a mobile app stretched to fit.
 *
 * IMPORTANT: if you add a new token here, also expose it in `cssVariables()`
 * so Tailwind can see it, then reference it from `app.css`'s `@theme` block
 * where appropriate.
 */

// ---------------------------------------------------------------------------
// COLORS
// ---------------------------------------------------------------------------

const brand = {
  primary: {
    50:  "#edfff4",
    100: "#d5ffe6",
    200: "#adffd0",
    300: "#6fffab",
    400: "#2bff7e",
    500: "#00e85c",
    600: "#00c94e",
    700: "#009d3d",
    800: "#067a34",
    900: "#08652e",
  },
} as const;

const neutral = {
  // Slate ramp — primary surface/text scale.
  50:  "#f8fafc",
  100: "#f1f5f9",
  200: "#e2e8f0",
  300: "#cbd5e1",
  400: "#94a3b8",
  500: "#64748b",
  600: "#475569",
  700: "#334155",
  800: "#1e293b",
  900: "#0f172a",
  950: "#020617",
} as const;

const semantic = {
  success: "#16a34a",
  warning: "#d97706",
  danger:  "#dc2626",
  info:    "#2563eb",
} as const;

// ---------------------------------------------------------------------------
// TYPOGRAPHY
// ---------------------------------------------------------------------------

const typography = {
  fontFamily: {
    display: '"Nunito", ui-sans-serif, system-ui, sans-serif',
    body:    '"Inter", ui-sans-serif, system-ui, sans-serif',
    mono:    'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  fontSize: {
    // Desktop-tuned type ramp. Line heights included as a second value.
    xs:   ["0.75rem",  "1rem"],      // 12 / 16
    sm:   ["0.875rem", "1.25rem"],   // 14 / 20
    base: ["1rem",     "1.5rem"],    // 16 / 24
    lg:   ["1.125rem", "1.75rem"],   // 18 / 28
    xl:   ["1.25rem",  "1.875rem"],  // 20 / 30
    "2xl":["1.5rem",   "2rem"],      // 24 / 32
    "3xl":["1.875rem", "2.375rem"],  // 30 / 38
    "4xl":["2.25rem",  "2.75rem"],   // 36 / 44
    "5xl":["3rem",     "3.25rem"],   // 48 / 52
  },
  fontWeight: {
    regular:  "400",
    medium:   "500",
    semibold: "600",
    bold:     "700",
    extrabold:"800",
    black:    "900",
  },
  letterSpacing: {
    tight:  "-0.02em",
    normal: "0",
    wide:   "0.02em",
    wider:  "0.05em",
  },
} as const;

// ---------------------------------------------------------------------------
// SPACING — 4px base grid
// ---------------------------------------------------------------------------

const spacing = {
  0:  "0",
  1:  "0.25rem",  // 4
  2:  "0.5rem",   // 8
  3:  "0.75rem",  // 12
  4:  "1rem",     // 16
  5:  "1.25rem",  // 20
  6:  "1.5rem",   // 24
  8:  "2rem",     // 32
  10: "2.5rem",   // 40
  12: "3rem",     // 48
  16: "4rem",     // 64
  20: "5rem",     // 80
  24: "6rem",     // 96
  32: "8rem",     // 128
} as const;

// ---------------------------------------------------------------------------
// RADII
// ---------------------------------------------------------------------------

const radius = {
  none: "0",
  sm:   "0.25rem",  // 4
  md:   "0.5rem",   // 8
  lg:   "0.75rem",  // 12
  xl:   "1rem",     // 16
  "2xl":"1.25rem",  // 20
  full: "9999px",
} as const;

// ---------------------------------------------------------------------------
// SHADOWS — tuned for desktop depth, not mobile card stacks
// ---------------------------------------------------------------------------

const shadow = {
  none:  "none",
  xs:    "0 1px 2px 0 rgb(15 23 42 / 0.04)",
  sm:    "0 1px 3px 0 rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.04)",
  md:    "0 4px 8px -2px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.04)",
  lg:    "0 12px 24px -8px rgb(15 23 42 / 0.12), 0 4px 8px -4px rgb(15 23 42 / 0.06)",
  xl:    "0 24px 48px -16px rgb(15 23 42 / 0.18), 0 8px 16px -8px rgb(15 23 42 / 0.08)",
  focus: "0 0 0 3px rgb(0 201 78 / 0.35)",
} as const;

// ---------------------------------------------------------------------------
// LAYOUT — desktop viewport dimensions
// ---------------------------------------------------------------------------

const layout = {
  /** Minimum supported viewport width — below this the app may look broken. */
  minViewport: "1024px",
  /** Sidebar width in the expanded state. */
  sidebarWidth: "15rem",        // 240
  /** Sidebar width when collapsed (icon-only). */
  sidebarWidthCollapsed: "3.75rem", // 60
  /** Top bar height. */
  topBarHeight: "3.5rem",       // 56
  /** Maximum content width for a page (inside the main area). */
  contentMaxWidth: "84rem",     // 1344
  /** Comfortable reading column width for prose pages. */
  readingMaxWidth: "48rem",     // 768
  /** Gutter between columns on the dashboard grid. */
  gridGutter: "1.5rem",
} as const;

// ---------------------------------------------------------------------------
// BREAKPOINTS — desktop-first; retained for grid utilities.
// ---------------------------------------------------------------------------

const breakpoint = {
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
} as const;

// ---------------------------------------------------------------------------
// Z-INDEX
// ---------------------------------------------------------------------------

const zIndex = {
  base:     "0",
  dropdown: "10",
  sidebar:  "20",
  topBar:   "30",
  modal:    "50",
  toast:    "60",
} as const;

// ---------------------------------------------------------------------------
// MOTION
// ---------------------------------------------------------------------------

const motion = {
  duration: {
    instant: "0ms",
    fast:    "120ms",
    base:    "180ms",
    slow:    "260ms",
  },
  easing: {
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    entrance: "cubic-bezier(0, 0, 0, 1)",
    exit:     "cubic-bezier(0.4, 0, 1, 1)",
  },
} as const;

// ---------------------------------------------------------------------------
// PUBLIC OBJECT
// ---------------------------------------------------------------------------

export const designSystem = {
  color: { brand, neutral, semantic },
  typography,
  spacing,
  radius,
  shadow,
  layout,
  breakpoint,
  zIndex,
  motion,
} as const;

export type DesignSystem = typeof designSystem;

// ---------------------------------------------------------------------------
// CSS VARIABLES — the bridge between TS tokens and Tailwind's @theme / CSS.
// `app.css` imports the emitted values through CSS custom properties. Keep
// this function in sync with new tokens added above.
// ---------------------------------------------------------------------------

/**
 * Flat record of CSS custom-property names → values. Written into :root so
 * `app.css` (and any raw CSS) can reference them. Also consumed by Tailwind
 * inside its `@theme` block so the utility layer stays in lockstep.
 */
export function cssVariables(): Record<string, string> {
  const vars: Record<string, string> = {};

  // Brand
  for (const [k, v] of Object.entries(brand.primary)) {
    vars[`--ds-color-primary-${k}`] = v;
  }
  // Neutral
  for (const [k, v] of Object.entries(neutral)) {
    vars[`--ds-color-neutral-${k}`] = v;
  }
  // Semantic
  for (const [k, v] of Object.entries(semantic)) {
    vars[`--ds-color-${k}`] = v;
  }
  // Typography
  vars["--ds-font-display"] = typography.fontFamily.display;
  vars["--ds-font-body"]    = typography.fontFamily.body;
  vars["--ds-font-mono"]    = typography.fontFamily.mono;
  // Layout
  vars["--ds-sidebar-width"]           = layout.sidebarWidth;
  vars["--ds-sidebar-width-collapsed"] = layout.sidebarWidthCollapsed;
  vars["--ds-topbar-height"]           = layout.topBarHeight;
  vars["--ds-content-max"]             = layout.contentMaxWidth;
  vars["--ds-reading-max"]             = layout.readingMaxWidth;
  vars["--ds-grid-gutter"]             = layout.gridGutter;
  // Shadows
  for (const [k, v] of Object.entries(shadow)) {
    vars[`--ds-shadow-${k}`] = v;
  }
  // Radii
  for (const [k, v] of Object.entries(radius)) {
    vars[`--ds-radius-${k}`] = v;
  }
  // Motion
  for (const [k, v] of Object.entries(motion.duration)) {
    vars[`--ds-duration-${k}`] = v;
  }
  for (const [k, v] of Object.entries(motion.easing)) {
    vars[`--ds-easing-${k}`] = v;
  }

  return vars;
}

/**
 * Convenience helper for components that want to inject the variables into a
 * specific subtree rather than relying on :root (e.g. Storybook, theming
 * experiments). Usage:
 *
 *   <div style={designSystem.inlineStyle()}>…</div>
 */
export function designSystemInlineStyle(): React.CSSProperties {
  return cssVariables() as React.CSSProperties;
}
