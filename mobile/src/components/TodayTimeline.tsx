import { View, Text, StyleSheet } from 'react-native';
import type { EmotionLog } from 'howwefeel-kyle-shared';
import { FAMILY_COLORS } from 'howwefeel-kyle-shared';
import { useTheme } from '../theme';

interface Props {
  logs: EmotionLog[];
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function IntensityDots({ intensity, color }: { intensity: number; color: string }) {
  return (
    <View style={dotStyles.row}>
      {Array.from({ length: 5 }, (_, i) => (
        <View
          key={i}
          style={[
            dotStyles.dot,
            { backgroundColor: i < intensity ? color : 'rgba(255,255,255,0.12)' },
          ]}
        />
      ))}
    </View>
  );
}

const dotStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});

function LogCard({ log }: { log: EmotionLog }) {
  const { colors, typography, spacing, radii } = useTheme();
  const familyColor = FAMILY_COLORS[log.emotionFamily];

  return (
    <View
      style={[
        cardStyles.container,
        {
          backgroundColor: colors.surface,
          borderRadius: radii.md,
          padding: spacing[4],
          marginBottom: spacing[2],
        },
      ]}
    >
      <View style={cardStyles.row}>
        <View style={[cardStyles.familyDot, { backgroundColor: familyColor }]} />
        <View style={cardStyles.content}>
          <Text style={[cardStyles.label, { color: colors.text, fontSize: typography.sizes.md }]}>
            {log.emotionLabel}
          </Text>
          <IntensityDots intensity={log.intensity} color={familyColor} />
        </View>
        <Text style={[cardStyles.time, { color: colors.textTertiary, fontSize: typography.sizes.xs }]}>
          {formatTime(log.loggedAt)}
        </Text>
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  container: {},
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  familyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
    marginRight: 10,
  },
  content: {
    flex: 1,
  },
  label: {
    fontWeight: '600',
  },
  time: {
    marginLeft: 8,
    marginTop: 2,
  },
});

export function TodayTimeline({ logs }: Props) {
  const { colors, typography, spacing } = useTheme();
  const today = new Date().toDateString();
  const todayLogs = logs
    .filter(l => !l.deletedAt && new Date(l.loggedAt).toDateString() === today)
    .sort((a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime());

  if (todayLogs.length === 0) {
    return (
      <View style={[emptyStyles.container, { paddingVertical: spacing[5] }]}>
        <Text style={[emptyStyles.text, { color: colors.textTertiary, fontSize: typography.sizes.sm }]}>
          No logs today yet
        </Text>
      </View>
    );
  }

  return (
    <View>
      {todayLogs.map(log => (
        <LogCard key={log.id} log={log} />
      ))}
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  text: {},
});
