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

export const MATERIAS_DEFAULT: Materia[] = [
  { id:"administracion", nombre:"Administración",                    examen:"2026-06-08T09:00", metaHoras:20 },
  { id:"contabilidad",   nombre:"Contabilidad",                      examen:"2026-06-10T09:00", metaHoras:25 },
  { id:"matematica",     nombre:"Matemática Aplicada I",             examen:"2026-06-05T09:00", metaHoras:30 },
  { id:"microeconomia",  nombre:"Microeconomía",                     examen:"2026-06-12T09:00", metaHoras:28 },
  { id:"seminario",      nombre:"Seminario: Argentina en el Mundo",  examen:"2026-06-15T09:00", metaHoras:12 },
  { id:"filosofia",      nombre:"Filosofía",                         examen:"2026-06-17T09:00", metaHoras:15 },
  { id:"antropologia",   nombre:"Antropología",                      examen:"2026-06-19T09:00", metaHoras:15 },
  { id:"logica",         nombre:"Taller de Lógica y Oratoria",       examen:"2026-06-22T09:00", metaHoras:10 },
  { id:"redaccion",      nombre:"Taller Comunicación y Redacción",   examen:"2026-06-24T09:00", metaHoras:10 },
];

export const DATA_DEFAULT: AppData = {
  materias:    MATERIAS_DEFAULT,
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
