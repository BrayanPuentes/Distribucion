# Distribución Operativa V2

## Alcance

La V2 reemplaza el reparto por puntajes con plantillas fijas configurables por líderes. Cada plantilla corresponde a una combinación de turno y cantidad de analistas.

Incluye:

- Tres turnos: 6–2, 2–10 y 10–6.
- Plantillas iniciales para 1 a 9 analistas por turno.
- Editor de grupos y tareas en **Plantillas**.
- Reasignación manual antes de publicar.
- Edición de horario y composición en programaciones futuras, activas o expiradas.
- Edición de tareas en distribuciones publicadas anteriores.
- Histórico con hora inicial y final.
- Catálogo actualizado, con retiros, unificaciones, cambios de nombre y tareas nuevas.

## Conservación de datos

No se debe eliminar ni recrear D1. Al primer acceso, la API normaliza el catálogo y agrega las propiedades V2 al estado existente. Las tablas, usuarios, auditoría, programaciones, publicaciones e histórico se conservan.

Las plantillas se guardan dentro de `app_state`. Modificar una plantilla no altera instantáneas publicadas ni programaciones existentes.

## Publicación desde GitHub

1. Crea una rama de respaldo desde la versión actualmente desplegada.
2. Copia el contenido de esta versión sobre el repositorio, sin reemplazar secretos, archivos `.env`, `.wrangler` ni la identidad de hosting existente.
3. Ejecuta `npm ci`, `npm test` y `npm run build`.
4. Confirma los cambios y súbelos a la rama conectada con Cloudflare.
5. Cuando termine el despliegue, entra como líder y revisa **Plantillas** antes de publicar la primera distribución V2.

## Comprobación funcional recomendada

- Abrir una plantilla para cada turno y guardar un cambio menor.
- Generar un borrador con 5 analistas y confirmar que `Tickets QA` queda solo si se habilita.
- Generar otro con 7 analistas y confirmar que `Check Threat Alerts 3` tiene grupo propio.
- Mover una tarea en la previsualización y programar la distribución.
- Editar esa programación y volver a mover una tarea.
- Editar una distribución anterior y comprobar que el histórico se actualiza sin duplicados.
