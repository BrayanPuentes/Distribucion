import {
  AuthError,
  assertSameOrigin,
  authErrorResponse,
  createSession,
  database,
  ensureAuthDatabase,
  hashPassword,
  requestIdentifier,
  requireSession,
  sessionCookie,
  verifyPassword,
  writeAuthLog,
} from "../../../../lib/server/auth";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const requestId = requestIdentifier();
  try {
    assertSameOrigin(request);
    await ensureAuthDatabase();
    const user = await requireSession(request);
    const body = (await request.json()) as {
      currentPassword?: string;
      newPassword?: string;
    };
    const row = await database()
      .prepare(
        "SELECT password_hash, password_salt, password_iterations FROM users WHERE id = ? LIMIT 1",
      )
      .bind(user.id)
      .first<{
        password_hash: string;
        password_salt: string;
        password_iterations: number;
      }>();
    if (
      !row ||
      !(await verifyPassword(
        body.currentPassword || "",
        row.password_hash,
        row.password_salt,
        Number(row.password_iterations),
      ))
    ) {
      throw new AuthError(
        400,
        "La contraseña actual no es correcta.",
        "INVALID_CURRENT_PASSWORD",
      );
    }
    if ((body.currentPassword || "") === (body.newPassword || "")) {
      throw new AuthError(
        400,
        "La nueva contraseña debe ser diferente de la actual.",
        "PASSWORD_NOT_CHANGED",
      );
    }
    const password = await hashPassword(body.newPassword || "");
    await database().batch([
      database()
        .prepare(
          "UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(password.hash, password.salt, password.iterations, user.id),
      database()
        .prepare("DELETE FROM user_sessions WHERE user_id = ?")
        .bind(user.id),
    ]);
    const token = await createSession(user.id);
    await writeAuthLog(
      "INFO",
      "CAMBIAR_CONTRASENA",
      "La contraseña fue actualizada y las sesiones anteriores se cerraron.",
      user.displayName,
      requestId,
      { userId: user.id },
    );
    return Response.json(
      { ok: true, requestId },
      { headers: { "set-cookie": sessionCookie(request, token) } },
    );
  } catch (error) {
    return authErrorResponse(error, requestId);
  }
}

