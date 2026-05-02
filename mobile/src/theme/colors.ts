import { FAMILY_COLORS } from 'howwefeel-kyle-shared';

export const colors = {
  background: '#0F0F14',
  surface: '#1A1A22',
  surfaceElevated: '#22222E',
  border: '#2E2E3E',
  borderSubtle: '#1E1E28',

  text: '#F5F5F7',
  textSecondary: '#9999AA',
  textTertiary: '#5C5C6E',
  textInverse: '#0F0F14',

  primary: '#7B6BFF',
  primaryMuted: 'rgba(123,107,255,0.15)',

  success: '#52B788',
  error: '#E05252',
  warning: '#F7C948',

  tabBar: '#131319',
  tabBarBorder: '#1E1E28',

  emotionYellow: FAMILY_COLORS.yellow,
  emotionRed: FAMILY_COLORS.red,
  emotionGreen: FAMILY_COLORS.green,
  emotionBlue: FAMILY_COLORS.blue,

  transparent: 'transparent',
  overlay: 'rgba(0,0,0,0.6)',
} as const;

export type Colors = typeof colors;
