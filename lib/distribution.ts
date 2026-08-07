export type Role = "leader" | "analyst";

export type AnalystStatus = "Disponible" | "Horario parcial" | "Ausente";

export type ShiftName = "Turno 6–2" | "Turno 2–10" | "Turno 10–6";

export type Analyst = {
  id: number;
  name: string;
  initials: string;
  schedule: string;
  status: AnalystStatus;
  active: boolean;
};

export type TaskFamily = {
  id: string;
  name: string;
  description: string;
  active: boolean;
};

export type CriticalFront = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  order: number;
};

export type Task = {
  id: number;
  name: string;
  /** Conservado solo para leer estados V1. El generador V2 no usa puntajes. */
  weight: number;
  category: string;
  active: boolean;
  description?: string;
  defaultAssignmentNote?: string;
  minAnalysts: number;
  family?: string;
  criticalLane?: string;
  shifts?: ShiftName[];
  qa?: boolean;
  exclusive?: boolean;
};

export type GroupRecord = {
  id: number;
  name: string;
  analystId: number;
  taskIds: number[];
  taskNotes?: Record<string, string>;
};

export type TemplateGroup = {
  id: number;
  name: string;
  taskIds: number[];
};

export type DistributionTemplate = {
  id: string;
  name: string;
  shift: ShiftName;
  analystCount: number;
  groups: TemplateGroup[];
  active: boolean;
};

export type ScheduleStatus = "Programada" | "Requiere revisión" | "Activada" | "Cancelada" | "Expirada";

export type ScheduledDistribution = {
  id: number;
  name: string;
  startsAt: string;
  endsAt: string;
  shift: string;
  status: ScheduleStatus;
  analystCount: number;
  groups: GroupRecord[];
  createdAt: string;
  createdBy: string;
  note: string;
};

export type AppState = {
  version: number;
  analysts: Analyst[];
  tasks: Task[];
  taskFamilies: TaskFamily[];
  criticalFronts: CriticalFront[];
  templates: DistributionTemplate[];
  groups: GroupRecord[];
  scheduled: ScheduledDistribution[];
  activeScheduleId: number | null;
};

export type HydratedGroup = Omit<GroupRecord, "taskIds"> & { tasks: Task[] };
export type ValidationResult = { valid: boolean; errors: string[] };
export type ScheduleResolution = { state: AppState; changed: boolean; activated: ScheduledDistribution | null };

export const SHIFT_NAMES: ShiftName[] = ["Turno 6–2", "Turno 2–10", "Turno 10–6"];

const task = (
  id: number,
  name: string,
  category: string,
  options: Partial<Task> = {},
): Task => ({
  id,
  name,
  category,
  weight: 1,
  active: true,
  minAnalysts: 1,
  description: "",
  defaultAssignmentNote: "",
  ...options,
});

export const initialTasks: Task[] = [
  task(1, "Compromised Card Searches", "Búsquedas", { family: "searches" }),
  task(2, "Prepare/Open Compromised", "Búsquedas", { family: "searches" }),
  task(3, "CBC - Store search", "Búsquedas", { family: "searches" }),
  task(4, "In Progress Tickets Check", "Seguimiento", { family: "follow-up" }),
  task(5, "In Progress Tickets Check 2", "Seguimiento", { family: "follow-up" }),
  task(6, "Check teams notifications for ProactivityTA Ads", "Alertas", { family: "alerts" }),
  task(7, "Brand Abuse Protection Manual Searches", "Búsquedas", { family: "searches" }),
  task(8, "Check Threat Alerts 3", "Alertas", { family: "alerts", minAnalysts: 7 }),
  task(9, "Check Threat Alerts 1", "Alertas", { family: "alerts" }),
  task(10, "Check Threat Alerts 2", "Alertas", { family: "alerts" }),
  task(11, "Check Twitter Notifications", "Alertas", { family: "alerts" }),
  task(12, "Phish y redirect to phish Manual Searches", "Búsquedas", { family: "searches" }),
  task(13, "NEW takedowns 1", "Takedowns", { family: "takedowns" }),
  task(14, "NEW takedowns 2", "Takedowns", { family: "takedowns" }),
  task(15, "NEW takedowns 3", "Takedowns", { family: "takedowns" }),
  task(16, "Check providers replies", "Proveedores", { family: "providers" }),
  task(17, "CheckTakedownAlerts", "Alertas", { family: "alerts" }),
  task(18, "GFC Tracking", "Seguimiento", { family: "follow-up" }),
  task(19, "Update Open Tickets - DBI", "Seguimiento", { family: "follow-up" }),
  task(20, "Update Open Tickets - Mobile", "Seguimiento", { family: "follow-up" }),
  task(21, "Update Open Tickets - Other and Disclosure", "Seguimiento", { family: "follow-up" }),
  task(22, "Update Open Tickets - Phishing", "Seguimiento", { family: "follow-up" }),
  task(23, "New Takedowns & Inprogress", "Takedowns", { family: "takedowns", shifts: ["Turno 10–6"] }),
  task(24, "Update Open Tickets - DBI y Spoofing", "Seguimiento", { family: "follow-up", shifts: ["Turno 10–6"] }),
  task(25, "Update Open Tickets - Phishing & Mobile Apps", "Seguimiento", { family: "follow-up", shifts: ["Turno 10–6"] }),
  task(26, "Tickets QA", "Calidad", { family: "qa", qa: true, exclusive: true, minAnalysts: 5 }),
  task(27, "Malvertising", "Monitoreo", { family: "specialized" }),
  task(28, "Redirect Changes", "Redirects", { family: "redirects" }),
  task(29, "Old Redirect", "Redirects", { family: "redirects" }),
  task(30, "Japan blogs", "Monitoreo", { family: "specialized", shifts: ["Turno 10–6"] }),
  task(31, "Búsquedas focalizadas", "Búsquedas", { family: "specialized", minAnalysts: 9 }),
];

export const initialTaskFamilies: TaskFamily[] = [
  { id: "searches", name: "Búsquedas", description: "Búsquedas generales y manuales", active: true },
  { id: "alerts", name: "Alertas", description: "Alertas y notificaciones", active: true },
  { id: "takedowns", name: "Takedowns", description: "Apertura y gestión inicial", active: true },
  { id: "follow-up", name: "Seguimiento", description: "Tickets abiertos y cambios", active: true },
  { id: "providers", name: "Proveedores", description: "Respuestas de proveedores", active: true },
  { id: "redirects", name: "Redirects", description: "Redirects nuevos y reactivados", active: true },
  { id: "specialized", name: "Monitoreos especializados", description: "Ads, blogs y búsquedas focalizadas", active: true },
  { id: "qa", name: "Calidad", description: "QA exclusivo", active: true },
];

export const initialCriticalFronts: CriticalFront[] = [
  { id: "searches", name: "Búsquedas", description: "Cobertura de búsquedas", active: true, order: 1 },
  { id: "alerts", name: "Alertas", description: "Cobertura de alertas", active: true, order: 2 },
  { id: "takedowns", name: "Takedowns", description: "Nuevos casos", active: true, order: 3 },
  { id: "follow-up", name: "Seguimiento", description: "Casos en curso", active: true, order: 4 },
];

const idsByFamily = (family: string, shift: ShiftName) =>
  initialTasks.filter((item) => item.family === family && (!item.shifts || item.shifts.includes(shift))).map((item) => item.id);

function group(id: number, name: string, taskIds: number[]): TemplateGroup {
  return { id, name, taskIds: [...new Set(taskIds)] };
}

function templateGroups(shift: ShiftName, count: number): TemplateGroup[] {
  const searches = idsByFamily("searches", shift);
  const alerts = idsByFamily("alerts", shift).filter((id) => id !== 8);
  const takedowns = idsByFamily("takedowns", shift);
  const followUp = idsByFamily("follow-up", shift);
  const providers = idsByFamily("providers", shift);
  const redirects = idsByFamily("redirects", shift);
  const specialized = idsByFamily("specialized", shift).filter((id) => id !== 31);
  const threat3 = initialTasks.some((item) => item.id === 8 && (!item.shifts || item.shifts.includes(shift))) ? [8] : [];
  const qa = [26];
  const focused = count >= 9 ? [31] : [];
  const all = [...searches, ...alerts, ...takedowns, ...followUp, ...providers, ...redirects, ...specialized, ...threat3, ...focused];
  if (count <= 1) return [group(1, "Operación completa", all)];
  if (count === 2) return [group(1, "Búsquedas y alertas", [...searches, ...alerts, ...specialized, ...threat3]), group(2, "Takedowns y seguimiento", [...takedowns, ...followUp, ...providers, ...redirects])];
  if (count === 3) return [group(1, "Búsquedas", searches), group(2, "Alertas", [...alerts, ...specialized, ...threat3]), group(3, "Takedowns y seguimiento", [...takedowns, ...followUp, ...providers, ...redirects])];
  if (count === 4) return [group(1, "Búsquedas", searches), group(2, "Alertas", [...alerts, ...specialized, ...threat3]), group(3, "Nuevos takedowns", takedowns), group(4, "Seguimiento", [...followUp, ...providers, ...redirects])];
  const base = [group(1, "Búsquedas", searches), group(2, "Alertas", [...alerts, ...specialized]), group(3, "Nuevos takedowns", takedowns), group(4, "Seguimiento", [...followUp, ...providers, ...redirects])];
  if (count >= 5) base.push(group(5, "Tickets QA", qa));
  if (count >= 6) {
    base[0] = group(1, "Búsquedas generales", searches.slice(0, Math.ceil(searches.length / 2)));
    base.splice(1, 0, group(2, "Búsquedas especializadas", [...searches.slice(Math.ceil(searches.length / 2)), ...specialized]));
    base[2] = group(3, "Alertas", alerts);
    for (let index = 2; index < base.length; index += 1) base[index].id = index + 1;
  }
  if (count >= 7) base.splice(base.length - 1, 0, group(base.length, "Check Threat Alerts 3", threat3));
  if (count >= 8) {
    const followIndex = base.findIndex((item) => item.name === "Seguimiento");
    if (followIndex >= 0) base[followIndex] = group(base[followIndex].id, "Seguimiento de tickets", followUp);
    base.splice(base.length - 1, 0, group(base.length, "Redirects y proveedores", [...redirects, ...providers]));
  }
  if (count >= 9) base.splice(base.length - 1, 0, group(base.length, "Búsquedas focalizadas", focused));
  while (base.length < count) base.splice(base.length - 1, 0, group(base.length, `Grupo especializado ${base.length}`, []));
  return base.slice(0, count).map((item, index) => ({ ...item, id: index + 1 }));
}

export const initialTemplates: DistributionTemplate[] = SHIFT_NAMES.flatMap((shift) =>
  Array.from({ length: 9 }, (_, index) => index + 1).map((analystCount) => ({
    id: `${shift}-${analystCount}`,
    name: `${shift} · ${analystCount} analista${analystCount === 1 ? "" : "s"}`,
    shift,
    analystCount,
    groups: templateGroups(shift, analystCount),
    active: true,
  })),
);

export const initialState: AppState = {
  version: 1,
  analysts: [
    { id: 1, name: "Laura Gómez", initials: "LG", schedule: "2:00 p. m.–10:00 p. m.", status: "Disponible", active: true },
    { id: 2, name: "Carlos Ruiz", initials: "CR", schedule: "2:00 p. m.–10:00 p. m.", status: "Disponible", active: true },
    { id: 3, name: "Andrés Torres", initials: "AT", schedule: "2:00 p. m.–10:00 p. m.", status: "Disponible", active: true },
    { id: 4, name: "Mariana León", initials: "ML", schedule: "2:00 p. m.–10:00 p. m.", status: "Disponible", active: true },
    { id: 5, name: "Sofía Vargas", initials: "SV", schedule: "2:00 p. m.–10:00 p. m.", status: "Disponible", active: true },
    { id: 6, name: "Gabriel Lopes", initials: "GL", schedule: "2:00 p. m.–10:00 p. m.", status: "Disponible", active: true },
  ],
  tasks: initialTasks,
  taskFamilies: initialTaskFamilies,
  criticalFronts: initialCriticalFronts,
  templates: initialTemplates,
  groups: [],
  scheduled: [],
  activeScheduleId: null,
};

export function initialsFor(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("es") ?? "").join("");
}

export function isExclusiveTask(task: Task) { return Boolean(task.qa || task.exclusive); }
export function groupWeight(group: HydratedGroup) { return group.tasks.length; }

export function assignmentNote(group: HydratedGroup, task: Task) {
  return group.taskNotes?.[String(task.id)] ?? task.defaultAssignmentNote ?? "";
}

export function hydrateGroups(groups: GroupRecord[], tasks: Task[]): HydratedGroup[] {
  return groups.map((item) => ({
    id: item.id,
    name: item.name,
    analystId: item.analystId,
    taskNotes: { ...(item.taskNotes || {}) },
    tasks: item.taskIds.map((id) => tasks.find((candidate) => candidate.id === id)).filter((candidate): candidate is Task => Boolean(candidate)).map((candidate) => ({ ...candidate })),
  }));
}

export function serializeGroups(groups: HydratedGroup[]): GroupRecord[] {
  return groups.map((item) => ({ id: item.id, name: item.name, analystId: item.analystId, taskIds: item.tasks.map((taskItem) => taskItem.id), taskNotes: { ...(item.taskNotes || {}) } }));
}

export function cloneHydratedGroups(groups: HydratedGroup[]) {
  return groups.map((item) => ({ ...item, taskNotes: { ...(item.taskNotes || {}) }, tasks: item.tasks.map((taskItem) => ({ ...taskItem })) }));
}

export function nextCalendarDate(dateValue: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) return dateValue;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function buildScheduleLocalRange(dateValue: string, startTime: string, endTime: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return { startsAt: "", endsAt: "" };
  const endDate = endTime <= startTime ? nextCalendarDate(dateValue) : dateValue;
  return { startsAt: `${dateValue}T${startTime}`, endsAt: `${endDate}T${endTime}` };
}

export function activeTasksForAnalystCount(tasks: Task[], analystCount: number, qaEnabled: boolean, shift?: string) {
  return tasks.filter((item) => item.active && item.minAnalysts <= analystCount && (qaEnabled || !item.qa) && (!item.shifts || !shift || item.shifts.includes(shift as ShiftName)));
}

export function generateDraftGroups(
  analystIds: number[],
  tasks: Task[],
  qaEnabled: boolean,
  _analysts: Analyst[] = [],
  templates: DistributionTemplate[] = initialTemplates,
  shift: ShiftName = "Turno 2–10",
): { groups: GroupRecord[]; error?: string } {
  if (!analystIds.length) return { groups: [], error: "Selecciona al menos un analista." };
  const template = templates.find((item) => item.active && item.shift === shift && item.analystCount === analystIds.length);
  if (!template) return { groups: [], error: `No existe una plantilla activa para ${shift} con ${analystIds.length} analistas.` };
  const applicable = new Set(activeTasksForAnalystCount(tasks, analystIds.length, qaEnabled, shift).map((item) => item.id));
  const groups = template.groups.map((templateGroup, index) => ({
    id: index + 1,
    name: templateGroup.name,
    analystId: analystIds[index],
    taskIds: templateGroup.taskIds.filter((id) => applicable.has(id)),
    taskNotes: {},
  }));
  if (groups.some((item) => !item.analystId)) return { groups: [], error: "La plantilla tiene más grupos que analistas seleccionados." };
  const assigned = new Set(groups.flatMap((item) => item.taskIds));
  const missing = [...applicable].filter((id) => !assigned.has(id));
  for (const taskId of missing) {
    const taskItem = tasks.find((item) => item.id === taskId);
    const target = taskItem?.qa ? groups.find((item) => item.taskIds.length === 0) : groups.filter((item) => !item.taskIds.some((id) => tasks.find((taskCandidate) => taskCandidate.id === id)?.qa)).sort((a, b) => a.taskIds.length - b.taskIds.length)[0];
    target?.taskIds.push(taskId);
  }
  return { groups };
}

export function reconcileAfterAnalystRemoval(groups: HydratedGroup[], removedGroupId: number, tasks: Task[], qaEnabled: boolean, analysts: Analyst[], templates: DistributionTemplate[] = initialTemplates, shift: ShiftName = "Turno 2–10") {
  const remaining = groups.filter((item) => item.id !== removedGroupId).map((item) => item.analystId);
  const generated = generateDraftGroups(remaining, tasks, qaEnabled, analysts, templates, shift);
  return { groups: generated.groups.length ? hydrateGroups(generated.groups, tasks) : groups, removedTasks: [] as Task[], error: generated.error };
}

function duplicated(values: number[]) { return values.filter((value, index) => values.indexOf(value) !== index); }

export function validateState(state: AppState): ValidationResult {
  const errors: string[] = [];
  if (!state || !Array.isArray(state.analysts) || !Array.isArray(state.tasks) || !Array.isArray(state.groups) || !Array.isArray(state.scheduled)) return { valid: false, errors: ["La estructura general del estado no es válida."] };
  const analystIds = state.analysts.map((item) => item.id);
  const taskIds = state.tasks.map((item) => item.id);
  if (duplicated(analystIds).length) errors.push("Hay identificadores de analistas duplicados.");
  if (duplicated(taskIds).length) errors.push("Hay identificadores de tareas duplicados.");
  const validateGroups = (groups: GroupRecord[], label: string) => {
    if (duplicated(groups.map((item) => item.id)).length) errors.push(`${label}: hay identificadores de grupo duplicados.`);
    if (duplicated(groups.map((item) => item.analystId)).length) errors.push(`${label}: un analista no puede ser responsable de dos grupos.`);
    if (duplicated(groups.flatMap((item) => item.taskIds)).length) errors.push(`${label}: una tarea no puede aparecer en dos grupos.`);
    for (const item of groups) {
      if (!analystIds.includes(item.analystId)) errors.push(`${label}: ${item.name} tiene un analista inexistente.`);
      if (item.taskIds.some((id) => !taskIds.includes(id))) errors.push(`${label}: ${item.name} contiene una tarea inexistente.`);
      const resolved = item.taskIds.map((id) => state.tasks.find((candidate) => candidate.id === id)).filter((candidate): candidate is Task => Boolean(candidate));
      if (resolved.some(isExclusiveTask) && resolved.length > 1) errors.push(`${label}: ${resolved.find(isExclusiveTask)?.name} debe permanecer sola.`);
    }
  };
  validateGroups(state.groups, "Distribución vigente");
  state.scheduled.forEach((item) => {
    validateGroups(item.groups, `Programación ${item.name}`);
    if (!Number.isFinite(Date.parse(item.startsAt)) || !Number.isFinite(Date.parse(item.endsAt)) || Date.parse(item.endsAt) <= Date.parse(item.startsAt)) errors.push(`Programación ${item.name}: el horario no es válido.`);
  });
  (state.templates || []).forEach((item) => {
    if (item.groups.length !== item.analystCount) errors.push(`Plantilla ${item.name}: debe tener ${item.analystCount} grupos.`);
    if (duplicated(item.groups.flatMap((templateGroup) => templateGroup.taskIds)).length) errors.push(`Plantilla ${item.name}: una tarea no puede estar en varios grupos.`);
  });
  return { valid: errors.length === 0, errors };
}

export function schedulesOverlap(schedules: ScheduledDistribution[], startsAt: string, endsAt: string, ignoredId?: number) {
  const start = Date.parse(startsAt); const end = Date.parse(endsAt);
  return schedules.some((item) => item.id !== ignoredId && ["Programada", "Requiere revisión"].includes(item.status) && start < Date.parse(item.endsAt) && end > Date.parse(item.startsAt));
}

export function resolveScheduledDistributions(currentState: AppState, now = Date.now()): ScheduleResolution {
  const state = structuredClone(currentState); let changed = false;
  for (const item of state.scheduled) if (["Programada", "Activada"].includes(item.status) && Date.parse(item.endsAt) <= now) { item.status = "Expirada"; changed = true; }
  const due = state.scheduled.filter((item) => item.status === "Programada" && Date.parse(item.startsAt) <= now && Date.parse(item.endsAt) > now).sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))[0];
  if (!due || state.activeScheduleId === due.id) return { state, changed, activated: null };
  state.groups = due.groups.map((item) => ({ ...item, taskIds: [...item.taskIds], taskNotes: { ...(item.taskNotes || {}) } }));
  state.activeScheduleId = due.id; due.status = "Activada";
  return { state, changed: true, activated: due };
}

export function nextId(items: Array<{ id: number }>) { return Math.max(0, ...items.map((item) => item.id)) + 1; }
