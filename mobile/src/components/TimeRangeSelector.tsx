import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

export type TimeRange = '7d' | '30d' | '90d' | 'all';

interface Props {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

const RANGES: readonly { label: string; value: TimeRange }[] = [
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' },
  { label: 'All', value: 'all' },
] as const;

export function TimeRangeSelector({ value, onChange }: Props) {
  const { colors, typography, spacing, radii } = useTheme();

  return (
    <View style={styles.container}>
      {RANGES.map((range) => {
        const selected = range.value === value;
        return (
          <Pressable
            key={range.value}
            onPress={() => onChange(range.value)}
            style={[
              styles.pill,
              {
                backgroundColor: selected ? colors.primary : colors.surface,
                borderRadius: radii.full,
                paddingHorizontal: spacing[4],
                paddingVertical: spacing[2],
                marginHorizontal: spacing[1],
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                {
                  color: selected ? colors.textInverse : colors.textSecondary,
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.medium,
                },
              ]}
            >
              {range.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {},
  label: {},
});
