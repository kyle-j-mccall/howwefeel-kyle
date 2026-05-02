import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { EMOTIONS_BY_FAMILY, FAMILY_COLORS, type EmotionFamily } from 'howwefeel-kyle-shared';
import { useTheme } from '../theme';

const LABELS_PER_FAMILY = 6;

interface Props {
  family: EmotionFamily;
  selectedLabel: string | null;
  onSelect: (label: string) => void;
}

export function EmotionFamilyExpanded({ family, selectedLabel, onSelect }: Props) {
  const { colors, typography, radii } = useTheme();
  const emotions = EMOTIONS_BY_FAMILY[family].slice(0, LABELS_PER_FAMILY);
  const familyColor = FAMILY_COLORS[family];

  function handlePress(label: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelect(label);
  }

  return (
    <View style={styles.container}>
      {emotions.map((emotion) => {
        const isSelected = selectedLabel === emotion;
        const displayLabel = emotion.charAt(0) + emotion.slice(1).toLowerCase();
        return (
          <Pressable
            key={emotion}
            style={[
              styles.chip,
              {
                borderColor: familyColor,
                borderRadius: radii.full,
                backgroundColor: isSelected ? familyColor : colors.surface,
              },
            ]}
            onPress={() => handlePress(emotion)}
          >
            <Text
              style={[
                styles.chipText,
                {
                  fontSize: typography.sizes.md,
                  color: isSelected ? '#fff' : colors.text,
                  fontWeight: isSelected ? '600' : '400',
                },
              ]}
            >
              {displayLabel}
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
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  chip: {
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderWidth: 1.5,
  },
  chipText: {
    textAlign: 'center',
  },
});
