# Distribución Operativa 2.1

La asignación automática combina plantillas fijas con rotación justa por turno. El motor compara el histórico de los últimos 7 y 30 días, evita repeticiones consecutivas y considera las programaciones anteriores a la fecha que se está preparando. Los líderes conservan la reasignación manual antes de guardar.

Sistema local persistente para crear, revisar, publicar, programar y auditar
distribuciones por turno.

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
**Usuarios** para registrar otras cuentas:

- **Líder:** puede revisar la distribución, mover tareas individuales,
  previsualizar, publicar, programar, consultar el histórico, administrar
  tareas, analistas, usuarios y logs.
- **Analista:** debe vincularse con un analista del catálogo. En Inicio ve su
  propio grupo; en Distribuciones consulta las tareas del equipo y en Histórico
  alterna entre su trazabilidad individual y la grupal.

Solo los líderes pueden crear, editar, activar, desactivar o eliminar cuentas.
Cada persona puede cambiar su propia contraseña desde el menú lateral.

## Funciones incluidas

- Generación guiada con selección previa de analistas y QA opcional.
- Un analista responsable por grupo.
- News, Búsquedas, In Progress y QA siempre en grupos exclusivos.
- Edición de responsables y movimiento de tareas individuales.
- Retiro y reincorporación de analistas durante la preparación.
- Previsualización antes de publicar o programar.
- Programación futura con fecha, turno y horas definidos desde la primera
  pantalla, además de validación de solapamientos.
- Edición, duplicación, visualización y eliminación de programaciones que aún
  no estuvieron vigentes.
- Activación automática de programaciones al abrir o actualizar el sistema.
- Administración persistente de tareas y analistas.
- Login real con usuarios, contraseñas derivadas mediante PBKDF2, sesiones
  HttpOnly, bloqueo temporal de intentos repetidos y permisos validados por el
  servidor.
- Registro de cuentas de líderes y analistas, vínculo de una sola cuenta por
  analista, activación, desactivación, restablecimiento de contraseña y
  eliminación controlada.
- Histórico filtrable por texto, fecha, turno, analista, tarea y grupo.
- Logs filtrables por nivel y módulo, con identificador de solicitud, detalle
  técnico y exportación CSV.
- Registro automático de errores de API, base de datos, validaciones y errores
  no controlados de la interfaz.

## Persistencia, histórico y reglas

- Analistas, tareas, distribución vigente, programaciones, versiones, auditoría
  e histórico, usuarios y sesiones se guardan en la base local.
- El modo claro/oscuro se guarda solamente en el navegador.
- News, Búsquedas, In Progress y QA son tareas exclusivas.
- QA es opcional.
- Solo existe un analista responsable por grupo.
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
