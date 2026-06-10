import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';

import ColaboradoresStack from './ColaboradoresStack';
import EvaluadosScreen from '../screens/EvaluadosScreen';
import ReportesScreen from '../screens/ReportesScreen';
import AjustesScreen from '../screens/AjustesScreen';

// ─────────────────────────────────────────────────────────────────────────────

const Tab = createBottomTabNavigator();

type Props = NativeStackScreenProps<RootStackParamList, 'SedeTabs'>;

// ─────────────────────────────────────────────────────────────────────────────
// Wrappers para pasar sedeId/sedeNombre a cada pantalla del tab
// sin perder la firma de componente que espera React Navigation.
// ─────────────────────────────────────────────────────────────────────────────

const makeEvaluados = (sedeId: string, sedeNombre: string) =>
  function EvaluadosTab({ navigation }: any) {
    const handleNavigateToEvaluacion = (params: any) => {
      // Navegación cross-tab: desde Evaluados hasta Evaluacion dentro de Colaboradores
      navigation.navigate('Colaboradores', {
        screen: 'Evaluacion',
        params,
      });
    };
    return (
      <EvaluadosScreen
        sedeId={sedeId}
        sedeNombre={sedeNombre}
        onNavigateToEvaluacion={handleNavigateToEvaluacion}
      />
    );
  };

const makeReportes = (sedeNombre: string) =>
  function ReportesTab() {
    return <ReportesScreen sedeNombre={sedeNombre} />;
  };

const makeAjustes = (sedeNombre: string) =>
  function AjustesTab() {
    return <AjustesScreen sedeNombre={sedeNombre} />;
  };

const makeColaboradores = (sedeId: string, sedeNombre: string) =>
  function ColaboradoresTab() {
    return <ColaboradoresStack sedeId={sedeId} sedeNombre={sedeNombre} />;
  };

// ─────────────────────────────────────────────────────────────────────────────

export default function SedeTabs({ route }: Props) {
  const { sedeId, sedeNombre } = route.params;

  // Creamos los componentes wrapper una sola vez (evita re-montajes en cada render)
  const EvaluadosTab = React.useMemo(
    () => makeEvaluados(sedeId, sedeNombre),
    [sedeId, sedeNombre]
  );
  const ColaboradoresTab = React.useMemo(
    () => makeColaboradores(sedeId, sedeNombre),
    [sedeId, sedeNombre]
  );
  const ReportesTab = React.useMemo(
    () => makeReportes(sedeNombre),
    [sedeNombre]
  );
  const AjustesTab = React.useMemo(
    () => makeAjustes(sedeNombre),
    [sedeNombre]
  );

  return (
    <Tab.Navigator
      initialRouteName="Colaboradores"
      screenOptions={({ route: tabRoute }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#10B981',
        tabBarInactiveTintColor: '#4B5563',
        tabBarStyle: {
          backgroundColor: '#0D0D10',
          borderTopColor: '#1E1E28',
          borderTopWidth: 1,
          height: 72,
          paddingBottom: 12,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'ellipse-outline';

          if (tabRoute.name === 'Evaluados') {
            iconName = focused ? 'clipboard' : 'clipboard-outline';
          } else if (tabRoute.name === 'Colaboradores') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (tabRoute.name === 'Reportes') {
            iconName = focused ? 'bar-chart' : 'bar-chart-outline';
          } else if (tabRoute.name === 'Ajustes') {
            iconName = focused ? 'settings' : 'settings-outline';
          }

          return <Ionicons name={iconName} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Colaboradores" component={ColaboradoresTab} />
      <Tab.Screen name="Evaluados" component={EvaluadosTab} />
      <Tab.Screen name="Reportes" component={ReportesTab} />
      <Tab.Screen name="Ajustes" component={AjustesTab} />
    </Tab.Navigator>
  );
}
