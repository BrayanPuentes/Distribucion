import {
  type Analyst,
  type AppState,
  type ScheduledDistribution,
  type TaskFamily,
  type CriticalFront,
  type Task,
  initialState,
  isExclusiveTask,
  resolveScheduledDistributions,
  validateState,
} from "../../../lib/distribution.ts";
import {
  AuthError,
  assertSameOrigin,
  authErrorResponse,
  database,
  requestIdentifier,
  requireLeader,
  requireSession,
} from "../../../lib/server/auth.ts";

export const dynamic = "force-dynamic";

type LogLevel = "INFO" | "WARN" | "ERROR";

type StateRow = {
  payload: string;
  revision: number;
  updated_at: string;
};

async function ensureDatabase() {
  const db = database();
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS history_events (id INTEGER PRIMARY KEY AUTOINCREMENT, distribution_id INTEGER, effective_at TEXT NOT NULL, valid_until TEXT, shift TEXT NOT NULL, task TEXT NOT NULL, task_description TEXT NOT NULL DEFAULT '', assignment_note TEXT NOT NULL DEFAULT '', analyst TEXT NOT NULL, group_name TEXT NOT NULL, event TEXT NOT NULL, version INTEGER NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE INDEX IF NOT EXISTS history_distribution_idx ON history_events (distribution_id)"),
    db.prepare("CREATE TABLE IF NOT EXISTS published_distributions (id INTEGER PRIMARY KEY AUTOINCREMENT, schedule_id INTEGER, name TEXT NOT NULL, effective_at TEXT NOT NULL, valid_until TEXT, shift TEXT NOT NULL, snapshot TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', is_current INTEGER NOT NULL DEFAULT 0, archived_at TEXT, archived_by TEXT, archive_reason TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE INDEX IF NOT EXISTS published_status_idx ON published_distributions (status, effective_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS history_effective_idx ON history_events (effective_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS history_task_idx ON history_events (task)"),
    db.prepare("CREATE INDEX IF NOT EXISTS history_analyst_idx ON history_events (analyst)"),
    db.prepare("CREATE TABLE IF NOT EXISTS audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', actor TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS system_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, level TEXT NOT NULL, module TEXT NOT NULL, action TEXT NOT NULL, message TEXT NOT NULL, actor TEXT NOT NULL DEFAULT '', request_id TEXT NOT NULL DEFAULT '', context TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE INDEX IF NOT EXISTS system_logs_created_idx ON system_logs (created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS system_logs_level_idx ON system_logs (level)"),
    db.prepare("CREATE INDEX IF NOT EXISTS system_logs_module_idx ON system_logs (module)"),
  ]);
  const historyColumns = await db
    .prepare("PRAGMA table_info(history_events)")
    .all<{ name: string }>();
  const existingColumns = new Set(
    historyColumns.results.map((column) => column.name),
  );
  if (!existingColumns.has("task_description")) {
    await db
      .prepare(
        "ALTER TABLE history_events ADD COLUMN task_description TEXT NOT NULL DEFAULT ''",
      )
      .run();
  }
  if (!existingColumns.has("assignment_note")) {
    await db
      .prepare(
        "ALTER TABLE history_events ADD COLUMN assignment_note TEXT NOT NULL DEFAULT ''",
      )
      .run();
  }
  if (!existingColumns.has("distribution_id")) {
    await db.prepare("ALTER TABLE history_events ADD COLUMN distribution_id INTEGER").run();
  }
  if (!existingColumns.has("valid_until")) {
    await db.prepare("ALTER TABLE history_events ADD COLUMN valid_until TEXT").run();
  }
  const publicationColumns = await db
    .prepare("PRAGMA table_info(published_distributions)")
    .all<{ name: string }>();
  const existingPublicationColumns = new Set(
    publicationColumns.results.map((column) => column.name),
  );
  if (!existingPublicationColumns.has("schedule_id")) {
    await db.prepare("ALTER TABLE published_distributions ADD COLUMN schedule_id INTEGER").run();
  }
  if (!existingPublicationColumns.has("valid_until")) {
    await db.prepare("ALTER TABLE published_distributions ADD COLUMN valid_until TEXT").run();
  }
  await db.batch([
    db.prepare("CREATE INDEX IF NOT EXISTS published_schedule_idx ON published_distributions (schedule_id)"),
  ]);
  await db
    .prepare("INSERT OR IGNORE INTO app_state (id, payload, revision) VALUES (1, ?, 1)")
    .bind(JSON.stringify(initialState))
    .run();
}

async function writeLog(
  level: LogLevel,
  module: string,
  action: string,
  message: string,
  actor = "",
  requestId = "",
  context: Record<string, unknown> = {},
) {
  try {
    await database()
      .prepare("INSERT INTO system_logs (level, module, action, message, actor, request_id, context) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(
        level,
        module.slice(0, 80),
        action.slice(0, 120),
        message.slice(0, 1000),
        actor.slice(0, 120),
        requestId.slice(0, 80),
        JSON.stringify(context).slice(0, 4000),
      )
      .run();
  } catch {
    // El registro no debe ocultar el error original si la base está fallando.
  }
}

function normalizeAnalysts(value: unknown): Analyst[] {
  if (!Array.isArray(value)) return initialState.analysts.map((analyst) => ({ ...analyst }));
  return value.map((item, index) => {
    const analyst = item as Partial<Analyst> & { status?: string };
    const rawStatus = String(analyst.status || "");
    const status =
      rawStatus === "Ausente"
        ? "Ausente"
        : rawStatus === "Horario parcial" || rawStatus === "Sale a las 5" || rawStatus === "Inicia a las 8"
          ? "Horario parcial"
          : "Disponible";
    return {
      id: Number.isInteger(analyst.id) ? Number(analyst.id) : index + 1,
      name: String(analyst.name || `Analista ${index + 1}`),
      initials: String(analyst.initials || ""),
      schedule: String(analyst.schedule || "Horario por definir"),
      status,
      active: analyst.active !== false,
    };
  });
}

function normalizeTasks(value: unknown): Task[] {
  if (!Array.isArray(value)) return initialState.tasks.map((task) => ({ ...task }));
  return value.map((item, index) => {
    const task = item as Partial<Task>;
    const normalized: Task = {
      id: Number.isInteger(task.id) ? Number(task.id) : index + 1,
      name: String(task.name || `Tarea ${index + 1}`),
      weight: Math.min(10, Math.max(1, Number(task.weight) || 1)),
      category: String(task.category || "General"),
      active: task.active !== false,
      description: String(task.description || ""),
      defaultAssignmentNote: String(task.defaultAssignmentNote || ""),
      minAnalysts: Math.min(
        10,
        Math.max(1, Number(task.minAnalysts) || 3),
      ),
      family: task.family ? String(task.family) : undefined,
      criticalLane: task.criticalLane ? String(task.criticalLane) : undefined,
      qa: Boolean(task.qa),
      exclusive: Boolean(task.exclusive),
    };
    if (isExclusiveTask(normalized)) normalized.exclusive = true;
    return normalized;
  });
}

function normalizeTaskFamilies(value: unknown): TaskFamily[] {
  if (!Array.isArray(value)) return initialState.taskFamilies.map((item) => ({ ...item }));
  return value.map((item) => item as Partial<TaskFamily>).filter((item) => item.id).map((item) => ({
    id: String(item.id), name: String(item.name || item.id), description: String(item.description || ""), active: item.active !== false,
  }));
}

function normalizeCriticalFronts(value: unknown): CriticalFront[] {
  if (!Array.isArray(value)) return initialState.criticalFronts.map((item) => ({ ...item }));
  return value.map((item) => item as Partial<CriticalFront>).filter((item) => item.id).map((item, index) => ({
    id: String(item.id), name: String(item.name || item.id), description: String(item.description || ""), active: item.active !== false, order: Number(item.order) || index + 1,
  })).sort((a, b) => a.order - b.order);
}

function normalizeGroups(value: unknown): AppState["groups"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => item as Partial<AppState["groups"][number]>)
    .filter(
      (item) =>
        Number.isInteger(item.id) &&
        Number.isInteger(item.analystId) &&
        Array.isArray(item.taskIds),
    )
    .map((item) => ({
      id: Number(item.id),
      name: String(item.name || `Grupo ${item.id}`),
      analystId: Number(item.analystId),
      taskIds: (item.taskIds || [])
        .map(Number)
        .filter((taskId) => Number.isInteger(taskId)),
      taskNotes:
        item.taskNotes && typeof item.taskNotes === "object"
          ? Object.fromEntries(
              Object.entries(item.taskNotes).map(([taskId, note]) => [
                String(taskId),
                String(note || ""),
              ]),
            )
          : {},
    }));
}

function normalizeSchedules(value: unknown): ScheduledDistribution[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => item as Partial<ScheduledDistribution>)
    .filter((item) => Number.isInteger(item.id) && item.startsAt && item.endsAt && Array.isArray(item.groups))
    .map((item) => ({
      id: Number(item.id),
      name: String(item.name || `Distribución ${item.id}`),
      startsAt: String(item.startsAt),
      endsAt: String(item.endsAt),
      shift: String(item.shift || "Turno por definir"),
      status: item.status || "Requiere revisión",
      analystCount: Number(item.analystCount) || item.groups?.length || 0,
      groups: normalizeGroups(item.groups),
      createdAt: String(item.createdAt || new Date().toISOString()),
      createdBy: String(item.createdBy || "Sistema"),
      note: String(item.note || ""),
    }));
}

function normalizeState(value: unknown): AppState {
  const source = (value && typeof value === "object" ? value : {}) as Partial<AppState>;
  return {
    version: Number(source.version) || 1,
    analysts: normalizeAnalysts(source.analysts),
    tasks: normalizeTasks(source.tasks),
    taskFamilies: normalizeTaskFamilies(source.taskFamilies),
    criticalFronts: normalizeCriticalFronts(source.criticalFronts),
    groups: normalizeGroups(source.groups),
    scheduled: normalizeSchedules(source.scheduled),
    activeScheduleId: Number.isInteger(source.activeScheduleId) ? Number(source.activeScheduleId) : null,
  };
}

async function readState() {
  await ensureDatabase();
  const row = await database()
    .prepare("SELECT payload, revision, updated_at FROM app_state WHERE id = 1")
    .first<StateRow>();
  if (!row) throw new Error("No fue posible inicializar la base de datos.");
  return {
    state: normalizeState(JSON.parse(row.payload)),
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

async function eligibleAnalystIds() {
  const rows = await database()
    .prepare(
      "SELECT analyst_id FROM users WHERE role = 'analyst' AND active = 1 AND analyst_id IS NOT NULL",
    )
    .all<{ analyst_id: number }>();
  return new Set(rows.results.map((row) => Number(row.analyst_id)));
}

function validateEligibleOwners(state: AppState, eligible: Set<number>) {
  const invalidOwner = [
    ...state.groups.map((group) => ({
      analystId: group.analystId,
      scope: "la distribución vigente",
    })),
    ...state.scheduled.flatMap((schedule) =>
      schedule.groups.map((group) => ({
        analystId: group.analystId,
        scope: `la programación “${schedule.name}”`,
      })),
    ),
  ].find((owner) => !eligible.has(owner.analystId));
  if (!invalidOwner) return null;
  const analyst = state.analysts.find(
    (item) => item.id === invalidOwner.analystId,
  );
  return `${
    analyst?.name || "Un analista"
  } no tiene una cuenta activa y no puede aparecer en ${invalidOwner.scope}.`;
}

function historyStatements(
  db: D1Database,
  state: AppState,
  groups: AppState["groups"],
  effectiveAt: string,
  validUntil: string | null,
  shift: string,
  event: string,
  version: number,
  actor: string,
  distributionId: number | null,
) {
  return groups.flatMap((group) => {
    const analyst = state.analysts.find((item) => item.id === group.analystId);
    return group.taskIds.map((taskId) => {
      const task = state.tasks.find((item) => item.id === taskId);
      return db
        .prepare("INSERT INTO history_events (distribution_id, effective_at, valid_until, shift, task, task_description, assignment_note, analyst, group_name, event, version, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(
          distributionId,
          effectiveAt,
          validUntil,
          shift,
          task?.name || `Tarea ${taskId}`,
          task?.description || "",
          group.taskNotes?.[String(taskId)] ||
            task?.defaultAssignmentNote ||
            "",
          analyst?.name || "Sin responsable",
          group.name,
          event,
          version,
          actor,
        );
    });
  });
}

async function registerMissingHistoricalSchedules(
  state: AppState,
  version: number,
) {
  const expiredSchedules = state.scheduled.filter(
    (schedule) => schedule.status === "Expirada",
  );
  if (!expiredSchedules.length) return;

  const db = database();
  for (const schedule of expiredSchedules) {
    const actor = schedule.createdBy || "Sistema";
    let existing = await db
      .prepare("SELECT id, name, effective_at, valid_until, shift, snapshot FROM published_distributions WHERE schedule_id = ? LIMIT 1")
      .bind(schedule.id)
      .first<{ id: number; name: string; effective_at: string; valid_until: string | null; shift: string; snapshot: string }>();
    if (!existing) {
      existing = await db
        .prepare("SELECT id, name, effective_at, valid_until, shift, snapshot FROM published_distributions WHERE schedule_id IS NULL AND name = ? LIMIT 1")
        .bind(schedule.name)
        .first<{ id: number; name: string; effective_at: string; valid_until: string | null; shift: string; snapshot: string }>();
    }
    if (existing) {
      const snapshot = JSON.stringify({ groups: schedule.groups, tasks: state.tasks, analysts: state.analysts, startsAt: schedule.startsAt, endsAt: schedule.endsAt, note: schedule.note });
      if (existing.name === schedule.name && existing.effective_at === schedule.startsAt && existing.valid_until === schedule.endsAt && existing.shift === schedule.shift && existing.snapshot === snapshot) {
        if (!existing.valid_until) await db.prepare("UPDATE published_distributions SET schedule_id = ?, valid_until = ? WHERE id = ?").bind(schedule.id, schedule.endsAt, existing.id).run();
        continue;
      }
      await db.batch([
        db.prepare("UPDATE published_distributions SET schedule_id = ?, name = ?, effective_at = ?, valid_until = ?, shift = ?, snapshot = ? WHERE id = ?").bind(schedule.id, schedule.name, schedule.startsAt, schedule.endsAt, schedule.shift, snapshot, existing.id),
        db.prepare("DELETE FROM history_events WHERE distribution_id = ?").bind(existing.id),
      ]);
      const replacement = historyStatements(db, state, schedule.groups, schedule.startsAt, schedule.endsAt, schedule.shift, `Registro histórico: ${schedule.name}`, version, actor, existing.id);
      if (replacement.length) await db.batch(replacement);
      continue;
    }
    const publication = await db
      .prepare(
        "INSERT INTO published_distributions (schedule_id, name, effective_at, valid_until, shift, snapshot, status, is_current, created_by) VALUES (?, ?, ?, ?, ?, ?, 'active', 0, ?)",
      )
      .bind(
        schedule.id,
        schedule.name,
        schedule.startsAt,
        schedule.endsAt,
        schedule.shift,
        JSON.stringify({
          groups: schedule.groups,
          tasks: state.tasks,
          analysts: state.analysts,
          startsAt: schedule.startsAt,
          endsAt: schedule.endsAt,
          note: schedule.note,
        }),
        actor,
      )
      .run();
    const distributionId = Number(publication.meta.last_row_id);
    const statements = historyStatements(
      db,
      state,
      schedule.groups,
      schedule.startsAt,
      schedule.endsAt,
      schedule.shift,
      `Registro histórico: ${schedule.name}`,
      version,
      actor,
      distributionId,
    );
    if (statements.length) await db.batch(statements);
    await db
      .prepare("INSERT INTO audit_events (action, detail, actor) VALUES (?, ?, ?)")
      .bind(
        "DISTRIBUCION_HISTORICA_REGISTRADA",
        `${schedule.name} · ${schedule.startsAt}–${schedule.endsAt}`,
        actor,
      )
      .run();
    await writeLog(
      "INFO",
      "PROGRAMACION",
      "REGISTRO_HISTORICO",
      `Se registró ${schedule.name} como distribución histórica.`,
      actor,
      "",
      {
        scheduleId: schedule.id,
        distributionId,
        startsAt: schedule.startsAt,
        endsAt: schedule.endsAt,
        groups: schedule.groups.length,
      },
    );
  }
}

async function activateDueSchedule(current: Awaited<ReturnType<typeof readState>>) {
  const resolution = resolveScheduledDistributions(current.state);
  if (!resolution.changed) {
    await registerMissingHistoricalSchedules(current.state, current.revision);
    return current;
  }
  const { state, activated: due } = resolution;

  const validation = validateState(state);
  if (!validation.valid) {
    await writeLog(
      "ERROR",
      "PROGRAMACION",
      "ACTIVACION_AUTOMATICA",
      `La activación automática fue detenida: ${validation.errors.join(" ")}`,
      "Sistema",
      null,
      "",
      { scheduleId: due?.id ?? null },
    );
    return current;
  }

  const db = database();
  const nextRevision = current.revision + 1;
  state.version = nextRevision;
  const update = await db
    .prepare("UPDATE app_state SET payload = ?, revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1 AND revision = ?")
    .bind(JSON.stringify(state), nextRevision, current.revision)
    .run();
  if (!update.meta.changes) return readState();

  if (due) {
    await db.prepare("UPDATE published_distributions SET is_current = 0 WHERE is_current = 1").run();
    const publication = await db
      .prepare("INSERT INTO published_distributions (schedule_id, name, effective_at, valid_until, shift, snapshot, status, is_current, created_by) VALUES (?, ?, ?, ?, ?, ?, 'active', 1, 'Sistema')")
      .bind(due.id, due.name, due.startsAt, due.endsAt, due.shift, JSON.stringify({ groups: due.groups, tasks: state.tasks, analysts: state.analysts, startsAt: due.startsAt, endsAt: due.endsAt }))
      .run();
    const distributionId = Number(publication.meta.last_row_id);
    const statements = historyStatements(
      db,
      state,
      due.groups,
      due.startsAt,
      due.endsAt,
      due.shift,
      `Activación programada: ${due.name}`,
      nextRevision,
      "Sistema",
      distributionId,
    );
    if (statements.length) await db.batch(statements);
    await db
      .prepare("INSERT INTO audit_events (action, detail, actor) VALUES (?, ?, ?)")
      .bind("ACTIVACION_AUTOMATICA", due.name, "Sistema")
      .run();
    await writeLog(
      "INFO",
      "PROGRAMACION",
      "ACTIVACION_AUTOMATICA",
      `Se activó ${due.name}.`,
      "Sistema",
      "",
      { scheduleId: due.id, startsAt: due.startsAt, groups: due.groups.length },
    );
  }
  await registerMissingHistoricalSchedules(state, nextRevision);
  return { state, revision: nextRevision, updatedAt: new Date().toISOString() };
}

export async function GET(request: Request) {
  const requestId = requestIdentifier();
  try {
    const user = await requireSession(request);
    const current = await activateDueSchedule(await readState());
    const db = database();
    const [history, published, audit, logs] = await Promise.all([
      db.prepare("SELECT id, distribution_id, effective_at, valid_until, shift, task, task_description, assignment_note, analyst, group_name, event, version, created_by FROM history_events ORDER BY effective_at DESC, id DESC LIMIT 5000").all(),
      db.prepare("SELECT id, schedule_id, name, effective_at, valid_until, shift, status, is_current, archived_at, archived_by, archive_reason, created_by, created_at FROM published_distributions ORDER BY effective_at DESC, id DESC").all(),
      user.role === "leader"
        ? db.prepare("SELECT id, action, detail, actor, created_at FROM audit_events ORDER BY id DESC LIMIT 1000").all()
        : Promise.resolve({ results: [] }),
      user.role === "leader"
        ? db.prepare("SELECT id, level, module, action, message, actor, request_id, context, created_at FROM system_logs ORDER BY id DESC LIMIT 2000").all()
        : Promise.resolve({ results: [] }),
    ]);
    const eligible = await eligibleAnalystIds();
    return Response.json({
      ...current,
      history: history.results,
      publishedDistributions: published.results,
      audit: audit.results,
      logs: logs.results,
      eligibleAnalystIds: Array.from(eligible),
      requestId,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error, requestId);
    }
    await writeLog(
      "ERROR",
      "BASE_DATOS",
      "CARGAR_ESTADO",
      error instanceof Error ? error.message : "Error desconocido al cargar.",
      "",
      requestId,
    );
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Error de base de datos",
        requestId,
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const requestId = requestIdentifier();
  try {
    assertSameOrigin(request);
    const authenticatedUser = await requireLeader(request);
    const body = (await request.json()) as {
      state?: unknown;
      revision?: number;
      action?: string;
      actor?: string;
      detail?: string;
      publish?: boolean;
      effectiveAt?: string;
      shift?: string;
      level?: LogLevel;
      module?: string;
    };
    if (!body.state || !Number.isInteger(body.revision)) {
      await ensureDatabase();
      await writeLog("WARN", "API", "VALIDACION", "Estado o revisión inválidos.", authenticatedUser.displayName, requestId);
      return Response.json({ error: "Estado o revisión inválidos.", requestId }, { status: 400 });
    }

    await ensureDatabase();
    const state = normalizeState(body.state);
    const validation = validateState(state);
    if (!validation.valid) {
      await writeLog(
        "WARN",
        body.module || "DISTRIBUCION",
        body.action || "VALIDACION",
        validation.errors.join(" "),
        authenticatedUser.displayName,
        requestId,
      );
      return Response.json(
        { error: validation.errors[0], errors: validation.errors, requestId },
        { status: 400 },
      );
    }
    const ownerError = validateEligibleOwners(
      state,
      await eligibleAnalystIds(),
    );
    if (ownerError) {
      await writeLog(
        "WARN",
        body.module || "DISTRIBUCION",
        body.action || "VALIDACION",
        ownerError,
        authenticatedUser.displayName,
        requestId,
      );
      return Response.json(
        { error: ownerError, requestId },
        { status: 400 },
      );
    }

    const actor = authenticatedUser.displayName.slice(0, 120);
    const action = (body.action || "ACTUALIZAR").slice(0, 120);
    const detail = (body.detail || "").slice(0, 1000);
    const nextRevision = Number(body.revision) + 1;
    state.version = nextRevision;
    const db = database();
    const update = await db
      .prepare("UPDATE app_state SET payload = ?, revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1 AND revision = ?")
      .bind(JSON.stringify(state), nextRevision, body.revision)
      .run();

    if (!update.meta.changes) {
      await writeLog(
        "WARN",
        body.module || "CONCURRENCIA",
        action,
        "La operación fue rechazada porque otra sesión guardó cambios primero.",
        actor,
        requestId,
        { expectedRevision: body.revision },
      );
      return Response.json(
        {
          error: "La distribución cambió en otra sesión. Recarga antes de guardar.",
          code: "REVISION_CONFLICT",
          requestId,
        },
        { status: 409 },
      );
    }

    await db
      .prepare("INSERT INTO audit_events (action, detail, actor) VALUES (?, ?, ?)")
      .bind(action, detail, actor)
      .run();

    if (body.publish) {
      await db.prepare("UPDATE published_distributions SET is_current = 0 WHERE is_current = 1").run();
      const publication = await db
        .prepare("INSERT INTO published_distributions (name, effective_at, shift, snapshot, status, is_current, created_by) VALUES (?, ?, ?, ?, 'active', 1, ?)")
        .bind(
          detail || `Distribución versión ${nextRevision}`,
          body.effectiveAt || new Date().toISOString(),
          body.shift || "Turno actual",
          JSON.stringify({ groups: state.groups, tasks: state.tasks, analysts: state.analysts }),
          actor,
        )
        .run();
      const distributionId = Number(publication.meta.last_row_id);
      const statements = historyStatements(
        db,
        state,
      state.groups,
      body.effectiveAt || new Date().toISOString(),
      null,
      body.shift || "Turno actual",
        detail || action,
        nextRevision,
        actor,
        distributionId,
      );
      if (statements.length) await db.batch(statements);
    }

    await writeLog(
      body.level || "INFO",
      body.module || "DISTRIBUCION",
      action,
      detail || "Operación completada.",
      actor,
      requestId,
      {
        revision: nextRevision,
        publish: Boolean(body.publish),
        analysts: state.analysts.length,
        tasks: state.tasks.length,
        groups: state.groups.length,
        schedules: state.scheduled.length,
      },
    );
    return Response.json({ ok: true, revision: nextRevision, requestId });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error, requestId);
    }
    await ensureDatabase().catch(() => undefined);
    await writeLog(
      "ERROR",
      "API",
      "GUARDAR_ESTADO",
      error instanceof Error ? error.message : "No fue posible guardar.",
      "",
      requestId,
    );
    return Response.json(
      {
        error: error instanceof Error ? error.message : "No fue posible guardar.",
        requestId,
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const requestId = requestIdentifier();
  try {
    assertSameOrigin(request);
    const authenticatedUser = await requireSession(request);
    await ensureDatabase();
    const body = (await request.json()) as {
      level?: LogLevel;
      module?: string;
      action?: string;
      message?: string;
      actor?: string;
      context?: Record<string, unknown>;
    };
    await writeLog(
      body.level || "INFO",
      body.module || "CLIENTE",
      body.action || "EVENTO",
      body.message || "Evento registrado desde la interfaz.",
      authenticatedUser.displayName,
      requestId,
      body.context || {},
    );
    return Response.json({ ok: true, requestId });
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error, requestId);
    }
    return Response.json(
      {
        error: error instanceof Error ? error.message : "No fue posible registrar el evento.",
        requestId,
      },
      { status: 500 },
    );
  }
}
