// Fechas importantes para las redes del club (pedido del CM, 22/10/2026). [mes-día, título, idea para el posteo]
// Las que cambian de día cada año (Día del Padre, del Niño, de la Madre) se calculan abajo.
export const FIJAS = [
  ['01-01', 'Año Nuevo', 'saludo de año nuevo del club'],
  ['02-04', 'Día Mundial contra el Cáncer', 'mensaje de concientización'],
  ['03-08', 'Día Internacional de la Mujer', 'posteo con las jugadoras del club'],
  ['03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia', 'posteo institucional'],
  ['04-02', 'Día del Veterano y de los Caídos en Malvinas', 'posteo institucional'],
  ['04-06', 'Día Internacional del Deporte para el Desarrollo y la Paz', 'posteo sobre el deporte en el club'],
  ['05-01', 'Día del Trabajador', 'saludo institucional'],
  ['05-25', 'Revolución de Mayo', 'fecha patria'],
  ['06-03', 'Ni Una Menos', 'posteo institucional'],
  ['06-17', 'Paso a la Inmortalidad del Gral. Güemes', 'fecha patria'],
  ['06-20', 'Día de la Bandera', 'fecha patria'],
  ['07-09', 'Día de la Independencia', 'fecha patria'],
  ['07-20', 'Día del Amigo', 'posteo con fotos de equipo'],
  ['08-17', 'Paso a la Inmortalidad del Gral. San Martín', 'fecha patria'],
  ['09-11', 'Día del Maestro', 'saludo a los entrenadores y profes del club'],
  ['09-21', 'Día del Estudiante y de la Primavera', 'posteo con las inferiores'],
  ['10-01', 'Comienza Octubre Rosa', 'prendé el modo rosa en Ciudad Studio'],
  ['10-06', 'Aniversario del Club Ciudad de Buenos Aires (1920)', 'posteo de aniversario del club'],
  ['10-12', 'Día del Respeto a la Diversidad Cultural', 'fecha patria'],
  ['10-19', 'Día Mundial de la Lucha contra el Cáncer de Mama', 'posteo rosa de concientización'],
  ['11-20', 'Día de la Soberanía Nacional', 'fecha patria'],
  ['12-08', 'Día de la Inmaculada Concepción', 'feriado'],
  ['12-24', 'Nochebuena', 'saludo de fiestas'],
  ['12-25', 'Navidad', 'saludo de fiestas'],
  ['12-31', 'Fin de año', 'resumen del año del club'],
];
// n-ésimo domingo de un mes (Argentina: Padre 3er dom. de junio, Niño 3er dom. de agosto, Madre 3er dom. de octubre)
const domingo = (anio, mes, n) => { const d = new Date(Date.UTC(anio, mes - 1, 1)); const primero = (7 - d.getUTCDay()) % 7 + 1; return `${String(mes).padStart(2, '0')}-${String(primero + 7 * (n - 1)).padStart(2, '0')}`; };
export function fechasDe(fecha) { // 'YYYY-MM-DD' → [{ titulo, idea }]
  const anio = +fecha.slice(0, 4), md = fecha.slice(5);
  const variables = [[domingo(anio, 6, 3), 'Día del Padre', 'saludo a los papás del club'], [domingo(anio, 8, 3), 'Día del Niño', 'posteo con las escuelitas e inferiores'], [domingo(anio, 10, 3), 'Día de la Madre', 'saludo a las mamás del club']];
  return [...FIJAS, ...variables].filter(([f]) => f === md).map(([, titulo, idea]) => ({ titulo, idea }));
}
