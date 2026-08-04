# Distribución Operativa

Sistema local persistente para crear, revisar, publicar, programar y auditar
distribuciones por turno.

## Novedades de la versión 7

- Archivar y restaurar distribuciones publicadas.
- Eliminar permanentemente publicaciones de prueba con motivo y confirmación `ELIMINAR`.
- Histórico enlazado a la publicación que lo originó, sin borrar logs de auditoría.
- Grupos relacionados de tareas y frentes críticos administrables desde **Tareas**.
- Listas dinámicas para “Frente relacionado” y “Separación crítica”.

Al archivar la distribución vigente, el equipo queda sin asignación activa hasta publicar o restaurar otra. Al restaurar, la composición guardada vuelve a quedar vigente.

## Requisitos

- Node.js 22.13 o superior.
- npm.

## Ejecutar localmente

1. Abre una terminal dentro de esta carpeta.
2. Instala las dependencias:

   ```bash
   npm install
   ```

3. Inicia la aplicación:

   ```bash
   npm run dev
   ```

4. Abre en el navegador la dirección que muestre la terminal.

En el primer inicio se crean automáticamente la base local, sus tablas y los
datos iniciales. La información se conserva dentro de `.wrangler`; no elimines
esa carpeta si deseas mantener las pruebas.

## Primer acceso y usuarios

La primera vez que abras el sistema verás **Crear el primer líder**. Registra:

1. Nombre del líder.
2. Usuario.
3. Contraseña de al menos 10 caracteres.

No existen credenciales predeterminadas. Después de ingresar, abre
**Equipo** para registrar otras personas:

- **Líder:** puede revisar la distribución, mover o retirar tareas individuales,
  previsualizar, publicar, programar, consultar el histórico, administrar
  tareas, equipo, usuarios y logs.
- **Analista:** su cuenta y su perfil operativo se crean juntos. En Inicio ve
  su propio grupo; en Distribuciones consulta las tareas del equipo y en
  Histórico alterna entre su trazabilidad individual y la grupal.

Solo los líderes pueden crear, editar, activar, desactivar o eliminar personas.
Cada persona puede cambiar su propia contraseña desde el menú lateral.

## Funciones incluidas

- Generación guiada con selección previa de analistas y QA opcional.
- Un analista responsable por grupo.
- News, Búsquedas e In Progress con responsables distintos; pueden llevar
  tareas complementarias. QA sí permanece sola.
- Descripción general por tarea y particularidad sugerida.
- Particularidad editable por asignación, visible para el responsable.
- Edición de responsables, movimiento y retiro de tareas individuales.
- Retiro o incorporación de analistas con regeneración de las tareas que
  aplican para el nuevo tamaño del turno.
- Plantillas dinámicas de 3 a 10 analistas reconstruidas desde el Excel:
  `New Takedowns 2`, `Provider Replies 2`, búsquedas adicionales y demás
  variantes aparecen únicamente cuando existe capacidad.
- Previsualización antes de publicar o programar.
- Programación futura con fecha, turno y horas definidos desde la primera
  pantalla, además de validación de solapamientos.
- Edición, duplicación, visualización y eliminación de programaciones que aún
  no estuvieron vigentes.
- Activación automática de programaciones al abrir o actualizar el sistema.
- Administración persistente de tareas y equipo.
- Login real con usuarios, contraseñas derivadas mediante PBKDF2, sesiones
  HttpOnly, bloqueo temporal de intentos repetidos y permisos validados por el
  servidor.
- Registro unificado de líderes y analistas, activación, desactivación,
  restablecimiento de contraseña y eliminación controlada.
- Histórico filtrable por texto, fecha, turno, analista, tarea y grupo.
- Histórico con la descripción y la particularidad exactas que estuvieron
  vigentes; cambios posteriores en el catálogo no alteran esa evidencia.
- Logs filtrables por nivel y módulo, con identificador de solicitud, detalle
  técnico y exportación CSV.
- Registro automático de errores de API, base de datos, validaciones y errores
  no controlados de la interfaz.

## Persistencia, histórico y reglas

- Personas, tareas, distribución vigente, programaciones, versiones, auditoría
  e histórico, usuarios y sesiones se guardan en la base local.
- El modo claro/oscuro se guarda solamente en el navegador.
- News, Búsquedas e In Progress deben tener responsables distintos.
- QA es opcional.
- QA es exclusiva.
- Solo existe un analista responsable por grupo.
- Un analista solo puede seleccionarse si tiene una cuenta activa.
- El número mínimo indicado en cada tarea cuenta analistas operativos; si QA
  está activa, su responsable se reserva aparte.
- Los borradores no crean histórico; publicar sí.
- Una programación eliminada antes de entrar en vigencia no crea histórico
  operativo, pero la acción queda registrada en los logs.
- Una distribución que ya estuvo vigente no se elimina, porque se conserva para
  auditoría y consultas de QA.
- El control de revisión evita sobrescrituras silenciosas entre dos sesiones.

## Dejar distribuciones preparadas

1. Entra como líder y abre **Programación**.
2. Selecciona **Nueva programación**.
3. Define la fecha de activación, el turno y las horas.
4. Selecciona los analistas disponibles y decide si se incluye QA.
5. Genera y ajusta el borrador.
6. En la previsualización confirma el botón **Programar para [fecha]**.

La fecha permanece visible durante la edición y la previsualización. Cuando
llegue la hora indicada, la distribución se activará automáticamente sin que
un líder tenga que estar conectado. Puedes repetir el proceso o duplicar una
programación para dejar cubiertos varios días.

## Verificación

Ejecuta la validación completa con:

```bash
npm test
```

El reporte de los flujos revisados está en `VALIDACION.md`.

## Probar esta versión

Descomprime v6 en una carpeta nueva y deja que cree su propia `.wrangler`. Así
iniciará con el catálogo reconstruido desde el Excel y sin cuentas de prueba.
No copies la `.wrangler` de v5: esa base contiene el catálogo demostrativo
anterior. La migración de datos reales entre catálogos debe hacerse de forma
controlada cuando se defina el alojamiento definitivo.
