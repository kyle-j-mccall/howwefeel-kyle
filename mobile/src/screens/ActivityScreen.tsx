import { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme';
import { useActivityStore } from '../store/activityStore';
import libraryData from '../../assets/activities/library.json';

type Props = NativeStackScreenProps<RootStackParamList, 'Activity'>;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ActivityScreen({ navigation, route }: Props) {
  const { activityId } = route.params;
  const { colors, typography, spacing, radii } = useTheme();
  const { markCompleted, toggleFavorite, isFavorite } = useActivityStore();

  const activity = libraryData.find((a) => a.id === activityId);
  const [stepIndex, setStepIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!activity) return null;

  const currentStep = activity.steps[stepIndex];
  const isLastStep = stepIndex === activity.steps.length - 1;
  const progress = (stepIndex + 1) / activity.steps.length;
  const favorited = isFavorite(activityId);

  const handleNext = () => {
    if (isLastStep) {
      markCompleted(activityId);
      navigation.goBack();
    } else {
      setStepIndex((i) => i + 1);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingHorizontal: spacing[6], paddingTop: spacing[12] }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={[styles.skipText, { color: colors.textSecondary, fontSize: typography.sizes.md }]}>
            Skip
          </Text>
        </Pressable>
        <Text style={{ color: colors.textTertiary, fontSize: typography.sizes.sm }}>
          {formatTime(elapsedSeconds)}
        </Text>
        <Pressable onPress={() => toggleFavorite(activityId)} hitSlop={8}>
          <Text style={{ fontSize: typography.sizes.xl, color: favorited ? colors.warning : colors.textTertiary }}>
            {favorited ? '★' : '☆'}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.progressTrack, { backgroundColor: colors.border, marginTop: spacing[4] }]}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: colors.primary, width: `${progress * 100}%` },
          ]}
        />
      </View>

      <View style={[styles.body, { paddingHorizontal: spacing[6], paddingTop: spacing[8] }]}>
        <Text style={[styles.activityName, { color: colors.text, fontSize: typography.sizes['2xl'] }]}>
          {activity.name}
        </Text>

        <View style={[styles.stepBadge, { backgroundColor: colors.primaryMuted, borderRadius: radii.full, marginTop: spacing[6] }]}>
          <Text style={[styles.stepBadgeText, { color: colors.primary, fontSize: typography.sizes.xs }]}>
            Step {stepIndex + 1} of {activity.steps.length}
          </Text>
        </View>

        <Text style={[styles.instruction, { color: colors.text, fontSize: typography.sizes.lg, marginTop: spacing[4] }]}>
          {currentStep.instruction}
        </Text>
      </View>

      <View style={[styles.footer, { paddingHorizontal: spacing[6], paddingBottom: spacing[12] }]}>
        <Pressable
          onPress={handleNext}
          style={[styles.nextButton, { backgroundColor: colors.primary, borderRadius: radii.md }]}
        >
          <Text style={[styles.nextButtonText, { color: colors.textOnPrimary, fontSize: typography.sizes.md }]}>
            {isLastStep ? 'Done' : 'Next'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skipText: {
    fontWeight: '500',
  },
  progressTrack: {
    height: 3,
    width: '100%',
  },
  progressFill: {
    height: 3,
  },
  body: {
    flex: 1,
  },
  activityName: {
    fontWeight: '700',
  },
  stepBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  stepBadgeText: {
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  instruction: {
    lineHeight: 26,
    fontWeight: '400',
  },
  footer: {
    justifyContent: 'flex-end',
  },
  nextButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  nextButtonText: {
    fontWeight: '600',
  },
});
