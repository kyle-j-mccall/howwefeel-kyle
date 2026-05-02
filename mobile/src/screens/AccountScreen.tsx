import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SettingsStackParamList } from '../navigation/types';
import { useTheme } from '../theme';

type Props = NativeStackScreenProps<SettingsStackParamList, 'Account'>;

const MOCK_USER_NAME = 'Guest';

export function AccountScreen({ navigation }: Props) {
  const { colors, typography, spacing, radii } = useTheme();

  const handleDeleteAccount = () => {
    Alert.alert('Delete Account', 'Not available in mock mode.');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingHorizontal: spacing[6], paddingTop: spacing[12], paddingBottom: spacing[6] }]}>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes['2xl'] }]}>
          Account
        </Text>
      </View>

      <View style={[styles.group, { paddingHorizontal: spacing[6] }]}>
        <View
          style={[
            styles.profileRow,
            {
              backgroundColor: colors.surface,
              borderRadius: radii.md,
              paddingHorizontal: spacing[4],
              paddingVertical: spacing[4],
              marginBottom: spacing[3],
            },
          ]}
        >
          <Text style={[styles.profileLabel, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
            Name
          </Text>
          <Text style={[styles.profileValue, { color: colors.text, fontSize: typography.sizes.md }]}>
            {MOCK_USER_NAME}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign In"
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: pressed ? colors.surfaceElevated : colors.surface,
              borderRadius: radii.md,
              paddingHorizontal: spacing[4],
              paddingVertical: spacing[4],
              marginBottom: spacing[3],
              opacity: 0.5,
            },
          ]}
        >
          <Text style={[styles.rowLabel, { color: colors.text, fontSize: typography.sizes.md }]}>
            Sign In
          </Text>
          <Text style={{ color: colors.textTertiary, fontSize: typography.sizes.md }}>›</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete Account"
          onPress={handleDeleteAccount}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: pressed ? colors.surfaceElevated : colors.surface,
              borderRadius: radii.md,
              paddingHorizontal: spacing[4],
              paddingVertical: spacing[4],
            },
          ]}
        >
          <Text style={[styles.rowLabel, { color: colors.error, fontSize: typography.sizes.md }]}>
            Delete Account
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {},
  title: { fontWeight: '700' },
  group: {},
  profileRow: {},
  profileLabel: { marginBottom: 2 },
  profileValue: { fontWeight: '500' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  rowLabel: { fontWeight: '500' },
});
