import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  Pressable,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

interface SedeItem {
  id: string;
  nombre: string;
}

type Props = NativeStackScreenProps<RootStackParamList, 'Sedes'>;

const getSedeImage = (nombre: string) => {
  const normalizedName = nombre.toLowerCase().trim();
  
  if (normalizedName.includes('san martin') || normalizedName.includes('san martín')) {
    return require('../../assets/san-martin.webp');
  } else if (normalizedName.includes('lima centro')) {
    return require('../../assets/lima-centro.webp');
  } else if (normalizedName.includes('los olivos') || normalizedName.includes('los-olivos')) {
    return require('../../assets/los-olivos.webp');
  }
  
  return null;
};

export default function SedesScreen({ navigation }: Props) {
  const [sedeList, setSedeList] = useState<SedeItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchSedes = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      const { data, error } = await supabase
        .from('sede')
        .select('id, nombre')
        .order('nombre', { ascending: true });

      if (error) {
        throw error;
      }

      if (data) {
        setSedeList(data);
      }
    } catch (err: any) {
      console.error('Error fetching Sedes:', err);
      setErrorMsg(err.message || 'Error desconocido al conectar con Supabase.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSedes();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerSubtitle}>AVIVA PREVALENCIAS</Text>
          <Text style={styles.headerTitle}>Selecciona una Sede</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color="#10B981" />
              <Text style={styles.loadingText}>Cargando sedes...</Text>
            </View>
          ) : errorMsg ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorTitle}>¡Ups! Algo salió mal</Text>
              <Text style={styles.errorText}>{errorMsg}</Text>
              <Pressable style={styles.retryButton} onPress={fetchSedes}>
                <Text style={styles.retryButtonText}>Reintentar</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.listContainer}>
              {sedeList
                .filter((item) => getSedeImage(item.nombre) !== null)
                .map((item) => {
                  const imageSource = getSedeImage(item.nombre);
                  return (
                    <Pressable 
                      key={item.id} 
                      style={({ pressed }) => [
                        styles.cardWrapper,
                        pressed && styles.cardPressed
                      ]}
                    onPress={() => navigation.navigate('SedeTabs', { sedeId: item.id, sedeNombre: item.nombre })}
                    >
                      <ImageBackground 
                        source={imageSource!} 
                        style={styles.cardImage}
                        imageStyle={styles.cardImageStyle}
                      >
                        <View style={styles.overlay}>
                          <Text style={styles.cardTitle}>{item.nombre}</Text>
                        </View>
                      </ImageBackground>
                    </Pressable>
                  );
                })}
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F0F12',
  },
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 32,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 2,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    flexGrow: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#9CA3AF',
    fontSize: 16,
    fontWeight: '500',
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    alignItems: 'center',
    marginTop: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#EF4444',
    marginBottom: 12,
  },
  errorText: {
    fontSize: 15,
    color: '#E5E7EB',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: '#EF4444',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  listContainer: {
    gap: 24,
  },
  cardWrapper: {
    borderRadius: 24,
    overflow: 'hidden',
    height: 220,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 15,
    elevation: 10,
    backgroundColor: '#1C1C24',
  },
  cardPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  cardImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'flex-end',
  },
  cardImageStyle: {
    borderRadius: 24,
  },
  overlay: {
    padding: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  cardTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
});
