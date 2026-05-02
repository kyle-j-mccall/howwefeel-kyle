import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SettingsStackParamList } from '../navigation/types';
import { useTheme } from '../theme';
import { useSettingsStore } from '../store/settingsStore';

type Props = NativeStackScreenProps<SettingsStackParamList, 'Notifications'>;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FREQUENCIES = [1, 2, 3, 4] as const;

function formatHour(hour: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:00 ${period}`;
}

export function NotificationsScreen({ navigation }: Props) {
  const { colors, typography, spacing, radii } = useTheme();
  const { notifications, setFrequency, setStartHour, setEndHour, toggleDay } = useSettingsStore();

  const adjustHour = (current: number, delta: number, min: number, max: number) =>
    Math.min(max, Math.max(min, current + delta));

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      accessibilityLabel="Notifications settings"
    >
      <View style={[styles.header, { paddingHorizontal: spacing[6], paddingTop: spacing[12], paddingBottom: spacing[6] }]}>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes['2xl'] }]}>
          Notifications
        </Text>
      </View>

      <View style={[styles.section, { paddingHorizontal: spacing[6], marginBottom: spacing[6] }]}>
        <Text style={[styles.sectionLabel, { color: colors.textTertiary, fontSize: typography.sizes.xs, marginBottom: spacing[2] }]}>
          CHECK-IN FREQUENCY
        </Text>
        <View
          style={[
            styles.segmentRow,
            { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing[1] },
          ]}
        >
          {FREQUENCIES.map((freq) => {
            const active = notifications.frequency === freq;
            return (
              <Pressable
                key={freq}
                accessibilityRole="button"
                accessibilityLabel={`${freq}x per day`}
                accessibilityState={{ selected: active }}
                onPress={() => setFrequency(freq)}
                style={[
                  styles.segment,
                  {
                    backgroundColor: active ? colors.primary : colors.transparent,
                    borderRadius: radii.sm,
                    paddingVertical: spacing[2],
                    minHeight: 44,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.segmentLabel,
                    {
                      color: active ? colors.textOnPrimary : colors.textSecondary,
                      fontSize: typography.sizes.sm,
                    },
                  ]}
                >
                  {freq}x
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.section, { paddingHorizontal: spacing[6], marginBottom: spacing[6] }]}>
        <Text style={[styles.sectionLabel, { color: colors.textTertiary, fontSize: typography.sizes.xs, marginBottom: spacing[2] }]}>
          TIME WINDOW
        </Text>
        <View style={[styles.timeRow, { backgroundColor: colors.surface, borderRadius: radii.md, paddingHorizontal: spacing[4], paddingVertical: spacing[3] }]}>
          <Text style={[styles.timeLabel, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>Start</Text>
          <View style={styles.hourControl}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decrease start hour"
              onPress={() => setStartHour(adjustHour(notifications.startHour, -1, 0, 23))}
              style={[styles.hourBtn, { minWidth: 44, minHeight: 44 }]}
            >
              <Text style={[styles.hourBtnText, { color: colors.textSecondary, fontSize: typography.sizes.lg }]}>−</Text>
            </Pressable>
            <Text style={[styles.hourValue, { color: colors.text, fontSize: typography.sizes.md, minWidth: 72 }]}>
              {formatHour(notifications.startHour)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Increase start hour"
              onPress={() => setStartHour(adjustHour(notifications.startHour, 1, 0, 23))}
              style={[styles.hourBtn, { minWidth: 44, minHeight: 44 }]}
            >
              <Text style={[styles.hourBtnText, { color: colors.textSecondary, fontSize: typography.sizes.lg }]}>+</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.timeRow, { backgroundColor: colors.surface, borderRadius: radii.md, paddingHorizontal: spacing[4], paddingVertical: spacing[3], marginTop: spacing[2] }]}>
          <Text style={[styles.timeLabel, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}>End</Text>
          <View style={styles.hourControl}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decrease end hour"
              onPress={() => setEndHour(adjustHour(notifications.endHour, -1, 0, 23))}
              style={[styles.hourBtn, { minWidth: 44, minHeight: 44 }]}
            >
              <Text style={[styles.hourBtnText, { color: colors.textSecondary, fontSize: typography.sizes.lg }]}>−</Text>
            </Pressable>
            <Text style={[styles.hourValue, { color: colors.text, fontSize: typography.sizes.md, minWidth: 72 }]}>
              {formatHour(notifications.endHour)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Increase end hour"
              onPress={() => setEndHour(adjustHour(notifications.endHour, 1, 0, 23))}
              style={[styles.hourBtn, { minWidth: 44, minHeight: 44 }]}
            >
              <Text style={[styles.hourBtnText, { color: colors.textSecondary, fontSize: typography.sizes.lg }]}>+</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={[styles.section, { paddingHorizontal: spacing[6], marginBottom: spacing[6] }]}>
        <Text style={[styles.sectionLabel, { color: colors.textTertiary, fontSize: typography.sizes.xs, marginBottom: spacing[2] }]}>
          DAYS
        </Text>
        <View style={styles.daysRow}>
          {DAYS.map((day, index) => {
            const active = notifications.days[index];
            return (
              <Pressable
                key={day}
                accessibilityRole="checkbox"
                accessibilityLabel={day}
                accessibilityState={{ checked: active }}
                onPress={() => toggleDay(index)}
                style={[
                  styles.dayBtn,
                  {
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderRadius: radii.full,
                    minWidth: 44,
                    minHeight: 44,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.dayLabel,
                    {
                      color: active ? colors.textOnPrimary : colors.textSecondary,
                      fontSize: typography.sizes.xs,
                    },
                  ]}
                >
                  {day}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1 },
  header: {},
  title: { fontWeight: '700' },
  section: {},
  sectionLabel: {
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  segmentRow: {
    flexDirection: 'row',
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentLabel: { fontWeight: '600' },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeLabel: { fontWeight: '500', flex: 1 },
  hourControl: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hourBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hourBtnText: { fontWeight: '400' },
  hourValue: {
    textAlign: 'center',
    fontWeight: '500',
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLabel: { fontWeight: '600' },
});
