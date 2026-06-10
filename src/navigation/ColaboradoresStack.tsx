import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ColaboradoresParamList } from './types';
import UpssScreen from '../screens/UpssScreen';
import SearchPersonalScreen from '../screens/SearchPersonalScreen';
import EvaluacionScreen from '../screens/EvaluacionScreen';

const Stack = createNativeStackNavigator<ColaboradoresParamList>();

const backHeaderOptions = {
  headerShown: true,
  headerTitle: '',
  headerTransparent: true,
  headerTintColor: '#10B981',
  headerBackTitleVisible: false,
};

interface Props {
  sedeId: string;
  sedeNombre: string;
}

// Stack de navegación del tab "Colaboradores".
// Contiene: Upss → SearchPersonal → Evaluacion
export default function ColaboradoresStack({ sedeId, sedeNombre }: Props) {
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
    >
      <Stack.Screen
        name="Upss"
        component={UpssScreen}
        initialParams={{ sedeId, sedeNombre }}
      />
      <Stack.Screen
        name="SearchPersonal"
        component={SearchPersonalScreen}
        options={backHeaderOptions}
      />
      <Stack.Screen
        name="Evaluacion"
        component={EvaluacionScreen}
        options={backHeaderOptions}
      />
    </Stack.Navigator>
  );
}
