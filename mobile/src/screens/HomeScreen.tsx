import { useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme';
import { useLogStore } from '../store/logStore';
import { TodayTimeline } from '../components/TodayTimeline';
import { StreakBadge } from '../components/StreakBadge';
import { WeeklySparkline } from '../components/WeeklySparkline';
import { JournalQuickAccess } from '../components/JournalQuickAccess';
import { LogFAB } from '../components/LogFAB';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function HomeScreen() {
  const { colors, typography, spacing } = useTheme();
  const navigation = useNavigation<Nav>();
  const { logs, pendingActivitySuggestion, clearActivitySuggestion } = useLogStore();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (pendingActivitySuggestion) {
      clearActivitySuggestion();
      navigation.navigate('ActivityLibrary', { fromPostLog: true });
    }
  }, [pendingActivitySuggestion]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + spacing[5],
            paddingBottom: 100,
            paddingHorizontal: spacing[5],
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Text
            style={[styles.greeting, { color: colors.text, fontSize: typography.sizes['2xl'] }]}
          >
            How are you feeling?
          </Text>
          <StreakBadge logs={logs} />
        </View>

        <Text
          style={[
            styles.sectionLabel,
            { color: colors.textSecondary, fontSize: typography.sizes.xs, marginTop: spacing[6], marginBottom: spacing[3] },
          ]}
        >
          THIS WEEK
        </Text>
        <WeeklySparkline logs={logs} />

        <Text
          style={[
            styles.sectionLabel,
            { color: colors.textSecondary, fontSize: typography.sizes.xs, marginTop: spacing[6], marginBottom: spacing[3] },
          ]}
        >
          TODAY
        </Text>
        <TodayTimeline logs={logs} />

        <Text
          style={[
            styles.sectionLabel,
            { color: colors.textSecondary, fontSize: typography.sizes.xs, marginTop: spacing[6], marginBottom: spacing[3] },
          ]}
        >
          JOURNAL
        </Text>
        <JournalQuickAccess logs={logs} />
      </ScrollView>

      <LogFAB />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {},
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greeting: {
    fontWeight: '700',
    flex: 1,
    marginRight: 12,
  },
  sectionLabel: {
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
