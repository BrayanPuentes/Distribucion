import assert from "node:assert/strict";
import test from "node:test";
import {
  type Analyst,
  activeTasksForAnalystCount,
  assignmentNote,
  buildScheduleLocalRange,
  generateDraftGroups,
  groupWeight,
  hydrateGroups,
  initialState,
  initialsFor,
  reconcileAfterAnalystRemoval,
  resolveAnalystRegistration,
  resolveScheduledDistributions,
  schedulesOverlap,
  validateState,
} from "../lib/distribution.ts";

const analysts: Analyst[] = Array.from({ length: 10 }, (_, index) => ({
  id: index + 1,
  name: `Analista ${index + 1}`,
  initials: `A${index + 1}`,
  schedule: "2:00 p. m.–10:00 p. m.",
  status: "Disponible",
  active: true,
}));

test("builds same-day and overnight schedule ranges from an explicit date", () => {
  assert.deepEqual(
    buildScheduleLocalRange("2026-07-28", "14:00", "22:00"),
    {
      startsAt: "2026-07-28T14:00",
      endsAt: "2026-07-28T22:00",
    },
  );
  assert.deepEqual(
    buildScheduleLocalRange("2026-07-28", "22:00", "06:00"),
    {
      startsAt: "2026-07-28T22:00",
      endsAt: "2026-07-29T06:00",
    },
  );
});

test("generates complete and balanced profiles for 3 through 10 operational analysts", () => {
  for (let count = 3; count <= 10; count += 1) {
    const ids = analysts.slice(0, count).map((value) => value.id);
    const result = generateDraftGroups(
      ids,
      initialState.tasks,
      false,
      analysts,
    );
    assert.equal(result.error, undefined, `Perfil de ${count}`);
    const groups = hydrateGroups(result.groups, initialState.tasks);
    assert.equal(groups.length, count);
    const applicable = activeTasksForAnalystCount(
      initialState.tasks,
      count,
      false,
    );
    assert.deepEqual(
      new Set(groups.flatMap((group) => group.tasks.map((value) => value.id))),
      new Set(applicable.map((value) => value.id)),
    );
    const weights = groups.map(groupWeight);
    assert.ok(
      Math.max(...weights) - Math.min(...weights) <= 5,
      `El perfil de ${count} quedó desbalanceado: ${weights.join(", ")}`,
    );
  }
});

test("matches the Excel capacity thresholds when QA consumes one selected analyst", () => {
  for (let totalSelected = 4; totalSelected <= 10; totalSelected += 1) {
    const result = generateDraftGroups(
      analysts.slice(0, totalSelected).map((value) => value.id),
      initialState.tasks,
      true,
      analysts,
    );
    assert.equal(result.error, undefined, `Plantilla total ${totalSelected}`);
    const groups = hydrateGroups(result.groups, initialState.tasks);
    assert.equal(groups.length, totalSelected);
    const names = new Set(
      groups.flatMap((group) => group.tasks.map((value) => value.name)),
    );
    const operational = totalSelected - 1;
    assert.equal(names.has("New Takedowns 2"), operational >= 4);
    assert.equal(names.has("Check Providers Replies 2"), operational >= 5);
    assert.equal(names.has("Phishing/Redirects Manual Searches"), operational >= 5);
    assert.equal(names.has("New Takedowns 3"), operational >= 6);
  }
});

test("keeps News, Searches and In Progress with different owners while QA remains alone", () => {
  const result = generateDraftGroups(
    analysts.slice(0, 7).map((value) => value.id),
    initialState.tasks,
    true,
    analysts,
  );
  const groups = hydrateGroups(result.groups, initialState.tasks);
  const criticalOwners = new Map<string, number>();
  for (const group of groups) {
    for (const value of group.tasks) {
      if (value.criticalLane) {
        criticalOwners.set(value.criticalLane, group.analystId);
      }
    }
  }
  assert.equal(new Set(criticalOwners.values()).size, 3);
  const qa = groups.find((group) => group.tasks.some((value) => value.qa));
  assert.ok(qa);
  assert.equal(qa.tasks.length, 1);
  assert.equal(qa.analystId, 7);
});

test("activates duplicate fronts only at the Excel-derived thresholds", () => {
  const namesFor = (count: number) =>
    new Set(
      activeTasksForAnalystCount(initialState.tasks, count, false).map(
        (value) => value.name,
      ),
    );
  assert.equal(namesFor(3).has("New Takedowns 2"), false);
  assert.equal(namesFor(4).has("New Takedowns 2"), true);
  assert.equal(namesFor(4).has("Check Providers Replies 2"), false);
  assert.equal(namesFor(5).has("Check Providers Replies 2"), true);
  assert.equal(namesFor(5).has("Phishing/Redirects Manual Searches"), true);
  assert.equal(namesFor(5).has("New Takedowns 3"), false);
  assert.equal(namesFor(6).has("New Takedowns 3"), true);
});

test("stores different assignment particularities for duplicated fronts", () => {
  const result = generateDraftGroups(
    analysts.slice(0, 6).map((value) => value.id),
    initialState.tasks,
    false,
    analysts,
  );
  const groups = hydrateGroups(result.groups, initialState.tasks);
  const providers = groups.flatMap((group) =>
    group.tasks
      .filter((value) => value.family === "provider-replies")
      .map((value) => ({
        owner: group.analystId,
        note: assignmentNote(group, value),
      })),
  );
  assert.equal(providers.length, 2);
  assert.equal(new Set(providers.map((value) => value.owner)).size, 2);
  assert.deepEqual(
    new Set(providers.map((value) => value.note)),
    new Set([
      "Respuestas de Cloudflare.",
      "Respuestas de todos los proveedores excepto Cloudflare.",
    ]),
  );

  const searches = groups.flatMap((group) =>
    group.tasks
      .filter((value) => value.family === "manual-searches")
      .map((value) => ({
        owner: group.analystId,
        note: assignmentNote(group, value),
      })),
  );
  assert.equal(searches.length, 2);
  assert.equal(new Set(searches.map((value) => value.owner)).size, 2);
});

test("removing an analyst recalculates variants and drops New Takedowns 2 at three analysts", () => {
  const generated = generateDraftGroups(
    analysts.slice(0, 4).map((value) => value.id),
    initialState.tasks,
    false,
    analysts,
  );
  const groups = hydrateGroups(generated.groups, initialState.tasks);
  const secondary = groups
    .flatMap((group) => group.tasks)
    .find((value) => value.name === "New Takedowns 2");
  assert.ok(secondary);
  const groupToRemove = groups.find((group) =>
    group.tasks.some((value) => value.id === secondary.id),
  );
  assert.ok(groupToRemove);

  const reconciled = reconcileAfterAnalystRemoval(
    groups,
    groupToRemove.id,
    initialState.tasks,
    false,
    analysts,
  );
  assert.equal(reconciled.error, undefined);
  assert.equal(reconciled.groups.length, 3);
  assert.equal(
    reconciled.groups
      .flatMap((group) => group.tasks)
      .some((value) => value.name === "New Takedowns 2"),
    false,
  );
  assert.ok(
    reconciled.removedTasks.some(
      (value) => value.name === "New Takedowns 2",
    ),
  );
  assert.equal(
    reconciled.groups
      .flatMap((group) => group.tasks)
      .filter((value) => value.family === "new-takedowns").length,
    1,
  );
});

test("requires four selected analysts when QA is enabled", () => {
  const result = generateDraftGroups(
    analysts.slice(0, 3).map((value) => value.id),
    initialState.tasks,
    true,
    analysts,
  );
  assert.match(result.error || "", /al menos 4 analistas/);
});

test("detects overlapping future schedules", () => {
  const schedules = [
    {
      id: 1,
      name: "Turno",
      startsAt: "2026-07-28T14:00:00.000Z",
      endsAt: "2026-07-28T22:00:00.000Z",
      shift: "Tarde",
      status: "Programada" as const,
      analystCount: 4,
      groups: [],
      createdAt: "2026-07-25T00:00:00.000Z",
      createdBy: "Líder",
      note: "",
    },
  ];
  assert.equal(
    schedulesOverlap(
      schedules,
      "2026-07-28T18:00:00.000Z",
      "2026-07-29T01:00:00.000Z",
    ),
    true,
  );
  assert.equal(
    schedulesOverlap(
      schedules,
      "2026-07-29T01:00:00.000Z",
      "2026-07-29T08:00:00.000Z",
    ),
    false,
  );
});

test("state validation blocks duplicate owners and mixed critical lanes", () => {
  const invalid = structuredClone(initialState);
  invalid.analysts = analysts.slice(0, 3);
  invalid.groups = [
    {
      id: 1,
      name: "Grupo 1",
      analystId: 1,
      taskIds: [3, 13],
      taskNotes: {},
    },
    {
      id: 2,
      name: "Grupo 2",
      analystId: 1,
      taskIds: [11],
      taskNotes: {},
    },
  ];
  const validation = validateState(invalid);
  assert.equal(validation.valid, false);
  assert.ok(
    validation.errors.some((value) =>
      value.includes("responsable de dos grupos"),
    ),
  );
  assert.ok(
    validation.errors.some((value) =>
      value.includes("responsables distintos"),
    ),
  );
});

test("builds stable initials for new analysts", () => {
  assert.equal(initialsFor("  Gabriel   Lopes  "), "GL");
  assert.equal(initialsFor("Ángela"), "Á");
});

test("registers a new analyst when the unified form does not send a legacy id", () => {
  const existing = analysts.slice(0, 3);
  const fresh = resolveAnalystRegistration(existing, null);
  assert.equal(fresh.invalidRequestedId, false);
  assert.equal(fresh.existingAnalyst, undefined);
  assert.equal(fresh.analystId, 4);

  const legacy = resolveAnalystRegistration(existing, 2);
  assert.equal(legacy.invalidRequestedId, false);
  assert.equal(legacy.existingAnalyst?.id, 2);

  const missing = resolveAnalystRegistration(existing, 99);
  assert.equal(missing.invalidRequestedId, true);
});

test("activates a due schedule and preserves assignment notes", () => {
  const state = structuredClone(initialState);
  state.analysts = analysts.slice(0, 3);
  state.scheduled = [
    {
      id: 11,
      name: "Turno futuro",
      startsAt: "2026-07-28T14:00:00.000Z",
      endsAt: "2026-07-28T22:00:00.000Z",
      shift: "Tarde",
      status: "Programada",
      analystCount: 3,
      groups: [
        {
          id: 1,
          name: "Grupo 1",
          analystId: 1,
          taskIds: [13],
          taskNotes: { "13": "Cobertura especial del bloque futuro." },
        },
      ],
      createdAt: "2026-07-25T00:00:00.000Z",
      createdBy: "Líder",
      note: "",
    },
  ];
  const resolved = resolveScheduledDistributions(
    state,
    Date.parse("2026-07-28T16:00:00.000Z"),
  );
  assert.equal(resolved.changed, true);
  assert.equal(resolved.activated?.id, 11);
  assert.equal(
    resolved.state.groups[0].taskNotes?.["13"],
    "Cobertura especial del bloque futuro.",
  );
});
