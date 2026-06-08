import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { supabase } from './supabase';

interface UpssItem {
  id: string;
  nombre: string;
  orden: number;
  activa: boolean;
}

export default function App() {
  const [upssList, setUpssList] = useState<UpssItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [status, setStatus] = useState<'connecting' | 'success' | 'failed'>('connecting');

  const fetchUpss = async () => {
    try {
      setLoading(true);
      setStatus('connecting');
      setErrorMsg(null);

      const { data, error } = await supabase
        .from('upss')
        .select('id, nombre, orden, activa')
        .order('orden', { ascending: true });

      if (error) {
        throw error;
      }

      if (data) {
        setUpssList(data);
        setStatus('success');
      }
    } catch (err: any) {
      console.error('Error fetching UPSS:', err);
      setErrorMsg(err.message || 'Error desconocido al conectar con Supabase.');
      setStatus('failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUpss();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerSubtitle}>AVIVA PREVALENCIAS</Text>
          <Text style={styles.headerTitle}>Verificación de Conexión</Text>
          
          {/* Connection Badge */}
          <View style={[
            styles.badge, 
            status === 'success' ? styles.badgeSuccess : 
            status === 'failed' ? styles.badgeFailed : styles.badgeConnecting
          ]}>
            <View style={[
              styles.dot, 
              status === 'success' ? styles.dotSuccess : 
              status === 'failed' ? styles.dotFailed : styles.dotConnecting
            ]} />
            <Text style={[
              styles.badgeText,
              status === 'success' ? styles.badgeTextSuccess : 
              status === 'failed' ? styles.badgeTextFailed : styles.badgeTextConnecting
            ]}>
              {status === 'success' ? 'Conectado a Supabase' : 
               status === 'failed' ? 'Error de Conexión' : 'Conectando...'}
            </Text>
          </View>
        </View>

        {/* Content */}
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color="#10B981" />
              <Text style={styles.loadingText}>Obteniendo catálogo de UPSS...</Text>
            </View>
          ) : errorMsg ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorTitle}>¡Ups! Algo salió mal</Text>
              <Text style={styles.errorText}>{errorMsg}</Text>
              <Pressable style={styles.retryButton} onPress={fetchUpss}>
                <Text style={styles.retryButtonText}>Reintentar Conexión</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.listContainer}>
              <Text style={styles.sectionTitle}>
                Tabla `upss` ({upssList.length} registros)
              </Text>
              
              {upssList.map((item) => (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.orderBadge}>
                      <Text style={styles.orderText}>#{item.orden}</Text>
                    </View>
                    <View style={[
                      styles.statusIndicator, 
                      item.activa ? styles.statusActive : styles.statusInactive
                    ]}>
                      <Text style={styles.statusText}>
                        {item.activa ? 'ACTIVA' : 'INACTIVA'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardTitle}>{item.nombre}</Text>
                  <Text style={styles.cardId}>ID: {item.id}</Text>
                </View>
              ))}
              
              <Pressable style={styles.refreshButton} onPress={fetchUpss}>
                <Text style={styles.refreshButtonText}>Actualizar Datos</Text>
              </Pressable>
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
    backgroundColor: '#0F0F12', // Obsidian background
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F27',
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#3B82F6', // Sleek blue tint
    letterSpacing: 2,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  badgeConnecting: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  badgeSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  badgeFailed: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  dotConnecting: {
    backgroundColor: '#F59E0B',
  },
  dotSuccess: {
    backgroundColor: '#10B981',
  },
  dotFailed: {
    backgroundColor: '#EF4444',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  badgeTextConnecting: {
    color: '#F59E0B',
  },
  badgeTextSuccess: {
    color: '#10B981',
  },
  badgeTextFailed: {
    color: '#EF4444',
  },
  scrollContent: {
    paddingVertical: 20,
    flexGrow: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 16,
    color: '#9CA3AF',
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#EF4444',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#D1D5DB',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  listContainer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#16161D', // Card dark grey
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#24242F',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderBadge: {
    backgroundColor: '#1F2937',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  orderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  statusIndicator: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  statusActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  statusInactive: {
    backgroundColor: 'rgba(107, 114, 128, 0.1)',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#10B981',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  cardId: {
    fontSize: 11,
    color: '#6B7280',
    fontFamily: 'System',
  },
  refreshButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
