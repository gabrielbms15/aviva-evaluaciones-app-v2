import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './src/navigation/types';

import SedesScreen from './src/screens/SedesScreen';
import SedeTabs from './src/navigation/SedeTabs';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen
          name="Sedes"
          component={SedesScreen}
          options={{ animation: 'fade' }}
        />
        <Stack.Screen
          name="SedeTabs"
          component={SedeTabs}
          options={{ animation: 'slide_from_right' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
