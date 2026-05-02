import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Polyline, Line, Text as SvgText, Circle, G } from 'react-native-svg';
import type { EmotionLog, EmotionFamily } from 'howwefeel-kyle-shared';
import { EMOTION_FAMILIES, FAMILY_COLORS } from 'howwefeel-kyle-shared';
import { useTheme } from '../theme';

interface Props {
  logs: EmotionLog[];
  rangeDays: number;
}

const PAD = { top: 8, bottom: 28, left: 28, right: 12 };
const CHART_H = 160;
const MIN_I = 1;
const MAX_I = 5;

function toDateKey(isoStr: string): string {
  return isoStr.slice(0, 10);
}

function buildDailyAvgByFamily(
  logs: EmotionLog[],
  sortedDates: string[],
): Map<EmotionFamily, Map<string, number>> {
  const sums: Map<EmotionFamily, Map<string, number>> = new Map();
  const cnts: Map<EmotionFamily, Map<string, number>> = new Map();

  for (const family of EMOTION_FAMILIES) {
    sums.set(family, new Map());
    cnts.set(family, new Map());
  }

  for (const log of logs) {
    const dk = toDateKey(log.loggedAt);
    if (!sortedDates.includes(dk)) continue;
    const s = sums.get(log.emotionFamily)!;
    const c = cnts.get(log.emotionFamily)!;
    s.set(dk, (s.get(dk) ?? 0) + log.intensity);
    c.set(dk, (c.get(dk) ?? 0) + 1);
  }

  const result: Map<EmotionFamily, Map<string, number>> = new Map();
  for (const family of EMOTION_FAMILIES) {
    const avg: Map<string, number> = new Map();
    const s = sums.get(family)!;
    const c = cnts.get(family)!;
    for (const dk of sortedDates) {
      const cnt = c.get(dk) ?? 0;
      if (cnt > 0) {
        avg.set(dk, (s.get(dk) ?? 0) / cnt);
      }
    }
    result.set(family, avg);
  }
  return result;
}

export function IntensityTrendChart({ logs, rangeDays }: Props) {
  const { colors, typography } = useTheme();
  const screenW = Dimensions.get('window').width;
  const chartW = screenW - 48;
  const plotW = chartW - PAD.left - PAD.right;
  const plotH = CHART_H - PAD.top - PAD.bottom;

  const dateSet = new Set<string>();
  for (const log of logs) {
    dateSet.add(toDateKey(log.loggedAt));
  }
  const sortedDates = Array.from(dateSet).sort();

  if (sortedDates.length === 0) {
    return (
      <View style={[styles.container, { height: CHART_H, alignItems: 'center', justifyContent: 'center' }]}>
        <SvgText fill={colors.textTertiary} fontSize={typography.sizes.sm}>
          No data for this range
        </SvgText>
      </View>
    );
  }

  const avgByFamily = buildDailyAvgByFamily(logs, sortedDates);
  const n = sortedDates.length;

  const xScale = (i: number) =>
    PAD.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);

  const yScale = (v: number) =>
    PAD.top + plotH - ((v - MIN_I) / (MAX_I - MIN_I)) * plotH;

  const yAxisVals = [1, 2, 3, 4, 5];

  return (
    <View style={styles.container}>
      <Svg width={chartW} height={CHART_H}>
        {yAxisVals.map((v) => {
          const y = yScale(v);
          return (
            <Line
              key={`grid-${v}`}
              x1={PAD.left}
              y1={y}
              x2={chartW - PAD.right}
              y2={y}
              stroke={colors.borderSubtle}
              strokeWidth={1}
            />
          );
        })}
        {yAxisVals.map((v) => (
          <SvgText
            key={`label-${v}`}
            x={PAD.left - 4}
            y={yScale(v) + 4}
            fill={colors.textTertiary}
            fontSize={typography.sizes.xs}
            textAnchor="end"
          >
            {String(v)}
          </SvgText>
        ))}
        {EMOTION_FAMILIES.map((family) => {
          const avg = avgByFamily.get(family)!;
          const points: string[] = [];
          sortedDates.forEach((dk, i) => {
            const v = avg.get(dk);
            if (v !== undefined) {
              points.push(`${xScale(i)},${yScale(v)}`);
            }
          });

          if (points.length === 0) return null;

          const dotPoints: { x: number; y: number }[] = [];
          sortedDates.forEach((dk, i) => {
            const v = avg.get(dk);
            if (v !== undefined) {
              dotPoints.push({ x: xScale(i), y: yScale(v) });
            }
          });

          return (
            <G key={family}>
              <Polyline
                points={points.join(' ')}
                fill="none"
                stroke={FAMILY_COLORS[family]}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {dotPoints.map((pt, j) => (
                <Circle
                  key={j}
                  cx={pt.x}
                  cy={pt.y}
                  r={3}
                  fill={FAMILY_COLORS[family]}
                />
              ))}
            </G>
          );
        })}
        {n > 1 && (
          <>
            <SvgText
              x={PAD.left}
              y={CHART_H - 4}
              fill={colors.textTertiary}
              fontSize={typography.sizes.xs}
            >
              {sortedDates[0]}
            </SvgText>
            <SvgText
              x={chartW - PAD.right}
              y={CHART_H - 4}
              fill={colors.textTertiary}
              fontSize={typography.sizes.xs}
              textAnchor="end"
            >
              {sortedDates[n - 1]}
            </SvgText>
          </>
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
});
