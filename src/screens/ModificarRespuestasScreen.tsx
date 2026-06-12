import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenLayout from '../components/ScreenLayout';
import { supabase } from '../../supabase';
import { colors } from '../theme/colors';

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

interface SetPreguntas {
  id: string;
  nombre: string;
  orden: number;
}

interface Pregunta {
  id: string;
  texto: string;
  orden: number;
  respuesta_esperada: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PANTALLA
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
}

export default function ModificarRespuestasScreen({ onBack }: Props) {
  const [sets, setSets] = useState<SetPreguntas[]>([]);
  const [selectedSetIdx, setSelectedSetIdx] = useState(0);
  const [preguntas, setPreguntas] = useState<Pregunta[]>([]);
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingPreguntas, setLoadingPreguntas] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // ─── Carga inicial: sets ────────────────────────────────────────────────
  useEffect(() => {
    const loadSets = async () => {
      setLoadingInit(true);
      const { data, error } = await supabase
        .from('set_preguntas')
        .select('id, nombre, orden')
        .eq('activo', true)
        .order('orden');

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        setSets((data ?? []) as SetPreguntas[]);
      }
      setLoadingInit(false);
    };
    loadSets();
  }, []);

  // ─── Carga preguntas al cambiar set ────────────────────────────────────
  const loadPreguntas = useCallback(async () => {
    const setId = sets[selectedSetIdx]?.id;
    if (!setId) return;

    setLoadingPreguntas(true);
    const { data, error } = await supabase
      .from('pregunta')
      .select('id, texto, orden, respuesta_esperada')
      .eq('set_id', setId)
      .eq('activa', true)
      .order('orden');

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      const ps = (data ?? []) as Pregunta[];
      setPreguntas(ps);
      // Inicializar el estado local con los valores actuales de BD
      const map: Record<string, string> = {};
      ps.forEach(p => { map[p.id] = p.respuesta_esperada ?? ''; });
      setRespuestas(map);
    }
    setLoadingPreguntas(false);
  }, [sets, selectedSetIdx]);

  useEffect(() => {
    loadPreguntas();
  }, [loadPreguntas]);

  // ─── Guardar cambios ────────────────────────────────────────────────────
  const guardar = async () => {
    setGuardando(true);
    try {
      // Solo actualizar preguntas que tienen valor (aunque sea string vacío)
      const updates = preguntas.map(p =>
        supabase
          .from('pregunta')
          .update({ respuesta_esperada: respuestas[p.id]?.trim() || null })
          .eq('id', p.id)
      );

      const results = await Promise.all(updates);
      const firstError = results.find(r => r.error);
      if (firstError?.error) throw firstError.error;

      Alert.alert('¡Listo!', 'Respuestas esperadas guardadas correctamente.');
    } catch (err: any) {
      Alert.alert('Error al guardar', err.message ?? 'Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  // ─── RENDER ──────────────────────────────────────────────────────────────

  if (loadingInit) {
    return (
      <ScreenLayout>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.verde1Aviva} />
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={16}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <Pressable onPress={onBack} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={colors.azulOscuroAviva} />
          </Pressable>
          <Text style={styles.title}>Modificar respuestas</Text>
        </View>

        {/* ── Selector de set ── */}
        <Pressable
          style={({ pressed }) => [styles.setSelector, pressed && { opacity: 0.7 }]}
          onPress={() =>
            Alert.alert(
              'Seleccionar set',
              undefined,
              [
                ...sets.map((s, idx) => ({
                  text: s.nombre,
                  onPress: () => setSelectedSetIdx(idx),
                  style: idx === selectedSetIdx ? 'destructive' as const : 'default' as const,
                })),
                { text: 'Cancelar', style: 'cancel' as const },
              ]
            )
          }
        >
          <View style={styles.setSelectorLeft}>
            <Ionicons name="list-outline" size={18} color={colors.azul1Aviva} />
            <Text style={styles.setSelectorText} numberOfLines={1}>
              {sets[selectedSetIdx]?.nombre ?? 'Seleccionar set'}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
        </Pressable>

        {/* ── Lista de preguntas ── */}
        {loadingPreguntas ? (
          <View style={styles.centered}>
            <ActivityIndicator size="small" color={colors.verde1Aviva} />
          </View>
        ) : (
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {preguntas.map((p, idx) => (
              <View key={p.id} style={styles.preguntaCard}>
                {/* Número + texto */}
                <View style={styles.preguntaHeaderRow}>
                  <View style={styles.numCircle}>
                    <Text style={styles.numText}>{idx + 1}</Text>
                  </View>
                  <Text style={styles.preguntaTexto}>{p.texto}</Text>
                </View>

                {/* Campo respuesta esperada */}
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Respuesta esperada</Text>
                  <TextInput
                    style={styles.textInput}
                    value={respuestas[p.id] ?? ''}
                    onChangeText={text =>
                      setRespuestas(prev => ({ ...prev, [p.id]: text }))
                    }
                    placeholder="Escribe la respuesta esperada…"
                    placeholderTextColor="#C4C4CC"
                    multiline
                    textAlignVertical="top"
                  />
                </View>
              </View>
            ))}

            <View style={styles.btnGuardarWrapper}>
              <Pressable
                style={({ pressed }) => [styles.btnGuardar, pressed && { opacity: 0.8 }, guardando && { opacity: 0.6 }]}
                onPress={guardar}
                disabled={guardando}
              >
                {guardando ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.btnGuardarText}>Guardar cambios</Text>
                  </>
                )}
              </Pressable>
            </View>

            <View style={{ height: 120 }} />
          </ScrollView>
        )}

      </KeyboardAvoidingView>
    </ScreenLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },

  // Set selector
  setSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  setSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  setSelectorText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    flex: 1,
  },

  // Lista
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 4 },

  // Pregunta card
  preguntaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  preguntaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 10,
  },
  numCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.azul1Aviva,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  preguntaTexto: { flex: 1, fontSize: 14, color: '#1F2937', lineHeight: 20 },

  // Input
  inputWrapper: {},
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.azul1AvivaLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: colors.backgroundAviva,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#1F2937',
    minHeight: 64,
    lineHeight: 20,
  },

  btnGuardarWrapper: {
    marginTop: 8,
    marginBottom: 8,
  },
  btnGuardar: {
    backgroundColor: colors.verde1Aviva,
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.verde1Aviva,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  btnGuardarText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
});
