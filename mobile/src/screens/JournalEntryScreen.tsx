import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FAMILY_COLORS } from 'howwefeel-kyle-shared';
import { useLogStore } from '../store/logStore';
import { useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'JournalEntry'>;

export function JournalEntryScreen({ route, navigation }: Props) {
  const { logId } = route.params;
  const { colors, typography, spacing, radii } = useTheme();

  const log = useLogStore((state) => state.logs.find((l) => l.id === logId));
  const updateLog = useLogStore((state) => state.updateLog);
  const removeLog = useLogStore((state) => state.removeLog);

  const [isEditing, setIsEditing] = useState(false);
  const [draftNote, setDraftNote] = useState(log?.journalNote ?? '');

  if (!log) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={[styles.notFound, { paddingTop: spacing[16] }]}>
          <Text style={[{ color: colors.textSecondary, fontSize: typography.sizes.md }]}>
            Entry not found
          </Text>
          <Pressable onPress={() => navigation.goBack()} style={{ marginTop: spacing[4] }}>
            <Text style={[{ color: colors.primary, fontSize: typography.sizes.md }]}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const familyColor = FAMILY_COLORS[log.emotionFamily];
  const date = new Date(log.loggedAt);
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  function handleSave() {
    updateLog(logId, { journalNote: draftNote.trim() || null, updatedAt: new Date().toISOString() });
    setIsEditing(false);
  }

  function handleDelete() {
    Alert.alert(
      'Delete entry?',
      'This journal entry will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            removeLog(logId);
            navigation.goBack();
          },
        },
      ],
    );
  }

  function handleCancelEdit() {
    setDraftNote(log?.journalNote ?? '');
    setIsEditing(false);
  }

  const intensityDots = Array.from({ length: 5 }, (_, i) => i < log.intensity);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.headerRow,
            {
              paddingHorizontal: spacing[4],
              paddingVertical: spacing[3],
              borderBottomColor: colors.borderSubtle,
              borderBottomWidth: 1,
            },
          ]}
        >
          <Pressable onPress={isEditing ? handleCancelEdit : () => navigation.goBack()} style={styles.backBtn}>
            <Text style={[{ color: colors.primary, fontSize: typography.sizes.md }]}>
              {isEditing ? 'Cancel' : '← Back'}
            </Text>
          </Pressable>

          <View style={styles.headerActions}>
            {isEditing ? (
              <Pressable onPress={handleSave} style={[styles.actionBtn, { backgroundColor: colors.primary, borderRadius: radii.md, paddingHorizontal: spacing[4], paddingVertical: spacing[2] }]}>
                <Text style={[{ color: colors.textOnPrimary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold }]}>
                  Save
                </Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  onPress={() => { setDraftNote(log.journalNote ?? ''); setIsEditing(true); }}
                  style={[styles.actionBtn, { marginRight: spacing[3] }]}
                >
                  <Text style={[{ color: colors.primary, fontSize: typography.sizes.md }]}>Edit</Text>
                </Pressable>
                <Pressable onPress={handleDelete}>
                  <Text style={[{ color: colors.error, fontSize: typography.sizes.md }]}>Delete</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>

        <ScrollView
          contentContainerStyle={[styles.scrollContent, { padding: spacing[4] }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.emotionRow, { marginBottom: spacing[4] }]}>
            <View
              style={[
                styles.familyDot,
                { backgroundColor: familyColor, borderRadius: radii.full },
              ]}
            />
            <View style={styles.emotionInfo}>
              <Text
                style={[
                  styles.emotionLabel,
                  { color: colors.text, fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
                ]}
              >
                {log.emotionLabel}
              </Text>
              <Text style={[{ color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: 2 }]}>
                {dateStr} · {timeStr}
              </Text>
            </View>
          </View>

          <View style={[styles.intensityRow, { marginBottom: spacing[4] }]}>
            {intensityDots.map((filled, i) => (
              <View
                key={i}
                style={[
                  styles.intensityDot,
                  {
                    backgroundColor: filled ? familyColor : colors.surface,
                    borderColor: filled ? familyColor : colors.border,
                    borderRadius: radii.full,
                    marginRight: spacing[2],
                  },
                ]}
              />
            ))}
            <Text style={[{ color: colors.textSecondary, fontSize: typography.sizes.sm, marginLeft: spacing[1] }]}>
              Intensity {log.intensity}/5
            </Text>
          </View>

          {log.contextTags.length > 0 && (
            <View style={[styles.tagsRow, { marginBottom: spacing[5] }]}>
              {log.contextTags.map((tag) => (
                <View
                  key={tag}
                  style={[
                    styles.tag,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      borderRadius: radii.full,
                      paddingHorizontal: spacing[3],
                      paddingVertical: spacing[1],
                      marginRight: spacing[2],
                      marginBottom: spacing[2],
                    },
                  ]}
                >
                  <Text style={[{ color: colors.textSecondary, fontSize: typography.sizes.sm }]}>
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View
            style={[
              styles.noteContainer,
              {
                backgroundColor: colors.surface,
                borderRadius: radii.lg,
                padding: spacing[4],
                minHeight: 120,
              },
            ]}
          >
            {isEditing ? (
              <TextInput
                value={draftNote}
                onChangeText={setDraftNote}
                placeholder="Write a note…"
                placeholderTextColor={colors.textTertiary}
                multiline
                autoFocus
                style={[
                  styles.noteInput,
                  {
                    color: colors.text,
                    fontSize: typography.sizes.md,
                    lineHeight: typography.sizes.md * typography.lineHeights.relaxed,
                  },
                ]}
              />
            ) : (
              <Text
                style={[
                  styles.noteText,
                  {
                    color: log.journalNote ? colors.text : colors.textTertiary,
                    fontSize: typography.sizes.md,
                    lineHeight: typography.sizes.md * typography.lineHeights.relaxed,
                  },
                ]}
              >
                {log.journalNote ?? 'No note'}
              </Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  notFound: { flex: 1, alignItems: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {},
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: {},
  scrollContent: {},
  emotionRow: { flexDirection: 'row', alignItems: 'center' },
  familyDot: { width: 20, height: 20, marginRight: 12 },
  emotionInfo: { flex: 1 },
  emotionLabel: {},
  intensityRow: { flexDirection: 'row', alignItems: 'center' },
  intensityDot: { width: 14, height: 14, borderWidth: 1.5 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap' },
  tag: { borderWidth: 1 },
  noteContainer: {},
  noteInput: { textAlignVertical: 'top' },
  noteText: {},
});
