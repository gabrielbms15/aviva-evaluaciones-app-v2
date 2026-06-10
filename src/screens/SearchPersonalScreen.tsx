import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  FlatList,
  ActivityIndicator,
  Pressable,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '../../supabase';
import type { ColaboradoresParamList } from '../navigation/types';

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<ColaboradoresParamList, 'SearchPersonal'>;

interface PersonalItem {
  id: string;
  nombre_completo: string;
  cargo: string | null;
}

interface GrupoProfesional {
  id: string;
  nombre: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 5; // Celda 1 es siempre "Añadir Personal"

const formatName = (fullName: string) => {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/).map(part =>
    part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
  );
  if (parts.length >= 3) return [...parts.slice(2), ...parts.slice(0, 2)].join(' ');
  if (parts.length === 2) return `${parts[1]} ${parts[0]}`;
  return parts.join(' ');
};

// Nombre corto para la grid: "Nombre1 Apellido1"
const shortName = (formattedName: string) => {
  const parts = formattedName.trim().split(' ');
  if (parts.length >= 3) return `${parts[0]}\n${parts[2]}`;
  if (parts.length === 2) return `${parts[0]}\n${parts[1]}`;
  return parts[0] ?? formattedName;
};

const capitalize = (text: string | null) => {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

const normalizeText = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export default function SearchPersonalScreen({ route, navigation }: Props) {
  const { sedeId, sedeNombre, upssId, upssNombre } = route.params;

  // ── Datos ──
  const [fullPersonalList, setFullPersonalList] = useState<PersonalItem[]>([]);
  const [grupoProfesionalList, setGrupoProfesionalList] = useState<GrupoProfesional[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── UI ──
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(0);

  // ── Modal Añadir Personal ──
  const [modalVisible, setModalVisible] = useState(false);
  const [grupoPicker, setGrupoPicker] = useState(false); // sub-modal selector
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoCargo, setNuevoCargo] = useState('');
  const [selectedGrupo, setSelectedGrupo] = useState<GrupoProfesional | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // CARGA DE DATOS
  // ─────────────────────────────────────────────────────────────────────────

  const fetchPersonal = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase
        .from('personal_prevalencia')
        .select('id, nombre_completo, cargo')
        .eq('sede_id', sedeId)
        .eq('upss_id', upssId)
        .eq('activo', true)
        .order('nombre_completo', { ascending: true });

      if (error) throw error;
      setFullPersonalList(data ?? []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al obtener el personal');
    } finally {
      setLoading(false);
    }
  }, [sedeId, upssId]);

  useEffect(() => {
    fetchPersonal();
  }, [fetchPersonal]);

  useEffect(() => {
    // Cargar grupos profesionales (tabla pública, sin RLS)
    supabase
      .from('grupo_profesional')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => { if (data) setGrupoProfesionalList(data); });
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // BÚSQUEDA (filtrado local)
  // ─────────────────────────────────────────────────────────────────────────

  const filteredList = useMemo(() => {
    if (searchQuery.trim() === '') return [];
    const q = normalizeText(searchQuery.trim());
    return fullPersonalList.filter(p =>
      normalizeText(p.nombre_completo).includes(q)
    );
  }, [searchQuery, fullPersonalList]);

  const isSearching = searchQuery.trim() !== '';

  // ─────────────────────────────────────────────────────────────────────────
  // PAGINACIÓN (modo grid)
  // ─────────────────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(fullPersonalList.length / ITEMS_PER_PAGE));
  const pageItems = fullPersonalList.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);

  // Construir las 6 celdas: celda 0 = "Añadir Personal", celdas 1-5 = personal (o vacío)
  const gridCells: (PersonalItem | 'add' | 'empty')[] = [
    'add',
    ...pageItems,
    // rellenar con celdas vacías para mantener el layout 2×3
    ...(Array(ITEMS_PER_PAGE - pageItems.length).fill('empty') as 'empty'[]),
  ];

  // Filas de 2 columnas
  const gridRows: (PersonalItem | 'add' | 'empty')[][] = [];
  for (let i = 0; i < gridCells.length; i += 2) {
    gridRows.push([gridCells[i], gridCells[i + 1] ?? 'empty']);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AÑADIR PERSONAL
  // ─────────────────────────────────────────────────────────────────────────

  const resetModal = () => {
    setNuevoNombre('');
    setNuevoCargo('');
    setSelectedGrupo(null);
    setGrupoPicker(false);
  };

  const abrirModal = () => { resetModal(); setModalVisible(true); };
  const cerrarModal = () => { setModalVisible(false); resetModal(); };

  const guardarPersonal = async () => {
    if (!nuevoNombre.trim()) {
      Alert.alert('Campo requerido', 'Ingresa el nombre completo del personal.');
      return;
    }
    if (!selectedGrupo) {
      Alert.alert('Campo requerido', 'Selecciona el grupo profesional.');
      return;
    }

    setSubmitting(true);
    try {
      // TODO(auth): Cuando se active RLS, revisar que la política permita
      // insertar en personal_prevalencia. Por ahora opera con anon key.
      const { error } = await supabase
        .from('personal_prevalencia')
        .insert({
          sede_id: sedeId,
          upss_id: upssId,
          grupo_profesional_id: selectedGrupo.id,
          nombre_completo: nuevoNombre.trim().toUpperCase(),
          cargo: nuevoCargo.trim() || null,
          activo: true,
        });

      if (error) throw error;

      cerrarModal();
      setCurrentPage(0);
      await fetchPersonal(); // refrescar lista
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo agregar el personal.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: celda de la grid
  // ─────────────────────────────────────────────────────────────────────────

  const renderGridCell = (cell: PersonalItem | 'add' | 'empty', idx: number) => {
    if (cell === 'empty') {
      return <View key={`empty-${idx}`} style={styles.gridCellEmpty} />;
    }

    if (cell === 'add') {
      return (
        <Pressable
          key="add"
          style={({ pressed }) => [styles.gridCell, styles.gridCellAdd, pressed && styles.cellPressed]}
          onPress={abrirModal}
        >
          <Text style={styles.addIcon}>+</Text>
          <Text style={styles.addLabel}>Añadir{'\n'}Personal</Text>
        </Pressable>
      );
    }

    const formattedFull = formatName(cell.nombre_completo);
    return (
      <Pressable
        key={cell.id}
        style={({ pressed }) => [styles.gridCell, pressed && styles.cellPressed]}
        onPress={() =>
          navigation.navigate('Evaluacion', {
            personalId: cell.id,
            personalNombre: formattedFull,
            cargo: cell.cargo,
            upssNombre,
            sedeId,
            sedeNombre,
          })
        }
      >
        <Text style={styles.gridCellName} numberOfLines={3}>
          {shortName(formattedFull)}
        </Text>
        {cell.cargo ? (
          <Text style={styles.gridCellCargo} numberOfLines={2}>
            {capitalize(cell.cargo)}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: item de la lista de búsqueda
  // ─────────────────────────────────────────────────────────────────────────

  const renderListItem = ({ item }: { item: PersonalItem }) => (
    <Pressable
      style={({ pressed }) => [styles.listCard, pressed && styles.cellPressed]}
      onPress={() =>
        navigation.navigate('Evaluacion', {
          personalId: item.id,
          personalNombre: formatName(item.nombre_completo),
          cargo: item.cargo,
          upssNombre,
          sedeId,
          sedeNombre,
        })
      }
    >
      <Text style={styles.listCardName}>{formatName(item.nombre_completo)}</Text>
      {item.cargo ? <Text style={styles.listCardCargo}>{capitalize(item.cargo)}</Text> : null}
    </Pressable>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER PRINCIPAL
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.container}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.headerSubtitle}>{sedeNombre} · {upssNombre}</Text>
          <Text style={styles.headerTitle}>Personal</Text>
        </View>

        {/* ── Buscador ── */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nombre..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={text => { setSearchQuery(text); setCurrentPage(0); }}
            autoCapitalize="words"
            clearButtonMode="while-editing"
          />
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#10B981" style={{ marginTop: 40 }} />
        ) : errorMsg ? (
          <Text style={styles.errorText}>{errorMsg}</Text>
        ) : isSearching ? (
          /* ── Modo búsqueda: lista plana ── */
          <FlatList
            data={filteredList}
            keyExtractor={item => item.id}
            renderItem={renderListItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No se encontró personal para la búsqueda.</Text>
            }
          />
        ) : (
          /* ── Modo grid ── */
          <View style={styles.gridContainer}>
            {gridRows.map((row, rowIdx) => (
              <View key={rowIdx} style={styles.gridRow}>
                {row.map((cell, colIdx) => renderGridCell(cell, rowIdx * 2 + colIdx))}
              </View>
            ))}

            {/* ── Paginación ── */}
            {totalPages > 1 && (
              <View style={styles.paginacion}>
                <Pressable
                  style={[styles.pageBtn, currentPage === 0 && styles.pageBtnDisabled]}
                  onPress={() => setCurrentPage(p => p - 1)}
                  disabled={currentPage === 0}
                >
                  <Text style={styles.pageArrow}>‹</Text>
                </Pressable>
                <Text style={styles.pageLabel}>
                  {currentPage + 1} / {totalPages}
                </Text>
                <Pressable
                  style={[styles.pageBtn, currentPage === totalPages - 1 && styles.pageBtnDisabled]}
                  onPress={() => setCurrentPage(p => p + 1)}
                  disabled={currentPage === totalPages - 1}
                >
                  <Text style={styles.pageArrow}>›</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </View>

      {/* ══════════════════════════════════════════════════════════════
          MODAL: Añadir Personal
      ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={cerrarModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            {/* Header del modal */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Añadir Personal</Text>
              <Pressable onPress={cerrarModal} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              {/* Nombre completo */}
              <Text style={styles.fieldLabel}>Nombres y Apellidos *</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="Ej. PEREZ LOPEZ JUAN CARLOS"
                placeholderTextColor="#6B7280"
                value={nuevoNombre}
                onChangeText={setNuevoNombre}
                autoCapitalize="characters"
              />
              <Text style={styles.fieldHint}>Formato: APELLIDO1 APELLIDO2 NOMBRE1 NOMBRE2</Text>

              {/* Cargo */}
              <Text style={styles.fieldLabel}>Cargo</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="Ej. Enfermero(a) asistencial"
                placeholderTextColor="#6B7280"
                value={nuevoCargo}
                onChangeText={setNuevoCargo}
              />

              {/* Grupo profesional */}
              <Text style={styles.fieldLabel}>Grupo Profesional *</Text>
              <Pressable
                style={({ pressed }) => [styles.fieldSelector, pressed && { opacity: 0.7 }]}
                onPress={() => setGrupoPicker(true)}
              >
                <Text style={selectedGrupo ? styles.fieldSelectorValue : styles.fieldSelectorPlaceholder}>
                  {selectedGrupo ? selectedGrupo.nombre : 'Seleccionar grupo...'}
                </Text>
                <Text style={styles.fieldSelectorArrow}>›</Text>
              </Pressable>

              {/* Botones */}
              <View style={styles.modalBtnRow}>
                <Pressable
                  style={({ pressed }) => [styles.modalBtnSecondary, pressed && { opacity: 0.7 }]}
                  onPress={cerrarModal}
                >
                  <Text style={styles.modalBtnSecondaryText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.modalBtnPrimary, pressed && { opacity: 0.8 }, submitting && { opacity: 0.6 }]}
                  onPress={guardarPersonal}
                  disabled={submitting}
                >
                  {submitting
                    ? <ActivityIndicator color="#000" size="small" />
                    : <Text style={styles.modalBtnPrimaryText}>Guardar</Text>
                  }
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          MODAL: Selector de Grupo Profesional
      ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={grupoPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setGrupoPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setGrupoPicker(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Grupo Profesional</Text>
            <FlatList
              data={grupoProfesionalList}
              keyExtractor={g => g.id}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [
                    styles.pickerItem,
                    selectedGrupo?.id === item.id && styles.pickerItemSelected,
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => { setSelectedGrupo(item); setGrupoPicker(false); }}
                >
                  <Text style={[
                    styles.pickerItemText,
                    selectedGrupo?.id === item.id && styles.pickerItemTextSelected,
                  ]}>
                    {item.nombre}
                  </Text>
                  {selectedGrupo?.id === item.id && <Text style={styles.pickerCheck}>✓</Text>}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0F0F12' },
  container: { flex: 1 },

  header: { paddingTop: 16, paddingBottom: 8, paddingHorizontal: 24 },
  headerSubtitle: {
    fontSize: 12, fontWeight: '800', color: '#10B981',
    letterSpacing: 2, marginBottom: 6, textTransform: 'uppercase',
  },
  headerTitle: { fontSize: 28, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },

  searchContainer: { paddingHorizontal: 24, paddingBottom: 16 },
  searchInput: {
    backgroundColor: '#1C1C24', color: '#FFFFFF', borderRadius: 16,
    paddingHorizontal: 20, paddingVertical: 14, fontSize: 16,
    borderWidth: 1, borderColor: '#374151',
  },

  // ── Grid ──
  gridContainer: { flex: 1, paddingHorizontal: 16 },
  gridRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  gridCell: {
    flex: 1,
    backgroundColor: '#1C1C24',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2D2D38',
    padding: 16,
    minHeight: 110,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridCellEmpty: {
    flex: 1,
    minHeight: 110,
    backgroundColor: 'transparent',
  },
  gridCellAdd: {
    borderStyle: 'dashed',
    borderColor: '#10B981',
    backgroundColor: 'rgba(16,185,129,0.06)',
  },
  cellPressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  addIcon: { fontSize: 28, color: '#10B981', fontWeight: '300', marginBottom: 4 },
  addLabel: { fontSize: 13, color: '#10B981', fontWeight: '700', textAlign: 'center' },
  gridCellName: {
    fontSize: 15, fontWeight: '800', color: '#FFFFFF',
    textAlign: 'center', marginBottom: 4, lineHeight: 20,
  },
  gridCellCargo: {
    fontSize: 11, color: '#9CA3AF', textAlign: 'center', lineHeight: 15,
  },

  // ── Paginación ──
  paginacion: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 20, marginTop: 4, paddingBottom: 12,
  },
  pageBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#1C1C24', borderWidth: 1, borderColor: '#2D2D38',
    justifyContent: 'center', alignItems: 'center',
  },
  pageBtnDisabled: { opacity: 0.3 },
  pageArrow: { fontSize: 26, color: '#10B981', lineHeight: 30 },
  pageLabel: { color: '#9CA3AF', fontSize: 15, fontWeight: '600' },

  // ── Lista búsqueda ──
  listContent: { paddingHorizontal: 24, paddingBottom: 40, gap: 12 },
  listCard: {
    backgroundColor: '#1C1C24', padding: 18, borderRadius: 16,
    borderWidth: 1, borderColor: '#2D2D38',
  },
  listCardName: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', marginBottom: 2 },
  listCardCargo: { fontSize: 13, color: '#9CA3AF' },

  errorText: { color: '#EF4444', textAlign: 'center', marginTop: 20, paddingHorizontal: 24 },
  emptyText: { color: '#9CA3AF', textAlign: 'center', marginTop: 40, fontSize: 16 },

  // ── Modal Añadir Personal ──
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#151519', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderBottomWidth: 0, borderColor: '#2D2D38',
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingVertical: 20,
    borderBottomWidth: 1, borderBottomColor: '#2D2D38',
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  modalCloseBtn: { padding: 4 },
  modalCloseText: { fontSize: 18, color: '#6B7280' },
  modalBody: { padding: 24, gap: 4 },

  fieldLabel: { color: '#9CA3AF', fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  fieldInput: {
    backgroundColor: '#1C1C24', color: '#FFFFFF', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 15,
    borderWidth: 1, borderColor: '#374151',
  },
  fieldHint: { color: '#4B5563', fontSize: 11, marginTop: 4 },
  fieldSelector: {
    backgroundColor: '#1C1C24', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: '#374151', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  fieldSelectorPlaceholder: { color: '#6B7280', fontSize: 15 },
  fieldSelectorValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  fieldSelectorArrow: { color: '#10B981', fontSize: 20 },
  modalBtnRow: { flexDirection: 'row', gap: 12, marginTop: 28 },
  modalBtnSecondary: {
    flex: 1, borderWidth: 1, borderColor: '#374151',
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  modalBtnSecondaryText: { color: '#9CA3AF', fontWeight: '700', fontSize: 16 },
  modalBtnPrimary: {
    flex: 2, backgroundColor: '#10B981', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  modalBtnPrimaryText: { color: '#000', fontWeight: '800', fontSize: 16 },

  // ── Selector Grupo Profesional ──
  pickerSheet: {
    backgroundColor: '#151519', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderBottomWidth: 0, borderColor: '#2D2D38',
    maxHeight: '60%', paddingBottom: 24,
  },
  pickerTitle: {
    fontSize: 17, fontWeight: '800', color: '#FFFFFF',
    textAlign: 'center', paddingVertical: 18,
    borderBottomWidth: 1, borderBottomColor: '#2D2D38',
  },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#1C1C24',
  },
  pickerItemSelected: { backgroundColor: 'rgba(16,185,129,0.1)' },
  pickerItemText: { color: '#E5E7EB', fontSize: 16 },
  pickerItemTextSelected: { color: '#10B981', fontWeight: '700' },
  pickerCheck: { color: '#10B981', fontSize: 18, fontWeight: '700' },
});
