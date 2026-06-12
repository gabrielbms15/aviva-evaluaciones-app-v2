// Tipos centralizados para todos los navegadores
// Importar desde aquí en todas las pantallas para evitar referencias circulares

export type RootStackParamList = {
  Login: undefined;
  Sedes: undefined;
  SedeTabs: { sedeId: string; sedeNombre: string };
};

export type ColaboradoresParamList = {
  Upss: { sedeId: string; sedeNombre: string };
  SearchPersonal: {
    sedeId: string;
    sedeNombre: string;
    upssId: string;
    upssNombre: string;
  };
  Evaluacion: {
    personalId: string;
    personalNombre: string;
    cargo: string | null;
    upssNombre: string;
    sedeId: string;
    sedeNombre: string;
  };
};
