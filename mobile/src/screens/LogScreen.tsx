import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { EmotionWheel } from '../components/EmotionWheel';
import { EmotionFamilyExpanded } from '../components/EmotionFamilyExpanded';
import { IntensitySelector } from '../components/IntensitySelector';
import { useTheme } from '../theme';
import type { EmotionFamily } from 'howwefeel-kyle-shared';

type Props = NativeStackScreenProps<RootStackParamList, 'Log'>;

type Step = 'wheel' | 'label' | 'intensity';

export function LogScreen({ navigation, route }: Props) {
  const { colors, typography, spacing } = useTheme();
  const prefill = route.params?.prefillFamily;

  const [step, setStep] = useState<Step>(prefill ? 'label' : 'wheel');
  const [selectedFamily, setSelectedFamily] = useState<EmotionFamily | null>(prefill ?? null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [pendingIntensity, setPendingIntensity] = useState<number | null>(null);

  function handleFamilySelect(family: EmotionFamily) {
    setSelectedFamily(family);
    setStep('label');
  }

  function handleLabelSelect(label: string) {
    setSelectedLabel(label);
    setStep('intensity');
  }

  function handleIntensitySelect(intensity: 1 | 2 | 3 | 4 | 5) {
    if (!selectedFamily || !selectedLabel) return;
    setPendingIntensity(intensity);
    navigation.navigate('LogContext', { family: selectedFamily, label: selectedLabel, intensity });
  }

  function handleBack() {
    if (step === 'intensity') {
      setStep('label');
      setPendingIntensity(null);
    } else if (step === 'label') {
      setStep('wheel');
      setSelectedLabel(null);
      if (!route.params?.prefillFamily) setSelectedFamily(null);
    } else {
      navigation.goBack();
    }
  }

  const stepLabels: Record<Step, string> = {
    wheel: 'How are you feeling?',
    label: selectedFamily
      ? `${selectedFamily.charAt(0).toUpperCase() + selectedFamily.slice(1)} — pick a word`
      : 'Pick a word',
    intensity: 'How intense is it?',
  };

  const backLabel = step === 'wheel' ? 'Cancel' : 'Back';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: spacing[10], paddingHorizontal: spacing[6] }]}>
        <Pressable onPress={handleBack} hitSlop={12} style={styles.backButton}>
          <Text style={[styles.backText, { color: colors.textSecondary, fontSize: typography.sizes.md }]}>
            {backLabel}
          </Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes['2xl'] }]}>
          {stepLabels[step]}
        </Text>
      </View>

      <View style={styles.content}>
        {step === 'wheel' && (
          <EmotionWheel selectedFamily={selectedFamily} onSelect={handleFamilySelect} />
        )}
        {step === 'label' && selectedFamily !== null && (
          <EmotionFamilyExpanded
            family={selectedFamily}
            selectedLabel={selectedLabel}
            onSelect={handleLabelSelect}
          />
        )}
        {step === 'intensity' && selectedFamily !== null && (
          <>
            <Text
              style={[
                styles.selectedLabelText,
                {
                  color: colors.textSecondary,
                  fontSize: typography.sizes.lg,
                  marginBottom: spacing[6],
                },
              ]}
            >
              {selectedLabel
                ? selectedLabel.charAt(0) + selectedLabel.slice(1).toLowerCase()
                : ''}
            </Text>
            <IntensitySelector
              family={selectedFamily}
              selectedIntensity={pendingIntensity}
              onSelect={handleIntensitySelect}
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    gap: 12,
    marginBottom: 32,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  backText: {
    fontWeight: '500',
  },
  title: {
    fontWeight: '600',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  selectedLabelText: {
    fontWeight: '500',
    textAlign: 'center',
  },
});
