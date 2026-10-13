# Perfiles en la web (para sumar a ciudad-hockey.web.app)

Los datos ya están en Firestore (`ccba_perfiles/datos`, se regeneran solos en cada actualización).
Estos dos archivos los muestran; no dependen de ningún framework.

- `perfiles.js` — lee los perfiles y arma:
  - `cumpleaniosHTML(perfiles, 7)`: cumpleaños de los próximos 7 días, con el texto sugerido para el post;
  - `fichaHTML(perfil)`: ficha del jugador/a (equipo, número, PJ y goles de la temporada, recorrido año a año,
    fecha de nacimiento si tiene 18+ o categoría si es menor);
  - `buscar(perfiles, 'texto')`, `textoPost(perfil)`, `temporada(perfil)`, `edad(fecha)`.
- `ejemplo.html` — página de prueba: cumpleaños de la semana + buscador con ficha.

## Cómo sumarlo a tu web

1. Copiá `perfiles.js` (y si querés `ejemplo.html`) a la carpeta pública de tu web (la que publica `firebase deploy`, normalmente `public/`).
2. Probalo: `firebase serve` (o `firebase emulators:start --only hosting`) y abrí `http://localhost:5000/ejemplo.html`.
3. Para integrarlo a tus páginas, importá las funciones y pasale tu instancia de Firestore:
   ```js
   import { cargarPerfiles, cumpleaniosHTML, fichaHTML, buscar } from './perfiles.js';
   const perfiles = await cargarPerfiles(db);           // db = el getFirestore(...) que ya usa tu web
   document.querySelector('#cumples').innerHTML = cumpleaniosHTML(perfiles, 7);
   ```
   Si tu web usa el SDK de Firebase por npm en vez de los links de gstatic, cambiá la primera línea de
   `perfiles.js` por `import { doc, getDoc } from 'firebase/firestore';`.
4. `firebase deploy`.

Para enlazar desde la lista de jugadores de un equipo: cada perfil tiene `rama` y `nombre`, y sus
`temporadas` del año actual tienen `div`, `tira` y `numero`, igual que los jugadores del paquete.
