import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { EmotionLog, EmotionFamily } from 'howwefeel-kyle-shared';
import { FAMILY_COLORS } from 'howwefeel-kyle-shared';
import { useTheme } from '../theme';

interface Props {
  logs: EmotionLog[];
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function getDominantFamily(dayLogs: EmotionLog[]): EmotionFamily | null {
  if (dayLogs.length === 0) return null;
  const counts: Partial<Record<EmotionFamily, number>> = {};
  for (const log of dayLogs) {
    counts[log.emotionFamily] = (counts[log.emotionFamily] ?? 0) + 1;
  }
  let dominant: EmotionFamily = dayLogs[0].emotionFamily;
  let max = 0;
  for (const [family, count] of Object.entries(counts) as [EmotionFamily, number][]) {
    if (count > max) {
      max = count;
      dominant = family;
    }
  }
  return dominant;
}

export function CalendarHeatmap({ logs }: Props) {
  const { colors, typography, spacing, radii } = useTheme();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const logsByDay = new Map<string, EmotionLog[]>();
  for (const log of logs) {
    const dateKey = log.loggedAt.slice(0, 10);
    const d = new Date(dateKey + 'T00:00:00.000Z');
    if (d.getUTCFullYear() === year && d.getUTCMonth() === month) {
      const existing = logsByDay.get(dateKey) ?? [];
      existing.push(log);
      logsByDay.set(dateKey, existing);
    }
  }

  const prefixCells: null[] = Array(firstDayOfWeek).fill(null);
  const dayCells: number[] = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const allCells: (number | null)[] = [...prefixCells, ...dayCells];
  while (allCells.length % 7 !== 0) allCells.push(null);

  const CELL_SIZE = 36;
  const CELL_MARGIN = 3;

  return (
    <View>
      <View style={styles.headerRow}>
        {DAY_LABELS.map((label, i) => (
          <Text
            key={i}
            style={[
              styles.dayLabel,
              {
                width: CELL_SIZE + CELL_MARGIN * 2,
                color: colors.textTertiary,
                fontSize: typography.sizes.xs,
                textAlign: 'center',
              },
            ]}
          >
            {label}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {allCells.map((day, i) => {
          if (day === null) {
            return (
              <View
                key={`empty-${i}`}
                style={{ width: CELL_SIZE, height: CELL_SIZE, margin: CELL_MARGIN }}
              />
            );
          }
          const dateKey = `${year}-${pad(month + 1)}-${pad(day)}`;
          const dayLogs = logsByDay.get(dateKey) ?? [];
          const dominant = getDominantFamily(dayLogs);
          const isToday = day === today;
          const isSelected = selectedDay === day;
          const cellBg = dominant ? FAMILY_COLORS[dominant] : colors.surfaceElevated;

          return (
            <Pressable
              key={dateKey}
              onPress={() => setSelectedDay(isSelected ? null : day)}
              style={[
                styles.cell,
                {
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  margin: CELL_MARGIN,
                  backgroundColor: cellBg,
                  borderRadius: radii.sm,
                  borderWidth: isToday ? 2 : isSelected ? 1.5 : 0,
                  borderColor: isToday ? colors.primary : colors.text,
                  opacity: dominant ? 1 : 0.35,
                },
              ]}
            >
              <Text
                style={[
                  styles.dayNumber,
                  {
                    color: dominant ? colors.textOnPrimary : colors.textTertiary,
                    fontSize: typography.sizes.xs,
                    fontWeight: isToday ? typography.weights.bold : typography.weights.regular,
                  },
                ]}
              >
                {day}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {selectedDay !== null && (() => {
        const dateKey = `${year}-${pad(month + 1)}-${pad(selectedDay)}`;
        const dayLogs = logsByDay.get(dateKey) ?? [];
        const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'long' });
        return (
          <View
            style={[
              styles.popover,
              {
                backgroundColor: colors.surfaceElevated,
                borderRadius: radii.md,
                padding: spacing[4],
                marginTop: spacing[3],
              },
            ]}
          >
            <Text
              style={[
                styles.popoverDate,
                { color: colors.textSecondary, fontSize: typography.sizes.sm, marginBottom: spacing[2] },
              ]}
            >
              {`${monthName} ${selectedDay}, ${year}`}
            </Text>
            {dayLogs.length === 0 ? (
              <Text style={{ color: colors.textTertiary, fontSize: typography.sizes.sm }}>
                No logs recorded
              </Text>
            ) : (
              dayLogs.map((log) => (
                <View key={log.id} style={[styles.popoverRow, { marginBottom: spacing[2] }]}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: FAMILY_COLORS[log.emotionFamily], marginRight: spacing[2] },
                    ]}
                  />
                  <View style={styles.popoverText}>
                    <Text style={{ color: colors.text, fontSize: typography.sizes.sm, fontWeight: typography.weights.medium }}>
                      {log.emotionLabel}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}>
                      {`Intensity ${log.intensity}${log.contextTags.length > 0 ? '  ·  ' + log.contextTags.join(', ') : ''}`}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayLabel: {
    textAlign: 'center',
    fontWeight: '500',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: {
    textAlign: 'center',
  },
  popover: {},
  popoverDate: {},
  popoverRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 3,
  },
  popoverText: {
    flex: 1,
  },
});
