# Validación funcional

Fecha de revisión: 25 de julio de 2026.

## Resultado

La compilación de producción, la validación del artefacto de Sites y las pruebas
automatizadas finalizaron correctamente. También se ejecutaron los flujos
principales en el navegador contra la base local.

| Área | Prueba realizada | Resultado |
|---|---|---|
| Configuración inicial | Creación del primer líder sin credenciales predeterminadas | Correcto |
| Inicio de sesión | Acceso con credenciales reales como líder y analista | Correcto |
| Contraseña | Cambio propio, cierre de sesiones anteriores, rechazo de la clave anterior y acceso con la nueva | Correcto |
| Usuarios | Alta de analista vinculado, alta de otro líder y eliminación controlada | Correcto |
| Permisos | Navegación y operaciones de administración ocultas al analista; autorización aplicada en el servidor | Correcto |
| Vista del analista | Inicio con su grupo y Distribuciones con los seis grupos del equipo | Correcto |
| Histórico por alcance | Accesos rápidos a “Mi histórico” e “Histórico grupal”, además de filtros detallados | Correcto |
| Generador | Selección de seis analistas y creación de borrador | Correcto |
| Reglas exclusivas | News, Búsquedas e In Progress separados; QA opcional | Correcto |
| Edición | Movimiento de tareas y retiro/reincorporación de un analista | Correcto |
| Previsualización | Modal opaco, legible y con resumen de cambios | Correcto |
| Publicación | Nueva versión e histórico por tarea | Correcto |
| Programación | Fecha explícita desde el primer paso, conservación durante edición y previsualización, guardado del 26/07 y eliminación posterior | Correcto |
| Eliminación | Confirmación y eliminación de programación no vigente | Correcto |
| Persistencia | Recarga del navegador conservando datos | Correcto |
| Tareas | Alta y eliminación persistentes | Correcto |
| Analistas | Alta y eliminación persistentes | Correcto |
| Histórico | Búsqueda por tarea con resultado filtrado | Correcto |
| Logs | Filtros, actualización y registro de advertencia de validación | Correcto |
| Logs de acceso | Alta de usuario, inicios correctos y fallidos, cambio de contraseña, cierre de sesión y eliminación | Correcto |
| Consola | Carga limpia sin errores propios de la aplicación | Correcto |

## Pruebas automatizadas

- Generación completa sin analistas ni tareas duplicados.
- Exclusividad de QA, News, Búsquedas e In Progress.
- Rechazo cuando no hay suficientes analistas.
- Detección de solapamientos entre programaciones.
- Construcción correcta de franjas del mismo día y turnos nocturnos que
  finalizan al día siguiente.
- Validación de responsables duplicados y tareas exclusivas compartidas.
- Iniciales para nuevos analistas.
- Activación automática de una programación vigente y expiración de bloques
  anteriores.
- Renderizado del artefacto y presencia del Worker y manifiesto requeridos.
- Normalización y validación de nombres de usuario.
- Derivación y verificación de contraseñas sin conservar texto visible.
- Atributos HttpOnly, SameSite y Secure de la cookie según el entorno.

En total se ejecutan 12 pruebas automatizadas, además de TypeScript, lint,
compilación y validación interactiva en navegador.

## Nota operativa

Las distribuciones que ya estuvieron vigentes se conservan para auditoría. El
botón de eliminación se ofrece únicamente en programaciones que todavía no
entraron en vigencia.
