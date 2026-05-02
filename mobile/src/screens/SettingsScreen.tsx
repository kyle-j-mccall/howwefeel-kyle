import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function SettingsScreen(){
  const { colors, typography, spacing, radii } = useTheme();
  const navigation = useNavigation<Nav>();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes['2xl'], paddingHorizontal: spacing[6], paddingTop: spacing[12] }]}>
        Settings
      </Text>

      <View style={[styles.section, { marginTop: spacing[8], paddingHorizontal: spacing[6] }]}>
        <Pressable
          onPress={() => navigation.navigate('ActivityLibrary', {})}
          style={[styles.row, { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing[4] }]}
        >
          <Text style={[styles.rowLabel, { color: colors.text, fontSize: typography.sizes.md }]}>
            Activity Library
          </Text>
          <Text style={{ color: colors.textTertiary, fontSize: typography.sizes.md }}>›</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontWeight: '700',
  },
  section: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    fontWeight: '500',
  },
});
