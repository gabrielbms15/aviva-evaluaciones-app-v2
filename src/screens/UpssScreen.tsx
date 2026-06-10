import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  ActivityIndicator,
  Pressable,
  TextInput,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '../../supabase';
import type { ColaboradoresParamList } from '../navigation/types';
import ScreenLayout from '../components/ScreenLayout';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<ColaboradoresParamList, 'Upss'>;

interface UpssItem {
  id: string;
  nombre: string;
}

interface PersonalItem {
  id: string;
  nombre_completo: string;
  cargo: string | null;
  upssNombre: string;
}

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

const formatName = (fullName: string) => {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/).map(part =>
    part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
  );
  if (parts.length >= 3) {
    return [...parts.slice(2), ...parts.slice(0, 2)].join(' ');
  } else if (parts.length === 2) {
    return `${parts[1]} ${parts[0]}`;
  }
  return parts.join(' ');
};

const normalizeText = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function UpssScreen({ route, navigation }: Props) {
  const { sedeId, sedeNombre } = route.params;
  const [searchQuery, setSearchQuery] = useState('');
  const [upssList, setUpssList] = useState<UpssItem[]>([]);
  const [fullPersonalList, setFullPersonalList] = useState<PersonalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setErrorMsg(null);

      try {
        const { data, error } = await supabase
          .from('personal_prevalencia')
          .select('id, nombre_completo, cargo, upss_id, upss:upss_id(id, nombre)')
          .eq('sede_id', sedeId)
          .eq('activo', true)
          .order('nombre_completo', { ascending: true });

        if (error) throw error;

        if (data) {
          setFullPersonalList(
            data.map(r => {
              const upss = r.upss as unknown as { id: string; nombre: string } | null;
              return {
                id: r.id,
                nombre_completo: r.nombre_completo,
                cargo: r.cargo,
                upssNombre: upss?.nombre ?? '',
              };
            })
          );

          const seen = new Set<string>();
          const unique: UpssItem[] = [];
          for (const row of data) {
            const upss = row.upss as unknown as { id: string; nombre: string } | null;
            if (upss && !seen.has(upss.id)) {
              seen.add(upss.id);
              unique.push({ id: upss.id, nombre: upss.nombre });
            }
          }
          unique.sort((a, b) => a.nombre.localeCompare(b.nombre));
          setUpssList(unique);
        }
      } catch (error: any) {
        console.error('Error fetching data:', error);
        setErrorMsg(error.message || 'Error al obtener los datos');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [sedeId]);

  const filteredPersonal = useMemo(() => {
    if (searchQuery.trim() === '') return [];
    const q = normalizeText(searchQuery.trim());
    return fullPersonalList.filter(p =>
      normalizeText(p.nombre_completo).includes(q)
    );
  }, [searchQuery, fullPersonalList]);

  const isSearching = searchQuery.trim() !== '';

  const renderUpssItem = ({ item }: { item: UpssItem }) => (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() =>
        navigation.navigate('SearchPersonal', {
          sedeId,
          sedeNombre,
          upssId: item.id,
          upssNombre: item.nombre,
        })
      }
    >
      <View style={styles.cardContent}>
        <View style={styles.leftSection}>
          <View style={styles.iconCircle}>
            <Ionicons name={getUpssIcon(item.nombre) as any} size={20} color="#FFFFFF" />
          </View>
          <Text style={styles.upssName}>{formatUpssName(item.nombre)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
      </View>
    </Pressable>
  );

  const renderPersonalItem = ({ item }: { item: PersonalItem }) => (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() =>
        navigation.navigate('Evaluacion', {
          personalId: item.id,
          personalNombre: formatName(item.nombre_completo),
          cargo: item.cargo,
          upssNombre: item.upssNombre,
          sedeId,
          sedeNombre,
        })
      }
    >
      <View style={styles.cardContent}>
        <View style={styles.leftSection}>
          <View style={styles.iconCircle}>
            <Ionicons name="person-outline" size={20} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.upssName}>{formatName(item.nombre_completo)}</Text>
            {item.cargo ? <Text style={styles.cargoText}>{item.cargo}</Text> : null}
            <Text style={styles.upssBadge}>{formatUpssName(item.upssNombre)}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
      </View>
    </Pressable>
  );

  return (
    <ScreenLayout>
      <StatusBar style="light" />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {isSearching ? 'Buscar personal' : 'Seleccionar área'}
          </Text>
          <View style={styles.sedeContainer}>
            <Ionicons name="location-sharp" size={16} color="#4B5563" style={styles.locationIcon} />
            <Text style={styles.headerSubtitle}>
              Sede {formatSedeName(sedeNombre)}
            </Text>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <View style={styles.searchBarWrapper}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar personal en toda la sede..."
              placeholderTextColor="#6B7280"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="words"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>✕</Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.listContainer}>
          {loading ? (
            <ActivityIndicator size="large" color="#10B981" style={{ marginTop: 40 }} />
          ) : errorMsg ? (
            <Text style={styles.errorText}>{errorMsg}</Text>
          ) : isSearching ? (
            <FlatList
              data={filteredPersonal}
              keyExtractor={item => item.id}
              renderItem={renderPersonalItem}
              contentContainerStyle={styles.flatListContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  No se encontró personal para la búsqueda.
                </Text>
              }
            />
          ) : (
            <FlatList
              data={upssList}
              keyExtractor={item => item.id}
              renderItem={renderUpssItem}
              contentContainerStyle={styles.flatListContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  No se encontraron áreas para esta sede.
                </Text>
              }
            />
          )}
        </View>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  sedeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationIcon: {
    marginRight: 4,
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
  listContainer: {
    flex: 1,
  },
  flatListContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.verde1Aviva,
    justifyContent: 'center',
    alignItems: 'center',
  },
  upssName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  cargoText: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  upssBadge: {
    fontSize: 11,
    color: colors.verde1Aviva,
    fontWeight: '700',
    marginTop: 4,
    backgroundColor: 'rgba(93, 202, 165, 0.15)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  emptyText: {
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 15,
  },
  errorText: {
    color: '#EF4444',
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 24,
    fontSize: 15,
  },
});
