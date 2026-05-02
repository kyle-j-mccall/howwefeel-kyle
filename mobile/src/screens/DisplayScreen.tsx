import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SettingsStackParamList } from '../navigation/types';
import { useTheme } from '../theme';

type Props = NativeStackScreenProps<SettingsStackParamList, 'Display'>;

export function DisplayScreen(_props: Props) {
  const { colors, typography, spacing, radii } = useTheme();

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
        <View
          style={[
            styles.row,
            {
              backgroundColor: colors.surface,
              borderRadius: radii.md,
              paddingHorizontal: spacing[4],
              paddingVertical: spacing[4],
              minHeight: 44,
            },
          ]}
        >
          <View style={styles.rowLeft}>
            <Text style={[styles.rowLabel, { color: colors.text, fontSize: typography.sizes.md }]}>
              Dark
            </Text>
            <Text style={[styles.comingSoon, { color: colors.textTertiary, fontSize: typography.sizes.sm, marginTop: spacing[1] }]}>
              Light mode and system theme are coming in a future release.
            </Text>
          </View>
        </View>
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
  comingSoon: {},
});
