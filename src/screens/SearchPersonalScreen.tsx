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
import ScreenLayout from '../components/ScreenLayout';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
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

// ─── Pipeline de nombres ────────────────────────────────────────────────────

/**
 * Agrupa tokens considerando prefijos compuestos tipo "de".
 *   ["DE","LA","VEGA"]   → ["DE LA VEGA"]   (de + ≤3 letras + ≥4 letras)
 *   ["DE","VILLA"]       → ["DE VILLA"]     (de + ≥4 letras)
 *   ["PEREZ"]            → ["PEREZ"]
 */
const groupTokens = (tokens: string[]): string[] => {
  const segments: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.toLowerCase() === 'de' && i + 1 < tokens.length) {
      const next = tokens[i + 1];
      if (next.length <= 3 && i + 2 < tokens.length) {
        // "de" + prefijo corto (la/los/del/…) + palabra ≥4 letras → compound de 3 tokens
        segments.push(`${token} ${next} ${tokens[i + 2]}`);
        i += 3;
      } else {
        // "de" + palabra ≥4 letras → compound de 2 tokens
        segments.push(`${token} ${next}`);
        i += 2;
      }
    } else {
      segments.push(token);
      i += 1;
    }
  }
  return segments;
};

/** Capitaliza cada palabra de un segmento (incluyendo los de "De La Vega"). */
const capitalizeSegment = (seg: string): string =>
  seg
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

interface ParsedName {
  apellidos: string[]; // segmentos (pueden ser compuestos)
  nombres: string[];
}

/**
 * Parsea `nombre_completo` en BD (formato APELLIDOS primero, todo en mayúsculas).
 *   1 segmento  → sin apellido, 1 nombre
 *   2 segmentos → 1 apellido + 1 nombre
 *   3 segmentos → 2 apellidos + 1 nombre
 *   ≥4 segmentos → (N-2) apellidos + 2 nombres
 */
const parseNombreCompleto = (raw: string): ParsedName => {
  if (!raw?.trim()) return { apellidos: [], nombres: [] };
  const tokens = raw.trim().split(/\s+/);
  const segs = groupTokens(tokens);
  const N = segs.length;
  if (N === 1) return { apellidos: [], nombres: [segs[0]] };
  if (N === 2) return { apellidos: [segs[0]], nombres: [segs[1]] };
  if (N === 3) return { apellidos: [segs[0], segs[1]], nombres: [segs[2]] };
  return { apellidos: segs.slice(0, N - 2), nombres: segs.slice(N - 2) };
};

/**
 * Formatea para display completo: "Nombre1 Nombre2 Apellido1 Apellido2".
 * (recibe el valor crudo de BD)
 */
const formatName = (raw: string): string => {
  if (!raw) return '';
  const { apellidos, nombres } = parseNombreCompleto(raw);
  return [...nombres, ...apellidos].map(capitalizeSegment).join(' ');
};

/**
 * Nombre corto para las cards: "Nombre1 Apellido1" (recibe valor crudo de BD).
 */
const shortName = (raw: string): string => {
  if (!raw) return '';
  const { apellidos, nombres } = parseNombreCompleto(raw);
  const n1 = nombres[0] ? capitalizeSegment(nombres[0]) : '';
  const a1 = apellidos[0] ? capitalizeSegment(apellidos[0]) : '';
  if (n1 && a1) return `${n1} ${a1}`;
  return n1 || a1;
};

/**
 * Convierte la entrada del usuario (orden natural: NOMBRES APELLIDOS)
 * al formato de BD (APELLIDOS primero, en MAYÚSCULAS).
 *   1 seg: NOMBRE1                        → "NOMBRE1"
 *   2 seg: NOMBRE1 APELLIDO1             → "APELLIDO1 NOMBRE1"
 *   3 seg: NOMBRE1 APELLIDO1 APELLIDO2   → "APELLIDO1 APELLIDO2 NOMBRE1"
 *   ≥4 seg: N1 N2 A1 A2 …               → "A1 A2 … N1 N2"
 */
const inputToDbFormat = (input: string): string => {
  if (!input?.trim()) return '';
  const tokens = input.trim().toUpperCase().split(/\s+/).filter(Boolean);
  const segs = groupTokens(tokens);
  const N = segs.length;
  if (N === 0) return '';
  if (N === 1) return segs[0];
  if (N === 2) return `${segs[1]} ${segs[0]}`;
  if (N === 3) return `${segs[1]} ${segs[2]} ${segs[0]}`;
  // ≥4: primeros 2 = nombres, resto = apellidos
  const nombres = segs.slice(0, 2);
  const apellidos = segs.slice(2);
  return [...apellidos, ...nombres].join(' ');
};

const capitalize = (text: string | null) => {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

const normalizeText = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const formatSedeName = (name: string) => {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const formatUpssName = (name: string) => {
  if (!name) return '';
  const lower = name.toLowerCase().trim();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

const getUpssIcon = (name: string) => {
  const norm = name.toLowerCase().trim();
  if (norm.includes('consulta')) return 'clipboard-outline';
  if (norm.includes('emergencia')) return 'alert-circle-outline';
  if (norm.includes('hospital')) return 'bed-outline';
  if (norm.includes('quirur') || norm.includes('quirúrgico')) return 'pulse-outline';
  if (norm.includes('obstet') || norm.includes('obstétrico')) return 'heart-outline';
  if (norm.includes('esterili') || norm.includes('esterilización')) return 'shield-checkmark-outline';
  if (norm.includes('sangre')) return 'water-outline';
  if (norm.includes('endosco')) return 'eye-outline';
  if (norm.includes('farmacia')) return 'medkit-outline';
  if (norm.includes('medico') || norm.includes('médicos')) return 'people-outline';
  if (norm.includes('neonato') || norm.includes('neonatología')) return 'heart-outline';
  if (norm.includes('nutri') || norm.includes('nutrición')) return 'nutrition-outline';
  if (norm.includes('uci')) return 'pulse-outline';
  if (norm.includes('imagen') || norm.includes('imágenes')) return 'image-outline';
  return 'medical-outline'; // default
};

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
  const [grupoPicker, setGrupoPicker] = useState(false); // controla el modal selector de grupo profesional
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
    supabase
      .from('grupo_profesional')
      .select('id, nombre')
      .order('nombre')
      .then(({ data, error }) => {
        if (data) setGrupoProfesionalList(data);
        if (error) console.warn('grupo_profesional error:', error.message);
      });
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
          nombre_completo: inputToDbFormat(nuevoNombre),
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
          <View style={styles.addIconCircle}>
            <Ionicons name="add" size={24} color={colors.verde1Aviva} />
          </View>
          <View style={styles.gridCellTextContainer}>
            <Text style={styles.addLabel}>Añadir Personal</Text>
          </View>
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
        <View style={styles.gridCellIconCircle}>
          <Ionicons name="person" size={20} color="#FFFFFF" />
        </View>
        <View style={styles.gridCellTextContainer}>
          <Text style={styles.gridCellName} numberOfLines={2}>
            {shortName(cell.nombre_completo)}
          </Text>
          {cell.cargo ? (
            <Text style={styles.gridCellCargo} numberOfLines={2}>
              {capitalize(cell.cargo)}
            </Text>
          ) : null}
        </View>
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
    <ScreenLayout>
      <StatusBar style="light" />
      <View style={styles.container}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Personal</Text>
          <View style={styles.sedeRow}>
            <Ionicons name="location-sharp" size={16} color="#4B5563" style={styles.headerIcon} />
            <Text style={styles.headerSubtitle}>
              Sede {formatSedeName(sedeNombre)}
            </Text>
          </View>
          <View style={styles.upssRow}>
            <Ionicons name={getUpssIcon(upssNombre) as any} size={16} color="#4B5563" style={styles.headerIcon} />
            <Text style={styles.headerSubtitle}>
              {formatUpssName(upssNombre)}
            </Text>
          </View>
        </View>

        {/* ── Buscador ── */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBarWrapper}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por nombre..."
              placeholderTextColor="#6B7280"
              value={searchQuery}
              onChangeText={text => { setSearchQuery(text); setCurrentPage(0); }}
              autoCapitalize="words"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>✕</Text>
              </Pressable>
            )}
          </View>
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
                    ? <ActivityIndicator color="#FFFFFF" size="small" />
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
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setGrupoPicker(false)}
        >
          <Pressable style={styles.pickerSheet} onPress={() => {}}>
            <Text style={styles.pickerTitle}>Grupo Profesional</Text>
            <ScrollView
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
              {grupoProfesionalList.map(g => (
                <Pressable
                  key={g.id}
                  style={[styles.pickerItem, selectedGrupo?.id === g.id && styles.pickerItemSelected]}
                  onPress={() => {
                    setSelectedGrupo(g);
                    setGrupoPicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.pickerItemText,
                      selectedGrupo?.id === g.id && styles.pickerItemTextSelected,
                    ]}
                  >
                    {g.nombre}
                  </Text>
                  {selectedGrupo?.id === g.id && (
                    <Text style={styles.pickerCheck}>✓</Text>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

    </ScreenLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    paddingTop: 24,
    paddingBottom: 16,
    paddingHorizontal: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  sedeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  upssRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    marginRight: 6,
  },
  headerSubtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4B5563',
  },

  searchContainer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  searchInput: {
    flex: 1,
    color: '#1F2937',
    paddingVertical: 6,
    fontSize: 12,
    paddingLeft: 8,
  },
  searchIcon: {
    fontSize: 16,
  },
  clearBtn: {
    padding: 4,
  },
  clearBtnText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // ── Grid ──
  gridContainer: { flex: 1, paddingHorizontal: 16 },
  gridRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  gridCell: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 10,
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  gridCellEmpty: {
    flex: 1,
    minHeight: 76,
    backgroundColor: 'transparent',
  },
  gridCellAdd: {
    borderColor: 'rgba(93, 202, 165, 0.4)',
    backgroundColor: 'rgba(93, 202, 165, 0.08)',
    elevation: 0,
    shadowOpacity: 0,
  },
  cellPressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  addIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(93, 202, 165, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addLabel: {
    fontSize: 13,
    color: colors.verde1Aviva,
    fontWeight: '700',
    textAlign: 'left',
  },
  gridCellIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.verde1AvivaLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridCellTextContainer: {
    flex: 1,
    marginLeft: 8,
    justifyContent: 'center',
  },
  gridCellName: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1F2937',
    textAlign: 'left',
    lineHeight: 14,
    marginBottom: 2,
  },
  gridCellCargo: {
    fontSize: 10.5,
    color: '#6B7280',
    textAlign: 'left',
    lineHeight: 14,
  },

  // ── Paginación ──
  paginacion: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 20, marginTop: 4, paddingBottom: 12,
  },
  pageBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  pageBtnDisabled: { opacity: 0.3 },
  pageArrow: { fontSize: 26, color: colors.verde1Aviva, lineHeight: 30 },
  pageLabel: { color: '#4B5563', fontSize: 15, fontWeight: '600' },

  // ── Lista búsqueda ──
  listContent: { paddingHorizontal: 24, paddingBottom: 40, gap: 12 },
  listCard: {
    backgroundColor: '#FFFFFF', padding: 18, borderRadius: 16,
    borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  listCardName: { fontSize: 17, fontWeight: '700', color: '#1F2937', marginBottom: 2 },
  listCardCargo: { fontSize: 13, color: '#6B7280' },

  errorText: { color: '#EF4444', textAlign: 'center', marginTop: 20, paddingHorizontal: 24 },
  emptyText: { color: '#6B7280', textAlign: 'center', marginTop: 40, fontSize: 16 },

  // ── Modal Añadir Personal ──
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderBottomWidth: 0, borderColor: '#E5E7EB',
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingVertical: 20,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1F2937' },
  modalCloseBtn: { padding: 4 },
  modalCloseText: { fontSize: 18, color: '#6B7280' },
  modalBody: { padding: 24, gap: 4 },

  fieldLabel: { color: '#4B5563', fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  fieldInput: {
    backgroundColor: '#F3F4F6', color: '#1F2937', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 15,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  fieldHint: { color: '#6B7280', fontSize: 11, marginTop: 4 },
  fieldSelector: {
    backgroundColor: '#F3F4F6', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: '#E5E7EB', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  fieldSelectorPlaceholder: { color: '#9CA3AF', fontSize: 15 },
  fieldSelectorValue: { color: '#1F2937', fontSize: 15, fontWeight: '600' },
  fieldSelectorArrow: { color: colors.verde1Aviva, fontSize: 20 },
  modalBtnRow: { flexDirection: 'row', gap: 12, marginTop: 28 },
  modalBtnSecondary: {
    flex: 1, borderWidth: 1, borderColor: '#D1D5DB',
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  modalBtnSecondaryText: { color: '#4B5563', fontWeight: '700', fontSize: 16 },
  modalBtnPrimary: {
    flex: 2, backgroundColor: colors.verde1Aviva, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: colors.verde1Aviva, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  modalBtnPrimaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },

  // ── Selector Grupo Profesional ──
  pickerSheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderBottomWidth: 0, borderColor: '#E5E7EB',
    maxHeight: '60%', paddingBottom: 24,
  },
  pickerTitle: {
    fontSize: 17, fontWeight: '800', color: '#1F2937',
    textAlign: 'center', paddingVertical: 18,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  pickerItemSelected: { backgroundColor: 'rgba(93, 202, 165, 0.1)' },
  pickerItemText: { color: '#374151', fontSize: 16 },
  pickerItemTextSelected: { color: colors.verde1Aviva, fontWeight: '700' },
  pickerCheck: { color: colors.verde1Aviva, fontSize: 18, fontWeight: '700' },
});
