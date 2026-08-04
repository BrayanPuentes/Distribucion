import {
  assertSameOrigin,
  authErrorResponse,
  createSession,
  database,
  ensureAuthDatabase,
  hashPassword,
  requestIdentifier,
  sessionCookie,
  validateDisplayName,
  validateUsername,
  writeAuthLog,
} from "../../../../lib/server/auth.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = requestIdentifier();
  try {
    assertSameOrigin(request);
    await ensureAuthDatabase();
    const body = (await request.json()) as {
      displayName?: string;
      username?: string;
      password?: string;
    };
    const displayName = validateDisplayName(body.displayName || "");
    const usernameNormalized = validateUsername(body.username || "");
    const password = await hashPassword(body.password || "");
    const result = await database()
      .prepare(
        "INSERT INTO users (username, username_normalized, display_name, role, analyst_id, password_hash, password_salt, password_iterations, active, last_login_at) SELECT ?, ?, ?, 'leader', NULL, ?, ?, ?, 1, CURRENT_TIMESTAMP WHERE NOT EXISTS (SELECT 1 FROM users)",
      )
      .bind(
        body.username?.trim() || usernameNormalized,
        usernameNormalized,
        displayName,
        password.hash,
        password.salt,
        password.iterations,
      )
      .run();
    if (!result.meta.changes) {
      return Response.json(
        {
          error:
            "La configuración inicial ya fue completada. Inicia sesión con una cuenta registrada.",
          code: "SETUP_ALREADY_COMPLETED",
          requestId,
        },
        { status: 409 },
      );
    }
    const row = await database()
      .prepare(
        "SELECT id, username, display_name, role, analyst_id, active FROM users WHERE username_normalized = ? LIMIT 1",
      )
      .bind(usernameNormalized)
      .first<{
        id: number;
        username: string;
        display_name: string;
        role: string;
        analyst_id: number | null;
        active: number;
      }>();
    if (!row) throw new Error("No fue posible recuperar la cuenta creada.");
    const token = await createSession(Number(row.id));
    const user = {
      id: Number(row.id),
      username: row.username,
      displayName: row.display_name,
      role: "leader" as const,
      analystId: null,
      active: true,
    };
    await writeAuthLog(
      "INFO",
      "CONFIGURACION_INICIAL",
      "Se creó la primera cuenta de líder.",
      displayName,
      requestId,
      { userId: user.id },
    );
    return Response.json(
      { ok: true, user, requestId },
      { headers: { "set-cookie": sessionCookie(request, token) } },
    );
  } catch (error) {
    await writeAuthLog(
      "ERROR",
      "CONFIGURACION_INICIAL",
      error instanceof Error ? error.message : "Error desconocido.",
      "",
      requestId,
    );
    return authErrorResponse(error, requestId);
  }
}
