# Forecast Demo — GitHub Pages

Esta versión estática conserva la interfaz V9, contratos ficticios y portales Manager / Aprobador. No requiere Python, SQLite, Azure ni licencias Power Apps.

## Publicación
1. Crea un repositorio en GitHub con **solo** estos archivos: `index.html`, `styles.css`, `app.js`, `seed.js`, `.nojekyll`.
2. En el repositorio, abre Settings → Pages → Build and deployment.
3. Elige `Deploy from a branch`, `main` y `/ (root)` y guarda.
4. Abre la dirección que GitHub indique tras publicar.

No subas `forecast_demo.db`, correos reales ni información corporativa. Si la empresa restringe GitHub público, consulta a TI.

## Uso
- Los perfiles de Camila y Diego permiten proponer modificaciones.
- Los perfiles de Paula e Iván permiten aprobar o rechazar por contrato y mes.
- El Manager puede reemplazar propuestas pendientes.
- Al aprobar, `Valor Actual Contrato` aumenta o disminuye según el delta propuesto-vigente; `Valor Contrato` no cambia. Si se rechaza, ambos quedan intactos.
- Se conservan los datos en `localStorage`, solo en el mismo navegador/perfil/equipo.
- `Reiniciar demo` restaura los datos ficticios originales.
- No hay autenticación ni colaboración compartida entre equipos.

Nota funcional: el incremento de Valor Actual Contrato con el cambio neto mensual es una **regla simulada explícitamente solicitada para la demo**; en un escenario productivo habría que validar la distinción entre ajustes de Forecast y modificaciones contractuales formales.

## Prueba
1. Abrir `index.html` o la página de GitHub Pages.
2. Camila Torres, `CT-001`, noviembre 2026 (si sigue siendo mes actual o futuro), modificar y `Enviar cambios`.
3. Paula Fuentes, aprobar esa propuesta.
4. Volver a Camila y comprobar que Valor Actual Contrato cambió por la diferencia aprobada.

Para pruebas en fechas posteriores selecciona cualquier mes vigente o futuro dentro de la duración del contrato.
