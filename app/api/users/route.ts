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
} from "../../../lib/server/auth";

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

async function analystExists(analystId: number) {
  const row = await database()
    .prepare("SELECT payload FROM app_state WHERE id = 1 LIMIT 1")
    .first<{ payload: string }>();
  if (!row) return false;
  try {
    const state = JSON.parse(row.payload) as {
      analysts?: Array<{ id?: number }>;
    };
    return Boolean(
      state.analysts?.some((analyst) => Number(analyst.id) === analystId),
    );
  } catch {
    return false;
  }
}

async function validateAnalystLink(
  role: UserRole,
  analystId: unknown,
  ignoredUserId?: number,
) {
  if (role === "leader") return null;
  const value = Number(analystId);
  if (!Number.isInteger(value) || !(await analystExists(value))) {
    throw new AuthError(
      400,
      "Selecciona el analista operativo asociado a esta cuenta.",
      "ANALYST_REQUIRED",
    );
  }
  const duplicate = await database()
    .prepare(
      "SELECT id FROM users WHERE analyst_id = ? AND id <> ? LIMIT 1",
    )
    .bind(value, ignoredUserId || 0)
    .first<{ id: number }>();
  if (duplicate) {
    throw new AuthError(
      409,
      "Ese analista ya tiene una cuenta de acceso registrada.",
      "ANALYST_ALREADY_LINKED",
    );
  }
  return value;
}

function parseRole(value: unknown): UserRole {
  if (value === "leader" || value === "analyst") return value;
  throw new AuthError(400, "El rol seleccionado no es válido.", "INVALID_ROLE");
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

export async function GET(request: Request) {
  const requestId = requestIdentifier();
  try {
    await ensureAuthDatabase();
    await requireLeader(request);
    const rows = await database()
      .prepare(
        "SELECT id, username, username_normalized, display_name, role, analyst_id, active, password_hash, password_salt, password_iterations, created_at, updated_at, last_login_at FROM users ORDER BY active DESC, role ASC, display_name COLLATE NOCASE ASC",
      )
      .all<UserRow>();
    return Response.json({
      users: rows.results.map(mapUserListItem),
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
    const body = (await request.json()) as {
      username?: string;
      displayName?: string;
      role?: UserRole;
      analystId?: number | null;
      password?: string;
    };
    const role = parseRole(body.role);
    const usernameNormalized = validateUsername(body.username || "");
    const displayName = validateDisplayName(body.displayName || "");
    const analystId = await validateAnalystLink(role, body.analystId);
    const password = await hashPassword(body.password || "");

    const existing = await database()
      .prepare(
        "SELECT id FROM users WHERE username_normalized = ? LIMIT 1",
      )
      .bind(usernameNormalized)
      .first<{ id: number }>();
    if (existing) {
      throw new AuthError(
        409,
        "Ya existe una cuenta con ese usuario.",
        "USERNAME_TAKEN",
      );
    }

    const result = await database()
      .prepare(
        "INSERT INTO users (username, username_normalized, display_name, role, analyst_id, password_hash, password_salt, password_iterations, active, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
      )
      .bind(
        body.username?.trim() || usernameNormalized,
        usernameNormalized,
        displayName,
        role,
        analystId,
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
      `Se registró una cuenta de ${role === "leader" ? "líder" : "analista"}.`,
      actor.displayName,
      requestId,
      { userId, role, analystId },
    );
    return Response.json({ ok: true, userId, requestId });
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
    const body = (await request.json()) as {
      id?: number;
      username?: string;
      displayName?: string;
      role?: UserRole;
      analystId?: number | null;
      password?: string;
      active?: boolean;
    };
    const id = Number(body.id);
    if (!Number.isInteger(id)) {
      throw new AuthError(400, "La cuenta no es válida.", "INVALID_USER");
    }
    const current = await targetUser(id);
    if (!current) {
      throw new AuthError(404, "La cuenta ya no existe.", "USER_NOT_FOUND");
    }
    const role = parseRole(body.role);
    const usernameNormalized = validateUsername(body.username || "");
    const displayName = validateDisplayName(body.displayName || "");
    const analystId = await validateAnalystLink(role, body.analystId, id);
    const active = body.active !== false;

    if (id === actor.id && !active) {
      throw new AuthError(
        400,
        "No puedes desactivar la cuenta con la que estás trabajando.",
        "CANNOT_DISABLE_SELF",
      );
    }
    if (id === actor.id && role !== current.role) {
      throw new AuthError(
        400,
        "No puedes cambiar el rol de la cuenta con la que estás trabajando.",
        "CANNOT_CHANGE_OWN_ROLE",
      );
    }
    if (
      current.role === "leader" &&
      current.active &&
      (role !== "leader" || !active) &&
      (await activeLeaderCount()) <= 1
    ) {
      throw new AuthError(
        400,
        "Debe permanecer al menos una cuenta de líder activa.",
        "LAST_LEADER",
      );
    }
    const duplicate = await database()
      .prepare(
        "SELECT id FROM users WHERE username_normalized = ? AND id <> ? LIMIT 1",
      )
      .bind(usernameNormalized, id)
      .first<{ id: number }>();
    if (duplicate) {
      throw new AuthError(
        409,
        "Ya existe una cuenta con ese usuario.",
        "USERNAME_TAKEN",
      );
    }

    const passwordValue = body.password?.trim() ? body.password : null;
    if (id === actor.id && passwordValue) {
      throw new AuthError(
        400,
        "Usa la opción “Cambiar contraseña” de tu perfil para actualizar tu propia clave.",
        "USE_OWN_PASSWORD_FLOW",
      );
    }
    if (passwordValue) {
      const password = await hashPassword(passwordValue);
      await database()
        .prepare(
          "UPDATE users SET username = ?, username_normalized = ?, display_name = ?, role = ?, analyst_id = ?, active = ?, password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(
          body.username?.trim() || usernameNormalized,
          usernameNormalized,
          displayName,
          role,
          analystId,
          active ? 1 : 0,
          password.hash,
          password.salt,
          password.iterations,
          id,
        )
        .run();
    } else {
      await database()
        .prepare(
          "UPDATE users SET username = ?, username_normalized = ?, display_name = ?, role = ?, analyst_id = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(
          body.username?.trim() || usernameNormalized,
          usernameNormalized,
          displayName,
          role,
          analystId,
          active ? 1 : 0,
          id,
        )
        .run();
    }

    if (
      passwordValue ||
      !active ||
      current.role !== role ||
      Number(current.analyst_id || 0) !== Number(analystId || 0)
    ) {
      await database()
        .prepare("DELETE FROM user_sessions WHERE user_id = ?")
        .bind(id)
        .run();
    }
    await writeAuthLog(
      "INFO",
      "ACTUALIZAR_USUARIO",
      "Se actualizó una cuenta de acceso.",
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
      throw new AuthError(400, "La cuenta no es válida.", "INVALID_USER");
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
      throw new AuthError(404, "La cuenta ya no existe.", "USER_NOT_FOUND");
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
    await database().batch([
      database()
        .prepare("DELETE FROM user_sessions WHERE user_id = ?")
        .bind(id),
      database().prepare("DELETE FROM users WHERE id = ?").bind(id),
    ]);
    await writeAuthLog(
      "WARN",
      "ELIMINAR_USUARIO",
      "Se eliminó una cuenta de acceso.",
      actor.displayName,
      requestId,
      {
        userId: id,
        username: normalizeUsername(current.username),
        role: current.role,
      },
    );
    return Response.json({ ok: true, requestId });
  } catch (error) {
    return authErrorResponse(error, requestId);
  }
}
