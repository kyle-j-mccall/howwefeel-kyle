import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { useActivityStore } from '../store/activityStore';

interface Activity {
  id: string;
  name: string;
  durationMinutes: number;
  description: string;
}

interface Props {
  activity: Activity;
  onPress: (activityId: string) => void;
}

export function ActivityCard({ activity, onPress }: Props) {
  const { colors, typography, spacing, radii } = useTheme();
  const { isFavorite, toggleFavorite } = useActivityStore();
  const favorited = isFavorite(activity.id);

  return (
    <Pressable
      onPress={() => onPress(activity.id)}
      style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, marginHorizontal: spacing[6], marginBottom: spacing[3] }]}
    >
      <View style={styles.row}>
        <View style={styles.content}>
          <Text style={[styles.name, { color: colors.text, fontSize: typography.sizes.md }]}>
            {activity.name}
          </Text>
          <Text style={[styles.duration, { color: colors.textTertiary, fontSize: typography.sizes.xs }]}>
            {activity.durationMinutes} min
          </Text>
          <Text
            numberOfLines={2}
            style={[styles.description, { color: colors.textSecondary, fontSize: typography.sizes.sm }]}
          >
            {activity.description}
          </Text>
        </View>
        <Pressable
          onPress={() => toggleFavorite(activity.id)}
          hitSlop={8}
          style={[styles.favoriteButton, { paddingLeft: spacing[4] }]}
        >
          <Text style={{ fontSize: typography.sizes.xl, color: favorited ? colors.warning : colors.textTertiary }}>
            {favorited ? '★' : '☆'}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  content: {
    flex: 1,
  },
  name: {
    fontWeight: '600',
    marginBottom: 2,
  },
  duration: {
    marginBottom: 6,
  },
  description: {
    lineHeight: 18,
  },
  favoriteButton: {
    alignSelf: 'center',
  },
});
