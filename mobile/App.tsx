import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RootNavigator } from './src/navigation/RootNavigator';

const queryClient = new QueryClient();

export default function App(){
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <QueryClientProvider client={queryClient}>
          <RootNavigator />
        </QueryClientProvider>
        <StatusBar style="light" />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
