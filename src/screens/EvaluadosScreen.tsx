import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../../supabase';
import type { ColaboradoresParamList } from '../navigation/types';

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

type EvaluacionParams = ColaboradoresParamList['Evaluacion'];

interface Props {
  sedeId: string;
  sedeNombre: string;
  /** Callback para navegar a EvaluacionScreen en el tab Colaboradores */
  onNavigateToEvaluacion: (params: EvaluacionParams) => void;
}

interface PersonalEvaluado {
  evaluacion_id: string;
  personal_id: string;
  nombre_completo: string;
  cargo: string | null;
  upss_nombre: string;
  sets_pendientes: number;
  total_sets: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const formatName = (fullName: string) => {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/).map(p =>
    p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
  );
  if (parts.length >= 3) return [...parts.slice(2), ...parts.slice(0, 2)].join(' ');
  if (parts.length === 2) return `${parts[1]} ${parts[0]}`;
  return parts.join(' ');
};

const capitalize = (text: string | null) => {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE
// ─────────────────────────────────────────────────────────────────────────────

export default function EvaluadosScreen({ sedeId, sedeNombre, onNavigateToEvaluacion }: Props) {
  const [evaluados, setEvaluados] = useState<PersonalEvaluado[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [procesoNombre, setProcesoNombre] = useState<string | null>(null);

  const fetchEvaluados = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      // Paso 1: Buscar proceso activo de la sede
      const { data: procesos, error: errP } = await supabase
        .from('proceso_prevalencia')
        .select('id, nombre')
        .eq('sede_id', sedeId)
        .eq('estado', 'activo')
        .limit(1);

      if (errP) throw errP;

      if (!procesos || procesos.length === 0) {
        setErrorMsg('No hay un proceso de evaluación activo para esta sede.');
        setLoading(false);
        return;
      }

      const proceso = procesos[0];
      setProcesoNombre(proceso.nombre);

      // Paso 2: Obtener el personal evaluado con datos de personal, upss y estados de sets
      const { data, error } = await supabase
        .from('evaluacion_personal')
        .select(`
          id,
          personal:personal_id(
            id,
            nombre_completo,
            cargo,
            upss:upss_id(nombre)
          ),
          evaluacion_set(estado)
        `)
        .eq('proceso_id', proceso.id)
        .order('id');

      if (error) throw error;

      const mapped: PersonalEvaluado[] = (data ?? []).map((row: any) => {
        const sets: { estado: string }[] = row.evaluacion_set ?? [];
        return {
          evaluacion_id: row.id,
          personal_id: row.personal?.id ?? '',
          nombre_completo: row.personal?.nombre_completo ?? '',
          cargo: row.personal?.cargo ?? null,
          upss_nombre: row.personal?.upss?.nombre ?? '—',
          sets_pendientes: sets.filter(s => s.estado === 'pendiente').length,
          total_sets: sets.length,
        };
      });

      setEvaluados(mapped);
    } catch (err: any) {
      console.error('Error fetching evaluados:', err);
      setErrorMsg(err.message || 'Error al obtener el personal evaluado.');
    } finally {
      setLoading(false);
    }
  }, [sedeId]);

  useEffect(() => {
    fetchEvaluados();
  }, [fetchEvaluados]);

  const handleCardPress = (item: PersonalEvaluado) => {
    onNavigateToEvaluacion({
      personalId: item.personal_id,
      personalNombre: formatName(item.nombre_completo),
      cargo: item.cargo,
      upssNombre: item.upss_nombre,
      sedeId,
      sedeNombre,
    });
  };

  const renderItem = ({ item, index }: { item: PersonalEvaluado; index: number }) => {
    const completo = item.sets_pendientes === 0 && item.total_sets > 0;
    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => handleCardPress(item)}
      >
        <View style={styles.cardLeft}>
          <View style={styles.indexBadge}>
            <Text style={styles.indexText}>{index + 1}</Text>
          </View>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardName}>{formatName(item.nombre_completo)}</Text>
          {item.cargo ? (
            <Text style={styles.cardCargo}>{capitalize(item.cargo)}</Text>
          ) : null}
          <View style={styles.badgeRow}>
            <View style={styles.upssBadge}>
              <Text style={styles.upssBadgeText}>{item.upss_nombre}</Text>
            </View>
            {item.total_sets > 0 && (
              <View style={[styles.setsBadge, completo ? styles.setsBadgeCompleto : styles.setsBadgePendiente]}>
                <Text style={[styles.setsBadgeText, completo ? styles.setsBadgeTextCompleto : styles.setsBadgeTextPendiente]}>
                  {completo
                    ? `✓ Completo`
                    : `${item.sets_pendientes}/${item.total_sets} pendientes`
                  }
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.cardRight}>
          <Text style={[styles.chevron, !completo && styles.chevronPendiente]}>›</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerSubtitle}>SEDE {sedeNombre}</Text>
          <Text style={styles.headerTitle}>Evaluados</Text>
          {procesoNombre ? (
            <Text style={styles.procesoLabel}>{procesoNombre}</Text>
          ) : null}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#10B981" style={{ marginTop: 40 }} />
        ) : errorMsg ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>Sin proceso activo</Text>
            <Text style={styles.emptyBody}>{errorMsg}</Text>
          </View>
        ) : evaluados.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>Sin evaluaciones aún</Text>
            <Text style={styles.emptyBody}>
              Aún no se ha evaluado a ningún colaborador en el proceso activo.
            </Text>
          </View>
        ) : (
          <FlatList
            data={evaluados}
            keyExtractor={item => item.evaluacion_id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View style={styles.countRow}>
                <Text style={styles.countText}>
                  {evaluados.length} {evaluados.length === 1 ? 'persona evaluada' : 'personas evaluadas'}
                </Text>
                <Pressable onPress={fetchEvaluados} style={styles.refreshBtn}>
                  <Text style={styles.refreshText}>↻ Actualizar</Text>
                </Pressable>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0F0F12' },
  container: { flex: 1 },
  header: { paddingTop: 16, paddingHorizontal: 24, paddingBottom: 16 },
  headerSubtitle: {
    fontSize: 12, fontWeight: '800', color: '#10B981',
    letterSpacing: 2, marginBottom: 6, textTransform: 'uppercase',
  },
  headerTitle: { fontSize: 28, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  procesoLabel: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  listContent: { paddingHorizontal: 24, paddingBottom: 40, gap: 12 },
  countRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  },
  countText: { color: '#6B7280', fontSize: 13 },
  refreshBtn: { padding: 4 },
  refreshText: { color: '#10B981', fontSize: 13, fontWeight: '600' },

  card: {
    backgroundColor: '#1C1C24', borderRadius: 16, borderWidth: 1, borderColor: '#2D2D38',
    flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12,
  },
  cardPressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  cardLeft: {},
  cardBody: { flex: 1 },
  cardRight: { justifyContent: 'center' },

  indexBadge: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#12121A', borderWidth: 1, borderColor: '#374151',
    justifyContent: 'center', alignItems: 'center',
  },
  indexText: { color: '#6B7280', fontSize: 13, fontWeight: '700' },

  cardName: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', marginBottom: 2 },
  cardCargo: { fontSize: 13, color: '#9CA3AF', marginBottom: 8 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  upssBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)',
  },
  upssBadgeText: { color: '#10B981', fontSize: 11, fontWeight: '700' },

  setsBadge: {
    alignSelf: 'flex-start', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1,
  },
  setsBadgeCompleto: {
    backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)',
  },
  setsBadgePendiente: {
    backgroundColor: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.3)',
  },
  setsBadgeText: { fontSize: 11, fontWeight: '700' },
  setsBadgeTextCompleto: { color: '#10B981' },
  setsBadgeTextPendiente: { color: '#F59E0B' },

  chevron: { fontSize: 26, color: '#4B5563', lineHeight: 30 },
  chevronPendiente: { color: '#F59E0B' },

  emptyContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32,
  },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', marginBottom: 8 },
  emptyBody: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 20 },
});
