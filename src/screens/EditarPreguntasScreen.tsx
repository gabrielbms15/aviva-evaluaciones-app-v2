import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
  activa: boolean;
}

interface Props {
  onBack: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// PANTALLA
// ─────────────────────────────────────────────────────────────────────────────

export default function EditarPreguntasScreen({ onBack }: Props) {
  const [sets, setSets] = useState<SetPreguntas[]>([]);
  const [selectedSetIdx, setSelectedSetIdx] = useState(0);

  // Preguntas activas e inactivas del set seleccionado
  const [preguntas, setPreguntas] = useState<Pregunta[]>([]);
  const [preguntasEliminadas, setPreguntasEliminadas] = useState<Pregunta[]>([]);

  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingPreguntas, setLoadingPreguntas] = useState(false);
  const [operando, setOperando] = useState(false); // añadir / desactivar / reactivar

  // Bottom-sheet selector de set
  const [pickerVisible, setPickerVisible] = useState(false);

  // Modo: 'activas' | 'eliminadas'
  const [modo, setModo] = useState<'activas' | 'eliminadas'>('activas');

  // Modal añadir pregunta
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [nuevaTextoPregunta, setNuevaTextoPregunta] = useState('');

  // ─── Carga inicial: sets ──────────────────────────────────────────────────
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

  // ─── Carga preguntas al cambiar set o modo ────────────────────────────────
  const loadPreguntas = useCallback(async () => {
    const setId = sets[selectedSetIdx]?.id;
    if (!setId) return;

    setLoadingPreguntas(true);

    const { data: activas, error: errActivas } = await supabase
      .from('pregunta')
      .select('id, texto, orden, activa')
      .eq('set_id', setId)
      .eq('activa', true)
      .order('orden');

    const { data: inactivas, error: errInactivas } = await supabase
      .from('pregunta')
      .select('id, texto, orden, activa')
      .eq('set_id', setId)
      .eq('activa', false)
      .order('orden');

    if (errActivas) Alert.alert('Error', errActivas.message);
    else setPreguntas((activas ?? []) as Pregunta[]);

    if (errInactivas) Alert.alert('Error', errInactivas.message);
    else setPreguntasEliminadas((inactivas ?? []) as Pregunta[]);

    setLoadingPreguntas(false);
  }, [sets, selectedSetIdx]);

  useEffect(() => {
    loadPreguntas();
  }, [loadPreguntas]);

  // ─── Eliminar pregunta (activa → false) ───────────────────────────────────
  const eliminarPregunta = (pregunta: Pregunta) => {
    Alert.alert(
      'Eliminar pregunta',
      `¿Deseas desactivar la siguiente pregunta?\n\n"${pregunta.texto}"`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setOperando(true);
            const { error } = await supabase
              .from('pregunta')
              .update({ activa: false })
              .eq('id', pregunta.id);
            setOperando(false);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              await loadPreguntas();
            }
          },
        },
      ]
    );
  };

  // ─── Reactivar pregunta (false → true) ───────────────────────────────────
  const reactivarPregunta = async (pregunta: Pregunta) => {
    setOperando(true);
    const { error } = await supabase
      .from('pregunta')
      .update({ activa: true })
      .eq('id', pregunta.id);
    setOperando(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      await loadPreguntas();
    }
  };

  // ─── Añadir nueva pregunta ─────────────────────────────────────────────────
  const añadirPregunta = async () => {
    const texto = nuevaTextoPregunta.trim();
    if (!texto) {
      Alert.alert('Campo requerido', 'Ingresa el texto de la pregunta.');
      return;
    }

    const setId = sets[selectedSetIdx]?.id;
    if (!setId) return;

    // El orden sigue al mayor existente (activas + inactivas)
    const todosOrdenes = [...preguntas, ...preguntasEliminadas].map(p => p.orden);
    const maxOrden = todosOrdenes.length > 0 ? Math.max(...todosOrdenes) : 0;

    setOperando(true);
    const { error } = await supabase.from('pregunta').insert({
      set_id: setId,
      texto,
      orden: maxOrden + 1,
      activa: true,
    });
    setOperando(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setNuevaTextoPregunta('');
      setAddModalVisible(false);
      await loadPreguntas();
    }
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────

  if (loadingInit) {
    return (
      <ScreenLayout>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.verde1Aviva} />
        </View>
      </ScreenLayout>
    );
  }

  const listaActual = modo === 'activas' ? preguntas : preguntasEliminadas;

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
          <Text style={styles.title}>Editar preguntas</Text>

          {/* Botón añadir (solo en modo activas) */}
          {modo === 'activas' && (
            <Pressable
              style={styles.addBtn}
              onPress={() => { setNuevaTextoPregunta(''); setAddModalVisible(true); }}
              hitSlop={8}
            >
              <Ionicons name="add-circle" size={28} color={colors.verde1Aviva} />
            </Pressable>
          )}
        </View>

        {/* ── Selector de set ── */}
        <Pressable
          style={({ pressed }) => [styles.setSelector, pressed && { opacity: 0.7 }]}
          onPress={() => setPickerVisible(true)}
        >
          <View style={styles.setSelectorLeft}>
            <Ionicons name="list-outline" size={18} color={colors.azul1Aviva} />
            <Text style={styles.setSelectorText} numberOfLines={1}>
              {sets[selectedSetIdx]?.nombre ?? 'Seleccionar set'}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
        </Pressable>

        {/* ── Tabs: Activas / Eliminadas ── */}
        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tab, modo === 'activas' && styles.tabActive]}
            onPress={() => setModo('activas')}
          >
            <Text style={[styles.tabText, modo === 'activas' && styles.tabTextActive]}>
              Activas ({preguntas.length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, modo === 'eliminadas' && styles.tabActive]}
            onPress={() => setModo('eliminadas')}
          >
            <Ionicons
              name="eye-off-outline"
              size={14}
              color={modo === 'eliminadas' ? colors.verde1Aviva : '#9CA3AF'}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.tabText, modo === 'eliminadas' && styles.tabTextActive]}>
              Eliminadas ({preguntasEliminadas.length})
            </Text>
          </Pressable>
        </View>

        {/* ── Lista ── */}
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
            {listaActual.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons
                  name={modo === 'activas' ? 'document-text-outline' : 'eye-off-outline'}
                  size={40}
                  color="#D1D5DB"
                />
                <Text style={styles.emptyText}>
                  {modo === 'activas'
                    ? 'No hay preguntas activas en este set.'
                    : 'No hay preguntas eliminadas en este set.'}
                </Text>
              </View>
            ) : (
              listaActual.map((p, idx) => (
                <View key={p.id} style={[styles.preguntaCard, modo === 'eliminadas' && styles.preguntaCardEliminada]}>
                  <View style={styles.preguntaHeaderRow}>
                    <View style={[styles.numCircle, modo === 'eliminadas' && styles.numCircleEliminada]}>
                      <Text style={styles.numText}>{idx + 1}</Text>
                    </View>
                    <Text style={[styles.preguntaTexto, modo === 'eliminadas' && styles.preguntaTextoEliminada]}>
                      {p.texto}
                    </Text>
                  </View>

                  <View style={styles.preguntaActions}>
                    {modo === 'activas' ? (
                      <Pressable
                        style={({ pressed }) => [styles.btnEliminar, pressed && { opacity: 0.7 }, operando && { opacity: 0.5 }]}
                        onPress={() => eliminarPregunta(p)}
                        disabled={operando}
                      >
                        <Ionicons name="trash-outline" size={15} color="#EF4444" />
                        <Text style={styles.btnEliminarText}>Eliminar</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        style={({ pressed }) => [styles.btnReactivar, pressed && { opacity: 0.7 }, operando && { opacity: 0.5 }]}
                        onPress={() => reactivarPregunta(p)}
                        disabled={operando}
                      >
                        <Ionicons name="refresh-outline" size={15} color={colors.verde1Aviva} />
                        <Text style={styles.btnReactivarText}>Restaurar</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))
            )}

            <View style={{ height: 120 }} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      {/* ══ Bottom-sheet: Selector de set ══ */}
      <Modal
        visible={pickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerVisible(false)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setPickerVisible(false)}>
          <Pressable style={styles.pickerSheet} onPress={() => {}}>
            <Text style={styles.pickerTitle}>Seleccionar set</Text>
            <ScrollView showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
              {sets.map((s, idx) => (
                <Pressable
                  key={s.id}
                  style={[styles.pickerItem, idx === selectedSetIdx && styles.pickerItemSelected]}
                  onPress={() => {
                    setSelectedSetIdx(idx);
                    setPickerVisible(false);
                  }}
                >
                  <Text style={[styles.pickerItemText, idx === selectedSetIdx && styles.pickerItemTextSelected]}>
                    {s.nombre}
                  </Text>
                  {idx === selectedSetIdx && (
                    <Text style={styles.pickerCheck}>✓</Text>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ══ Modal: Añadir pregunta ══ */}
      <Modal
        visible={addModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setAddModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.pickerOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.pickerOverlay} onPress={() => setAddModalVisible(false)}>
            <Pressable style={styles.addSheet} onPress={() => {}}>
              {/* Header del modal */}
              <View style={styles.addSheetHeader}>
                <Text style={styles.addSheetTitle}>Nueva pregunta</Text>
                <Pressable onPress={() => setAddModalVisible(false)} hitSlop={8}>
                  <Ionicons name="close" size={22} color="#6B7280" />
                </Pressable>
              </View>

              <Text style={styles.addSheetLabel}>
                Set: <Text style={{ color: colors.azul1Aviva, fontWeight: '700' }}>{sets[selectedSetIdx]?.nombre}</Text>
              </Text>

              <Text style={styles.addFieldLabel}>Texto de la pregunta *</Text>
              <TextInput
                style={styles.addTextInput}
                value={nuevaTextoPregunta}
                onChangeText={setNuevaTextoPregunta}
                placeholder="Escribe el texto de la pregunta…"
                placeholderTextColor="#C4C4CC"
                multiline
                textAlignVertical="top"
                autoFocus
              />

              <Text style={styles.addHint}>
                Se añadirá como pregunta {[...preguntas, ...preguntasEliminadas].length > 0
                  ? `#${Math.max(...[...preguntas, ...preguntasEliminadas].map(p => p.orden)) + 1}`
                  : '#1'} del set.
              </Text>

              <View style={styles.addBtnRow}>
                <Pressable
                  style={({ pressed }) => [styles.addBtnSecondary, pressed && { opacity: 0.7 }]}
                  onPress={() => setAddModalVisible(false)}
                >
                  <Text style={styles.addBtnSecondaryText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.addBtnPrimary,
                    pressed && { opacity: 0.8 },
                    operando && { opacity: 0.6 },
                  ]}
                  onPress={añadirPregunta}
                  disabled={operando}
                >
                  {operando
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.addBtnPrimaryText}>Añadir</Text>
                  }
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

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
    flex: 1,
  },
  addBtn: {
    padding: 2,
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

  // Tabs
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 9,
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  tabTextActive: {
    color: colors.verde1Aviva,
    fontWeight: '700',
  },

  // Lista
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 4 },

  emptyContainer: {
    alignItems: 'center',
    paddingTop: 48,
    gap: 12,
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
  },

  // Pregunta card
  preguntaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  preguntaCardEliminada: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    shadowOpacity: 0,
    elevation: 0,
  },
  preguntaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  numCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.azul1Aviva,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  numCircleEliminada: {
    backgroundColor: '#EF4444',
  },
  numText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  preguntaTexto: { flex: 1, fontSize: 14, color: '#1F2937', lineHeight: 20 },
  preguntaTextoEliminada: { color: '#9CA3AF' },

  // Acciones de la card
  preguntaActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  btnEliminar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  btnEliminarText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '700',
  },
  btnReactivar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(93, 202, 165, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(93, 202, 165, 0.4)',
  },
  btnReactivarText: {
    color: colors.verde1Aviva,
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Picker bottom-sheet ──
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#E5E7EB',
    maxHeight: '60%',
    paddingBottom: 24,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1F2937',
    textAlign: 'center',
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pickerItemSelected: { backgroundColor: 'rgba(93, 202, 165, 0.1)' },
  pickerItemText: { color: '#374151', fontSize: 16 },
  pickerItemTextSelected: { color: colors.verde1Aviva, fontWeight: '700' },
  pickerCheck: { color: colors.verde1Aviva, fontSize: 18, fontWeight: '700' },

  // ── Modal añadir pregunta ──
  addSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#E5E7EB',
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  addSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    marginBottom: 16,
  },
  addSheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1F2937',
  },
  addSheetLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 16,
  },
  addFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.azul1AvivaLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  addTextInput: {
    backgroundColor: colors.backgroundAviva,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#1F2937',
    minHeight: 100,
    lineHeight: 22,
  },
  addHint: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 6,
    marginBottom: 20,
  },
  addBtnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  addBtnSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addBtnSecondaryText: { color: '#4B5563', fontWeight: '700', fontSize: 15 },
  addBtnPrimary: {
    flex: 2,
    backgroundColor: colors.verde1Aviva,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: colors.verde1Aviva,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  addBtnPrimaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});
