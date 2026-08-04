import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../app/api/distributions/route.ts", import.meta.url), "utf8");
const stateRoute = await readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("archive, restore and delete require leader authorization", () => {
  assert.match(route, /requireLeader\(request\)/);
  assert.match(route, /"archive" \| "restore" \| "delete"/);
});

test("permanent deletion requires reason and typed confirmation", () => {
  assert.match(route, /motivo de eliminación es obligatorio/i);
  assert.match(route, /!== "ELIMINAR"/);
});

test("history is deleted only by distribution id while audit remains", () => {
  assert.match(route, /DELETE FROM history_events WHERE distribution_id = \?/);
  assert.doesNotMatch(route, /DELETE FROM audit_events/);
});

test("publishing stores an immutable snapshot and links history", () => {
  assert.match(stateRoute, /INSERT INTO published_distributions/);
  assert.match(stateRoute, /historyStatements\([\s\S]*distributionId/);
});

test("task families and critical fronts are rendered from configuration", () => {
  assert.match(page, /Grupos relacionados/);
  assert.match(page, /Frentes críticos/);
  assert.match(page, /families\.filter/);
  assert.match(page, /fronts\.filter/);
});
