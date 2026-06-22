import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '../../supabase';
import type { ColaboradoresParamList } from '../navigation/types';
import ScreenLayout from '../components/ScreenLayout';
import { colors } from '../theme/colors';
import { getUpssIcon } from './UpssScreen';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<ColaboradoresParamList, 'Evaluacion'>;

type EstadoPantalla =
  | 'loading'      // verificando proceso y evaluación previa
  | 'no_proceso'   // no hay proceso activo para esta sede
  | 'confirmar'    // mostrar datos del personal + botón Iniciar Evaluación
  | 'iniciando'    // creando registros en BD (o cargando evaluación existente)
  | 'evaluando'    // formulario de sets y preguntas
  | 'terminado';   // evaluación completada

type ValorRespuesta = 'SI' | 'NO' | 'NA';

interface Pregunta {
  id: string;
  texto: string;
  orden: number;
  respuesta_esperada?: string | null;
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
  observacion?: string | null;
  evaluador_iniciales?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Agrupa tokens con prefijos compuestos tipo "de", "de la", etc. */
const groupTokens = (tokens: string[]): string[] => {
  const segments: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.toLowerCase() === 'de' && i + 1 < tokens.length) {
      const next = tokens[i + 1];
      if (next.length <= 3 && i + 2 < tokens.length) {
        segments.push(`${token} ${next} ${tokens[i + 2]}`);
        i += 3;
      } else {
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

/**
 * Convierte nombre en orden natural (NOMBRES APELLIDOS) al formato BD (APELLIDOS NOMBRES).
 * Espeja exactamente la lógica de SearchPersonalScreen.
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
  const nombres = segs.slice(0, 2);
  const apellidos = segs.slice(2);
  return [...apellidos, ...nombres].join(' ');
};

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
  const { personalId, personalNombre, grupoProfesionalId, grupoProfesionalNombre, upssId, upssNombre, sedeId, sedeNombre } = route.params;

  // Estado de la máquina de estados de la pantalla
  const [estado, setEstado] = useState<EstadoPantalla>('loading');

  // IDs obtenidos en la fase de verificación
  const [procesoId, setProcesoId] = useState<string | null>(null);
  const [procesoNombre, setProcesoNombre] = useState<string | null>(null);
  const [evaluacionPersonalId, setEvaluacionPersonalId] = useState<string | null>(null);
  const [evaluacionExistente, setEvaluacionExistente] = useState(false);

  // Datos editables del personal (se actualizan tras guardar)
  const [nombrePersonal, setNombrePersonal] = useState(personalNombre);
  const [grupoId, setGrupoId] = useState(grupoProfesionalId);
  const [grupoNombre, setGrupoNombre] = useState(grupoProfesionalNombre);
  const [upssIdLocal, setUpssIdLocal] = useState(upssId);
  const [upssNombreLocal, setUpssNombreLocal] = useState(upssNombre);

  // Modal edición
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editNombre, setEditNombre] = useState('');
  const [editGrupoId, setEditGrupoId] = useState('');
  const [editGrupoNombre, setEditGrupoNombre] = useState('');
  const [editUpssId, setEditUpssId] = useState('');
  const [editUpssNombre, setEditUpssNombre] = useState('');
  const [grupoList, setGrupoList] = useState<{ id: string; nombre: string }[]>([]);
  const [upssList, setUpssList] = useState<{ id: string; nombre: string }[]>([]);
  const [grupoPicker, setGrupoPicker] = useState(false);
  const [upssPicker, setUpssPicker] = useState(false);
  const [guardandoEdit, setGuardandoEdit] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  // Datos del formulario de evaluación
  const [setsConPreguntas, setSetsConPreguntas] = useState<SetConPreguntas[]>([]);
  const [evaluacionSets, setEvaluacionSets] = useState<EvaluacionSetLocal[]>([]);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);

  // Respuestas locales: { [pregunta_id]: 'SI' | 'NO' | 'NA' }
  const [respuestas, setRespuestas] = useState<Record<string, ValorRespuesta>>({});
  const [observacion, setObservacion] = useState(''); // observación del set actual
  const [guardando, setGuardando] = useState(false);
  const [debugMsg, setDebugMsg] = useState('Iniciando montado');
  const [evaluador, setEvaluador] = useState<{ id: string; iniciales: string } | null>(null);

  // Cargar catálogos para edición
  useEffect(() => {
    supabase.from('grupo_profesional').select('id, nombre').order('nombre')
      .then(({ data }) => { if (data) setGrupoList(data); });
    supabase.from('upss').select('id, nombre').order('nombre')
      .then(({ data }) => { if (data) setUpssList(data); });
  }, []);

  const abrirEdicion = () => {
    setEditNombre(nombrePersonal);
    setEditGrupoId(grupoId);
    setEditGrupoNombre(grupoNombre);
    setEditUpssId(upssIdLocal);
    setEditUpssNombre(upssNombreLocal);
    setEditModalVisible(true);
  };

  const guardarEdicion = async () => {
    if (!editNombre.trim()) {
      Alert.alert('Campo requerido', 'Ingresa el nombre del personal.');
      return;
    }
    // Convertir del orden display (NOMBRES APELLIDOS) al formato BD (APELLIDOS NOMBRES)
    const nombreParaBd = inputToDbFormat(editNombre.trim());
    setGuardandoEdit(true);
    const { error } = await supabase
      .from('personal_prevalencia')
      .update({
        nombre_completo: nombreParaBd,
        grupo_profesional_id: editGrupoId,
        upss_id: editUpssId,
      })
      .eq('id', personalId);
    setGuardandoEdit(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    // Mantener el nombre en formato display (como lo escribió el usuario)
    setNombrePersonal(editNombre.trim());
    setGrupoId(editGrupoId);
    setGrupoNombre(editGrupoNombre);
    setUpssIdLocal(editUpssId);
    setUpssNombreLocal(editUpssNombre);
    setEditModalVisible(false);
  };

  const confirmarEliminar = () => {
    Alert.alert(
      'Eliminar personal',
      `¿Deseas eliminar a ${nombrePersonal}? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setEliminando(true);
            const { error } = await supabase
              .from('personal_prevalencia')
              .update({ activo: false })
              .eq('id', personalId);
            setEliminando(false);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              navigation.goBack();
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    const fetchEvaluador = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('evaluador_perfil')
          .select('id, nombre, apellido')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profile) {
          const n = profile.nombre || '';
          const a = profile.apellido || '';
          let iniciales = `${n.charAt(0)}${a.charAt(0)}`.toUpperCase();
          if (!iniciales) iniciales = 'XX';
          setEvaluador({ id: profile.id, iniciales });
        }
      }
    };
    fetchEvaluador();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // FUNCIONES DE CARGA (Definidas antes del useEffect para evitar problemas de hoisting)
  // ─────────────────────────────────────────────────────────────────────────

  // Carga los set_preguntas con sus preguntas activas
  const cargarSetsConPreguntas = useCallback(async () => {
    const { data, error } = await supabase
      .from('set_preguntas')
      .select('id, nombre, orden, pregunta(id, texto, orden, activa, respuesta_esperada)')
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
    setDebugMsg(`[cargarEvaluacionExistente] Iniciando para epId: ${epId}`);
    try {
      setDebugMsg(`[cargarEvaluacionExistente] Consultando evaluacion_set`);
      // Cargar los evaluacion_set existentes
      const { data: evSets, error: errEvSets } = await supabase
        .from('evaluacion_set')
        .select(`
          id,
          set_id,
          estado,
          observacion,
          evaluador_perfil (nombre, apellido)
        `)
        .eq('evaluacion_personal_id', epId);

      if (errEvSets) throw errEvSets;

      const formattedEvSets = (evSets ?? []).map((es: any) => {
        let iniciales = 'XX';
        if (es.evaluador_perfil) {
          const n = es.evaluador_perfil.nombre || '';
          const a = es.evaluador_perfil.apellido || '';
          iniciales = `${n.charAt(0)}${a.charAt(0)}`.toUpperCase();
          if (!iniciales) iniciales = 'XX';
        }
        return {
          id: es.id,
          set_id: es.set_id,
          estado: es.estado,
          observacion: es.observacion ?? null,
          evaluador_iniciales: iniciales,
        };
      });

      setEvaluacionSets(formattedEvSets);

      // Cargar las respuestas ya guardadas
      const evSetIds = (evSets ?? []).map((es: any) => es.id);
      setDebugMsg(`[cargarEvaluacionExistente] Consultando ${evSetIds.length} respuestas...`);
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

      setDebugMsg(`[cargarEvaluacionExistente] Consultando set_preguntas`);
      // Cargar sets con preguntas
      const { data, error } = await supabase
        .from('set_preguntas')
        .select('id, nombre, orden, pregunta(id, texto, orden, activa, respuesta_esperada)')
        .eq('activo', true)
        .order('orden');

      if (error) throw error;

      setDebugMsg(`[cargarEvaluacionExistente] Procesando sets...`);
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
      setDebugMsg(`[cargarEvaluacionExistente] Completado`);
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

  useFocusEffect(
    useCallback(() => {
      let mounted = true;

      const verificar = async () => {
        // Resetear estados al cambiar de personal
        setEstado('loading');
        setDebugMsg('[verificar] Iniciando...');
        setProcesoId(null);
        setEvaluacionPersonalId(null);
        setEvaluacionExistente(false);
        setSetsConPreguntas([]);
        setEvaluacionSets([]);
        setRespuestas({});
        setCurrentSetIndex(0);

        try {
          setDebugMsg('[verificar] Consultando proceso_prevalencia...');
          const { data: procesos, error: errProceso } = await supabase
            .from('proceso_prevalencia')
            .select('id, nombre')
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
          setProcesoNombre(procesos[0].nombre);
          setDebugMsg(`[verificar] Proceso activo encontrado: ${pid}. Consultando evaluacion_personal...`);

          const { data: evalExistente, error: errEval } = await supabase
            .from('evaluacion_personal')
            .select('id')
            .eq('personal_id', personalId)
            .eq('proceso_id', pid);

          if (errEval) throw errEval;

          if (!mounted) return;

          if (evalExistente && evalExistente.length > 0) {
            setDebugMsg(`[verificar] Evaluación existente encontrada: ${evalExistente[0].id}. Mostrando confirmación...`);
            const epId = evalExistente[0].id;
            setEvaluacionPersonalId(epId);
            setEvaluacionExistente(true);
            setEstado('confirmar');
            return;
          }

          setEvaluacionExistente(false);
          setDebugMsg('[verificar] Nueva evaluación. Esperando confirmación.');
          setEstado('confirmar');
        } catch (err: any) {
          console.error('Error en verificación:', err);
          setDebugMsg(`[verificar] ERROR: ${err.message}`);
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
    }, [personalId, sedeId, cargarEvaluacionExistente, navigation])
  );

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
      const updatePayload: any = {
        estado: 'completado',
        fecha_fin: new Date().toISOString(),
        observacion: observacion.trim() || null,
      };
      if (evaluador?.id) {
        updatePayload.evaluador_id = evaluador.id;
      }

      const { error: errUpdate } = await supabase
        .from('evaluacion_set')
        .update(updatePayload)
        .eq('id', currentEvSet.id);

      if (errUpdate) throw errUpdate;

      // Actualizar el estado local del evaluacion_set
      setEvaluacionSets(prev =>
        prev.map(es =>
          es.id === currentEvSet.id
            ? { ...es, estado: 'completado', evaluador_iniciales: evaluador?.iniciales || 'XX', observacion: observacion.trim() || null }
            : es
        )
      );

      setObservacion(''); // limpiar para el siguiente set

      // Avanzar al siguiente set pendiente, o mostrar confirmación si todos están completados
      const updatedSets = evaluacionSets.map(es =>
        es.id === currentEvSet.id
          ? { ...es, estado: 'completado', evaluador_iniciales: evaluador?.iniciales || 'XX' }
          : es
      );
      const nextPendienteIdx = updatedSets.findIndex(es => es.estado === 'pendiente');
      if (nextPendienteIdx >= 0) {
        setCurrentSetIndex(nextPendienteIdx);
      } else {
        setEstado('terminado');
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
      <ScreenLayout>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>
            {estado === 'iniciando' ? 'Iniciando evaluación...' : 'Verificando...'}
          </Text>
        </View>
      </ScreenLayout>
    );
  }

  if (estado === 'no_proceso') {
    return (
      <ScreenLayout>
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
      </ScreenLayout>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: pantalla de confirmación
  // ─────────────────────────────────────────────────────────────────────────

  if (estado === 'confirmar') {
    return (
      <ScreenLayout>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={styles.container}>
            <View style={styles.header}>
              <Text style={styles.headerSubtitle}>
                {evaluacionExistente ? 'Ver Evaluación' : 'Iniciar Evaluación'}
              </Text>
            </View>

            <View style={styles.personalCard}>
              <Text style={styles.personalNombre}>{nombrePersonal}</Text>

              <View style={styles.infoRow}>
                <Ionicons name="people-outline" size={20} color={colors.azul1Aviva} style={styles.infoIcon as any} />
                <Text style={styles.infoText}>
                  <Text style={{ fontWeight: '700' }}>Grupo: </Text>
                  {capitalize(grupoNombre)}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Ionicons name={getUpssIcon(upssNombreLocal) as any} size={20} color={colors.azul1AvivaLight} style={styles.infoIcon as any} />
                <Text style={styles.infoText}>
                  <Text style={{ fontWeight: '700' }}>UPSS: </Text>
                  {upssNombreLocal}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Ionicons name="business" size={20} color={colors.verde1Aviva} style={styles.infoIcon as any} />
                <Text style={styles.infoText}>
                  <Text style={{ fontWeight: '700' }}>Sede: </Text>
                  {sedeNombre}
                </Text>
              </View>

              {procesoNombre ? (
                <View style={styles.infoRow}>
                  <Ionicons name="calendar" size={20} color={colors.verde1AvivaLight} style={styles.infoIcon as any} />
                  <Text style={styles.infoText}>
                    <Text style={{ fontWeight: '700' }}>Proceso: </Text>
                    {procesoNombre}
                  </Text>
                </View>
              ) : null}

              {/* Botones editar / eliminar */}
              <View style={styles.accionesRow}>
                <Pressable
                  style={({ pressed }) => [styles.btnAccionEditar, pressed && { opacity: 0.7 }]}
                  onPress={abrirEdicion}
                >
                  <Ionicons name="pencil-outline" size={15} color={colors.azul1Aviva} />
                  <Text style={styles.btnAccionEditarText}>Editar</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.btnAccionEliminar, pressed && { opacity: 0.7 }, eliminando && { opacity: 0.5 }]}
                  onPress={confirmarEliminar}
                  disabled={eliminando}
                >
                  {eliminando
                    ? <ActivityIndicator size="small" color="#EF4444" />
                    : <>
                        <Ionicons name="trash-outline" size={15} color="#EF4444" />
                        <Text style={styles.btnAccionEliminarText}>Eliminar</Text>
                      </>
                  }
                </Pressable>
              </View>
            </View>

            <Text style={styles.confirmarLabel}>
              {evaluacionExistente
                ? 'La evaluación para este personal ya fue iniciada.'
                : '¿Confirmar inicio de evaluación para este personal?'}
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
                onPress={() => {
                  if (evaluacionExistente && evaluacionPersonalId) {
                    cargarEvaluacionExistente(evaluacionPersonalId);
                  } else {
                    iniciarEvaluacion();
                  }
                }}
              >
                <Text style={styles.btnPrimaryText}>
                  {evaluacionExistente ? 'Ver Evaluación' : 'Iniciar Evaluación'}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>

        {/* ══ Modal Editar Personal ══ */}
        <Modal
          visible={editModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setEditModalVisible(false)}
        >
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Pressable style={styles.modalOverlay} onPress={() => setEditModalVisible(false)}>
              <Pressable style={styles.modalSheet} onPress={() => {}}>
                {/* Header */}
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Editar Personal</Text>
                  <Pressable onPress={() => setEditModalVisible(false)} hitSlop={8}>
                    <Ionicons name="close" size={22} color="#6B7280" />
                  </Pressable>
                </View>

                <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
                  {/* Nombre */}
                  <Text style={styles.fieldLabel}>Nombres y Apellidos *</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={editNombre}
                    onChangeText={setEditNombre}
                    autoCapitalize="characters"
                    placeholder="APELLIDO1 APELLIDO2 NOMBRE1 NOMBRE2"
                    placeholderTextColor="#9CA3AF"
                  />

                  {/* Grupo Profesional */}
                  <Text style={styles.fieldLabel}>Grupo Profesional *</Text>
                  <Pressable
                    style={({ pressed }) => [styles.fieldSelector, pressed && { opacity: 0.7 }]}
                    onPress={() => { setGrupoPicker(p => !p); setUpssPicker(false); }}
                  >
                    <Text style={editGrupoId ? styles.fieldSelectorValue : styles.fieldSelectorPlaceholder}>
                      {editGrupoNombre || 'Seleccionar grupo...'}
                    </Text>
                    <Ionicons name={grupoPicker ? 'chevron-up' : 'chevron-down'} size={16} color="#9CA3AF" />
                  </Pressable>

                  {/* Lista inline de grupos */}
                  {grupoPicker && (
                    <View style={styles.inlinePickerContainer}>
                      {grupoList.map(g => (
                        <Pressable
                          key={g.id}
                          style={[styles.pickerItem, editGrupoId === g.id && styles.pickerItemSelected]}
                          onPress={() => { setEditGrupoId(g.id); setEditGrupoNombre(g.nombre); setGrupoPicker(false); }}
                        >
                          <Text style={[styles.pickerItemText, editGrupoId === g.id && styles.pickerItemTextSelected]}>{g.nombre}</Text>
                          {editGrupoId === g.id && <Ionicons name="checkmark" size={18} color={colors.verde1Aviva} />}
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {/* UPSS */}
                  <Text style={styles.fieldLabel}>UPSS *</Text>
                  <Pressable
                    style={({ pressed }) => [styles.fieldSelector, pressed && { opacity: 0.7 }]}
                    onPress={() => { setUpssPicker(p => !p); setGrupoPicker(false); }}
                  >
                    <Text style={editUpssId ? styles.fieldSelectorValue : styles.fieldSelectorPlaceholder}>
                      {editUpssNombre || 'Seleccionar UPSS...'}
                    </Text>
                    <Ionicons name={upssPicker ? 'chevron-up' : 'chevron-down'} size={16} color="#9CA3AF" />
                  </Pressable>

                  {/* Lista inline de UPSS */}
                  {upssPicker && (
                    <View style={styles.inlinePickerContainer}>
                      {upssList.map(u => (
                        <Pressable
                          key={u.id}
                          style={[styles.pickerItem, editUpssId === u.id && styles.pickerItemSelected]}
                          onPress={() => { setEditUpssId(u.id); setEditUpssNombre(u.nombre); setUpssPicker(false); }}
                        >
                          <Text style={[styles.pickerItemText, editUpssId === u.id && styles.pickerItemTextSelected]}>{u.nombre}</Text>
                          {editUpssId === u.id && <Ionicons name="checkmark" size={18} color={colors.verde1Aviva} />}
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {/* Botones */}
                  <View style={styles.modalBtnRow}>
                    <Pressable
                      style={({ pressed }) => [styles.modalBtnSecondary, pressed && { opacity: 0.7 }]}
                      onPress={() => setEditModalVisible(false)}
                    >
                      <Text style={styles.modalBtnSecondaryText}>Cancelar</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.modalBtnPrimary, pressed && { opacity: 0.8 }, guardandoEdit && { opacity: 0.6 }]}
                      onPress={guardarEdicion}
                      disabled={guardandoEdit}
                    >
                      {guardandoEdit
                        ? <ActivityIndicator color="#FFFFFF" size="small" />
                        : <Text style={styles.modalBtnPrimaryText}>Guardar cambios</Text>
                      }
                    </Pressable>
                  </View>
                </ScrollView>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>


      </ScreenLayout>
    );
  }

  if (estado === 'terminado') {
    return (
      <ScreenLayout>
        <View style={styles.terminadoContainer}>
          <View style={styles.terminadoTitleRow}>
            <Ionicons name="checkmark-circle" size={28} color={colors.verde1AvivaLight} style={{ marginRight: 8 }} />
            <Text style={styles.terminadoTitle}>Evaluación Completada</Text>
          </View>
          <Text style={styles.terminadoBody}>
            Se han guardado todas las respuestas para:{'\n'}
            <Text style={{ fontWeight: '900', color: '#111827' }}>{personalNombre}</Text>
          </Text>
          <Pressable style={styles.btnVolver} onPress={() => navigation.goBack()}>
            <Text style={styles.btnPrimaryText}>Volver</Text>
          </Pressable>
        </View>
      </ScreenLayout>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: formulario de evaluación
  // ─────────────────────────────────────────────────────────────────────────

  const currentSet = setsConPreguntas[currentSetIndex];
  const currentEvSet = evaluacionSets.find(es => es.set_id === currentSet?.set_id);
  const totalSets = setsConPreguntas.length;
  const setCompletado = currentEvSet?.estado === 'completado';

  const progresoCompletado = evaluacionSets.filter(es => es.estado === 'completado').length;

  // Calculos para SVG circular progress
  const progressSize = 44;
  const progressStrokeWidth = 4;
  const progressRadius = (progressSize - progressStrokeWidth) / 2;
  const progressCircumference = progressRadius * 2 * Math.PI;
  const progressRatio = totalSets === 0 ? 0 : progresoCompletado / totalSets;
  const progressDashoffset = progressCircumference - (progressRatio * progressCircumference);

  // Helper para asignar un icono genérico al set
  const getSetIcon = (nombre: string) => {
    const n = nombre.toLowerCase();
    if (n.includes('medicamentos')) return 'flask';
    if (n.includes('infecciones')) return 'bug';
    if (n.includes('identificacion')) return 'id-card';
    if (n.includes('cirugia')) return 'medkit';
    return 'clipboard-outline';
  };

  return (
    <ScreenLayout>
      <View style={styles.container}>

        {/* ── Tarjeta 1: Info del Personal ── */}
        <View style={styles.cardContainer}>
          <View style={[styles.personalInfoRow, { marginBottom: 0 }]}>
            <LinearGradient
              colors={[colors.azul1AvivaLight, colors.verde1AvivaLight]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.avatarGradientCircle}
            >
              <Ionicons name="person" size={32} color="#FFFFFF" />
            </LinearGradient>

            <View style={styles.personalInfoTextContainer}>
              <Text style={styles.personalInfoName}>{shortName(nombrePersonal)}</Text>

              <View style={styles.personalInfoDataRow}>
                <Ionicons name="people-outline" size={14} color={colors.azul1AvivaLight} />
                <Text style={styles.personalInfoDataText} numberOfLines={2}>
                  <Text style={styles.boldLabel}>Grupo:</Text> {grupoNombre ? capitalize(grupoNombre) : '-'}
                </Text>
              </View>

              <View style={styles.personalInfoDataRow}>
                <Ionicons name="location" size={14} color={colors.verde1AvivaLight} />
                <Text style={styles.personalInfoDataText} numberOfLines={2}>
                  <Text style={styles.boldLabel}>Área:</Text> {upssNombreLocal ? capitalize(upssNombreLocal) : '-'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── ScrollView para Tarjeta 2 y Tarjeta 3 ── */}
        <ScrollView
          style={styles.preguntasScroll}
          contentContainerStyle={styles.preguntasScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Tarjeta 2: Info del Set de Preguntas ── */}
          <View style={styles.cardContainer}>
            <View style={styles.setInfoRow}>
              <View style={styles.setIconCircle}>
                <Ionicons name={getSetIcon(currentSet?.nombre || '') as any} size={24} color="#FFFFFF" />
              </View>

              <View style={styles.setTextContainer}>
                <Text style={styles.setNombre} numberOfLines={2}>{currentSet?.nombre}</Text>
              </View>

              <View style={styles.progressCircleContainer}>
                <Svg width={progressSize} height={progressSize} style={{ position: 'absolute' }}>
                  <Circle
                    stroke="#E5E7EB"
                    fill="transparent"
                    cx={progressSize / 2}
                    cy={progressSize / 2}
                    r={progressRadius}
                    strokeWidth={progressStrokeWidth}
                  />
                  {progresoCompletado > 0 && (
                    <Circle
                      stroke={colors.verde1Aviva}
                      fill={progresoCompletado === totalSets ? colors.verde1Aviva : "transparent"}
                      cx={progressSize / 2}
                      cy={progressSize / 2}
                      r={progressRadius}
                      strokeWidth={progressStrokeWidth}
                      strokeDasharray={`${progressCircumference} ${progressCircumference}`}
                      strokeDashoffset={progresoCompletado === totalSets ? 0 : progressDashoffset}
                      strokeLinecap="round"
                      transform={`rotate(-90 ${progressSize / 2} ${progressSize / 2})`}
                    />
                  )}
                </Svg>
                <Text style={[styles.progressText, progresoCompletado === totalSets && { color: '#FFFFFF' }]}>
                  {progresoCompletado}/{totalSets}
                </Text>
              </View>
            </View>

            <View style={styles.setNavControls}>
              <View style={styles.estadoRow}>
                <View style={[styles.estadoChip, setCompletado ? styles.estadoChipCompleto : styles.estadoChipPendiente]}>
                  <Text style={[styles.estadoChipText, { color: setCompletado ? colors.verde1Aviva : '#F59E0B' }]}>
                    {setCompletado ? '✓ Completado' : '● En proceso'}
                  </Text>
                </View>
                {setCompletado && (
                  <View style={styles.evaluadorInicialesChip}>
                    <Text style={styles.evaluadorInicialesText}>
                      {currentEvSet?.evaluador_iniciales || 'XX'}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.navArrowsWrapper}>
                <Pressable
                  style={({ pressed }) => [styles.setNavBtn, currentSetIndex === 0 && styles.setNavBtnDisabled, pressed && { opacity: 0.7 }]}
                  onPress={() => setCurrentSetIndex(i => i - 1)}
                  disabled={currentSetIndex === 0}
                >
                  <Text style={styles.setNavArrow}>‹</Text>
                </Pressable>

                <Text style={styles.navSetIndexText}>{currentSetIndex + 1}/{totalSets}</Text>

                <Pressable
                  style={({ pressed }) => [styles.setNavBtn, currentSetIndex === totalSets - 1 && styles.setNavBtnDisabled, pressed && { opacity: 0.7 }]}
                  onPress={() => setCurrentSetIndex(i => i + 1)}
                  disabled={currentSetIndex === totalSets - 1}
                >
                  <Text style={styles.setNavArrow}>›</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* ── Tarjeta 3: Contenedor de Preguntas ── */}
          <View style={[styles.cardContainer, styles.preguntasContainer]}>
            {currentSet?.preguntas.map((pregunta, idx) => {
              const valorActual = respuestas[pregunta.id];
              const isLastItem = idx === currentSet.preguntas.length - 1;
              return (
                <View key={pregunta.id} style={styles.preguntaBlock}>
                  {/* Pregunta Texto + Botón Info */}
                  <View style={styles.preguntaHeader}>
                    <View style={styles.preguntaNumCircle}>
                      <Text style={styles.preguntaNumText}>{idx + 1}</Text>
                    </View>
                    <Text style={[styles.preguntaTexto, { flex: 1 }]}>{pregunta.texto}</Text>
                    <Pressable
                      onPress={() =>
                        Alert.alert(
                          'Respuesta Esperada',
                          pregunta.respuesta_esperada?.trim()
                            ? pregunta.respuesta_esperada
                            : 'Esta pregunta no cuenta con respuesta registrada.',
                          [{ text: 'Cerrar' }]
                        )
                      }
                      style={({ pressed }) => [styles.infoBtn, pressed && { opacity: 0.5 }]}
                      hitSlop={8}
                    >
                      <Ionicons name="information-circle-outline" size={20} color={colors.azul1AvivaLight} />
                    </Pressable>
                  </View>

                  {/* Botones de Respuesta */}
                  <View style={styles.opcionesRow}>
                    {(['SI', 'NO', 'NA'] as ValorRespuesta[]).map(valor => {
                      const activo = valorActual === valor;
                      return (
                        <Pressable
                          key={valor}
                          style={[
                            styles.opcionBtn,
                            activo && (valor === 'SI' ? styles.opcionSI : valor === 'NO' ? styles.opcionNO : styles.opcionNA),
                            (setCompletado && !activo) && styles.opcionDisabled,
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

                  {/* Separador central (70%) entre preguntas */}
                  {!isLastItem && (
                    <View style={styles.separatorContainer}>
                      <View style={styles.separatorLine} />
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/* ── Observación del Set ── */}
          {currentEvSet?.observacion ? (
            <View style={styles.observacionCard}>
              <View style={styles.observacionTitleRow}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.azul1AvivaLight} />
                <Text style={styles.observacionTitle}>Observación del evaluador</Text>
              </View>
              <Text style={styles.observacionText}>{currentEvSet.observacion}</Text>
            </View>
          ) : null}

          {/* ── Botón Guardar Respuestas / Tarjeta de Cumplimiento ── */}
          {setCompletado ? (() => {
            const preguntas = currentSet?.preguntas ?? [];
            const totalSI = preguntas.filter(p => respuestas[p.id] === 'SI').length;
            const totalNO = preguntas.filter(p => respuestas[p.id] === 'NO').length;
            const base = totalSI + totalNO;
            const pct = base === 0 ? 0 : Math.round((totalSI / base) * 100);
            const pctColor = pct >= 80 ? colors.verde1Aviva : pct >= 60 ? '#F59E0B' : '#EF4444';
            return (
              <View style={styles.cumplimientoCard}>
                <View style={styles.cumplimientoLeft}>
                  <Text style={styles.cumplimientoLabel}>Cumplimiento del set</Text>
                  <Text style={styles.cumplimientoSub}>
                    {totalSI} SI · {totalNO} NO · {preguntas.length - base} NA
                  </Text>
                </View>
                <View style={[styles.cumplimientoBadge, { borderColor: pctColor }]}>
                  <Text style={[styles.cumplimientoPct, { color: pctColor }]}>{pct}%</Text>
                </View>
              </View>
            );
          })() : (
            <>
              {/* Campo de observación */}
              <View style={styles.observacionInputCard}>
                <View style={styles.observacionInputHeader}>
                  <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.azul1AvivaLight} />
                  <Text style={styles.observacionInputLabel}>Observación (opcional)</Text>
                </View>
                <TextInput
                  style={styles.observacionInput}
                  value={observacion}
                  onChangeText={setObservacion}
                  placeholder="Escribe una observación sobre este set…"
                  placeholderTextColor="#C4C4CC"
                  multiline
                  textAlignVertical="top"
                  maxLength={500}
                />
                {observacion.length > 0 && (
                  <Text style={styles.observacionCounter}>{observacion.length}/500</Text>
                )}
              </View>

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
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </ScreenLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundAviva, paddingHorizontal: 16, paddingTop: 16 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },

  // Loading / Error states
  loadingText: { color: '#6B7280', marginTop: 16, fontSize: 16 },
  errorIcon: { fontSize: 48, marginBottom: 16 },
  errorTitle: { fontSize: 22, fontWeight: '800', color: '#1F2937', marginBottom: 8, textAlign: 'center' },
  errorBody: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 32 },

  // Terminado
  terminadoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: 24,
  },
  terminadoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  terminadoTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1F2937',
    textAlign: 'left',
  },
  terminadoBody: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'left',
    lineHeight: 24,
    marginBottom: 32,
  },
  btnVolver: {
    backgroundColor: colors.verde1Aviva,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 40,
    alignItems: 'center',
    shadowColor: colors.verde1Aviva,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },

  // Header Confirmar
  header: { paddingTop: 8, paddingHorizontal: 8, paddingBottom: 8 },
  headerSubtitle: {
    fontSize: 22, fontWeight: '800', color: '#000000',
    letterSpacing: 0,
  },

  // Confirmar
  personalCard: {
    margin: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  personalNombre: { fontSize: 22, fontWeight: '800', color: '#1F2937', marginBottom: 16 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoIcon: {
    marginRight: 8,
    width: 24,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 15,
    color: '#374151',
    flex: 1,
  },
  confirmarLabel: {
    color: '#6B7280', fontSize: 15, textAlign: 'center',
    paddingHorizontal: 24, marginBottom: 24, marginTop: 16,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 8,
  },
  btnSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnSecondaryText: { color: '#6B7280', fontWeight: '700', fontSize: 16 },
  btnPrimary: {
    flex: 2,
    backgroundColor: colors.verde1Aviva,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: colors.verde1Aviva,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  btnPrimaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },

  // Tarjetas Base
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 10,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },

  // Tarjeta 1: Info del Personal
  personalInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarGradientCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  personalInfoTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  personalInfoName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 6,
  },
  personalInfoDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  personalInfoDataText: {
    fontSize: 12,
    color: '#4B5563',
    marginLeft: 6,
    fontWeight: '500',
  },
  boldLabel: {
    fontWeight: '800',
  },
  estadoChip: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  estadoChipPendiente: { backgroundColor: 'rgba(245,158,11,0.15)' },
  estadoChipCompleto: { backgroundColor: 'rgba(93, 202, 165, 0.15)' },
  estadoChipText: { fontWeight: '700', fontSize: 10 },

  // Botones acciones (editar / eliminar)
  accionesRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    justifyContent: 'flex-end',
  },
  btnAccionEditar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(74, 144, 226, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(74, 144, 226, 0.3)',
  },
  btnAccionEditarText: {
    color: colors.azul1Aviva,
    fontSize: 13,
    fontWeight: '700',
  },
  btnAccionEliminar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  btnAccionEliminarText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '700',
  },

  // Modal edición
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  modalBody: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.azul1AvivaLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 12,
  },
  fieldInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  fieldSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  fieldSelectorValue: {
    fontSize: 15,
    color: '#111827',
    flex: 1,
  },
  fieldSelectorPlaceholder: {
    fontSize: 15,
    color: '#9CA3AF',
    flex: 1,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalBtnSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalBtnSecondaryText: { color: '#4B5563', fontWeight: '700', fontSize: 15 },
  modalBtnPrimary: {
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
  modalBtnPrimaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },

  // Picker bottom-sheet
  pickerSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
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
  pickerItemText: { color: '#374151', fontSize: 16, flex: 1 },
  inlinePickerContainer: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    marginBottom: 4,
    overflow: 'hidden',
    backgroundColor: '#F9FAFB',
  },
  pickerItemTextSelected: { color: colors.verde1Aviva, fontWeight: '700' },
  setInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  setIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.verde1Aviva,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  setTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  setNombre: {
    color: '#1F2937',
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 22,
  },
  progressCircleContainer: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressText: {
    color: colors.verde1Aviva,
    fontWeight: '800',
    fontSize: 14,
  },
  setNavControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  estadoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  evaluadorInicialesChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  evaluadorInicialesText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#6B7280',
  },
  navArrowsWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  navSetIndexText: {
    color: colors.azul1Aviva,
    fontWeight: '800',
    fontSize: 13,
  },
  setNavBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  setNavBtnDisabled: { opacity: 0.3 },
  setNavArrow: { color: colors.azul1Aviva, fontSize: 24, fontWeight: '700', lineHeight: 28 },

  // Tarjeta 3: Preguntas
  preguntasScroll: { flex: 1 },
  preguntasScrollContent: { paddingBottom: 120 },
  preguntasContainer: {
    paddingHorizontal: 0,
    paddingVertical: 8,
  },
  preguntaBlock: {
    marginBottom: 0,
  },
  preguntaHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    marginBottom: 16,
    marginTop: 16,
  },
  preguntaNumCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.verde1Aviva,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  preguntaNumText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  preguntaTexto: {
    flex: 1,
    color: '#1F2937',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
  },
  separatorContainer: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 0,
  },
  separatorLine: {
    width: '70%',
    height: 1,
    backgroundColor: '#000000',
    opacity: 0.15,
  },
  opcionesRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
  },
  opcionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  opcionDisabled: { opacity: 0.5 },
  opcionSI: { backgroundColor: '#E0F5EE', borderColor: colors.verde1Aviva }, // verde1Aviva muy claro
  opcionNO: { backgroundColor: '#FEE2E2', borderColor: '#EF4444' },
  opcionNA: { backgroundColor: '#F3F4F6', borderColor: '#9CA3AF' },
  opcionText: { color: '#6B7280', fontWeight: '800', fontSize: 10 },
  opcionTextActivo: { color: '#1F2937' },

  // Botón Guardar
  btnGuardar: {
    backgroundColor: colors.verde1Aviva,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: colors.verde1Aviva,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  btnGuardarText: { color: '#FFFFFF', fontWeight: '800', fontSize: 17 },

  // Cumplimiento card (reemplaza botón guardar en sets completados)
  cumplimientoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cumplimientoLeft: { flex: 1, marginRight: 12 },
  cumplimientoLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 4,
  },
  cumplimientoSub: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  cumplimientoBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  cumplimientoPct: {
    fontSize: 18,
    fontWeight: '900',
  },

  // Info button en pregunta
  infoBtn: {
    paddingLeft: 8,
    alignSelf: 'flex-start',
  },

  // Observación del set
  observacionCard: {
    marginTop: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: colors.azul1AvivaLight,
  },
  observacionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  observacionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.azul1Aviva,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  observacionText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },

  // Observación editable (antes de guardar)
  observacionInputCard: {
    marginTop: 8,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  observacionInputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  observacionInputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.azul1AvivaLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  observacionInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1F2937',
    minHeight: 80,
    lineHeight: 20,
  },
  observacionCounter: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'right',
    marginTop: 4,
  },
});

