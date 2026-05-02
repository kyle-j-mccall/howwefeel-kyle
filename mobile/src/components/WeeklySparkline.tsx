import { View, StyleSheet } from 'react-native';
import type { EmotionLog, EmotionFamily } from 'howwefeel-kyle-shared';
import { FAMILY_COLORS } from 'howwefeel-kyle-shared';
import { useTheme } from '../theme';

interface Props {
  logs: EmotionLog[];
}

function dominantFamily(dayLogs: EmotionLog[]): EmotionFamily | null {
  if (dayLogs.length === 0) return null;
  const counts: Partial<Record<EmotionFamily, number>> = {};
  for (const log of dayLogs) {
    counts[log.emotionFamily] = (counts[log.emotionFamily] ?? 0) + 1;
  }
  return (Object.entries(counts) as [EmotionFamily, number][])
    .sort((a, b) => b[1] - a[1])[0][0];
}

export function WeeklySparkline({ logs }: Props) {
  const { colors, radii } = useTheme();
  const activeLogs = logs.filter(l => !l.deletedAt);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toDateString();
  });

  return (
    <View style={styles.container}>
      {days.map((day, i) => {
        const dayLogs = activeLogs.filter(l => new Date(l.loggedAt).toDateString() === day);
        const family = dominantFamily(dayLogs);
        const barColor = family ? FAMILY_COLORS[family] : colors.borderSubtle;

        return (
          <View
            key={i}
            style={[
              styles.bar,
              {
                backgroundColor: barColor,
                borderRadius: radii.sm,
                opacity: family ? 1 : 0.35,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: 40,
    gap: 4,
    alignItems: 'flex-end',
  },
  bar: {
    flex: 1,
    height: '100%',
  },
});
