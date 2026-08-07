# Cambios V2

## 2.1.0 — Rotación justa por turno

- Asignación automática según exposición de cada analista durante los últimos 7 y 30 días.
- Penalización de repeticiones consecutivas del mismo grupo.
- Cálculo independiente para los tres turnos.
- Las programaciones futuras previas también participan en la rotación.
- Las reasignaciones manuales guardadas alimentan el siguiente cálculo.
- Identificadores estables de analista, grupo y tarea en el histórico.

- Nuevo modelo de `DistributionTemplate` persistido dentro del estado.
- 27 plantillas iniciales: tres turnos por nueve capacidades.
- Generador determinista por plantilla; los puntajes dejan de intervenir en la distribución.
- Nueva sección de administración **Plantillas** para líderes.
- Catálogo operativo actualizado según el listado aprobado.
- `Tickets QA` permanece exclusivo y `Check Threat Alerts 3` obtiene grupo independiente desde siete analistas en la matriz inicial.
- El editor de programaciones abre también la composición y permite mover tareas.
- Las publicaciones anteriores exponen **Editar tareas** y actualizan su publicación e histórico asociados.
- Se conservan rangos de vigencia, recuperación de programaciones expiradas, autenticación, auditoría y control de concurrencia.
- Pruebas del dominio actualizadas para el modelo V2.
