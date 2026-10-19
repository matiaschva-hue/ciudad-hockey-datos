// Fotos de las leyendas: cambiarlas desde la web sin tocar los archivos de la PC.
// Las fotos de la PC siguen siendo las de siempre; si alguien sube una nueva desde Ciudad Studio,
// queda guardada en Firestore (ccba_leyendas_fotos/<id>) y la web muestra esa en lugar de la de la PC.
// "Volver a la original" la borra de Firestore y vuelve la de la PC.
//
//   import { cargarFotosLeyendas, aplicarFotos, botonCambiarFoto } from './leyendas-fotos.js';
//   aplicarFotos(await cargarFotosLeyendas(db));          // en la página de leyendas
//   el.append(botonCambiarFoto(db, 'juan-perez'));          // solo en Ciudad Studio
//
// En el HTML, cada foto de leyenda lleva su id:  <img src="img/leyendas/juan-perez.jpg" data-leyenda="juan-perez">
// La foto se achica en el navegador antes de subirla (lado mayor 900 px, JPEG): queda en ~100-200 KB.
import { collection, doc, getDocs, setDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';

const COL = 'ccba_leyendas_fotos';
const LADO = 900, CALIDAD = 0.82, MAX_BYTES = 700 * 1024; // un documento de Firestore admite hasta 1 MB

export async function cargarFotosLeyendas(db) {
  const out = {};
  for (const d of (await getDocs(collection(db, COL))).docs) out[d.id] = d.data();
  return out;
}

// Reemplaza el src de las <img data-leyenda="..."> que tengan foto nueva
export function aplicarFotos(fotos, raiz = document) {
  for (const img of raiz.querySelectorAll('img[data-leyenda]')) {
    const f = fotos[img.dataset.leyenda];
    if (!img.dataset.original) img.dataset.original = img.getAttribute('src') || '';
    img.src = f?.foto || img.dataset.original;
  }
}

// Archivo de imagen → JPEG achicado (data URL)
export async function achicar(archivo, lado = LADO) {
  const bmp = await createImageBitmap(archivo);
  const k = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  let q = CALIDAD, url = c.toDataURL('image/jpeg', q);
  while (url.length > MAX_BYTES && q > 0.4) url = c.toDataURL('image/jpeg', (q -= 0.1));
  if (url.length > MAX_BYTES) throw new Error('La foto quedó muy pesada, probá con otra.');
  return url;
}

export async function subirFotoLeyenda(db, id, archivo, por = '') {
  const foto = await achicar(archivo);
  await setDoc(doc(db, COL, id), { foto, actualizado: new Date().toISOString(), por });
  return foto;
}

export const volverAOriginal = (db, id) => deleteDoc(doc(db, COL, id));

// Descarga la foto nueva, para guardarla también en la carpeta de la PC si se quiere
export function descargar(foto, id) {
  const a = document.createElement('a');
  a.href = foto; a.download = `${id}.jpg`; a.click();
}

// Botones para Ciudad Studio: "Cambiar foto", "Descargar" y "Volver a la original"
export function botonCambiarFoto(db, id, { por = '', alCambiar } = {}) {
  const caja = document.createElement('span');
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true });
  const cambiar = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Cambiar foto' });
  const bajar = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Descargar', hidden: true });
  const original = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Volver a la original' });
  let ultima = null;
  const refrescar = async () => { const f = await cargarFotosLeyendas(db); aplicarFotos(f); alCambiar?.(f[id]); };
  cambiar.onclick = () => input.click();
  input.onchange = async () => {
    const a = input.files[0]; if (!a) return;
    cambiar.disabled = true; cambiar.textContent = 'Subiendo…';
    try { ultima = await subirFotoLeyenda(db, id, a, por); bajar.hidden = false; await refrescar(); }
    catch (e) { alert('No se pudo subir la foto: ' + e.message); }
    finally { cambiar.disabled = false; cambiar.textContent = 'Cambiar foto'; input.value = ''; }
  };
  bajar.onclick = () => ultima && descargar(ultima, id);
  original.onclick = async () => { if (!confirm('¿Volver a la foto original?')) return; await volverAOriginal(db, id); bajar.hidden = true; await refrescar(); };
  caja.append(input, cambiar, ' ', bajar, ' ', original);
  return caja;
}
