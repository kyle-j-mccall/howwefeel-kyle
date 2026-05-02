import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { EmotionFamily, ContextTag } from 'howwefeel-kyle-shared';
import { EMOTION_FAMILIES, CONTEXT_TAGS, FAMILY_COLORS } from 'howwefeel-kyle-shared';
import { useLogStore } from '../store/logStore';
import { JournalListItem } from '../components/JournalListItem';
import { useTheme } from '../theme';
import type { RootStackParamList, BottomTabParamList } from '../navigation/types';

type NavProp = CompositeNavigationProp<
  BottomTabNavigationProp<BottomTabParamList, 'Journal'>,
  NativeStackNavigationProp<RootStackParamList>
>;

type DateRange = 'all' | 'today' | 'week' | 'month';

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  all: 'All Time',
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
};

export function JournalScreen() {
  const { colors, typography, spacing, radii } = useTheme();
  const navigation = useNavigation<NavProp>();
  const logs = useLogStore((state) => state.logs);

  const [searchText, setSearchText] = useState('');
  const [familyFilter, setFamilyFilter] = useState<EmotionFamily | null>(null);
  const [contextFilter, setContextFilter] = useState<ContextTag | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('all');

  const journalLogs = useMemo(() => {
    const now = new Date();
    let filtered = logs.filter((l) => l.journalNote !== null && l.deletedAt === null);

    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      filtered = filtered.filter((l) => l.journalNote!.toLowerCase().includes(q));
    }

    if (familyFilter) {
      filtered = filtered.filter((l) => l.emotionFamily === familyFilter);
    }

    if (contextFilter) {
      filtered = filtered.filter((l) => (l.contextTags as readonly string[]).includes(contextFilter));
    }

    if (dateRange !== 'all') {
      const cutoff = new Date(now);
      if (dateRange === 'today') {
        cutoff.setHours(0, 0, 0, 0);
      } else if (dateRange === 'week') {
        cutoff.setDate(cutoff.getDate() - 7);
      } else if (dateRange === 'month') {
        cutoff.setMonth(cutoff.getMonth() - 1);
      }
      filtered = filtered.filter((l) => new Date(l.loggedAt) >= cutoff);
    }

    return filtered.sort(
      (a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime(),
    );
  }, [logs, searchText, familyFilter, contextFilter, dateRange]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={[styles.titleRow, { paddingHorizontal: spacing[4], paddingVertical: spacing[3] }]}>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes['2xl'] }]}>
          Journal
        </Text>
      </View>

      <View style={[styles.searchRow, { paddingHorizontal: spacing[4], marginBottom: spacing[3] }]}>
        <TextInput
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Search notes…"
          placeholderTextColor={colors.textTertiary}
          style={[
            styles.searchInput,
            {
              backgroundColor: colors.surface,
              borderRadius: radii.md,
              color: colors.text,
              fontSize: typography.sizes.md,
              paddingHorizontal: spacing[4],
              paddingVertical: spacing[3],
            },
          ]}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={{ paddingHorizontal: spacing[4] }}
      >
        <FilterChip
          label="All"
          selected={familyFilter === null}
          onPress={() => setFamilyFilter(null)}
        />
        {EMOTION_FAMILIES.map((family) => (
          <FilterChip
            key={family}
            label={family.charAt(0).toUpperCase() + family.slice(1)}
            selected={familyFilter === family}
            accentColor={FAMILY_COLORS[family]}
            onPress={() => setFamilyFilter(familyFilter === family ? null : family)}
          />
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={{ paddingHorizontal: spacing[4] }}
      >
        <FilterChip
          label="All Tags"
          selected={contextFilter === null}
          onPress={() => setContextFilter(null)}
        />
        {CONTEXT_TAGS.map((tag) => (
          <FilterChip
            key={tag}
            label={tag}
            selected={contextFilter === tag}
            onPress={() => setContextFilter(contextFilter === tag ? null : tag)}
          />
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.filterRow, { marginBottom: spacing[4] }]}
        contentContainerStyle={{ paddingHorizontal: spacing[4] }}
      >
        {(['all', 'today', 'week', 'month'] as const).map((range) => (
          <FilterChip
            key={range}
            label={DATE_RANGE_LABELS[range]}
            selected={dateRange === range}
            onPress={() => setDateRange(range)}
          />
        ))}
      </ScrollView>

      <FlatList
        data={journalLogs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <JournalListItem
            log={item}
            onPress={() => navigation.navigate('JournalEntry', { logId: item.id })}
          />
        )}
        ListEmptyComponent={
          <View style={[styles.empty, { paddingTop: spacing[16] }]}>
            <Text
              style={[styles.emptyText, { color: colors.textTertiary, fontSize: typography.sizes.md }]}
            >
              No journal entries
            </Text>
            <Text
              style={[
                styles.emptySubtext,
                { color: colors.textTertiary, fontSize: typography.sizes.sm, marginTop: spacing[2] },
              ]}
            >
              Add a note when logging emotions to see them here
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingTop: spacing[1], paddingBottom: spacing[10] }}
      />
    </SafeAreaView>
  );
}

interface FilterChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  accentColor?: string;
}

function FilterChip({ label, selected, onPress, accentColor }: FilterChipProps) {
  const { colors, typography, spacing, radii } = useTheme();
  const accent = accentColor ?? colors.primary;

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? accent + '26' : colors.surface,
          borderColor: selected ? accent : colors.border,
          borderRadius: radii.full,
          paddingHorizontal: spacing[4],
          paddingVertical: spacing[2],
          marginRight: spacing[2],
        },
      ]}
    >
      {accentColor && (
        <View
          style={[styles.chipDot, { backgroundColor: accentColor, borderRadius: radii.full }]}
        />
      )}
      <Text
        style={[
          styles.chipLabel,
          {
            color: selected ? accent : colors.textSecondary,
            fontSize: typography.sizes.sm,
            fontWeight: selected ? typography.weights.semibold : typography.weights.regular,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  titleRow: {},
  title: { fontWeight: '700' },
  searchRow: {},
  searchInput: {},
  filterRow: { marginBottom: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  chipDot: { width: 8, height: 8, marginRight: 6 },
  chipLabel: {},
  empty: { alignItems: 'center', paddingHorizontal: 32 },
  emptyText: { fontWeight: '500', textAlign: 'center' },
  emptySubtext: { textAlign: 'center', lineHeight: 20 },
});
