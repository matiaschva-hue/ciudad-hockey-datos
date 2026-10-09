// Funciones compartidas entre goleadores.mjs y subir.mjs.

// Nombre normalizado y con las palabras ordenadas: "Pérez, Juan" y "Juan Perez" dan lo mismo
export const nn = (x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
// Normalizado sin ordenar (para comparar prefijos)
const plano = (x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean).join(' ');

// ¿El nombre de la planilla ("Apellido Nombre", a veces cortado con "...") es el de "Apellido, Nombre" (pestaña Goleadores)?
export function mismoNombre(nombrePlanilla, apellidoNombre) {
  if (nn(nombrePlanilla) === nn(apellidoNombre)) return true;
  if (!/\.\.\.\s*$/.test(nombrePlanilla)) return false;
  const corto = plano(nombrePlanilla.replace(/\.+\s*$/, ''));
  return corto.length >= 8 && plano(apellidoNombre.replace(',', ' ')).startsWith(corto);
}

// Caballeros A y B juegan el mismo torneo y la pestaña Goleadores dice "CIUDAD" para las dos tiras.
// Quien hizo goles en las dos tiras aparece en dos filas (una por equipo, cada una con sus PJ).
// Reparte las filas entre las tiras con los PJ de las planillas:
//  - dos filas: la de más PJ va a la tira donde jugó más partidos, la otra a la otra tira;
//  - una fila: a la tira cuyos PJ en planillas se parecen más a los de la fila.
// filas: [{ apellidoNombre, pj, ... }] · planteles: { a: [{ nombre, pj }], b: [...] } → misma lista con .tira ('A' | 'B')
export function repartirTiras(filas, planteles) {
  const pjEn = (an, t) => (planteles[t] || []).filter((j) => mismoNombre(j.nombre, an)).reduce((m, j) => Math.max(m, +j.pj || 0), 0);
  const grupos = new Map();
  for (const f of filas) { const k = nn(f.apellidoNombre.replace(',', ' ')); grupos.set(k, [...(grupos.get(k) || []), f]); }
  const out = [];
  for (const g of grupos.values()) {
    const an = g[0].apellidoNombre;
    const pj = { a: pjEn(an, 'a'), b: pjEn(an, 'b') };
    if (g.length >= 2) {
      const tiras = ['a', 'b'].sort((x, y) => pj[y] - pj[x]);
      [...g].sort((x, y) => y.pj - x.pj).forEach((f, k) => out.push({ ...f, tira: tiras[Math.min(k, 1)].toUpperCase() }));
      continue;
    }
    const f = g[0];
    let tira = 'a';
    if (pj.a || pj.b) tira = ['a', 'b'].sort((x, y) => (pj[x] ? Math.abs(pj[x] - f.pj) : Infinity) - (pj[y] ? Math.abs(pj[y] - f.pj) : Infinity) || pj[y] - pj[x])[0];
    out.push({ ...f, tira: tira.toUpperCase() });
  }
  return out;
}
