import {
  type Analyst,
  type AnalystStatus,
  type AppState,
  initialState,
  initialsFor,
  resolveAnalystRegistration,
} from "../../../lib/distribution.ts";
import {
  AuthError,
  type UserRole,
  assertSameOrigin,
  authErrorResponse,
  database,
  ensureAuthDatabase,
  hashPassword,
  mapUserListItem,
  normalizeUsername,
  requestIdentifier,
  requireLeader,
  validateDisplayName,
  validateUsername,
  writeAuthLog,
} from "../../../lib/server/auth.ts";

export const dynamic = "force-dynamic";

type UserRow = {
  id: number;
  username: string;
  username_normalized: string;
  display_name: string;
  role: string;
  analyst_id: number | null;
  active: number;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
};

type StateRow = {
  payload: string;
  revision: number;
};

type UserPayload = {
  id?: number;
  username?: string;
  displayName?: string;
  role?: UserRole;
  analystId?: number | null;
  password?: string;
  active?: boolean;
  schedule?: string;
  status?: AnalystStatus;
};

async function ensureStateStorage() {
  const db = database();
  await db.batch([
    db.prepare(
      "CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    ),
    db
      .prepare(
        "INSERT OR IGNORE INTO app_state (id, payload, revision) VALUES (1, ?, 1)",
      )
      .bind(JSON.stringify(initialState)),
  ]);
}

async function readState() {
  await ensureStateStorage();
  const row = await database()
    .prepare(
      "SELECT payload, revision FROM app_state WHERE id = 1 LIMIT 1",
    )
    .first<StateRow>();
  if (!row) {
    throw new AuthError(
      500,
      "No fue posible abrir el equipo operativo.",
      "STATE_UNAVAILABLE",
    );
  }
  const parsed = JSON.parse(row.payload) as Partial<AppState>;
  return {
    state: {
      ...initialState,
      ...parsed,
      analysts: Array.isArray(parsed.analysts) ? parsed.analysts : [],
      tasks: Array.isArray(parsed.tasks)
        ? parsed.tasks
        : initialState.tasks,
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      scheduled: Array.isArray(parsed.scheduled)
        ? parsed.scheduled
        : [],
    } as AppState,
    revision: Number(row.revision) || 1,
  };
}

function stateUpdateStatement(state: AppState, revision: number) {
  const nextRevision = revision + 1;
  state.version = nextRevision;
  return database()
    .prepare(
      "UPDATE app_state SET payload = ?, revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
    )
    .bind(JSON.stringify(state), nextRevision);
}

function parseRole(value: unknown): UserRole {
  if (value === "leader" || value === "analyst") return value;
  throw new AuthError(
    400,
    "El rol seleccionado no es válido.",
    "INVALID_ROLE",
  );
}

function parseStatus(value: unknown): AnalystStatus {
  if (
    value === "Disponible" ||
    value === "Horario parcial" ||
    value === "Ausente"
  ) {
    return value;
  }
  return "Disponible";
}

function validateSchedule(value: unknown) {
  const schedule = String(value || "").trim();
  if (schedule.length < 3 || schedule.length > 120) {
    throw new AuthError(
      400,
      "Escribe el horario operativo del analista.",
      "SCHEDULE_REQUIRED",
    );
  }
  return schedule;
}

function analystInUse(state: AppState, analystId: number) {
  const current = state.groups.some(
    (group) => group.analystId === analystId,
  );
  const future = state.scheduled.some(
    (schedule) =>
      ["Programada", "Requiere revisión"].includes(schedule.status) &&
      schedule.groups.some(
        (group) => group.analystId === analystId,
      ),
  );
  return current || future;
}

async function activeLeaderCount() {
  const row = await database()
    .prepare(
      "SELECT COUNT(*) AS total FROM users WHERE role = 'leader' AND active = 1",
    )
    .first<{ total: number }>();
  return Number(row?.total || 0);
}

async function targetUser(id: number) {
  return database()
    .prepare(
      "SELECT id, username, username_normalized, display_name, role, analyst_id, active, password_hash, password_salt, password_iterations, created_at, updated_at, last_login_at FROM users WHERE id = ? LIMIT 1",
    )
    .bind(id)
    .first<UserRow>();
}

async function assertUniqueUsername(
  usernameNormalized: string,
  ignoredId = 0,
) {
  const existing = await database()
    .prepare(
      "SELECT id FROM users WHERE username_normalized = ? AND id <> ? LIMIT 1",
    )
    .bind(usernameNormalized, ignoredId)
    .first<{ id: number }>();
  if (existing) {
    throw new AuthError(
      409,
      "Ya existe una cuenta con ese usuario.",
      "USERNAME_TAKEN",
    );
  }
}

async function assertAnalystUnlinked(
  analystId: number,
  ignoredId = 0,
) {
  const duplicate = await database()
    .prepare(
      "SELECT id FROM users WHERE analyst_id = ? AND id <> ? LIMIT 1",
    )
    .bind(analystId, ignoredId)
    .first<{ id: number }>();
  if (duplicate) {
    throw new AuthError(
      409,
      "Ese analista ya tiene una cuenta de acceso registrada.",
      "ANALYST_ALREADY_LINKED",
    );
  }
}

function updatedAnalyst(
  current: Analyst | undefined,
  id: number,
  displayName: string,
  body: UserPayload,
  active: boolean,
): Analyst {
  return {
    id,
    name: displayName,
    initials: initialsFor(displayName),
    schedule: validateSchedule(body.schedule ?? current?.schedule),
    status: parseStatus(body.status ?? current?.status),
    active,
  };
}

export async function GET(request: Request) {
  const requestId = requestIdentifier();
  try {
    await ensureAuthDatabase();
    await requireLeader(request);
    const [{ state }, rows] = await Promise.all([
      readState(),
      database()
        .prepare(
          "SELECT id, username, username_normalized, display_name, role, analyst_id, active, password_hash, password_salt, password_iterations, created_at, updated_at, last_login_at FROM users ORDER BY active DESC, role ASC, display_name COLLATE NOCASE ASC",
        )
        .all<UserRow>(),
    ]);
    const linkedIds = new Set(
      rows.results
        .map((row) => row.analyst_id)
        .filter((id): id is number => Number.isInteger(id)),
    );
    return Response.json({
      users: rows.results.map((row) => {
        const analyst = row.analyst_id
          ? state.analysts.find(
              (item) => item.id === row.analyst_id,
            )
          : undefined;
        return {
          ...mapUserListItem(row),
          schedule: analyst?.schedule || null,
          status: analyst?.status || null,
          operationalActive: analyst?.active ?? null,
        };
      }),
      unlinkedAnalysts: state.analysts.filter(
        (analyst) => !linkedIds.has(analyst.id),
      ),
      requestId,
    });
  } catch (error) {
    return authErrorResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = requestIdentifier();
  try {
    assertSameOrigin(request);
    await ensureAuthDatabase();
    const actor = await requireLeader(request);
    const body = (await request.json()) as UserPayload;
    const role = parseRole(body.role);
    const usernameNormalized = validateUsername(body.username || "");
    const displayName = validateDisplayName(
      body.displayName || "",
    );
    const password = await hashPassword(body.password || "");
    await assertUniqueUsername(usernameNormalized);

    const db = database();
    if (role === "leader") {
      const result = await db
        .prepare(
          "INSERT INTO users (username, username_normalized, display_name, role, analyst_id, password_hash, password_salt, password_iterations, active, created_by) VALUES (?, ?, ?, 'leader', NULL, ?, ?, ?, 1, ?)",
        )
        .bind(
          body.username?.trim() || usernameNormalized,
          usernameNormalized,
          displayName,
          password.hash,
          password.salt,
          password.iterations,
          actor.id,
        )
        .run();
      const userId = Number(result.meta.last_row_id || 0);
      await writeAuthLog(
        "INFO",
        "REGISTRAR_USUARIO",
        "Se registró una cuenta de líder.",
        actor.displayName,
        requestId,
        { userId, role },
      );
      return Response.json({ ok: true, userId, requestId });
    }

    const { state, revision } = await readState();
    const {
      analystId,
      existingAnalyst,
      invalidRequestedId,
    } = resolveAnalystRegistration(
      state.analysts,
      body.analystId,
    );
    if (invalidRequestedId) {
      throw new AuthError(
        404,
        "El analista operativo ya no existe.",
        "ANALYST_NOT_FOUND",
      );
    }
    await assertAnalystUnlinked(analystId);
    const duplicateName = state.analysts.some(
      (analyst) =>
        analyst.id !== analystId &&
        analyst.name.trim().toLocaleLowerCase("es") ===
          displayName.trim().toLocaleLowerCase("es"),
    );
    if (duplicateName) {
      throw new AuthError(
        409,
        "Ya existe una persona con ese nombre.",
        "DISPLAY_NAME_TAKEN",
      );
    }
    const analyst = updatedAnalyst(
      existingAnalyst,
      analystId,
      displayName,
      body,
      true,
    );
    state.analysts = existingAnalyst
      ? state.analysts.map((item) =>
          item.id === analystId ? analyst : item,
        )
      : [...state.analysts, analyst];

    const [created] = await db.batch([
      db
        .prepare(
          "INSERT INTO users (username, username_normalized, display_name, role, analyst_id, password_hash, password_salt, password_iterations, active, created_by) VALUES (?, ?, ?, 'analyst', ?, ?, ?, ?, 1, ?)",
        )
        .bind(
          body.username?.trim() || usernameNormalized,
          usernameNormalized,
          displayName,
          analystId,
          password.hash,
          password.salt,
          password.iterations,
          actor.id,
        ),
      stateUpdateStatement(state, revision),
    ]);
    const userId = Number(created.meta.last_row_id || 0);
    await writeAuthLog(
      "INFO",
      "REGISTRAR_PERSONA",
      "Se registraron juntos el acceso y el perfil operativo del analista.",
      actor.displayName,
      requestId,
      { userId, analystId, role },
    );
    return Response.json({
      ok: true,
      userId,
      analystId,
      requestId,
    });
  } catch (error) {
    return authErrorResponse(error, requestId);
  }
}

export async function PUT(request: Request) {
  const requestId = requestIdentifier();
  try {
    assertSameOrigin(request);
    await ensureAuthDatabase();
    const actor = await requireLeader(request);
    const body = (await request.json()) as UserPayload;
    const id = Number(body.id);
    if (!Number.isInteger(id)) {
      throw new AuthError(
        400,
        "La cuenta no es válida.",
        "INVALID_USER",
      );
    }
    const current = await targetUser(id);
    if (!current) {
      throw new AuthError(
        404,
        "La cuenta ya no existe.",
        "USER_NOT_FOUND",
      );
    }
    const role = parseRole(body.role);
    if (role !== current.role) {
      throw new AuthError(
        400,
        "El rol forma parte de la identidad de la persona. Crea una cuenta nueva para usar otro rol.",
        "ROLE_IMMUTABLE",
      );
    }
    const usernameNormalized = validateUsername(body.username || "");
    const displayName = validateDisplayName(
      body.displayName || "",
    );
    const active = body.active !== false;
    await assertUniqueUsername(usernameNormalized, id);

    if (id === actor.id && !active) {
      throw new AuthError(
        400,
        "No puedes desactivar la cuenta con la que estás trabajando.",
        "CANNOT_DISABLE_SELF",
      );
    }
    if (
      current.role === "leader" &&
      current.active &&
      !active &&
      (await activeLeaderCount()) <= 1
    ) {
      throw new AuthError(
        400,
        "Debe permanecer al menos una cuenta de líder activa.",
        "LAST_LEADER",
      );
    }

    const { state, revision } = await readState();
    let analystId: number | null = null;
    if (role === "analyst") {
      analystId = Number(current.analyst_id || body.analystId);
      if (!Number.isInteger(analystId)) {
        throw new AuthError(
          400,
          "La cuenta no tiene un perfil operativo válido.",
          "ANALYST_REQUIRED",
        );
      }
      const existingAnalyst = state.analysts.find(
        (analyst) => analyst.id === analystId,
      );
      if (!existingAnalyst) {
        throw new AuthError(
          404,
          "El perfil operativo ya no existe.",
          "ANALYST_NOT_FOUND",
        );
      }
      if (!active && analystInUse(state, analystId)) {
        throw new AuthError(
          409,
          "Retira primero al analista de la distribución vigente y de las programaciones futuras.",
          "ANALYST_IN_USE",
        );
      }
      const analyst = updatedAnalyst(
        existingAnalyst,
        analystId,
        displayName,
        body,
        active,
      );
      state.analysts = state.analysts.map((item) =>
        item.id === analystId ? analyst : item,
      );
    }

    const passwordValue = body.password?.trim()
      ? body.password
      : null;
    if (id === actor.id && passwordValue) {
      throw new AuthError(
        400,
        "Usa la opción “Cambiar contraseña” de tu perfil para actualizar tu propia clave.",
        "USE_OWN_PASSWORD_FLOW",
      );
    }

    const statements = [];
    if (passwordValue) {
      const password = await hashPassword(passwordValue);
      statements.push(
        database()
          .prepare(
            "UPDATE users SET username = ?, username_normalized = ?, display_name = ?, active = ?, password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          )
          .bind(
            body.username?.trim() || usernameNormalized,
            usernameNormalized,
            displayName,
            active ? 1 : 0,
            password.hash,
            password.salt,
            password.iterations,
            id,
          ),
      );
    } else {
      statements.push(
        database()
          .prepare(
            "UPDATE users SET username = ?, username_normalized = ?, display_name = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          )
          .bind(
            body.username?.trim() || usernameNormalized,
            usernameNormalized,
            displayName,
            active ? 1 : 0,
            id,
          ),
      );
    }
    if (role === "analyst") {
      statements.push(stateUpdateStatement(state, revision));
    }
    if (passwordValue || !active) {
      statements.push(
        database()
          .prepare("DELETE FROM user_sessions WHERE user_id = ?")
          .bind(id),
      );
    }
    await database().batch(statements);

    await writeAuthLog(
      "INFO",
      "ACTUALIZAR_PERSONA",
      role === "analyst"
        ? "Se actualizaron juntos la cuenta y el perfil operativo."
        : "Se actualizó una cuenta de líder.",
      actor.displayName,
      requestId,
      {
        userId: id,
        role,
        analystId,
        active,
        passwordReset: Boolean(passwordValue),
      },
    );
    return Response.json({ ok: true, requestId });
  } catch (error) {
    return authErrorResponse(error, requestId);
  }
}

export async function DELETE(request: Request) {
  const requestId = requestIdentifier();
  try {
    assertSameOrigin(request);
    await ensureAuthDatabase();
    const actor = await requireLeader(request);
    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    if (!Number.isInteger(id)) {
      throw new AuthError(
        400,
        "La cuenta no es válida.",
        "INVALID_USER",
      );
    }
    if (id === actor.id) {
      throw new AuthError(
        400,
        "No puedes eliminar la cuenta con la que estás trabajando.",
        "CANNOT_DELETE_SELF",
      );
    }
    const current = await targetUser(id);
    if (!current) {
      throw new AuthError(
        404,
        "La cuenta ya no existe.",
        "USER_NOT_FOUND",
      );
    }
    if (
      current.role === "leader" &&
      current.active &&
      (await activeLeaderCount()) <= 1
    ) {
      throw new AuthError(
        400,
        "Debe permanecer al menos una cuenta de líder activa.",
        "LAST_LEADER",
      );
    }

    const statements = [
      database()
        .prepare("DELETE FROM user_sessions WHERE user_id = ?")
        .bind(id),
      database().prepare("DELETE FROM users WHERE id = ?").bind(id),
    ];
    let analystId: number | null = null;
    if (current.role === "analyst" && current.analyst_id) {
      const currentState = await readState();
      analystId = current.analyst_id;
      if (analystInUse(currentState.state, analystId)) {
        throw new AuthError(
          409,
          "No se puede eliminar una persona que aparece en una distribución vigente o programada.",
          "ANALYST_IN_USE",
        );
      }
      currentState.state.analysts =
        currentState.state.analysts.filter(
          (analyst) => analyst.id !== analystId,
        );
      statements.push(
        stateUpdateStatement(
          currentState.state,
          currentState.revision,
        ),
      );
    }
    await database().batch(statements);
    await writeAuthLog(
      "WARN",
      "ELIMINAR_PERSONA",
      current.role === "analyst"
        ? "Se eliminaron juntos el acceso y el perfil operativo; el histórico se conserva."
        : "Se eliminó una cuenta de líder.",
      actor.displayName,
      requestId,
      {
        userId: id,
        analystId,
        username: normalizeUsername(current.username),
        role: current.role,
      },
    );
    return Response.json({ ok: true, requestId });
  } catch (error) {
    return authErrorResponse(error, requestId);
  }
}
