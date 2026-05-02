import { ScrollView, View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme';
import { useActivityStore } from '../store/activityStore';
import { ActivityCard } from '../components/ActivityCard';
import libraryData from '../../assets/activities/library.json';

type Props = NativeStackScreenProps<RootStackParamList, 'ActivityLibrary'>;

export function ActivityLibraryScreen({ navigation, route }: Props) {
  const { colors, typography, spacing } = useTheme();
  const { favorites } = useActivityStore();
  const fromPostLog = route.params?.fromPostLog ?? false;

  const favoriteActivities = libraryData.filter((a) => favorites.includes(a.id));
  const otherActivities = libraryData.filter((a) => !favorites.includes(a.id));

  const handleActivityPress = (activityId: string) => {
    navigation.navigate('Activity', { activityId });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingHorizontal: spacing[6], paddingTop: spacing[12], paddingBottom: spacing[4] }]}>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes['2xl'] }]}>
          {fromPostLog ? 'Try an Activity' : 'Activity Library'}
        </Text>
        {fromPostLog && (
          <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: spacing[1] }]}>
            These can help when emotions feel intense.
          </Text>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing[12] }}
      >
        {favoriteActivities.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textTertiary, fontSize: typography.sizes.xs, paddingHorizontal: spacing[6], marginBottom: spacing[2] }]}>
              FAVORITES
            </Text>
            {favoriteActivities.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                onPress={handleActivityPress}
              />
            ))}
            <View style={[styles.divider, { backgroundColor: colors.border, marginHorizontal: spacing[6], marginVertical: spacing[4] }]} />
          </>
        )}

        <Text style={[styles.sectionLabel, { color: colors.textTertiary, fontSize: typography.sizes.xs, paddingHorizontal: spacing[6], marginBottom: spacing[2] }]}>
          ALL ACTIVITIES
        </Text>
        {otherActivities.map((activity) => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            onPress={handleActivityPress}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    marginBottom: 8,
  },
  title: {
    fontWeight: '700',
  },
  subtitle: {
    lineHeight: 20,
  },
  sectionLabel: {
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  divider: {
    height: 1,
  },
});
