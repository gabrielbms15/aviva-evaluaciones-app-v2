import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import ScreenLayout from '../components/ScreenLayout';

interface Props {
  sedeNombre: string;
}

export default function AjustesScreen({ sedeNombre }: Props) {
  return (
    <ScreenLayout>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerSubtitle}>SEDE {sedeNombre}</Text>
          <Text style={styles.headerTitle}>Ajustes</Text>
        </View>
        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonIcon}>⚙️</Text>
          <Text style={styles.comingSoonTitle}>Próximamente</Text>
          <Text style={styles.comingSoonBody}>
            La configuración y ajustes de la aplicación estarán disponibles en una próxima versión.
          </Text>
        </View>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 16, paddingHorizontal: 24, paddingBottom: 16 },
  headerSubtitle: {
    fontSize: 12, fontWeight: '800', color: '#10B981',
    letterSpacing: 2, marginBottom: 6, textTransform: 'uppercase',
  },
  headerTitle: { fontSize: 28, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  comingSoon: {
    flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32,
  },
  comingSoonIcon: { fontSize: 52, marginBottom: 16 },
  comingSoonTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginBottom: 8 },
  comingSoonBody: {
    fontSize: 15, color: '#9CA3AF', textAlign: 'center', lineHeight: 22,
  },
});
