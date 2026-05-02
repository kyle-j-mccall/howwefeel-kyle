import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme';
import { useLogStore } from '../store/logStore';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function HomeScreen(){
  const { colors, typography } = useTheme();
  const navigation = useNavigation<Nav>();
  const { pendingActivitySuggestion, clearActivitySuggestion } = useLogStore();

  useEffect(() => {
    if (pendingActivitySuggestion) {
      clearActivitySuggestion();
      navigation.navigate('ActivityLibrary', { fromPostLog: true });
    }
  }, [pendingActivitySuggestion]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes['2xl'] }]}>
        Home
      </Text>
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
});
