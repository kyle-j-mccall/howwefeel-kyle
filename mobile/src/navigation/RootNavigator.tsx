import { NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import { BottomTabNavigator } from './BottomTabNavigator';
import { LogScreen } from '../screens/LogScreen';
import { useTheme } from '../theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['hwf://'],
  config: {
    screens: {
      Main: '',
      Log: 'log',
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
