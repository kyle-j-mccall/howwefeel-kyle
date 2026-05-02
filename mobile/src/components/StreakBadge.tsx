import { View, Text, StyleSheet } from 'react-native';
import type { EmotionLog } from 'howwefeel-kyle-shared';
import { useTheme } from '../theme';

interface Props {
  logs: EmotionLog[];
}

function calculateStreak(logs: EmotionLog[]): number {
  const activeLogs = logs.filter(l => !l.deletedAt);
  const daySet = new Set(activeLogs.map(l => new Date(l.loggedAt).toDateString()));

  let streak = 0;
  const cursor = new Date();
  while (daySet.has(cursor.toDateString())) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function StreakBadge({ logs }: Props) {
  const { colors, typography, spacing, radii } = useTheme();
  const streak = calculateStreak(logs);

  if (streak === 0) return null;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderRadius: radii.lg,
          paddingHorizontal: spacing[4],
          paddingVertical: spacing[3],
        },
      ]}
    >
      <Text style={[styles.count, { color: colors.warning, fontSize: typography.sizes['2xl'] }]}>
        {streak}
      </Text>
      <Text style={[styles.label, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
        day streak
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  count: {
    fontWeight: '700',
    textAlign: 'center',
  },
  label: {
    marginTop: 1,
    textAlign: 'center',
  },
});
