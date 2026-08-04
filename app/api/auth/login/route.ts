import {
  AuthError,
  assertSameOrigin,
  authErrorResponse,
  createSession,
  database,
  ensureAuthDatabase,
  findUserByUsername,
  mapUserListItem,
  normalizeUsername,
  requestIdentifier,
  sessionCookie,
  verifyPassword,
  writeAuthLog,
} from "../../../../lib/server/auth.ts";

export const dynamic = "force-dynamic";

const MAX_FAILURES = 5;
const BLOCK_MINUTES = 15;

async function registerFailure(usernameNormalized: string) {
  const db = database();
  const current = await db
    .prepare(
      "SELECT failures FROM login_attempts WHERE username_normalized = ? LIMIT 1",
    )
    .bind(usernameNormalized)
    .first<{ failures: number }>();
  const failures = Number(current?.failures || 0) + 1;
  const blockedUntil =
    failures >= MAX_FAILURES
      ? new Date(Date.now() + BLOCK_MINUTES * 60_000).toISOString()
      : null;
  await db
    .prepare(
      "INSERT INTO login_attempts (username_normalized, failures, blocked_until, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(username_normalized) DO UPDATE SET failures = excluded.failures, blocked_until = excluded.blocked_until, updated_at = CURRENT_TIMESTAMP",
    )
    .bind(usernameNormalized, failures, blockedUntil)
    .run();
}

export async function POST(request: Request) {
  const requestId = requestIdentifier();
  let attemptedUsername = "";
  try {
    assertSameOrigin(request);
    await ensureAuthDatabase();
    const body = (await request.json()) as {
      username?: string;
      password?: string;
    };
    attemptedUsername = normalizeUsername(body.username || "");
    if (!attemptedUsername || !body.password) {
      throw new AuthError(
        400,
        "Ingresa tu usuario y contraseña.",
        "MISSING_CREDENTIALS",
      );
    }

    const attempt = await database()
      .prepare(
        "SELECT failures, blocked_until FROM login_attempts WHERE username_normalized = ? LIMIT 1",
      )
      .bind(attemptedUsername)
      .first<{ failures: number; blocked_until: string | null }>();
    if (
      attempt?.blocked_until &&
      Date.parse(attempt.blocked_until) > Date.now()
    ) {
      throw new AuthError(
        429,
        "La cuenta está temporalmente bloqueada por varios intentos fallidos. Intenta nuevamente en 15 minutos.",
        "LOGIN_BLOCKED",
      );
    }

    const row = await findUserByUsername(attemptedUsername);
    const passwordValid =
      row &&
      (await verifyPassword(
        body.password,
        row.password_hash,
        row.password_salt,
        Number(row.password_iterations),
      ));
    if (!row || !passwordValid || !row.active) {
      await registerFailure(attemptedUsername);
      await writeAuthLog(
        "WARN",
        "INICIO_SESION_FALLIDO",
        "Se rechazó un intento de inicio de sesión.",
        attemptedUsername,
        requestId,
      );
      throw new AuthError(
        401,
        "Usuario o contraseña incorrectos.",
        "INVALID_CREDENTIALS",
      );
    }

    await database().batch([
      database()
        .prepare(
          "UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = updated_at WHERE id = ?",
        )
        .bind(row.id),
      database()
        .prepare(
          "DELETE FROM login_attempts WHERE username_normalized = ?",
        )
        .bind(attemptedUsername),
    ]);
    const token = await createSession(Number(row.id));
    const user = mapUserListItem(row);
    await writeAuthLog(
      "INFO",
      "INICIAR_SESION",
      "Inicio de sesión correcto.",
      user.displayName,
      requestId,
      { userId: user.id, role: user.role },
    );
    return Response.json(
      { ok: true, user, requestId },
      { headers: { "set-cookie": sessionCookie(request, token) } },
    );
  } catch (error) {
    if (!(error instanceof AuthError)) {
      await writeAuthLog(
        "ERROR",
        "INICIAR_SESION",
        error instanceof Error ? error.message : "Error desconocido.",
        attemptedUsername,
        requestId,
      );
    }
    return authErrorResponse(error, requestId);
  }
}
