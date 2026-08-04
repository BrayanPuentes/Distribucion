import {
  assertSameOrigin,
  authErrorResponse,
  clearSessionCookie,
  deleteRequestSession,
  ensureAuthDatabase,
  getSessionUser,
  requestIdentifier,
  writeAuthLog,
} from "../../../../lib/server/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = requestIdentifier();
  try {
    assertSameOrigin(request);
    await ensureAuthDatabase();
    const user = await getSessionUser(request);
    await deleteRequestSession(request);
    if (user) {
      await writeAuthLog(
        "INFO",
        "CERRAR_SESION",
        "La sesión fue cerrada.",
        user.displayName,
        requestId,
        { userId: user.id },
      );
    }
    return Response.json(
      { ok: true, requestId },
      { headers: { "set-cookie": clearSessionCookie(request) } },
    );
  } catch (error) {
    return authErrorResponse(error, requestId);
  }
}

