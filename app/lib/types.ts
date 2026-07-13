export type Materia = {
  id: string;
  nombre: string;
  examen: string;
  metaHoras: number;
};

export type SemestreArchivado = {
  id: string;
  numero: number;
  nombre: string;
  materias: Materia[];
  sesiones: Record<string, number>;
  archivedAt: string;
};

export type AppData = {
  materias:    Materia[];
  sesiones:    Record<string, number>;
  preparacion: Record<string, number>;
  semestres:   SemestreArchivado[];
  planEstudio: Record<string, string[]>;
  notas:       string[];
};

// Multi-usuario (v10): las cuentas nuevas arrancan sin materias — cada
// estudiante carga las suyas en /semestre (ya no existen las de UCA·Economía
// pre-cargadas, que eran el semestre personal de Jano).
export const DATA_DEFAULT: AppData = {
  materias:    [],
  sesiones:    {},
  preparacion: {},
  semestres:   [],
  planEstudio: {},
  notas:       [],
};

export const COLORES_MATERIAS = [
  "#6B9FD4","#7BC47F","#E07B6B","#B088C9",
  "#E8A838","#5BB8B0","#D4956A","#8FA86E",
];
