import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useReducedMotion,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FAMILY_COLORS, type EmotionFamily } from 'howwefeel-kyle-shared';
import { useTheme } from '../theme';

const WHEEL_SIZE = 280;
const HALF = WHEEL_SIZE / 2;
const GAP = 6;
const QUADRANT_SIZE = HALF - GAP / 2;
const CENTER_SIZE = 80;
const CENTER_OFFSET = HALF - CENTER_SIZE / 2;

const FAMILY_LABELS: Record<EmotionFamily, string> = {
  yellow: 'Happy',
  red: 'Upset',
  blue: 'Sad',
  green: 'Calm',
};

const QUADRANT_POSITIONS: Record<EmotionFamily, object> = {
  red: { top: 0, left: 0 },
  yellow: { top: 0, left: HALF + GAP / 2 },
  blue: { top: HALF + GAP / 2, left: 0 },
  green: { top: HALF + GAP / 2, left: HALF + GAP / 2 },
};

interface QuadrantProps {
  family: EmotionFamily;
  isSelected: boolean | null;
  onPress: () => void;
  animate: boolean;
}

function QuadrantSegment({ family, isSelected, onPress, animate }: QuadrantProps) {
  const { colors } = useTheme();
  const opacity = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (animate) {
      opacity.value = withSequence(
        withTiming(0.6, { duration: 80 }),
        withTiming(1, { duration: 160 }),
      );
    }
    onPress();
  }

  const dimmed = isSelected === false;

  return (
    <Animated.View
      style={[
        styles.quadrant,
        QUADRANT_POSITIONS[family],
        { backgroundColor: FAMILY_COLORS[family] },
        animStyle,
      ]}
    >
      <Pressable style={StyleSheet.absoluteFillObject} onPress={handlePress}>
        {dimmed && <View style={styles.dimOverlay} />}
        <View style={styles.labelContainer}>
          <Text style={[styles.quadrantLabel, { color: colors.textOnPrimary }]}>{FAMILY_LABELS[family]}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

interface Props {
  selectedFamily: EmotionFamily | null;
  onSelect: (family: EmotionFamily) => void;
}

export function EmotionWheel({ selectedFamily, onSelect }: Props) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion() ?? false;
  const families = Object.keys(FAMILY_LABELS) as EmotionFamily[];

  return (
    <View style={[styles.wheel, { backgroundColor: colors.background }]}>
      {families.map((family) => (
        <QuadrantSegment
          key={family}
          family={family}
          isSelected={selectedFamily === null ? null : selectedFamily === family}
          onPress={() => onSelect(family)}
          animate={!reduceMotion}
        />
      ))}
      <View
        style={[styles.centerHole, { backgroundColor: colors.background }]}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wheel: {
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    borderRadius: WHEEL_SIZE / 2,
    overflow: 'hidden',
  },
  quadrant: {
    position: 'absolute',
    width: QUADRANT_SIZE,
    height: QUADRANT_SIZE,
  },
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  labelContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quadrantLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  centerHole: {
    position: 'absolute',
    width: CENTER_SIZE,
    height: CENTER_SIZE,
    borderRadius: CENTER_SIZE / 2,
    top: CENTER_OFFSET,
    left: CENTER_OFFSET,
    zIndex: 2,
  },
});
