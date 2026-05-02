import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

export function HomeScreen(){
  const { colors, typography } = useTheme();

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
