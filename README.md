# Scriptorium — Sala de lectura

App web para lectura rápida: sube un PDF o pega texto, configura cuántas palabras ver a la vez y la velocidad, y lee por chunks.

## Cómo usar

1. **Abrir la app**  
   Sirve el proyecto con un servidor local (recomendado para que el PDF funcione bien):

   ```bash
   npx serve .
   ```

   Luego abre en el navegador la URL que muestre (por ejemplo `http://localhost:3000`).

   También puedes abrir `index.html` directamente; la lectura de texto pegado funcionará, pero la extracción de PDF puede fallar en algunos navegadores.

2. **Contenido**  
   - **Pegar texto**: pestaña “Pegar texto” y escribe o pega el contenido.  
   - **PDF**: pestaña “Subir PDF” y elige un archivo.

3. **Ajustes**  
   - **Palabras por vez**: 1–5 (cuántas palabras se muestran en cada paso).  
   - **Velocidad**: palabras por minuto (60–600).

4. **Lectura**  
   Pulsa “Comenzar lectura”. Usa ⏸ Pausar, ▶ Reanudar y “Salir” para volver a la configuración.

5. **Tema**  
   El botón ☀️/🌙 en la cabecera cambia entre tema claro y oscuro. La preferencia se guarda en `localStorage`.

## Tecnologías

- HTML, JavaScript vanilla y [Tailwind CSS](https://tailwindcss.com/) (CDN) para los estilos.
- [PDF.js](https://mozilla.github.io/pdf.js/) (cdnjs) para extraer texto de PDFs.
- [Sunlit](https://github.com/jackyzha0/sunlit) para el fondo de pared con luz filtrada (día/noche según el tema).

## Estructura

- `index.html` — estructura, estilos Tailwind y controles.
- `app.js` — lógica: tema, pestañas, extracción de PDF, chunks, velocidad y controles de lectura.
- `sunlit.css` — estilos del fondo Sunlit (perspectiva, persianas, luz).
