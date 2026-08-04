export type Role = "leader" | "analyst";

export type AnalystStatus = "Disponible" | "Horario parcial" | "Ausente";

export type Analyst = {
  id: number;
  name: string;
  initials: string;
  schedule: string;
  status: AnalystStatus;
  active: boolean;
};

export type CriticalLane = string;

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
  weight: number;
  category: string;
  active: boolean;
  description: string;
  defaultAssignmentNote: string;
  minAnalysts: number;
  family?: string;
  criticalLane?: CriticalLane;
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

export type ScheduleStatus =
  | "Programada"
  | "Requiere revisión"
  | "Activada"
  | "Cancelada"
  | "Expirada";

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
  groups: GroupRecord[];
  scheduled: ScheduledDistribution[];
  activeScheduleId: number | null;
};

export type HydratedGroup = {
  id: number;
  name: string;
  analystId: number;
  tasks: Task[];
  taskNotes: Record<number, string>;
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

export type ScheduleResolution = {
  state: AppState;
  changed: boolean;
  activated: ScheduledDistribution | null;
};

export type ReconcileResult = {
  groups: HydratedGroup[];
  removedTasks: Task[];
  error?: string;
};

const task = (
  id: number,
  name: string,
  weight: number,
  category: string,
  description: string,
  options: Partial<
    Omit<
      Task,
      "id" | "name" | "weight" | "category" | "active" | "description"
    >
  > = {},
): Task => ({
  id,
  name,
  weight,
  category,
  active: true,
  description,
  defaultAssignmentNote: "",
  minAnalysts: 3,
  ...options,
});

/**
 * Catálogo reconstruido desde las plantillas operativas del Excel.
 * minAnalysts representa analistas operativos: el responsable de QA se
 * reserva aparte y no cuenta para activar variantes.
 */
export const initialState: AppState = {
  version: 1,
  analysts: [],
  taskFamilies: [
    { id: "new-takedowns", name: "New Takedowns", description: "Variantes del frente de nuevos takedowns.", active: true },
    { id: "provider-replies", name: "Provider Replies", description: "Variantes de respuestas de proveedores.", active: true },
    { id: "manual-searches", name: "Búsquedas manuales", description: "Variantes de búsquedas manuales.", active: true },
    { id: "in-progress", name: "In Progress", description: "Variantes de tickets en gestión.", active: true },
    { id: "threat-alerts", name: "Threat Alerts", description: "Variantes de alertas de amenazas.", active: true },
    { id: "quick-alerts", name: "Quick Alerts", description: "Variantes de Quick Alerts.", active: true },
  ],
  criticalFronts: [
    { id: "news", name: "News / New Takedowns", description: "Responsable principal de nuevos casos.", active: true, order: 1 },
    { id: "searches", name: "Búsquedas", description: "Responsable principal de búsquedas manuales.", active: true, order: 2 },
    { id: "in-progress", name: "In Progress", description: "Responsable principal de casos en gestión.", active: true, order: 3 },
  ],
  tasks: [
    task(
      1,
      "Check Threat Alerts 1",
      3,
      "Alertas",
      "Revisar y gestionar las alertas principales de amenazas.",
      { family: "threat-alerts" },
    ),
    task(
      2,
      "Ads Alerts / Blog Monitoring Alerts",
      2,
      "Alertas",
      "Revisar alertas provenientes de anuncios y monitoreo de blogs.",
    ),
    task(
      3,
      "Brand and Apps Manual Searches",
      4,
      "Búsquedas",
      "Realizar búsquedas manuales de marca y aplicaciones.",
      {
        family: "manual-searches",
        criticalLane: "searches",
        defaultAssignmentNote: "Búsquedas para los clientes del día.",
      },
    ),
    task(
      4,
      "Miarroba and Dnpedia",
      2,
      "Búsquedas",
      "Revisar fuentes Miarroba y DNPedia dentro del alcance del turno.",
    ),
    task(
      5,
      "Check Twitter Notifications",
      2,
      "Notificaciones",
      "Validar las notificaciones recibidas desde Twitter/X.",
    ),
    task(
      6,
      "Check Monitoring Closed Tickets",
      2,
      "Seguimiento",
      "Revisar tickets cerrados detectados por el monitoreo.",
    ),
    task(
      7,
      "Update Open Tickets - Phishing",
      3,
      "Seguimiento",
      "Actualizar los tickets abiertos clasificados como phishing.",
    ),
    task(
      8,
      "Update Open Tickets - Other and Disclosure",
      3,
      "Seguimiento",
      "Actualizar tickets abiertos de Other y Disclosure.",
    ),
    task(
      9,
      "Update Following Tickets Files - JP BR REDIRECTS",
      2,
      "Seguimiento",
      "Actualizar archivos de seguimiento asociados a JP/BR Redirects.",
    ),
    task(
      10,
      "Update Open Tickets - DBI",
      3,
      "Seguimiento",
      "Actualizar tickets abiertos del frente DBI.",
    ),
    task(
      11,
      "In Progress Tickets Check 1",
      5,
      "Takedown",
      "Revisar los tickets que continúan en gestión.",
      {
        family: "in-progress",
        criticalLane: "in-progress",
        defaultAssignmentNote: "Frente principal de tickets In Progress.",
      },
    ),
    task(
      12,
      "Check Quick Alerts 1",
      2,
      "Alertas",
      "Revisar el frente principal de Quick Alerts.",
      { family: "quick-alerts" },
    ),
    task(
      13,
      "New Takedowns 1",
      5,
      "Takedown",
      "Gestionar el frente principal de nuevos casos de takedown.",
      {
        family: "new-takedowns",
        criticalLane: "news",
        defaultAssignmentNote: "Frente principal de nuevos takedowns.",
      },
    ),
    task(
      14,
      "Activision",
      3,
      "Cliente",
      "Atender las responsabilidades operativas específicas de Activision.",
    ),
    task(
      15,
      "Check Providers Replies 1",
      3,
      "Proveedores",
      "Revisar y gestionar respuestas recibidas de proveedores.",
      {
        family: "provider-replies",
        defaultAssignmentNote: "Respuestas de Cloudflare.",
      },
    ),
    task(
      16,
      "Check Tickets Changes Notifications",
      2,
      "Notificaciones",
      "Revisar notificaciones de cambios en tickets.",
    ),
    task(
      17,
      "Update Open Tickets - Mobile",
      3,
      "Seguimiento",
      "Actualizar tickets abiertos relacionados con Mobile.",
    ),
    task(
      18,
      "New Takedowns 2",
      5,
      "Takedown",
      "Segundo frente de nuevos casos, habilitado cuando el turno tiene capacidad suficiente.",
      {
        family: "new-takedowns",
        minAnalysts: 4,
        defaultAssignmentNote: "Segundo frente de nuevos takedowns.",
      },
    ),
    task(
      19,
      "In Progress Tickets Check 2",
      5,
      "Takedown",
      "Segundo frente de revisión de tickets en gestión.",
      {
        family: "in-progress",
        minAnalysts: 4,
        defaultAssignmentNote: "Segundo frente de tickets In Progress.",
      },
    ),
    task(
      20,
      "Check Quick Alerts 2",
      2,
      "Alertas",
      "Segundo frente de Quick Alerts.",
      {
        family: "quick-alerts",
        minAnalysts: 4,
        defaultAssignmentNote: "Cobertura complementaria de Quick Alerts.",
      },
    ),
    task(
      21,
      "Check Threat Alerts 2",
      3,
      "Alertas",
      "Segundo frente de Threat Alerts.",
      {
        family: "threat-alerts",
        minAnalysts: 5,
        defaultAssignmentNote: "Cobertura complementaria de Threat Alerts.",
      },
    ),
    task(
      22,
      "Check Providers Replies 2",
      3,
      "Proveedores",
      "Segundo frente de respuestas de proveedores.",
      {
        family: "provider-replies",
        minAnalysts: 5,
        defaultAssignmentNote:
          "Respuestas de todos los proveedores excepto Cloudflare.",
      },
    ),
    task(
      23,
      "Phishing/Redirects Manual Searches",
      4,
      "Búsquedas",
      "Segundo frente de búsquedas manuales enfocado en phishing y redirects.",
      {
        family: "manual-searches",
        minAnalysts: 5,
        defaultAssignmentNote:
          "Búsquedas generales, no limitadas a los clientes del día.",
      },
    ),
    task(
      24,
      "Brand Manual Searches",
      3,
      "Búsquedas",
      "Realizar búsquedas manuales adicionales enfocadas en marca.",
      {
        minAnalysts: 5,
        defaultAssignmentNote: "Refuerzo de búsquedas manuales de marca.",
      },
    ),
    task(
      25,
      "App Searches",
      3,
      "Búsquedas",
      "Realizar búsquedas manuales adicionales enfocadas en aplicaciones.",
      {
        minAnalysts: 5,
        defaultAssignmentNote: "Refuerzo de búsquedas de aplicaciones.",
      },
    ),
    task(
      26,
      "New Takedowns 3",
      5,
      "Takedown",
      "Tercer frente de nuevos takedowns para turnos con alta capacidad.",
      {
        family: "new-takedowns",
        minAnalysts: 6,
        defaultAssignmentNote: "Tercer frente de nuevos takedowns.",
      },
    ),
    task(
      27,
      "QA / Quality Assurance",
      4,
      "Calidad",
      "Ejecutar la revisión QA definida para el turno.",
      {
        qa: true,
        exclusive: true,
        defaultAssignmentNote: "QA general del turno.",
      },
    ),
  ],
  groups: [],
  scheduled: [],
  activeScheduleId: null,
};

export function initialsFor(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("es") ?? "")
    .join("");
}

export function isExclusiveTask(value: Task) {
  return Boolean(value.qa || value.exclusive);
}

export function isTaskActiveForCount(
  value: Task,
  operationalAnalysts: number,
) {
  return (
    value.active &&
    !value.qa &&
    Math.max(1, value.minAnalysts || 3) <= operationalAnalysts
  );
}

export function activeTasksForAnalystCount(
  tasks: Task[],
  selectedAnalysts: number,
  qaEnabled: boolean,
) {
  const operationalAnalysts = selectedAnalysts - (qaEnabled ? 1 : 0);
  const regular = tasks.filter((value) =>
    isTaskActiveForCount(value, operationalAnalysts),
  );
  const qa = qaEnabled
    ? tasks.find((value) => value.qa && value.active)
    : undefined;
  return qa ? [...regular, qa] : regular;
}

export function groupWeight(group: HydratedGroup) {
  return group.tasks.reduce((sum, value) => sum + value.weight, 0);
}

export function assignmentNote(group: HydratedGroup, value: Task) {
  return group.taskNotes[value.id] ?? value.defaultAssignmentNote ?? "";
}

export function hydrateGroups(
  groups: GroupRecord[],
  tasks: Task[],
): HydratedGroup[] {
  return groups.map((group) => {
    const resolvedTasks = group.taskIds
      .map((taskId) => tasks.find((value) => value.id === taskId))
      .filter((value): value is Task => Boolean(value))
      .map((value) => ({ ...value }));
    return {
      id: group.id,
      name: group.name,
      analystId: group.analystId,
      tasks: resolvedTasks,
      taskNotes: Object.fromEntries(
        resolvedTasks.map((value) => [
          value.id,
          group.taskNotes?.[String(value.id)] ??
            value.defaultAssignmentNote ??
            "",
        ]),
      ),
    };
  });
}

export function serializeGroups(groups: HydratedGroup[]): GroupRecord[] {
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    analystId: group.analystId,
    taskIds: group.tasks.map((value) => value.id),
    taskNotes: Object.fromEntries(
      group.tasks.map((value) => [
        String(value.id),
        assignmentNote(group, value),
      ]),
    ),
  }));
}

export function cloneHydratedGroups(groups: HydratedGroup[]) {
  return groups.map((group) => ({
    ...group,
    tasks: group.tasks.map((value) => ({ ...value })),
    taskNotes: { ...group.taskNotes },
  }));
}

export function nextCalendarDate(dateValue: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) return dateValue;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function buildScheduleLocalRange(
  dateValue: string,
  startTime: string,
  endTime: string,
) {
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(dateValue);
  const validStart = /^\d{2}:\d{2}$/.test(startTime);
  const validEnd = /^\d{2}:\d{2}$/.test(endTime);
  if (!validDate || !validStart || !validEnd) {
    return { startsAt: "", endsAt: "" };
  }
  const endDate = endTime <= startTime ? nextCalendarDate(dateValue) : dateValue;
  return {
    startsAt: `${dateValue}T${startTime}`,
    endsAt: `${endDate}T${endTime}`,
  };
}

function capacityFor(analystId: number, analysts: Analyst[]) {
  const analyst = analysts.find((value) => value.id === analystId);
  return analyst?.status === "Horario parcial" ? 0.65 : 1;
}

function candidateScore(group: HydratedGroup, analysts: Analyst[]) {
  return groupWeight(group) / capacityFor(group.analystId, analysts);
}

function taskFamily(value: Task) {
  return value.family?.trim().toLocaleLowerCase("es") || "";
}

function chooseGroup(
  groups: HydratedGroup[],
  value: Task,
  analysts: Analyst[],
) {
  const family = taskFamily(value);
  const withoutSameFamily = family
    ? groups.filter(
        (group) =>
          !group.tasks.some(
            (assigned) => taskFamily(assigned) === family,
          ),
      )
    : groups;
  const candidates = withoutSameFamily.length ? withoutSameFamily : groups;
  return [...candidates].sort((a, b) => {
    const scoreDifference =
      candidateScore(a, analysts) - candidateScore(b, analysts);
    if (scoreDifference !== 0) return scoreDifference;
    if (a.tasks.length !== b.tasks.length) {
      return a.tasks.length - b.tasks.length;
    }
    return a.id - b.id;
  })[0];
}

export function generateDraftGroups(
  analystIds: number[],
  tasks: Task[],
  qaEnabled: boolean,
  analysts: Analyst[] = [],
): { groups: GroupRecord[]; error?: string } {
  const uniqueAnalystIds = Array.from(new Set(analystIds));
  if (uniqueAnalystIds.length !== analystIds.length) {
    return {
      groups: [],
      error: "Un analista no puede aparecer dos veces en la distribución.",
    };
  }

  const qaTask = tasks.find((value) => value.qa && value.active);
  if (qaEnabled && !qaTask) {
    return {
      groups: [],
      error:
        "QA está habilitada, pero no existe una tarea QA activa en el catálogo.",
    };
  }

  const operationalIds = qaEnabled
    ? uniqueAnalystIds.slice(0, -1)
    : uniqueAnalystIds;
  const qaAnalystId = qaEnabled ? uniqueAnalystIds.at(-1) : undefined;
  if (operationalIds.length < 3) {
    return {
      groups: [],
      error: `Se requieren al menos ${
        qaEnabled ? 4 : 3
      } analistas seleccionados${
        qaEnabled
          ? " para separar News, Búsquedas, In Progress y QA"
          : " para separar News, Búsquedas e In Progress"
      }.`,
    };
  }

  const regularTasks = tasks.filter((value) =>
    isTaskActiveForCount(value, operationalIds.length),
  );
  if (operationalIds.length > regularTasks.length) {
    return {
      groups: [],
      error:
        "Hay más analistas operativos que tareas aplicables. Activa más tareas o reduce el equipo seleccionado.",
    };
  }

  const hydrated: HydratedGroup[] = operationalIds.map(
    (analystId, index) => ({
      id: index + 1,
      name: `Grupo ${index + 1}`,
      analystId,
      tasks: [],
      taskNotes: {},
    }),
  );

  const criticalOrder: CriticalLane[] = Array.from(
    new Set(regularTasks.map((value) => value.criticalLane).filter(Boolean) as string[]),
  );
  const assigned = new Set<number>();
  criticalOrder.forEach((lane, index) => {
    const criticalTask = regularTasks
      .filter((value) => value.criticalLane === lane)
      .sort(
        (a, b) =>
          a.minAnalysts - b.minAnalysts || a.id - b.id,
      )[0];
    if (!criticalTask || !hydrated[index]) return;
    hydrated[index].tasks.push({ ...criticalTask });
    hydrated[index].taskNotes[criticalTask.id] =
      criticalTask.defaultAssignmentNote;
    assigned.add(criticalTask.id);
  });

  const remaining = regularTasks
    .filter((value) => !assigned.has(value.id))
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        a.minAnalysts - b.minAnalysts ||
        a.id - b.id,
    );

  for (const value of remaining) {
    const target = chooseGroup(hydrated, value, analysts);
    if (!target) continue;
    target.tasks.push({ ...value });
    target.taskNotes[value.id] = value.defaultAssignmentNote;
  }

  if (qaEnabled && qaTask && qaAnalystId) {
    hydrated.push({
      id: hydrated.length + 1,
      name: `Grupo ${hydrated.length + 1}`,
      analystId: qaAnalystId,
      tasks: [{ ...qaTask }],
      taskNotes: { [qaTask.id]: qaTask.defaultAssignmentNote },
    });
  }

  return { groups: serializeGroups(hydrated) };
}

export function reconcileAfterAnalystRemoval(
  currentGroups: HydratedGroup[],
  removedGroupId: number,
  tasks: Task[],
  qaEnabled: boolean,
  analysts: Analyst[] = [],
): ReconcileResult {
  const remainingIds = currentGroups
    .filter((group) => group.id !== removedGroupId)
    .map((group) => group.analystId);
  const generated = generateDraftGroups(
    remainingIds,
    tasks,
    qaEnabled,
    analysts,
  );
  if (generated.error) {
    return {
      groups: currentGroups,
      removedTasks: [],
      error: generated.error,
    };
  }

  const existingNotes = new Map<number, string>();
  for (const group of currentGroups) {
    for (const value of group.tasks) {
      existingNotes.set(value.id, assignmentNote(group, value));
    }
  }

  const reconciled = hydrateGroups(generated.groups, tasks).map((group) => ({
    ...group,
    taskNotes: Object.fromEntries(
      group.tasks.map((value) => [
        value.id,
        existingNotes.get(value.id) ??
          value.defaultAssignmentNote,
      ]),
    ),
  }));
  const remainingTaskIds = new Set(
    reconciled.flatMap((group) =>
      group.tasks.map((value) => value.id),
    ),
  );
  const removedTasks = currentGroups
    .flatMap((group) => group.tasks)
    .filter(
      (value, index, all) =>
        !remainingTaskIds.has(value.id) &&
        all.findIndex((candidate) => candidate.id === value.id) === index,
    );
  return { groups: reconciled, removedTasks };
}

function duplicated(values: number[]) {
  return values.filter(
    (value, index) => values.indexOf(value) !== index,
  );
}

export function validateState(state: AppState): ValidationResult {
  const errors: string[] = [];
  if (
    !state ||
    !Array.isArray(state.analysts) ||
    !Array.isArray(state.tasks) ||
    !Array.isArray(state.groups) ||
    !Array.isArray(state.scheduled)
  ) {
    return {
      valid: false,
      errors: ["La estructura general del estado no es válida."],
    };
  }

  const analystIds = state.analysts.map((analyst) => analyst.id);
  const taskIds = state.tasks.map((value) => value.id);
  if (duplicated(analystIds).length) {
    errors.push("Hay identificadores de analistas duplicados.");
  }
  if (duplicated(taskIds).length) {
    errors.push("Hay identificadores de tareas duplicados.");
  }

  const validateGroups = (groups: GroupRecord[], label: string) => {
    const groupIds = groups.map((group) => group.id);
    const owners = groups.map((group) => group.analystId);
    const assignedTasks = groups.flatMap((group) => group.taskIds);
    if (duplicated(groupIds).length) {
      errors.push(`${label}: hay identificadores de grupo duplicados.`);
    }
    if (duplicated(owners).length) {
      errors.push(
        `${label}: un analista no puede ser responsable de dos grupos.`,
      );
    }
    if (duplicated(assignedTasks).length) {
      errors.push(`${label}: una tarea no puede aparecer en dos grupos.`);
    }
    for (const group of groups) {
      if (!analystIds.includes(group.analystId)) {
        errors.push(
          `${label}: el grupo ${group.name} tiene un analista inexistente.`,
        );
      }
      const resolvedTasks = group.taskIds.map((id) =>
        state.tasks.find((value) => value.id === id),
      );
      if (resolvedTasks.some((value) => !value)) {
        errors.push(
          `${label}: el grupo ${group.name} contiene una tarea inexistente.`,
        );
      }
      const existingTasks = resolvedTasks.filter(
        (value): value is Task => Boolean(value),
      );
      const exclusive = existingTasks.find(isExclusiveTask);
      if (exclusive && group.taskIds.length > 1) {
        errors.push(
          `${label}: ${exclusive.name} debe permanecer sola en ${group.name}.`,
        );
      }
      const criticalLanes = existingTasks
        .map((value) => value.criticalLane)
        .filter((value): value is CriticalLane => Boolean(value));
      if (new Set(criticalLanes).size > 1) {
        errors.push(
          `${label}: News, Búsquedas e In Progress deben tener responsables distintos.`,
        );
      }
    }
  };

  validateGroups(state.groups, "Distribución vigente");
  for (const schedule of state.scheduled) {
    validateGroups(
      schedule.groups,
      `Programación ${schedule.name}`,
    );
    if (
      !Number.isFinite(Date.parse(schedule.startsAt)) ||
      !Number.isFinite(Date.parse(schedule.endsAt))
    ) {
      errors.push(
        `Programación ${schedule.name}: el horario no es válido.`,
      );
    } else if (
      Date.parse(schedule.endsAt) <= Date.parse(schedule.startsAt)
    ) {
      errors.push(
        `Programación ${schedule.name}: la hora final debe ser posterior a la inicial.`,
      );
    }
  }

  for (const value of state.tasks) {
    if (!value.name.trim()) {
      errors.push("Todas las tareas deben tener nombre.");
    }
    if (
      !Number.isInteger(value.weight) ||
      value.weight < 1 ||
      value.weight > 10
    ) {
      errors.push(
        `El peso de ${value.name || "una tarea"} debe estar entre 1 y 10.`,
      );
    }
    if (
      !Number.isInteger(value.minAnalysts) ||
      value.minAnalysts < 1 ||
      value.minAnalysts > 10
    ) {
      errors.push(
        `El mínimo de ${
          value.name || "una tarea"
        } debe estar entre 1 y 10.`,
      );
    }
  }
  for (const analyst of state.analysts) {
    if (!analyst.name.trim()) {
      errors.push("Todos los analistas deben tener nombre.");
    }
  }
  return { valid: errors.length === 0, errors };
}

export function schedulesOverlap(
  schedules: ScheduledDistribution[],
  startsAt: string,
  endsAt: string,
  ignoredId?: number,
) {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  return schedules.some((schedule) => {
    if (
      schedule.id === ignoredId ||
      !["Programada", "Requiere revisión"].includes(schedule.status)
    ) {
      return false;
    }
    return (
      start < Date.parse(schedule.endsAt) &&
      end > Date.parse(schedule.startsAt)
    );
  });
}

export function resolveScheduledDistributions(
  currentState: AppState,
  now = Date.now(),
): ScheduleResolution {
  const state = structuredClone(currentState);
  let changed = false;

  for (const schedule of state.scheduled) {
    if (
      (schedule.status === "Programada" ||
        schedule.status === "Activada") &&
      Date.parse(schedule.endsAt) <= now
    ) {
      schedule.status = "Expirada";
      changed = true;
    }
  }

  const due = state.scheduled
    .filter(
      (schedule) =>
        schedule.status === "Programada" &&
        Date.parse(schedule.startsAt) <= now &&
        Date.parse(schedule.endsAt) > now,
    )
    .sort(
      (a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt),
    )[0];

  if (!due || state.activeScheduleId === due.id) {
    return { state, changed, activated: null };
  }

  state.groups = due.groups.map((group) => ({
    ...group,
    taskIds: [...group.taskIds],
    taskNotes: { ...(group.taskNotes || {}) },
  }));
  state.activeScheduleId = due.id;
  due.status = "Activada";
  return { state, changed: true, activated: due };
}

export function nextId(items: Array<{ id: number }>) {
  return Math.max(0, ...items.map((item) => item.id)) + 1;
}

export function resolveAnalystRegistration(
  analysts: Analyst[],
  requestedId: unknown,
) {
  const hasRequestedId =
    requestedId !== null &&
    requestedId !== undefined &&
    Number(requestedId) > 0;
  if (!hasRequestedId) {
    return {
      analystId: nextId(analysts),
      existingAnalyst: undefined,
      invalidRequestedId: false,
    };
  }
  const analystId = Number(requestedId);
  const existingAnalyst = Number.isInteger(analystId)
    ? analysts.find((analyst) => analyst.id === analystId)
    : undefined;
  return {
    analystId,
    existingAnalyst,
    invalidRequestedId:
      !Number.isInteger(analystId) || !existingAnalyst,
  };
}
