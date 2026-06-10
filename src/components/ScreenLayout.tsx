import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../theme/colors';

interface ScreenLayoutProps {
  children: React.ReactNode;
}

export default function ScreenLayout({ children }: ScreenLayoutProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />

      {/* Header global azul1-aviva */}
      <View style={styles.header}>
        <Image
          source={require('../../assets/logo.webp')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      {/* Wrapper con color azul1Aviva para que los bordes redondeados muestren azul */}
      <View style={styles.bodyWrapper}>
        <View style={styles.body}>
          {children}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.azul1Aviva,
  },
  header: {
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.azul1Aviva,
    paddingBottom: 10,
  },
  logo: {
    height: 60,
    width: 210,
  },
  bodyWrapper: {
    flex: 1,
    backgroundColor: colors.azul1Aviva, // Fondo azul para las esquinas
  },
  body: {
    flex: 1,
    backgroundColor: colors.backgroundAviva, // Fondo claro definido
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
  }
});
