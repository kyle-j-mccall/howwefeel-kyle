import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import type { EmotionLog } from 'howwefeel-kyle-shared';
import { CONTEXT_TAGS } from 'howwefeel-kyle-shared';
import { useTheme } from '../theme';

interface Props {
  logs: EmotionLog[];
}

interface TagCount {
  tag: string;
  count: number;
}

export function TopContextsList({ logs }: Props) {
  const { colors, typography, spacing, radii } = useTheme();

  const counts: Partial<Record<string, number>> = {};
  for (const tag of CONTEXT_TAGS) {
    counts[tag] = 0;
  }
  for (const log of logs) {
    for (const tag of log.contextTags) {
      counts[tag] = (counts[tag] ?? 0) + 1;
    }
  }

  const ranked: TagCount[] = Object.entries(counts)
    .filter(([, c]) => (c ?? 0) > 0)
    .map(([tag, count]) => ({ tag, count: count ?? 0 }))
    .sort((a, b) => b.count - a.count);

  if (ranked.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={{ color: colors.textTertiary, fontSize: typography.sizes.sm }}>
          No context tags logged
        </Text>
      </View>
    );
  }

  const maxCount = ranked[0].count;
  const BAR_W = 80;

  return (
    <View>
      {ranked.map(({ tag, count }, i) => {
        const barW = Math.max((count / maxCount) * BAR_W, 4);
        return (
          <View
            key={tag}
            style={[
              styles.row,
              {
                backgroundColor: i % 2 === 0 ? colors.surface : colors.transparent,
                borderRadius: radii.sm,
                paddingVertical: spacing[2],
                paddingHorizontal: spacing[3],
                marginBottom: 2,
              },
            ]}
          >
            <Text
              style={[
                styles.tagLabel,
                { color: colors.text, fontSize: typography.sizes.sm, fontWeight: typography.weights.medium, width: 96 },
              ]}
            >
              {tag}
            </Text>
            <View style={styles.barArea}>
              <Svg width={BAR_W} height={16}>
                <Rect x={0} y={4} width={barW} height={8} fill={colors.primary} rx={3} />
              </Svg>
            </View>
            <Text
              style={[
                styles.count,
                { color: colors.textSecondary, fontSize: typography.sizes.sm, width: 24, textAlign: 'right' },
              ]}
            >
              {String(count)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagLabel: {},
  barArea: {
    flex: 1,
  },
  count: {},
});
