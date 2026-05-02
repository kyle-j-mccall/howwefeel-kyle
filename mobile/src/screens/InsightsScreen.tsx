import { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { EmotionLog } from 'howwefeel-kyle-shared';
import { useLogStore } from '../store/logStore';
import { useTheme } from '../theme';
import { TimeRangeSelector } from '../components/TimeRangeSelector';
import { CalendarHeatmap } from '../components/CalendarHeatmap';
import { EmotionFrequencyChart } from '../components/EmotionFrequencyChart';
import { IntensityTrendChart } from '../components/IntensityTrendChart';
import { TopContextsList } from '../components/TopContextsList';
import type { TimeRange } from '../components/TimeRangeSelector';

const RANGE_DAYS: Record<TimeRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: Infinity,
};

function filterByRange(logs: EmotionLog[], range: TimeRange): EmotionLog[] {
  if (range === 'all') return logs;
  const days = RANGE_DAYS[range];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return logs.filter((log) => new Date(log.loggedAt).getTime() >= cutoff);
}

export function InsightsScreen() {
  const { colors, typography, spacing } = useTheme();
  const logs = useLogStore((s) => s.logs);
  const [range, setRange] = useState<TimeRange>('30d');

  const filteredLogs = useMemo(() => filterByRange(logs, range), [logs, range]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingHorizontal: spacing[6] }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.screenTitle, { color: colors.text, fontSize: typography.sizes['2xl'], marginBottom: spacing[4] }]}>
          Insights
        </Text>

        <TimeRangeSelector value={range} onChange={setRange} />

        <View style={[styles.section, { marginTop: spacing[6] }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: typography.sizes.sm, marginBottom: spacing[3] }]}>
            THIS MONTH
          </Text>
          <CalendarHeatmap logs={logs} />
        </View>

        <View style={[styles.section, { marginTop: spacing[6] }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: typography.sizes.sm, marginBottom: spacing[3] }]}>
            EMOTION FREQUENCY
          </Text>
          <EmotionFrequencyChart logs={filteredLogs} />
        </View>

        <View style={[styles.section, { marginTop: spacing[6] }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: typography.sizes.sm, marginBottom: spacing[3] }]}>
            INTENSITY OVER TIME
          </Text>
          <IntensityTrendChart logs={filteredLogs} rangeDays={RANGE_DAYS[range]} />
        </View>

        <View style={[styles.section, { marginTop: spacing[6], marginBottom: spacing[8] }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: typography.sizes.sm, marginBottom: spacing[3] }]}>
            TOP CONTEXTS
          </Text>
          <TopContextsList logs={filteredLogs} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingTop: 16,
  },
  screenTitle: {
    fontWeight: '700',
  },
  section: {},
  sectionTitle: {
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
