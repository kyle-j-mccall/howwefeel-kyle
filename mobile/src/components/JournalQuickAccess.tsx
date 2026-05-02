import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { EmotionLog } from 'howwefeel-kyle-shared';
import { FAMILY_COLORS } from 'howwefeel-kyle-shared';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme';

interface Props {
  logs: EmotionLog[];
}

type Nav = NativeStackNavigationProp<RootStackParamList>;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function JournalQuickAccess({ logs }: Props) {
  const { colors, typography, spacing, radii } = useTheme();
  const navigation = useNavigation<Nav>();

  const journalLogs = logs
    .filter(l => !l.deletedAt && l.journalNote)
    .sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime())
    .slice(0, 3);

  if (journalLogs.length === 0) return null;

  return (
    <View>
      {journalLogs.map(log => {
        const familyColor = FAMILY_COLORS[log.emotionFamily];
        return (
          <Pressable
            key={log.id}
            onPress={() => navigation.navigate('JournalEntry', { logId: log.id })}
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderRadius: radii.md,
                padding: spacing[4],
                marginBottom: spacing[2],
                borderLeftWidth: 3,
                borderLeftColor: familyColor,
              },
            ]}
          >
            <View style={styles.header}>
              <Text style={[styles.label, { color: colors.text, fontSize: typography.sizes.sm }]}>
                {log.emotionLabel}
              </Text>
              <Text style={[styles.date, { color: colors.textTertiary, fontSize: typography.sizes.xs }]}>
                {formatDate(log.loggedAt)}
              </Text>
            </View>
            <Text
              numberOfLines={2}
              style={[
                styles.note,
                { color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: spacing[1] },
              ]}
            >
              {log.journalNote}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontWeight: '600',
  },
  date: {},
  note: {
    lineHeight: 18,
  },
});
