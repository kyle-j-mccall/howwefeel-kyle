import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'JournalEntry'>;

export function JournalEntryScreen({ navigation }: Props) {
  const { colors, typography, spacing } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes['2xl'] }]}>
        Journal Entry
      </Text>
      <Pressable
        onPress={() => navigation.goBack()}
        style={[styles.backButton, { backgroundColor: colors.surface, marginTop: spacing[4] }]}
      >
        <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.md }}>
          Back
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontWeight: '600',
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
});
