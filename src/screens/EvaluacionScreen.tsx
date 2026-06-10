import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  Pressable,
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

type Props = NativeStackScreenProps<ColaboradoresParamList, 'Evaluacion'>;

type EstadoPantalla =
  | 'loading'      // verificando proceso y evaluación previa
  | 'no_proceso'   // no hay proceso activo para esta sede
  | 'confirmar'    // mostrar datos del personal + botón Iniciar Evaluación
  | 'iniciando'    // creando registros en BD (o cargando evaluación existente)
  | 'evaluando';   // formulario de sets y preguntas

type ValorRespuesta = 'SI' | 'NO' | 'NA';

interface Pregunta {
  id: string;
  texto: string;
  orden: number;
}

interface SetConPreguntas {
  set_id: string;
  nombre: string;
  orden: number;
  preguntas: Pregunta[];
}

interface EvaluacionSetLocal {
  id: string;          // evaluacion_set.id en BD
  set_id: string;
  estado: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const capitalize = (text: string | null) => {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

// Extrae solo Nombre1 Apellido1 para el header de la evaluación
const shortName = (formattedFullName: string) => {
  const parts = formattedFullName.trim().split(' ');
  // formattedFullName ya viene en formato: "Nombre1 [Nombre2] Apellido1 [Apellido2]"
  if (parts.length >= 3) return `${parts[0]} ${parts[2]}`;
  if (parts.length === 2) return `${parts[0]} ${parts[1]}`;
  return parts[0] ?? formattedFullName;
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE
// ─────────────────────────────────────────────────────────────────────────────

export default function EvaluacionScreen({ route, navigation }: Props) {
  const { personalId, personalNombre, cargo, upssNombre, sedeId } = route.params;

  // Estado de la máquina de estados de la pantalla
  const [estado, setEstado] = useState<EstadoPantalla>('loading');

  // IDs obtenidos en la fase de verificación
  const [procesoId, setProcesoId] = useState<string | null>(null);
  const [evaluacionPersonalId, setEvaluacionPersonalId] = useState<string | null>(null);

  // Datos del formulario de evaluación
  const [setsConPreguntas, setSetsConPreguntas] = useState<SetConPreguntas[]>([]);
  const [evaluacionSets, setEvaluacionSets] = useState<EvaluacionSetLocal[]>([]);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);

  // Respuestas locales: { [pregunta_id]: 'SI' | 'NO' | 'NA' }
  const [respuestas, setRespuestas] = useState<Record<string, ValorRespuesta>>({});
  const [guardando, setGuardando] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // FUNCIONES DE CARGA (Definidas antes del useEffect para evitar problemas de hoisting)
  // ─────────────────────────────────────────────────────────────────────────

  // Carga los set_preguntas con sus preguntas activas
  const cargarSetsConPreguntas = useCallback(async () => {
    const { data, error } = await supabase
      .from('set_preguntas')
      .select('id, nombre, orden, pregunta(id, texto, orden, activa)')
      .eq('activo', true)
      .order('orden');

    if (error) throw error;

    const formatted: SetConPreguntas[] = (data ?? []).map((s: any) => ({
      set_id: s.id,
      nombre: s.nombre,
      orden: s.orden,
      preguntas: (s.pregunta ?? [])
        .filter((p: any) => p.activa)
        .sort((a: any, b: any) => a.orden - b.orden),
    }));

    setSetsConPreguntas(formatted);
    setCurrentSetIndex(0);
    setEstado('evaluando');
  }, []);

  const cargarEvaluacionExistente = useCallback(async (epId: string) => {
    setEstado('iniciando');
    try {
      // Cargar los evaluacion_set existentes
      const { data: evSets, error: errEvSets } = await supabase
        .from('evaluacion_set')
        .select('id, set_id, estado')
        .eq('evaluacion_personal_id', epId);

      if (errEvSets) throw errEvSets;
      setEvaluacionSets((evSets ?? []) as EvaluacionSetLocal[]);

      // Cargar las respuestas ya guardadas
      const evSetIds = (evSets ?? []).map((es: any) => es.id);
      if (evSetIds.length > 0) {
        const { data: respExistentes, error: errResp } = await supabase
          .from('respuesta')
          .select('pregunta_id, valor')
          .in('evaluacion_set_id', evSetIds);

        if (errResp) throw errResp;

        const respMap: Record<string, ValorRespuesta> = {};
        (respExistentes ?? []).forEach((r: any) => {
          respMap[r.pregunta_id] = r.valor as ValorRespuesta;
        });
        setRespuestas(respMap);
      }

      // Cargar sets con preguntas
      const { data, error } = await supabase
        .from('set_preguntas')
        .select('id, nombre, orden, pregunta(id, texto, orden, activa)')
        .eq('activo', true)
        .order('orden');

      if (error) throw error;

      const formatted: SetConPreguntas[] = (data ?? []).map((s: any) => ({
        set_id: s.id,
        nombre: s.nombre,
        orden: s.orden,
        preguntas: (s.pregunta ?? [])
          .filter((p: any) => p.activa)
          .sort((a: any, b: any) => a.orden - b.orden),
      }));

      setSetsConPreguntas(formatted);

      // Posicionar en el primer set pendiente
      const primerPendienteIdx = (evSets ?? []).findIndex(
        (es: any) => es.estado === 'pendiente'
      );
      setCurrentSetIndex(primerPendienteIdx >= 0 ? primerPendienteIdx : 0);
      setEstado('evaluando');
    } catch (err: any) {
      console.error('Error al cargar evaluación existente:', err);
      Alert.alert('Error', err.message || 'No se pudo cargar la evaluación.');
      navigation.goBack();
    }
  }, [navigation]);

  // ─────────────────────────────────────────────────────────────────────────
  // FASE 1: Verificar proceso activo y evaluación previa
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;

    const verificar = async () => {
      // Resetear estados al cambiar de personal
      setEstado('loading');
      setProcesoId(null);
      setEvaluacionPersonalId(null);
      setSetsConPreguntas([]);
      setEvaluacionSets([]);
      setRespuestas({});
      setCurrentSetIndex(0);

      try {
        const { data: procesos, error: errProceso } = await supabase
          .from('proceso_prevalencia')
          .select('id')
          .eq('sede_id', sedeId)
          .eq('estado', 'activo')
          .limit(1);

        if (errProceso) throw errProceso;

        if (!mounted) return;

        if (!procesos || procesos.length === 0) {
          setEstado('no_proceso');
          return;
        }

        const pid = procesos[0].id;
        setProcesoId(pid);

        const { data: evalExistente, error: errEval } = await supabase
          .from('evaluacion_personal')
          .select('id')
          .eq('personal_id', personalId)
          .eq('proceso_id', pid);

        if (errEval) throw errEval;

        if (!mounted) return;

        if (evalExistente && evalExistente.length > 0) {
          const epId = evalExistente[0].id;
          setEvaluacionPersonalId(epId);
          await cargarEvaluacionExistente(epId);
          return;
        }

        setEstado('confirmar');
      } catch (err: any) {
        console.error('Error en verificación:', err);
        if (mounted) {
          Alert.alert('Error', err.message || 'Error al verificar el proceso activo.');
          navigation.goBack();
        }
      }
    };

    verificar();

    return () => {
      mounted = false;
    };
  }, [personalId, sedeId, cargarEvaluacionExistente, navigation]);

  // ─────────────────────────────────────────────────────────────────────────
  // FASE 2: Iniciar evaluación (crear registros en BD)
  // ─────────────────────────────────────────────────────────────────────────

  const iniciarEvaluacion = useCallback(async () => {
    if (!procesoId) return;
    setEstado('iniciando');

    try {
      // TODO(auth): Cuando se active RLS, el insert requerirá el JWT del evaluador
      // autenticado. El cliente de Supabase usará automáticamente la sesión activa.

      // 2a. Crear evaluacion_personal
      const { data: ep, error: errEp } = await supabase
        .from('evaluacion_personal')
        .insert({ proceso_id: procesoId, personal_id: personalId, fecha_hora: new Date().toISOString() })
        .select('id')
        .single();

      if (errEp) throw errEp;

      const epId = ep.id;
      setEvaluacionPersonalId(epId);

      // 2b. Obtener los set_preguntas activos (replicamos el SELECT del SQL)
      const { data: sets, error: errSets } = await supabase
        .from('set_preguntas')
        .select('id')
        .eq('activo', true)
        .order('orden');

      if (errSets) throw errSets;
      if (!sets || sets.length === 0) throw new Error('No hay sets de preguntas activos.');

      // 2c. Crear los evaluacion_set (uno por cada set activo)
      const evalSetRows = sets.map(s => ({
        evaluacion_personal_id: epId,
        set_id: s.id,
        estado: 'pendiente',
        fecha_inicio: new Date().toISOString(),
      }));

      const { data: evSets, error: errEvSets } = await supabase
        .from('evaluacion_set')
        .insert(evalSetRows)
        .select('id, set_id, estado');

      if (errEvSets) throw errEvSets;

      // Guardar los evaluacion_set localmente
      setEvaluacionSets(evSets as EvaluacionSetLocal[]);

      // 2d. Cargar todos los sets con sus preguntas activas para el formulario
      await cargarSetsConPreguntas();
    } catch (err: any) {
      console.error('Error al iniciar evaluación:', err);
      Alert.alert('Error', err.message || 'No se pudo iniciar la evaluación.');
      setEstado('confirmar');
    }
  }, [procesoId, personalId]);



  // ─────────────────────────────────────────────────────────────────────────
  // FASE 3: Guardar respuestas del set actual
  // ─────────────────────────────────────────────────────────────────────────

  const guardarRespuestas = async () => {
    const currentSet = setsConPreguntas[currentSetIndex];
    const currentEvSet = evaluacionSets.find(es => es.set_id === currentSet.set_id);

    if (!currentEvSet) return;

    // Verificar que todas las preguntas tienen respuesta
    const sinResponder = currentSet.preguntas.filter(p => !respuestas[p.id]);
    if (sinResponder.length > 0) {
      Alert.alert(
        'Preguntas sin responder',
        `Faltan ${sinResponder.length} pregunta(s) por responder antes de guardar.`
      );
      return;
    }

    setGuardando(true);

    try {
      // TODO(auth): Cuando se active RLS, el insert verificará que
      // evaluacion_set.estado = 'pendiente' y que el evaluador tiene permisos.
      // El campo evaluador_id se completará con auth.uid() automáticamente via RLS/trigger.

      // 3a. Insertar todas las respuestas del set de una vez
      const respuestasArray = currentSet.preguntas.map(p => ({
        evaluacion_set_id: currentEvSet.id,
        pregunta_id: p.id,
        valor: respuestas[p.id],
      }));

      const { error: errResp } = await supabase
        .from('respuesta')
        .insert(respuestasArray);

      if (errResp) throw errResp;

      // 3b. Marcar el evaluacion_set como completado
      const { error: errUpdate } = await supabase
        .from('evaluacion_set')
        .update({ estado: 'completado', fecha_fin: new Date().toISOString() })
        .eq('id', currentEvSet.id);

      if (errUpdate) throw errUpdate;

      // Actualizar el estado local del evaluacion_set
      setEvaluacionSets(prev =>
        prev.map(es =>
          es.id === currentEvSet.id ? { ...es, estado: 'completado' } : es
        )
      );

      // Avanzar al siguiente set pendiente, o mostrar confirmación si todos están completados
      const updatedSets = evaluacionSets.map(es =>
        es.id === currentEvSet.id ? { ...es, estado: 'completado' } : es
      );
      const nextPendienteIdx = updatedSets.findIndex(es => es.estado === 'pendiente');
      if (nextPendienteIdx >= 0) {
        setCurrentSetIndex(nextPendienteIdx);
      } else {
        Alert.alert(
          '¡Evaluación completada!',
          'Todos los sets han sido guardados correctamente.',
          [{ text: 'Volver', onPress: () => navigation.goBack() }]
        );
      }
    } catch (err: any) {
      console.error('Error al guardar respuestas:', err);
      Alert.alert('Error', err.message || 'No se pudieron guardar las respuestas.');
    } finally {
      setGuardando(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: estados de carga y error
  // ─────────────────────────────────────────────────────────────────────────

  if (estado === 'loading' || estado === 'iniciando') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>
            {estado === 'iniciando' ? 'Iniciando evaluación...' : 'Verificando...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (estado === 'no_proceso') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.centered}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Sin proceso activo</Text>
          <Text style={styles.errorBody}>
            No hay un proceso de evaluación activo para esta sede.
          </Text>
          <Pressable style={styles.btnSecondary} onPress={() => navigation.goBack()}>
            <Text style={styles.btnSecondaryText}>Retroceder</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }



  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: pantalla de confirmación
  // ─────────────────────────────────────────────────────────────────────────

  if (estado === 'confirmar') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerSubtitle}>INICIAR EVALUACIÓN</Text>
          </View>

          <View style={styles.personalCard}>
            <Text style={styles.personalNombre}>{personalNombre}</Text>
            {cargo ? (
              <Text style={styles.personalCargo}>{capitalize(cargo)}</Text>
            ) : null}
            <View style={styles.upssChip}>
              <Text style={styles.upssChipText}>{upssNombre}</Text>
            </View>
          </View>

          <Text style={styles.confirmarLabel}>
            ¿Confirmar inicio de evaluación para este personal?
          </Text>

          <View style={styles.btnRow}>
            <Pressable
              style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.7 }]}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.btnSecondaryText}>Retroceder</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.8 }]}
              onPress={iniciarEvaluacion}
            >
              <Text style={styles.btnPrimaryText}>Iniciar Evaluación</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: formulario de evaluación
  // ─────────────────────────────────────────────────────────────────────────

  const currentSet = setsConPreguntas[currentSetIndex];
  const currentEvSet = evaluacionSets.find(es => es.set_id === currentSet?.set_id);
  const totalSets = setsConPreguntas.length;
  const setCompletado = currentEvSet?.estado === 'completado';

  const haySetsPendientes = evaluacionSets.some(es => es.estado === 'pendiente');

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.container}>

        {/* ── Cabecera del personal ── */}
        <View style={styles.personalHeader}>
          <Text style={styles.personalHeaderNombre}>{shortName(personalNombre)}</Text>
          {cargo ? (
            <Text style={styles.personalHeaderCargo}>{capitalize(cargo)}</Text>
          ) : null}
          <Text style={styles.personalHeaderUpss}>{upssNombre}</Text>
          <View style={[styles.estadoChip, haySetsPendientes ? styles.estadoChipPendiente : styles.estadoChipCompleto]}>
            <Text style={styles.estadoChipText}>
              {haySetsPendientes ? '● En evaluación' : '✓ Evaluación completada'}
            </Text>
          </View>
        </View>

        {/* ── Navegador de sets ── */}
        <View style={styles.setNavContainer}>
          <Pressable
            style={[styles.setNavBtn, currentSetIndex === 0 && styles.setNavBtnDisabled]}
            onPress={() => { setRespuestas({}); setCurrentSetIndex(i => i - 1); }}
            disabled={currentSetIndex === 0}
          >
            <Text style={styles.setNavArrow}>‹</Text>
          </Pressable>

          <View style={styles.setNameContainer}>
            <Text style={styles.setNombre} numberOfLines={2}>{currentSet?.nombre}</Text>
            <Text style={styles.setOrden}>{currentSetIndex + 1}/{totalSets}</Text>
            {setCompletado && (
              <Text style={styles.setCompletadoLabel}>✓ Completado</Text>
            )}
          </View>

          <Pressable
            style={[styles.setNavBtn, currentSetIndex === totalSets - 1 && styles.setNavBtnDisabled]}
            onPress={() => { setRespuestas({}); setCurrentSetIndex(i => i + 1); }}
            disabled={currentSetIndex === totalSets - 1}
          >
            <Text style={styles.setNavArrow}>›</Text>
          </Pressable>
        </View>

        {/* ── Lista de preguntas ── */}
        <ScrollView
          style={styles.preguntasScroll}
          contentContainerStyle={styles.preguntasContent}
          showsVerticalScrollIndicator={false}
        >
          {currentSet?.preguntas.map((pregunta, idx) => {
            const valorActual = respuestas[pregunta.id];
            return (
              <View key={pregunta.id} style={styles.preguntaCard}>
                <Text style={styles.preguntaNumero}>{idx + 1}.</Text>
                <Text style={styles.preguntaTexto}>{pregunta.texto}</Text>
                <View style={styles.opcionesRow}>
                  {(['SI', 'NO', 'NA'] as ValorRespuesta[]).map(valor => {
                    const activo = valorActual === valor;
                    return (
                      <Pressable
                        key={valor}
                        style={[
                          styles.opcionBtn,
                          activo && (valor === 'SI' ? styles.opcionSI : valor === 'NO' ? styles.opcionNO : styles.opcionNA),
                          setCompletado && styles.opcionDisabled,
                        ]}
                        onPress={() => {
                          if (setCompletado) return;
                          setRespuestas(prev => ({ ...prev, [pregunta.id]: valor }));
                        }}
                        disabled={setCompletado}
                      >
                        <Text style={[styles.opcionText, activo && styles.opcionTextActivo]}>
                          {valor}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}

          {/* ── Botón Guardar Respuestas ── */}
          {!setCompletado && (
            <Pressable
              style={({ pressed }) => [styles.btnGuardar, pressed && { opacity: 0.8 }, guardando && { opacity: 0.6 }]}
              onPress={guardarRespuestas}
              disabled={guardando}
            >
              {guardando ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnGuardarText}>Guardar Respuestas</Text>
              )}
            </Pressable>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },

  // Loading / Error states
  loadingText: { color: '#9CA3AF', marginTop: 16, fontSize: 16 },
  errorIcon: { fontSize: 48, marginBottom: 16 },
  errorTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginBottom: 8, textAlign: 'center' },
  errorBody: { fontSize: 15, color: '#9CA3AF', textAlign: 'center', lineHeight: 22, marginBottom: 32 },

  // Header
  header: { paddingTop: 16, paddingHorizontal: 24, paddingBottom: 8 },
  headerSubtitle: {
    fontSize: 12, fontWeight: '800', color: '#10B981',
    letterSpacing: 2, textTransform: 'uppercase',
  },

  // Confirmar
  personalCard: {
    margin: 24,
    backgroundColor: '#1C1C24',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2D2D38',
  },
  personalNombre: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginBottom: 6 },
  personalCargo: { fontSize: 15, color: '#9CA3AF', marginBottom: 12 },
  upssChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  upssChipText: { color: '#10B981', fontWeight: '700', fontSize: 13 },
  confirmarLabel: {
    color: '#9CA3AF', fontSize: 15, textAlign: 'center',
    paddingHorizontal: 24, marginBottom: 24,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
  },
  btnSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnSecondaryText: { color: '#9CA3AF', fontWeight: '700', fontSize: 16 },
  btnPrimary: {
    flex: 2,
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  btnPrimaryText: { color: '#000', fontWeight: '800', fontSize: 16 },

  // Personal header (formulario)
  personalHeader: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C24',
  },
  personalHeaderNombre: { fontSize: 24, fontWeight: '900', color: '#FFFFFF', marginBottom: 2 },
  personalHeaderCargo: { fontSize: 14, color: '#9CA3AF', marginBottom: 4 },
  personalHeaderUpss: { fontSize: 14, color: '#6B7280', marginBottom: 8 },
  estadoChip: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  estadoChipPendiente: { backgroundColor: 'rgba(245,158,11,0.15)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  estadoChipCompleto: { backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' },
  estadoChipText: { color: '#F59E0B', fontWeight: '700', fontSize: 12 },

  // Navegador de sets
  setNavContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1C1C24',
    marginHorizontal: 24,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D2D38',
  },
  setNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#2D2D38',
    justifyContent: 'center',
    alignItems: 'center',
  },
  setNavBtnDisabled: { opacity: 0.3 },
  setNavArrow: { color: '#10B981', fontSize: 24, fontWeight: '300', lineHeight: 28 },
  setNameContainer: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  setNombre: { color: '#FFFFFF', fontWeight: '700', fontSize: 15, textAlign: 'center' },
  setOrden: { color: '#6B7280', fontSize: 13, marginTop: 2 },
  setCompletadoLabel: { color: '#10B981', fontSize: 12, fontWeight: '700', marginTop: 2 },

  // Preguntas
  preguntasScroll: { flex: 1 },
  preguntasContent: { paddingHorizontal: 24, paddingTop: 16, gap: 16 },
  preguntaCard: {
    backgroundColor: '#1C1C24',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D2D38',
    padding: 16,
  },
  preguntaNumero: { color: '#10B981', fontWeight: '800', fontSize: 13, marginBottom: 4 },
  preguntaTexto: { color: '#E5E7EB', fontSize: 15, lineHeight: 22, marginBottom: 14 },
  opcionesRow: { flexDirection: 'row', gap: 10 },
  opcionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#374151',
    backgroundColor: '#12121A',
  },
  opcionDisabled: { opacity: 0.5 },
  opcionSI: { backgroundColor: 'rgba(16,185,129,0.2)', borderColor: '#10B981' },
  opcionNO: { backgroundColor: 'rgba(239,68,68,0.2)', borderColor: '#EF4444' },
  opcionNA: { backgroundColor: 'rgba(107,114,128,0.3)', borderColor: '#6B7280' },
  opcionText: { color: '#6B7280', fontWeight: '700', fontSize: 14 },
  opcionTextActivo: { color: '#FFFFFF' },

  // Botón Guardar
  btnGuardar: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  btnGuardarText: { color: '#000', fontWeight: '800', fontSize: 17 },
});
