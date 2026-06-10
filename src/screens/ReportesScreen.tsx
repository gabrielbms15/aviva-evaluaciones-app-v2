import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

interface Props {
  sedeNombre: string;
}

export default function ReportesScreen({ sedeNombre }: Props) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerSubtitle}>SEDE {sedeNombre}</Text>
          <Text style={styles.headerTitle}>Reportes</Text>
        </View>
        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonIcon}>📊</Text>
          <Text style={styles.comingSoonTitle}>Próximamente</Text>
          <Text style={styles.comingSoonBody}>
            Los reportes y análisis de prevalencias estarán disponibles en una próxima versión.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0F0F12' },
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
