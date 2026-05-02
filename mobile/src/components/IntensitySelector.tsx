import { View, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FAMILY_COLORS, type EmotionFamily } from 'howwefeel-kyle-shared';

const INTENSITIES = [1, 2, 3, 4, 5] as const;
const DOT_SIZE = 28;

interface Props {
  family: EmotionFamily;
  selectedIntensity: number | null;
  onSelect: (intensity: 1 | 2 | 3 | 4 | 5) => void;
}

export function IntensitySelector({ family, selectedIntensity, onSelect }: Props) {
  const familyColor = FAMILY_COLORS[family];

  function handlePress(intensity: 1 | 2 | 3 | 4 | 5) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelect(intensity);
  }

  return (
    <View style={styles.row}>
      {INTENSITIES.map((intensity) => {
        const filled = selectedIntensity !== null && intensity <= selectedIntensity;
        return (
          <Pressable
            key={intensity}
            style={[
              styles.dot,
              {
                borderColor: familyColor,
                backgroundColor: filled ? familyColor : 'transparent',
              },
              filled && styles.dotFilled,
            ]}
            onPress={() => handlePress(intensity)}
            hitSlop={8}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 8,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 2,
  },
  dotFilled: {
    transform: [{ scale: 1.15 }],
  },
});
