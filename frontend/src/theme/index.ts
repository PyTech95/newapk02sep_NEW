// NekSathi design tokens — dark neon glassmorphic "safety-tech" brand.
// Mirrors the live website palette + design_guidelines.json.

export const colors = {
  // surfaces
  bg: "#06060f",
  surface: "#0d0d1a",
  surfaceElevated: "#13131f",
  surfaceTertiary: "#1a1a2e",
  // text
  text: "#ffffff",
  textMuted: "#d9c9ff",
  textDim: "#8a8aa8",
  // pillar accents
  cyan: "#22d3ee", // personal safety / brand primary
  purple: "#8b5cf6", // family
  purpleDeep: "#7c3aed",
  red: "#ff3b5c", // SOS / anti-theft
  teal: "#2dd4bf", // smart QR
  green: "#34d399", // success
  amber: "#fbbf24", // warning
  // lines
  border: "#2a2a40",
  borderCyan: "rgba(34,211,238,0.4)",
  borderPurple: "rgba(139,92,246,0.4)",
  borderRed: "rgba(255,59,92,0.4)",
  borderTeal: "rgba(45,212,191,0.4)",
  borderGreen: "rgba(52,211,153,0.4)",
  borderAmber: "rgba(251,191,36,0.4)",
  glass: "rgba(19,19,31,0.72)",
} as const;

// translucent tint helpers for chips / icon bubbles
export const tint = {
  cyan: "rgba(34,211,238,0.14)",
  purple: "rgba(139,92,246,0.16)",
  red: "rgba(255,59,92,0.14)",
  teal: "rgba(45,212,191,0.14)",
  green: "rgba(52,211,153,0.16)",
  amber: "rgba(251,191,36,0.16)",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const fonts = {
  display: "ChakraPetch-Bold",
  displaySemi: "ChakraPetch-SemiBold",
  displayMedium: "ChakraPetch-Medium",
  body: "Outfit",
} as const;

export const fontSize = {
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  huge: 34,
} as const;

export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  glowRed: {
    shadowColor: colors.red,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 16,
  },
} as const;
