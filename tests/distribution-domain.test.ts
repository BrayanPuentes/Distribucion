import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScheduleLocalRange,
  generateDraftGroups,
  initialState,
  initialTasks,
  initialTemplates,
  initialsFor,
  resolveScheduledDistributions,
  schedulesOverlap,
  validateState,
  type ScheduledDistribution,
} from "../lib/distribution.ts";

test("construye rangos del mismo día y turnos que cruzan medianoche", () => {
  assert.deepEqual(buildScheduleLocalRange("2026-08-06", "06:00", "14:00"), { startsAt: "2026-08-06T06:00", endsAt: "2026-08-06T14:00" });
  assert.deepEqual(buildScheduleLocalRange("2026-08-06", "22:00", "06:00"), { startsAt: "2026-08-06T22:00", endsAt: "2026-08-07T06:00" });
});

test("genera grupos fijos sin duplicar tareas ni analistas", () => {
  const result = generateDraftGroups([1, 2, 3, 4, 5, 6], initialTasks, true, initialState.analysts, initialTemplates, "Turno 2–10");
  assert.equal(result.error, undefined);
  assert.equal(result.groups.length, 6);
  assert.equal(new Set(result.groups.map((group) => group.analystId)).size, 6);
  const taskIds = result.groups.flatMap((group) => group.taskIds);
  assert.equal(new Set(taskIds).size, taskIds.length);
});

test("Tickets QA queda solo y Threat Alerts 3 obtiene grupo propio desde siete analistas", () => {
  const result = generateDraftGroups([1, 2, 3, 4, 5, 6, 7], initialTasks, true, [], initialTemplates, "Turno 2–10");
  const qa = result.groups.find((group) => group.taskIds.includes(26));
  const threat3 = result.groups.find((group) => group.taskIds.includes(8));
  assert.deepEqual(qa?.taskIds, [26]);
  assert.deepEqual(threat3?.taskIds, [8]);
});

test("cada turno usa su catálogo operativo", () => {
  const day = generateDraftGroups([1, 2, 3], initialTasks, false, [], initialTemplates, "Turno 6–2").groups.flatMap((group) => group.taskIds);
  const night = generateDraftGroups([1, 2, 3], initialTasks, false, [], initialTemplates, "Turno 10–6").groups.flatMap((group) => group.taskIds);
  assert.equal(day.includes(30), false);
  assert.equal(night.includes(30), true);
  assert.equal(night.includes(23), true);
});

test("rechaza capacidades sin plantilla", () => {
  const result = generateDraftGroups(Array.from({ length: 10 }, (_, index) => index + 1), initialTasks, false, [], initialTemplates, "Turno 2–10");
  assert.match(result.error || "", /no existe una plantilla/i);
});

test("detecta superposición de programaciones", () => {
  const scheduled = [{ id: 1, startsAt: "2026-08-06T06:00", endsAt: "2026-08-06T14:00", status: "Programada" }] as ScheduledDistribution[];
  assert.equal(schedulesOverlap(scheduled, "2026-08-06T13:00", "2026-08-06T15:00"), true);
  assert.equal(schedulesOverlap(scheduled, "2026-08-06T14:00", "2026-08-06T22:00"), false);
});

test("la validación bloquea responsables y tareas duplicadas", () => {
  const state = structuredClone(initialState);
  state.groups = [
    { id: 1, name: "A", analystId: 1, taskIds: [1] },
    { id: 2, name: "B", analystId: 1, taskIds: [1] },
  ];
  const result = validateState(state);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /analista|tarea/i);
});

test("activa la programación vigente y expira las terminadas", () => {
  const state = structuredClone(initialState);
  state.scheduled = [
    { id: 1, name: "Anterior", startsAt: "2026-08-06T06:00", endsAt: "2026-08-06T14:00", shift: "Turno 6–2", status: "Programada", analystCount: 1, groups: [{ id: 1, name: "Anterior", analystId: 1, taskIds: [1] }], createdAt: "", createdBy: "Líder", note: "" },
    { id: 2, name: "Vigente", startsAt: "2026-08-06T14:00", endsAt: "2026-08-06T22:00", shift: "Turno 2–10", status: "Programada", analystCount: 1, groups: [{ id: 1, name: "Vigente", analystId: 2, taskIds: [2] }], createdAt: "", createdBy: "Líder", note: "" },
  ];
  const result = resolveScheduledDistributions(state, Date.parse("2026-08-06T15:00"));
  assert.equal(result.state.scheduled[0].status, "Expirada");
  assert.equal(result.state.scheduled[1].status, "Activada");
  assert.equal(result.state.activeScheduleId, 2);
  assert.deepEqual(result.state.groups[0].taskIds, [2]);
});

test("genera iniciales estables", () => {
  assert.equal(initialsFor("María del Pilar"), "MD");
});
