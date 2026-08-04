# Validación funcional

## Alcance agregado en versión 7

Se añadieron pruebas para autorización de líder, confirmación destructiva, eliminación selectiva del histórico mediante `distribution_id`, conservación de auditoría, instantáneas publicadas y catálogos parametrizables. La migración `0004` crea `published_distributions` y agrega el vínculo al histórico sin alterar filas anteriores.

Fecha de revisión: 25 de julio de 2026.

## Resultado verificable

La versión supera TypeScript, lint, la compilación de producción, la validación
del artefacto y 23 pruebas automatizadas. La vista previa local quedó
ejecutándose, pero el navegador remoto de validación no pudo conectarse a ella;
por eso este reporte no presenta recorridos visuales como si hubieran sido
completados.

| Área | Prueba automatizada o estática | Resultado |
|---|---|---|
| Perfiles de capacidad | Generación completa y balanceada con 3–10 analistas operativos | Correcto |
| Plantillas del Excel | Umbrales evaluados con QA ocupando una persona del turno | Correcto |
| Frentes críticos | News, Búsquedas e In Progress quedan con responsables distintos | Correcto |
| QA | Requiere al menos cuatro personas seleccionadas y queda sola | Correcto |
| Provider Replies | Dos responsables y notas Cloudflare / demás proveedores | Correcto |
| Búsquedas manuales | Dos responsables y particularidades clientes del día / búsquedas generales | Correcto |
| Reducción del equipo | Al pasar de cuatro a tres operativos desaparece `New Takedowns 2` | Correcto |
| Balance | Diferencia de peso acotada en todos los perfiles de 3–10 | Correcto |
| Particularidades | Serialización, clonación y activación futura conservan las notas por asignación | Correcto |
| Programación | Franjas del mismo día, nocturnas y detección de solapamientos | Correcto |
| Validación de estado | Bloqueo de responsables duplicados, tareas duplicadas y frentes críticos mezclados | Correcto |
| Autenticación | Normalización de usuarios, PBKDF2 y cookie HttpOnly | Correcto |
| Base de datos | Migración generada para descripción y particularidad históricas | Correcto |
| Producción | Worker ESM y manifiesto de alojamiento presentes | Correcto |
| Interfaz | TypeScript y lint sin errores ni advertencias | Correcto |

## Casos cubiertos por las 17 pruebas

- Una prueba del artefacto renderizado y su metadato de desarrollo.
- Cuatro pruebas de autenticación y seguridad.
- Trece pruebas de dominio de distribución, registro unificado, programación,
  balance, umbrales, particularidades, retiro de analistas y activación
  automática.

## Reglas verificadas

- El catálogo inicial sigue los frentes observados en el Excel.
- Los umbrales se calculan con analistas operativos; QA no aumenta la capacidad
  disponible para duplicar tareas.
- Las tareas de una misma familia intentan quedar con personas diferentes.
- Retirar una persona regenera el perfil; las variantes que dejan de aplicar
  se eliminan y se informa cuáles fueron.
- La particularidad se guarda dentro de la distribución, no solo en el
  catálogo.
- Al publicar, el histórico copia nombre, descripción y particularidad; queda
  congelado para consultas de QA.
- Un analista sin una cuenta activa no es elegible, y el servidor rechaza una
  distribución que intente incluirlo.
- Cuenta y perfil operativo se crean, actualizan y eliminan juntos.

## Comandos de control

```bash
npm run lint
npm test
```

## Validación manual recomendada en Windows

Después de descomprimir en una carpeta nueva:

1. Crea el primer líder.
2. En **Equipo**, registra cinco analistas con contraseña.
3. Genera una distribución con esos cinco analistas y sin QA.
4. Confirma que existan dos Provider Replies con particularidades distintas.
5. Edita una particularidad, publica y búscala en **Histórico**.
6. Redistribuye, retira dos personas hasta quedar en tres operativos y confirma
   que `New Takedowns 2` desaparezca.
7. Cierra sesión con el líder e ingresa como uno de los analistas para verificar
   su grupo en Inicio y el histórico individual/grupal.
