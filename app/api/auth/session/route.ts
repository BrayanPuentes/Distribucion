import {
  authErrorResponse,
  ensureAuthDatabase,
  getSessionUser,
  requestIdentifier,
  userCount,
} from "../../../../lib/server/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = requestIdentifier();
  try {
    await ensureAuthDatabase();
    const totalUsers = await userCount();
    if (totalUsers === 0) {
      return Response.json({
        authenticated: false,
        needsSetup: true,
        user: null,
        requestId,
      });
    }
    const user = await getSessionUser(request);
    return Response.json({
      authenticated: Boolean(user),
      needsSetup: false,
      user,
      requestId,
    });
  } catch (error) {
    return authErrorResponse(error, requestId);
  }
}

