import { NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import { BottomTabNavigator } from './BottomTabNavigator';
import { LogScreen } from '../screens/LogScreen';
import { ActivityScreen } from '../screens/ActivityScreen';
import { ActivityLibraryScreen } from '../screens/ActivityLibraryScreen';
import { useTheme } from '../theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['hwf://'],
  config: {
    screens: {
      Main: '',
      Log: 'log',
      ActivityLibrary: 'activities',
      Activity: 'activity/:activityId',
    },
  },
};

export function RootNavigator(){
  const { colors } = useTheme();

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={BottomTabNavigator} />
        <Stack.Screen
          name="Log"
          component={LogScreen}
          options={{
            presentation: 'modal',
            contentStyle: { backgroundColor: colors.background },
          }}
        />
        <Stack.Screen
          name="ActivityLibrary"
          component={ActivityLibraryScreen}
          options={{ contentStyle: { backgroundColor: colors.background } }}
        />
        <Stack.Screen
          name="Activity"
          component={ActivityScreen}
          options={{
            presentation: 'modal',
            contentStyle: { backgroundColor: colors.background },
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
