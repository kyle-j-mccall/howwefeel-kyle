import { Pressable, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function LogFAB() {
  const { colors, typography, radii, shadows } = useTheme();
  const navigation = useNavigation<Nav>();

  return (
    <Pressable
      onPress={() => navigation.navigate('Log')}
      style={[
        styles.fab,
        {
          backgroundColor: colors.primary,
          borderRadius: radii.full,
          ...shadows.lg,
        },
      ]}
    >
      <Text style={[styles.plus, { color: colors.textInverse, fontSize: typography.sizes['2xl'] }]}>
        +
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: {
    fontWeight: '300',
  },
});
