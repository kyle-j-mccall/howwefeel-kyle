import { View, Text, Pressable, Switch, Alert, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SettingsStackParamList } from '../navigation/types';
import { useTheme } from '../theme';

type Props = NativeStackScreenProps<SettingsStackParamList, 'Data'>;

export function DataScreen({ navigation }: Props) {
  const { colors, typography, spacing, radii } = useTheme();

  const handleExport = () => {
    Alert.alert('Export Data', 'Not available in mock mode.');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingHorizontal: spacing[6], paddingTop: spacing[12], paddingBottom: spacing[6] }]}>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes['2xl'] }]}>
          Data
        </Text>
      </View>

      <View style={[styles.group, { paddingHorizontal: spacing[6] }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Export Data"
          onPress={handleExport}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: pressed ? colors.surfaceElevated : colors.surface,
              borderRadius: radii.md,
              paddingHorizontal: spacing[4],
              paddingVertical: spacing[4],
              marginBottom: spacing[3],
            },
          ]}
        >
          <Text style={[styles.rowLabel, { color: colors.text, fontSize: typography.sizes.md }]}>
            Export Data
          </Text>
        </Pressable>

        <View
          style={[
            styles.row,
            {
              backgroundColor: colors.surface,
              borderRadius: radii.md,
              paddingHorizontal: spacing[4],
              paddingVertical: spacing[4],
            },
          ]}
        >
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, { color: colors.text, fontSize: typography.sizes.md }]}>
              Cloud Sync
            </Text>
            <Text style={[styles.rowSub, { color: colors.textTertiary, fontSize: typography.sizes.sm }]}>
              Sign in to enable
            </Text>
          </View>
          <Switch
            value={false}
            disabled
            accessibilityLabel="Cloud Sync toggle"
          />
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  rowText: { flex: 1 },
  rowLabel: { fontWeight: '500' },
  rowSub: { marginTop: 2 },
});
