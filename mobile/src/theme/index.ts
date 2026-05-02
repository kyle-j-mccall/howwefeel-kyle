import { colors } from './colors';
import { typography } from './typography';
import { spacing, radii } from './spacing';
import { shadows } from './shadows';

const theme = { colors, typography, spacing, radii, shadows } as const;

export type Theme = typeof theme;

export function useTheme(): Theme {
  return theme;
}

export { colors, typography, spacing, radii, shadows };
export type { Colors } from './colors';
export type { Typography } from './typography';
export type { Spacing, Radii } from './spacing';
export type { Shadows } from './shadows';
