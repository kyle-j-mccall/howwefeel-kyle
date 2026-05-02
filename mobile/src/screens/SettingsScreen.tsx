import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, SettingsStackParamList } from '../navigation/types';
import { useTheme } from '../theme';

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<SettingsStackParamList, 'SettingsMain'>,
  NativeStackNavigationProp<RootStackParamList>
>;

const SECTIONS = [
  { key: 'Account', label: 'Account' },
  { key: 'Data', label: 'Data' },
  { key: 'Notifications', label: 'Notifications' },
  { key: 'Display', label: 'Display' },
  { key: 'Privacy', label: 'Privacy' },
  { key: 'ActivityLibrary', label: 'Activity Library' },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

export function SettingsScreen() {
  const { colors, typography, spacing, radii } = useTheme();
  const navigation = useNavigation<Nav>();

  const handlePress = (key: SectionKey) => {
    if (key === 'ActivityLibrary') {
      navigation.navigate('ActivityLibrary', {});
    } else {
      navigation.navigate(key);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      accessibilityLabel="Settings"
    >
      <Text
        style={[
          styles.title,
          {
            color: colors.text,
            fontSize: typography.sizes['2xl'],
            paddingHorizontal: spacing[6],
            paddingTop: spacing[12],
            paddingBottom: spacing[6],
          },
        ]}
      >
        Settings
      </Text>

      <View style={[styles.group, { paddingHorizontal: spacing[6] }]}>
        {SECTIONS.map((section, index) => (
          <Pressable
            key={section.key}
            accessibilityRole="button"
            accessibilityLabel={section.label}
            onPress={() => handlePress(section.key)}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: pressed ? colors.surfaceElevated : colors.surface,
                borderRadius:
                  index === 0
                    ? radii.md
                    : index === SECTIONS.length - 1
                    ? radii.md
                    : 0,
                paddingHorizontal: spacing[4],
                paddingVertical: spacing[4],
                borderBottomWidth: index < SECTIONS.length - 1 ? StyleSheet.hairlineWidth : 0,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.rowLabel,
                { color: colors.text, fontSize: typography.sizes.md },
              ]}
            >
              {section.label}
            </Text>
            <Text style={{ color: colors.textTertiary, fontSize: typography.sizes.md }}>
              ›
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
  title: {
    fontWeight: '700',
  },
  group: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  rowLabel: {
    fontWeight: '500',
  },
});
