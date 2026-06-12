import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BarChart } from 'react-native-gifted-charts';
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

interface UpssBar {
  upss: string;
  total_si: number;
  total_no: number;
  porcentaje_cumplimiento: number;
}

interface Props {
  sedeId: string;
  sedeNombre: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const capitalize = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

/** Formatea el nombre de UPSS dividiéndolo en máximo 2 líneas para el eje X */
const formatearUpss = (nombre: string): string => {
  if (nombre === 'Central de Esterilización') return 'Central de\nEsterilización';
  if (nombre === 'Centro Quirúrgico') return 'Centro\nQuirúrgico';
  if (nombre === 'Centro Obstétrico') return 'Centro\nObstétrico';
  if (nombre === 'Banco de Sangre') return 'Banco\nde Sangre';
  if (nombre === 'Diagnóstico por Imágenes') return 'Diagnóstico\npor Imágenes';
  if (nombre === 'Consulta Externa') return 'Consulta\nExterna';
  return nombre;
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE
// ─────────────────────────────────────────────────────────────────────────────

export default function ReportesScreen({ sedeId, sedeNombre }: Props) {
  const [sets, setSets] = useState<SetPreguntas[]>([]);
  const [selectedSetIdx, setSelectedSetIdx] = useState(0);
  const [procesoId, setProcesoId] = useState<string | null>(null);
  const [procesoNombre, setProcesoNombre] = useState<string | null>(null);
  const [barData, setBarData] = useState<UpssBar[]>([]);
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingChart, setLoadingChart] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const screenWidth = Dimensions.get('window').width;
  const chartWidth = screenWidth - 48;

  // ─── Carga inicial: catálogo de sets + proceso activo ──────────────────────
  useEffect(() => {
    const init = async () => {
      setLoadingInit(true);
      setErrorMsg(null);
      try {
        const [{ data: setsData, error: errSets }, { data: procesos, error: errProc }] =
          await Promise.all([
            supabase
              .from('set_preguntas')
              .select('id, nombre, orden')
              .eq('activo', true)
              .order('orden'),
            supabase
              .from('proceso_prevalencia')
              .select('id, nombre')
              .eq('sede_id', sedeId)
              .eq('estado', 'activo')
              .limit(1),
          ]);

        if (errSets) throw errSets;
        if (errProc) throw errProc;

        setSets((setsData ?? []) as SetPreguntas[]);

        if (procesos && procesos.length > 0) {
          setProcesoId(procesos[0].id);
          setProcesoNombre(procesos[0].nombre);
        }
      } catch (err: any) {
        setErrorMsg(err.message ?? 'Error al cargar datos iniciales.');
      } finally {
        setLoadingInit(false);
      }
    };
    init();
  }, []);

  // ─── Carga de gráfico via RPC server-side ────────────────────────────────
  const fetchChartData = useCallback(async () => {
    if (!procesoId || sets.length === 0) return;
    const setId = sets[selectedSetIdx]?.id;
    if (!setId) return;

    setLoadingChart(true);
    setBarData([]);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase.rpc('get_cumplimiento_por_upss', {
        p_set_id: setId,
        p_proceso_id: procesoId,
      });

      if (error) throw error;
      setBarData((data ?? []) as UpssBar[]);
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Error al cargar el reporte.');
    } finally {
      setLoadingChart(false);
    }
  }, [procesoId, sets, selectedSetIdx]);

  useEffect(() => {
    fetchChartData();
  }, [fetchChartData]);

  // ─── Datos para gifted-charts (sin labels propios) ───────────────────────
  const chartBars = barData.map(row => ({
    value: Number(row.porcentaje_cumplimiento),
    frontColor: colors.lightBlue1Aviva,
    topLabelComponent: () => (
      <Text style={styles.barTopLabel}>{row.porcentaje_cumplimiento}%</Text>
    ),
  }));

  // Ref para sincronizar scroll del gráfico con el de las etiquetas
  const chartScrollRef = useRef<ScrollView>(null);
  const labelsScrollRef = useRef<ScrollView>(null);

  const BAR_WIDTH = 36;
  const BAR_SPACING = 24;
  // El eje Y en gifted-charts ocupa ~38px de offset a la izquierda
  const Y_AXIS_OFFSET = 38;

  // ─── RENDER ──────────────────────────────────────────────────────────────

  if (loadingInit) {
    return (
      <ScreenLayout>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.verde1Aviva} />
          <Text style={styles.loadingText}>Cargando reportes…</Text>
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.rootContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.headerBlock}>
          <Text style={styles.title}>Reportes</Text>
          <View style={styles.metaRow}>
            <Ionicons name="location-sharp" size={14} color={colors.azul1AvivaLight} />
            <Text style={styles.sedeLabel}>{capitalize(sedeNombre)}</Text>
          </View>
          {procesoNombre ? (
            <View style={styles.metaRow}>
              <Ionicons name="calendar" size={14} color={colors.verde1AvivaLight} />
              <Text style={styles.procesoLabel}>{procesoNombre}</Text>
            </View>
          ) : (
            <Text style={styles.noProceso}>⚠ Sin proceso activo en esta sede</Text>
          )}
        </View>

        {/* ── Selector de Sets ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsRow}
        >
          {sets.map((s, idx) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.pill, idx === selectedSetIdx && styles.pillActive]}
              onPress={() => setSelectedSetIdx(idx)}
              activeOpacity={0.75}
            >
              <Text style={[styles.pillText, idx === selectedSetIdx && styles.pillTextActive]}>
                {s.nombre}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Gráfico ── */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>
            {sets[selectedSetIdx]?.nombre ?? ''}
          </Text>
          <Text style={styles.chartSubtitle}>
            % cumplimiento por UPSS · sets completados
          </Text>


          {loadingChart ? (
            <View style={styles.placeholder}>
              <ActivityIndicator size="small" color={colors.verde1Aviva} />
              <Text style={styles.loadingText}>Calculando…</Text>
            </View>
          ) : errorMsg ? (
            <View style={styles.placeholder}>
              <Ionicons name="alert-circle-outline" size={32} color="#EF4444" />
              <Text style={[styles.loadingText, { color: '#EF4444' }]}>{errorMsg}</Text>
            </View>
          ) : !procesoId ? (
            <View style={styles.placeholder}>
              <Ionicons name="calendar-outline" size={32} color="#9CA3AF" />
              <Text style={styles.loadingText}>Sin proceso activo</Text>
            </View>
          ) : chartBars.length === 0 ? (
            <View style={styles.placeholder}>
              <Ionicons name="bar-chart-outline" size={44} color="#D1D5DB" />
              <Text style={styles.emptyText}>Sin datos aún para este set</Text>
              <Text style={styles.emptySubText}>
                Las barras aparecerán cuando haya evaluaciones completadas.
              </Text>
            </View>
          ) : (
            <View>
              {/* Gráfico sin labels de eje X */}
              <ScrollView
                horizontal
                ref={chartScrollRef}
                showsHorizontalScrollIndicator={false}
                onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                  labelsScrollRef.current?.scrollTo({
                    x: e.nativeEvent.contentOffset.x,
                    animated: false,
                  });
                }}
                scrollEventThrottle={16}
              >
                <BarChart
                  data={chartBars.map(b => ({ ...b, label: '' }))}
                  width={Math.max(chartWidth, chartBars.length * (BAR_WIDTH + BAR_SPACING) + Y_AXIS_OFFSET)}
                  height={200}
                  barWidth={BAR_WIDTH}
                  spacing={BAR_SPACING}
                  roundedTop={false}
                  noOfSections={5}
                  maxValue={100}
                  yAxisExtraHeight={20}
                  yAxisThickness={0}
                  xAxisThickness={1}
                  xAxisColor="#E5E7EB"
                  yAxisTextStyle={styles.axisText}
                  xAxisLabelTextStyle={{ fontSize: 0, height: 0 }}
                  rulesColor="#F3F4F6"
                  showFractionalValues={false}
                />
              </ScrollView>

              {/* Etiquetas personalizadas del eje X — wrapping ilimitado */}
              <ScrollView
                horizontal
                ref={labelsScrollRef}
                showsHorizontalScrollIndicator={false}
                scrollEnabled={false}
              >
                <View style={[
                  styles.customLabelsRow,
                  { paddingLeft: Y_AXIS_OFFSET, width: Math.max(chartWidth, chartBars.length * (BAR_WIDTH + BAR_SPACING) + Y_AXIS_OFFSET) },
                ]}>
                  {barData.map(row => (
                    <View key={row.upss} style={{ width: BAR_WIDTH + BAR_SPACING, alignItems: 'center', paddingHorizontal: 2 }}>
                      <Text style={[styles.axisText, { textAlign: 'center' }]}>
                        {row.upss}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}
        </View>

        {/* ── Tabla detalle ── */}
        {!loadingChart && chartBars.length > 0 && (
          <View style={styles.tableCard}>
            <Text style={styles.tableTitle}>Detalle por UPSS</Text>
            {barData.map((row, i) => (
              <View
                key={row.upss}
                style={[
                  styles.tableRow,
                  i === barData.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <Text style={styles.tableUpss} numberOfLines={1}>
                  {row.upss}
                </Text>
                <View style={styles.tableRight}>
                  <Text style={styles.tableSiNo}>
                    {row.total_si} SI · {row.total_no} NO
                  </Text>
                  <Text
                    style={[
                      styles.tablePct,
                      { color: colors.lightBlue1Aviva },
                    ]}
                  >
                    {row.porcentaje_cumplimiento}%
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backgroundAviva },
  rootContent: { paddingHorizontal: 16, paddingTop: 16 },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  loadingText: { color: '#9CA3AF', marginTop: 10, fontSize: 14 },

  // Header
  headerBlock: { marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '800', color: '#111827', marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  sedeLabel: { fontSize: 13, color: colors.azul1AvivaLight, fontWeight: '600' },
  procesoLabel: { fontSize: 13, color: '#6B7280' },
  noProceso: { fontSize: 13, color: '#F59E0B', marginTop: 4 },

  // Pills
  pillsRow: { gap: 8, paddingBottom: 12 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pillActive: { backgroundColor: colors.azulOscuroAviva, borderColor: colors.azulOscuroAviva },
  pillText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  pillTextActive: { color: '#FFFFFF' },

  // Chart card
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  chartTitle: { fontSize: 15, fontWeight: '800', color: '#1F2937', marginBottom: 2 },
  chartSubtitle: { fontSize: 12, color: '#9CA3AF', marginBottom: 14 },

  legend: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: '#6B7280' },

  placeholder: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 14, fontWeight: '700', color: '#9CA3AF', marginTop: 12 },
  emptySubText: {
    fontSize: 12,
    color: '#D1D5DB',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 24,
  },

  barTopLabel: { fontSize: 10, fontWeight: '700', color: '#374151', marginBottom: 4 },
  customLabelsRow: {
    flexDirection: 'row',
    paddingTop: 6,
  },
  axisText: { fontSize: 8, color: '#9CA3AF' },

  // Table card
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  tableTitle: { fontSize: 14, fontWeight: '800', color: '#1F2937', marginBottom: 12 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tableUpss: { flex: 1, fontSize: 13, color: '#374151', fontWeight: '600', marginRight: 8 },
  tableRight: { alignItems: 'flex-end' },
  tableSiNo: { fontSize: 11, color: '#9CA3AF' },
  tablePct: { fontSize: 16, fontWeight: '900' },
});
