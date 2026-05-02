import type { EmotionFamily } from 'howwefeel-kyle-shared';

export type RootStackParamList = {
  Main: undefined;
  Log: { prefillFamily?: EmotionFamily } | undefined;
  LogContext: {
    family: EmotionFamily;
    label: string;
    intensity: 1 | 2 | 3 | 4 | 5;
  };
  Activity: { activityId: string };
  ActivityLibrary: { fromPostLog?: boolean } | undefined;
  JournalEntry: { logId: string };
};

export type BottomTabParamList = {
  Home: undefined;
  Insights: undefined;
  Journal: undefined;
  Settings: undefined;
};
