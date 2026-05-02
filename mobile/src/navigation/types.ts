export type RootStackParamList = {
  Main: undefined;
  Log: { prefillFamily?: string } | undefined;
  Activity: { activityId: string };
  ActivityLibrary: { fromPostLog?: boolean } | undefined;
};

export type BottomTabParamList = {
  Home: undefined;
  Insights: undefined;
  Journal: undefined;
  Settings: undefined;
};
