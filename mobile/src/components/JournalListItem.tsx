import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { EmotionLog } from 'howwefeel-kyle-shared';
import { FAMILY_COLORS } from 'howwefeel-kyle-shared';
import { useTheme } from '../theme';

interface Props {
  log: EmotionLog;
  onPress: () => void;
}

export function JournalListItem({ log, onPress }: Props) {
  const { colors, typography, spacing, radii } = useTheme();
  const familyColor = FAMILY_COLORS[log.emotionFamily];
  const date = new Date(log.loggedAt);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: pressed ? colors.surfaceElevated : colors.surface,
          borderRadius: radii.lg,
          marginHorizontal: spacing[4],
          marginBottom: spacing[3],
          padding: spacing[4],
        },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: familyColor, borderRadius: radii.full }]} />
        <Text
          style={[
            styles.label,
            { color: colors.text, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
          ]}
        >
          {log.emotionLabel}
        </Text>
        <Text style={[styles.date, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
          {dateStr}
        </Text>
      </View>
      <Text
        style={[styles.note, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}
        numberOfLines={2}
      >
        {log.journalNote}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  dot: {
    width: 10,
    height: 10,
    marginRight: 8,
  },
  label: {
    flex: 1,
  },
  date: {},
  note: {
    lineHeight: 20,
  },
});
