export const EMOTION_FAMILIES = ['yellow', 'red', 'green', 'blue'] as const;
export type EmotionFamily = typeof EMOTION_FAMILIES[number];

export const FAMILY_COLORS: Record<EmotionFamily, string> = {
  yellow: '#F7C948',
  red: '#E05252',
  green: '#52B788',
  blue: '#5B8FD4',
};

export const EMOTIONS_BY_FAMILY: Record<EmotionFamily, readonly string[]> = {
  yellow: [
    'ECSTATIC', 'ENERGIZED', 'EXCITED', 'THRILLED', 'JUBILANT',
    'EXUBERANT', 'LIVELY', 'CHEERFUL', 'HOPEFUL', 'PLAYFUL',
    'MOTIVATED', 'INSPIRED', 'HAPPY', 'JOYFUL', 'PLEASED',
  ],
  red: [
    'ANGRY', 'FURIOUS', 'RESENTFUL', 'HOSTILE', 'FRUSTRATED',
    'ANNOYED', 'WORRIED', 'FEARFUL', 'ANXIOUS', 'TENSE',
    'STRESSED', 'SHOCKED', 'DISGUSTED', 'HORRIFIED', 'TROUBLED',
  ],
  green: [
    'CALM', 'PEACEFUL', 'CONTENT', 'SERENE', 'RELAXED',
    'GRATEFUL', 'SECURE', 'SATISFIED', 'FULFILLED', 'COMPASSIONATE',
    'THOUGHTFUL', 'GENTLE', 'TRANQUIL', 'RESTFUL', 'COMFORTABLE',
  ],
  blue: [
    'SAD', 'HOPELESS', 'LONELY', 'BORED', 'TIRED',
    'MISERABLE', 'DEPRESSED', 'DEJECTED', 'MELANCHOLY', 'GLOOMY',
    'DISAPPOINTED', 'SORROWFUL', 'WEARY', 'DISHEARTENED', 'WITHDRAWN',
  ],
};

export const CONTEXT_TAGS = [
  'Work', 'Family', 'Health', 'Social', 'Money', 'Relationship', 'Other',
] as const;
export type ContextTag = typeof CONTEXT_TAGS[number];
