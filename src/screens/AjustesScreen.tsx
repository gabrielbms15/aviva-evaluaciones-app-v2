import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenLayout from '../components/ScreenLayout';
import { colors } from '../theme/colors';
import ModificarRespuestasScreen from './ModificarRespuestasScreen';
import ModificarPreguntasScreen from './ModificarPreguntasScreen';
import EditarPreguntasScreen from './EditarPreguntasScreen';

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  sedeNombre: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Opciones del menú de Ajustes
// ─────────────────────────────────────────────────────────────────────────────

type SubPantalla = null | 'modificar_respuestas' | 'modificar_preguntas' | 'editar_preguntas';

const OPCIONES: {
  key: SubPantalla;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    key: 'modificar_respuestas',
    label: 'Modificar respuestas',
    description: 'Edita la respuesta esperada de cada pregunta por set.',
    icon: 'create-outline',
  },
  {
    key: 'modificar_preguntas',
    label: 'Modificar preguntas',
    description: 'Edita el texto de cada pregunta por set.',
    icon: 'list-outline',
  },
  {
    key: 'editar_preguntas',
    label: 'Editar preguntas',
    description: 'Añade o elimina preguntas de cada set. Restaura preguntas inactivas.',
    icon: 'pencil-outline',
  },
];

// ─────────────────────────────────────────────────────────────────────────────

export default function AjustesScreen({ sedeNombre }: Props) {
  const [subPantalla, setSubPantalla] = useState<SubPantalla>(null);

  // ── Sub-pantallas ──
  if (subPantalla === 'modificar_respuestas') {
    return <ModificarRespuestasScreen onBack={() => setSubPantalla(null)} />;
  }
  if (subPantalla === 'modificar_preguntas') {
    return <ModificarPreguntasScreen onBack={() => setSubPantalla(null)} />;
  }
  if (subPantalla === 'editar_preguntas') {
    return <EditarPreguntasScreen onBack={() => setSubPantalla(null)} />;
  }

  // ── Menú principal ──
  return (
    <ScreenLayout>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Ajustes</Text>
        </View>

        {/* Opciones */}
        <View style={styles.opcionesContainer}>
          {OPCIONES.map(opcion => (
            <Pressable
              key={opcion.key}
              style={({ pressed }) => [styles.opcionCard, pressed && styles.opcionCardPressed]}
              onPress={() => setSubPantalla(opcion.key)}
            >
              <View style={styles.opcionIconCircle}>
                <Ionicons name={opcion.icon} size={22} color={colors.azulOscuroAviva} />
              </View>
              <View style={styles.opcionTexts}>
                <Text style={styles.opcionLabel}>{opcion.label}</Text>
                <Text style={styles.opcionDesc}>{opcion.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </Pressable>
          ))}
        </View>
      </View>
    </ScreenLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundAviva },

  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
  },

  opcionesContainer: {
    paddingHorizontal: 16,
    gap: 10,
  },

  opcionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  opcionCardPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.99 }],
  },
  opcionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.backgroundAviva,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  opcionTexts: { flex: 1 },
  opcionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  opcionDesc: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },
});
