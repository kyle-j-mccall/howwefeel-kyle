import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SettingsStackParamList } from '../navigation/types';
import { useTheme } from '../theme';

type Props = NativeStackScreenProps<SettingsStackParamList, 'Display'>;

const THEMES = [
  { key: 'dark', label: 'Dark', available: true },
  { key: 'light', label: 'Light', available: false },
  { key: 'system', label: 'System', available: true },
] as const;

type ThemeKey = (typeof THEMES)[number]['key'];

export function DisplayScreen({ navigation }: Props) {
  const { colors, typography, spacing, radii } = useTheme();
  const activeTheme: ThemeKey = 'dark';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingHorizontal: spacing[6], paddingTop: spacing[12], paddingBottom: spacing[6] }]}>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes['2xl'] }]}>
          Display
        </Text>
      </View>

      <View style={[styles.group, { paddingHorizontal: spacing[6] }]}>
        <Text style={[styles.sectionLabel, { color: colors.textTertiary, fontSize: typography.sizes.xs, marginBottom: spacing[2] }]}>
          THEME
        </Text>
        {THEMES.map((theme, index) => (
          <Pressable
            key={theme.key}
            accessibilityRole="radio"
            accessibilityLabel={theme.label}
            accessibilityState={{ selected: theme.key === activeTheme, disabled: !theme.available }}
            disabled={!theme.available}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: pressed && theme.available ? colors.surfaceElevated : colors.surface,
                borderRadius: index === 0 ? radii.md : index === THEMES.length - 1 ? radii.md : 0,
                paddingHorizontal: spacing[4],
                paddingVertical: spacing[4],
                borderBottomWidth: index < THEMES.length - 1 ? StyleSheet.hairlineWidth : 0,
                borderBottomColor: colors.border,
                opacity: theme.available ? 1 : 0.5,
                minHeight: 44,
              },
            ]}
          >
            <View style={styles.rowLeft}>
              <Text style={[styles.rowLabel, { color: colors.text, fontSize: typography.sizes.md }]}>
                {theme.label}
              </Text>
              {!theme.available && (
                <Text style={[styles.comingSoon, { color: colors.textTertiary, fontSize: typography.sizes.sm }]}>
                  Coming soon
                </Text>
              )}
            </View>
            {theme.key === activeTheme && (
              <Text style={[styles.check, { color: colors.primary, fontSize: typography.sizes.md }]}>✓</Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {},
  title: { fontWeight: '700' },
  group: {},
  sectionLabel: {
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLeft: { flex: 1 },
  rowLabel: { fontWeight: '500' },
  comingSoon: { marginTop: 2 },
  check: { fontWeight: '600' },
});
