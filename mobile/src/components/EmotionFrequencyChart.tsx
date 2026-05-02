import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Rect, Text as SvgText, G } from 'react-native-svg';
import type { EmotionLog, EmotionFamily } from 'howwefeel-kyle-shared';
import { EMOTION_FAMILIES, FAMILY_COLORS } from 'howwefeel-kyle-shared';
import { useTheme } from '../theme';

interface Props {
  logs: EmotionLog[];
}

const LABEL_WIDTH = 52;
const COUNT_MARGIN = 8;
const BAR_HEIGHT = 26;
const BAR_GAP = 10;
const PAD_TOP = 4;
const PAD_BOTTOM = 4;
const CHART_H = EMOTION_FAMILIES.length * (BAR_HEIGHT + BAR_GAP) - BAR_GAP + PAD_TOP + PAD_BOTTOM;

export function EmotionFrequencyChart({ logs }: Props) {
  const { colors, typography } = useTheme();
  const screenW = Dimensions.get('window').width;
  const chartW = screenW - 48;
  const barAreaW = chartW - LABEL_WIDTH - COUNT_MARGIN - 20;

  const counts: Record<EmotionFamily, number> = { yellow: 0, red: 0, green: 0, blue: 0 };
  for (const log of logs) {
    counts[log.emotionFamily]++;
  }
  const maxCount = Math.max(...(Object.values(counts) as number[]), 1);

  const familyLabel: Record<EmotionFamily, string> = {
    yellow: 'Yellow',
    red: 'Red',
    green: 'Green',
    blue: 'Blue',
  };

  return (
    <View style={styles.container}>
      <Svg width={chartW} height={CHART_H}>
        {EMOTION_FAMILIES.map((family, i) => {
          const y = PAD_TOP + i * (BAR_HEIGHT + BAR_GAP);
          const barW = Math.max((counts[family] / maxCount) * barAreaW, counts[family] > 0 ? 4 : 0);
          const barX = LABEL_WIDTH;

          return (
            <G key={family}>
              <SvgText
                x={LABEL_WIDTH - 8}
                y={y + BAR_HEIGHT / 2 + 4}
                fill={colors.textSecondary}
                fontSize={typography.sizes.xs}
                textAnchor="end"
                fontWeight="500"
              >
                {familyLabel[family]}
              </SvgText>
              {barW > 0 && (
                <Rect
                  x={barX}
                  y={y}
                  width={barW}
                  height={BAR_HEIGHT}
                  fill={FAMILY_COLORS[family]}
                  rx={4}
                />
              )}
              {barW === 0 && (
                <Rect
                  x={barX}
                  y={y + BAR_HEIGHT / 2 - 1}
                  width={chartW - LABEL_WIDTH - 32}
                  height={2}
                  fill={colors.border}
                  rx={1}
                />
              )}
              <SvgText
                x={barX + barW + COUNT_MARGIN}
                y={y + BAR_HEIGHT / 2 + 4}
                fill={counts[family] > 0 ? colors.textSecondary : colors.textTertiary}
                fontSize={typography.sizes.xs}
              >
                {String(counts[family])}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
});
