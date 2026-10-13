// Padrón del club (Excel con Apellido, Nombres, Fecha nacimiento, Categoria, Genero) → ccba_padron/datos.
// Solo quienes figuran en las planillas de la temporada. Regla del club:
//  - desde los 18 (o si cumple 18 en su próximo cumpleaños): fecha de nacimiento;
//  - menores: solo la categoría, nunca la fecha.
// El Excel no se guarda en ningún lado: se lee, se cruza y se sube solo lo publicable.
// Uso: node padron.mjs <padron.xlsx> [--seco]
import ExcelJS from 'exceljs';

const archivo = process.argv[2];
const SECO = process.argv.includes('--seco');
if (!archivo) { console.error('Uso: node padron.mjs <padron.xlsx> [--seco]'); process.exit(1); }

const tokens = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);
const igual = (a, b) => a.length === b.length && [...a].sort().join(' ') === [...b].sort().join(' ');

export function leerPadron(filas) {
  // filas: [{ apellido, nombres, nacimiento: 'YYYY-MM-DD', categoria, genero }]
  return filas.filter((f) => f.apellido && /^\d{4}-\d{2}-\d{2}$/.test(f.nacimiento)).map((f) => ({
    ...f, rama: /fem/i.test(f.genero) ? 'damas' : 'caballeros',
    tok: tokens(`${f.apellido} ${f.nombres}`), plano: tokens(`${f.apellido} ${f.nombres}`).join(' '),
  }));
}

// nombre de planilla ("Apellido Nombre", a veces cortado con "..." o sin el segundo nombre) → persona del padrón
export function cruzar(rama, nombrePlanilla, padron) {
  const cand = padron.filter((c) => c.rama === rama);
  const t = tokens(nombrePlanilla.replace(/\.+\s*$/, ''));
  let m = cand.filter((c) => igual(c.tok, t));
  if (!m.length && /\.\.\.\s*$/.test(nombrePlanilla)) { const pl = t.join(' '); if (pl.length >= 8) m = cand.filter((c) => c.plano.startsWith(pl)); }
  if (!m.length && t.length >= 2) m = cand.filter((c) => t.every((x) => c.tok.includes(x)));
  if (m.length > 1 && new Set(m.map((c) => c.nacimiento)).size === 1) m = m.slice(0, 1); // repetido en el padrón
  return m.length === 1 ? m[0] : m.length ? 'ambiguo' : null;
}

// Lo que se publica de cada persona según la regla del club
export function publicable(c, hoy = new Date()) {
  const [y, mo, d] = c.nacimiento.split('-').map(Number);
  const yaCumplio = hoy.getMonth() + 1 > mo || (hoy.getMonth() + 1 === mo && hoy.getDate() >= d);
  const cumple = hoy.getFullYear() - y + (yaCumplio ? 1 : 0); // años que cumple en su próximo cumpleaños
  return cumple >= 18 ? { nacimiento: c.nacimiento } : { categoria: c.categoria || null };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(archivo);
  const ws = wb.worksheets[0];
  // la fila de encabezados puede no ser la primera (hay planillas con filas vacías arriba)
  let filaCab = 1;
  ws.eachRow((row, i) => { if (filaCab === 1 && row.values.some((v) => /^apellido/i.test(String(v || '').trim()))) filaCab = i; });
  const cab = ws.getRow(filaCab).values.map((v) => String(v || '').trim().toLowerCase());
  const col = (re) => cab.findIndex((v) => re.test(v));
  const C = { apellido: col(/^apellido/), nombres: col(/^nombre/), nacimiento: col(/nacimiento/), categoria: col(/^categor/), genero: col(/^g[eé]nero|^sexo/) };
  if (Object.values(C).some((i) => i < 0)) throw new Error('Faltan columnas en el padrón: ' + JSON.stringify(C));
  const fecha = (v) => v instanceof Date ? v.toISOString().slice(0, 10) : String(v || '').slice(0, 10);
  const filas = [];
  ws.eachRow((row, i) => { if (i > filaCab) filas.push({ apellido: String(row.getCell(C.apellido).value || '').trim(), nombres: String(row.getCell(C.nombres).value || '').trim(), nacimiento: fecha(row.getCell(C.nacimiento).value), categoria: row.getCell(C.categoria).value || null, genero: String(row.getCell(C.genero).value || '') }); });
  const padron = leerPadron(filas);

  const { initializeApp } = await import('firebase/app');
  const { getFirestore, doc, getDoc, setDoc } = await import('firebase/firestore');
  const db = getFirestore(initializeApp({ apiKey: 'AIzaSyB4xqW0rHESTovZqGQUIsUR07XBekqjuX0', authDomain: 'muni-hockey.firebaseapp.com', projectId: 'muni-hockey' }));
  const actual = JSON.parse((await getDoc(doc(db, 'ccba_cache', 'datos'))).data().json);

  const personas = {}, cuenta = { mayores: 0, menores: 0, sin: [], ambiguos: [] };
  const vistos = new Set();
  for (const j of Object.values(actual.jugadores)) {
    const rama = j.equipo.split('-')[0], k = `${rama}|${j.nombre}`;
    if (vistos.has(k)) continue; vistos.add(k);
    const c = cruzar(rama, j.nombre, padron);
    if (!c) { cuenta.sin.push(k); continue; }
    if (c === 'ambiguo') { cuenta.ambiguos.push(k); continue; }
    personas[k] = publicable(c);
    personas[k].nacimiento ? cuenta.mayores++ : cuenta.menores++;
  }
  console.log(`${padron.length} en el padrón · ${vistos.size} en planillas → ${cuenta.mayores} con fecha (18+) · ${cuenta.menores} menores con categoría · ${cuenta.sin.length} sin cruzar · ${cuenta.ambiguos.length} ambiguos`);
  if (!SECO) { await setDoc(doc(db, 'ccba_padron', 'datos'), { json: JSON.stringify({ v: 1, actualizado: new Date().toISOString(), personas }), actualizado: new Date().toISOString() }); console.log('Subido ccba_padron/datos'); }
  process.exit(0);
}
