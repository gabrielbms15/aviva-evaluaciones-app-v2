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
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '../../supabase';
import type { ColaboradoresParamList } from '../navigation/types';

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
        // Traemos todo el personal activo de la sede con su upss en un solo query
        const { data, error } = await supabase
          .from('personal_prevalencia')
          .select('id, nombre_completo, cargo, upss_id, upss:upss_id(id, nombre)')
          .eq('sede_id', sedeId)
          .eq('activo', true)
          .order('nombre_completo', { ascending: true });

        if (error) throw error;

        if (data) {
          // Personal completo para el buscador global (incluye upssNombre para la navegación)
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

          // UPSS únicas para la lista de áreas
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

  // Filtrado local del personal cuando hay texto en el buscador
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
        <Text style={styles.upssName}>{item.nombre}</Text>
        <Text style={styles.arrow}>›</Text>
      </View>
    </Pressable>
  );

  const renderPersonalItem = ({ item }: { item: PersonalItem }) => (
    <Pressable
      style={({ pressed }) => [styles.personalCard, pressed && styles.cardPressed]}
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
      <Text style={styles.nameText}>{formatName(item.nombre_completo)}</Text>
      {item.cargo ? <Text style={styles.cargoText}>{item.cargo}</Text> : null}
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerSubtitle}>SEDE {sedeNombre}</Text>
          <Text style={styles.headerTitle}>
            {isSearching ? 'Buscar Personal' : 'Selecciona un Área'}
          </Text>
        </View>

        {/* Buscador global por sede */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar personal en toda la sede..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="words"
            clearButtonMode="while-editing"
          />
        </View>

        <View style={styles.listContainer}>
          {loading ? (
            <ActivityIndicator size="large" color="#10B981" style={{ marginTop: 40 }} />
          ) : errorMsg ? (
            <Text style={styles.errorText}>{errorMsg}</Text>
          ) : isSearching ? (
            // Modo búsqueda: muestra personal filtrado
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
            // Modo normal: muestra lista de UPSS
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F0F12',
  },
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 24,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 2,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  searchContainer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  searchInput: {
    backgroundColor: '#1C1C24',
    color: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#374151',
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
    backgroundColor: '#1C1C24',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D2D38',
    overflow: 'hidden',
  },
  cardPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
  },
  upssName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
  },
  arrow: {
    fontSize: 24,
    color: '#10B981',
    fontWeight: '300',
    marginLeft: 12,
  },
  personalCard: {
    backgroundColor: '#1C1C24',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2D2D38',
  },
  nameText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  cargoText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  errorText: {
    color: '#EF4444',
    textAlign: 'center',
    marginTop: 20,
    paddingHorizontal: 24,
  },
  emptyText: {
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 16,
  },
});
