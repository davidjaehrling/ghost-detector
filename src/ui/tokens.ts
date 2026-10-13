// Design tokens, transcribed from docs/instrument-bible.md section 9.
// Type sizes come from section 5 (scale at 390 px width).

export const color = {
  p0: '#0F2416',
  p1: '#1C4A2A',
  p2: '#2F7A45',
  p3: '#4FB46A',
  p4: '#7CE895',
  p5: '#D4FFDC',
  n0: '#0A0F0B',
  n1: '#121712',
  n2: '#1E221C',
  n3: '#2E3229',
  n4: '#4A4D42',
  n5: '#8A8B7C',
  n6: '#C9C7B6',
  paper: '#E8E2C8',
  ink: '#23211A',
  red: '#FF4A3A',
} as const;

export const font = {
  readout: 'VT323_400Regular',
  label: 'B612Mono_400Regular',
  labelBold: 'B612Mono_700Bold',
} as const;

export const type = {
  rdXL: { fontFamily: font.readout, fontSize: 72, lineHeight: 64, letterSpacing: 0 },
  rdL: { fontFamily: font.readout, fontSize: 48, lineHeight: 44, letterSpacing: 0 },
  rdM: { fontFamily: font.readout, fontSize: 28, lineHeight: 28, letterSpacing: 0 },
  rdS: { fontFamily: font.readout, fontSize: 20, lineHeight: 22, letterSpacing: 0.5 },
  rdXS: { fontFamily: font.readout, fontSize: 16, lineHeight: 18, letterSpacing: 0.5 },
  lbM: { fontFamily: font.labelBold, fontSize: 13, lineHeight: 16, letterSpacing: 0.6 },
  lbS: { fontFamily: font.label, fontSize: 11, lineHeight: 14, letterSpacing: 0.8 },
  lbXS: { fontFamily: font.label, fontSize: 10, lineHeight: 12, letterSpacing: 1.0 },
  body: { fontFamily: font.label, fontSize: 14, lineHeight: 21, letterSpacing: 0 },
} as const;

export const space = {
  gutter: 16,
  unit: 4,
  div: 34,
} as const;

export const radius = {
  window: 18,
  key: 6,
  plate: 2,
} as const;

export const size = {
  led: 12,
  ledPitch: 22,
  screw: 10,
  keyH: 44,
} as const;

export const motion = {
  easeOut: [0.2, 0, 0, 1],
  easeIn: [0.4, 0, 1, 1],
  cut: { collapse: 80, black: 40, decay: 120 },
  press: { down: 60, up: 90 },
  warmup: 900,
  hold: 1200,
} as const;

export const needle = {
  reveal: { mass: 1, stiffness: 121, damping: 9.9 },
  live: { mass: 1, stiffness: 64, damping: 11.2 },
  jitter: 0.006,
} as const;

export const fx = {
  tauTrace: 180,
  tauSweep: 450,
  burnIn: 0.03,
  grain: 0.04,
  scanline: 0.06,
  vignette: 0.18,
  barrel: 0.015,
} as const;

// Lower bounds of the SPI tiers.
export const tier = {
  quiet: 0,
  trace: 20,
  active: 45,
  strong: 70,
  critical: 90,
} as const;

export type Tier = keyof typeof tier;

export function tierFor(spi: number): Tier {
  if (spi >= tier.critical) return 'critical';
  if (spi >= tier.strong) return 'strong';
  if (spi >= tier.active) return 'active';
  if (spi >= tier.trace) return 'trace';
  return 'quiet';
}
