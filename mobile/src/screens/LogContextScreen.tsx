import { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { CONTEXT_TAGS, type ContextTag } from 'howwefeel-kyle-shared';
import type { EmotionLog } from 'howwefeel-kyle-shared';
import { useLogStore } from '../store/logStore';
import { useTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'LogContext'>;

const HIGH_INTENSITY = 4;
const HIGH_INTENSITY_FAMILIES = new Set(['red', 'blue']);

export function LogContextScreen({ navigation, route }: Props) {
  const { family, label, intensity } = route.params;
  const { colors, typography, spacing, radii } = useTheme();
  const addLog = useLogStore((s) => s.addLog);

  const [selectedTags, setSelectedTags] = useState<ContextTag[]>([]);
  const [journalNote, setJournalNote] = useState('');

  function toggleTag(tag: ContextTag) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  function handleSave() {
    const now = new Date().toISOString();
    const log: EmotionLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId: 'mock-user-001',
      emotionFamily: family,
      emotionLabel: label,
      intensity,
      contextTags: selectedTags,
      journalNote: journalNote.trim() || null,
      photoUri: null,
      loggedAt: now,
      syncedAt: null,
      deviceId: 'mock-device-001',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    addLog(log);

    if (intensity >= HIGH_INTENSITY && HIGH_INTENSITY_FAMILIES.has(family)) {
      navigation.navigate('ActivityLibrary', { fromPostLog: true });
    } else {
      navigation.popToTop();
    }
  }

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.container, { paddingTop: spacing[10], paddingHorizontal: spacing[6] }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.heading, { color: colors.text, fontSize: typography.sizes['2xl'] }]}>
        What was it about?
      </Text>
      <Text style={[styles.subheading, { color: colors.textSecondary, fontSize: typography.sizes.md, marginTop: spacing[2] }]}>
        Select all that apply
      </Text>

      <View style={[styles.tagsRow, { marginTop: spacing[6] }]}>
        {CONTEXT_TAGS.map((tag) => {
          const isSelected = selectedTags.includes(tag);
          return (
            <Pressable
              key={tag}
              style={[
                styles.tag,
                {
                  borderRadius: radii.full,
                  borderColor: isSelected ? colors.primary : colors.border,
                  backgroundColor: isSelected ? colors.primaryMuted : colors.surface,
                },
              ]}
              onPress={() => toggleTag(tag)}
            >
              <Text
                style={[
                  styles.tagText,
                  {
                    fontSize: typography.sizes.md,
                    color: isSelected ? colors.primary : colors.textSecondary,
                    fontWeight: isSelected ? '600' : '400',
                  },
                ]}
              >
                {tag}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text
        style={[
          styles.noteLabel,
          { color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: spacing[8] },
        ]}
      >
        Journal note (optional)
      </Text>
      <TextInput
        style={[
          styles.noteInput,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radii.md,
            color: colors.text,
            fontSize: typography.sizes.md,
            marginTop: spacing[2],
          },
        ]}
        placeholder="What's on your mind?"
        placeholderTextColor={colors.textTertiary}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        value={journalNote}
        onChangeText={setJournalNote}
      />

      <Pressable
        style={[
          styles.saveButton,
          { backgroundColor: colors.primary, borderRadius: radii.md, marginTop: spacing[8] },
        ]}
        onPress={handleSave}
      >
        <Text style={[styles.saveText, { color: colors.textOnPrimary, fontSize: typography.sizes.lg }]}>
          Save
        </Text>
      </Pressable>

      <View style={{ height: spacing[12] }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
  },
  heading: {
    fontWeight: '600',
  },
  subheading: {},
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tag: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderWidth: 1.5,
  },
  tagText: {},
  noteLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  noteInput: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 100,
  },
  saveButton: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  saveText: {
    fontWeight: '600',
  },
});
