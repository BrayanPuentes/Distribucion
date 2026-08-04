import { type AppState } from "../../../lib/distribution.ts";
import {
  AuthError,
  assertSameOrigin,
  authErrorResponse,
  database,
  requestIdentifier,
  requireLeader,
} from "../../../lib/server/auth.ts";

export const dynamic = "force-dynamic";

type StateRow = { payload: string; revision: number };
type PublicationRow = {
  id: number;
  name: string;
  snapshot: string;
  status: string;
  is_current: number;
};

async function audit(action: string, detail: string, actor: string, context: Record<string, unknown>) {
  const db = database();
  await db.batch([
    db.prepare("INSERT INTO audit_events (action, detail, actor) VALUES (?, ?, ?)").bind(action, detail, actor),
    db.prepare("INSERT INTO system_logs (level, module, action, message, actor, request_id, context) VALUES ('INFO', 'DISTRIBUCION', ?, ?, ?, '', ?)").bind(action, detail, actor, JSON.stringify(context)),
  ]);
}

export async function POST(request: Request) {
  const requestId = requestIdentifier();
  try {
    assertSameOrigin(request);
    const user = await requireLeader(request);
    const body = (await request.json()) as {
      action?: "archive" | "restore" | "delete";
      distributionId?: number;
      reason?: string;
      confirmation?: string;
      revision?: number;
    };
    const reason = String(body.reason || "").trim();
    if (!Number.isInteger(body.distributionId) || !body.action) {
      return Response.json({ error: "Acción o distribución inválida.", requestId }, { status: 400 });
    }
    const db = database();
    const publication = await db.prepare("SELECT id, name, snapshot, status, is_current FROM published_distributions WHERE id = ?").bind(body.distributionId).first<PublicationRow>();
    if (!publication) return Response.json({ error: "La distribución ya no existe.", requestId }, { status: 404 });
    const stateRow = await db.prepare("SELECT payload, revision FROM app_state WHERE id = 1").first<StateRow>();
    if (!stateRow) return Response.json({ error: "No fue posible cargar el estado.", requestId }, { status: 500 });
    if (Number(body.revision) !== stateRow.revision) {
      return Response.json({ error: "La información cambió en otra sesión. Recarga antes de continuar.", code: "REVISION_CONFLICT", requestId }, { status: 409 });
    }

    if (body.action === "archive") {
      if (!reason) return Response.json({ error: "El motivo de archivo es obligatorio.", requestId }, { status: 400 });
      const statements = [
        db.prepare("UPDATE published_distributions SET status = 'archived', is_current = 0, archived_at = CURRENT_TIMESTAMP, archived_by = ?, archive_reason = ? WHERE id = ?").bind(user.displayName, reason, publication.id),
      ];
      if (publication.is_current) {
        const state = JSON.parse(stateRow.payload) as AppState;
        state.groups = [];
        state.activeScheduleId = null;
        state.version = stateRow.revision + 1;
        statements.push(db.prepare("UPDATE app_state SET payload = ?, revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1 AND revision = ?").bind(JSON.stringify(state), state.version, stateRow.revision));
      }
      await db.batch(statements);
      await audit("DISTRIBUTION_ARCHIVED", `${publication.name} · ${reason}`, user.displayName, { distributionId: publication.id });
      return Response.json({ ok: true, revision: stateRow.revision + (publication.is_current ? 1 : 0), requestId });
    }

    if (body.action === "restore") {
      if (publication.status !== "archived") return Response.json({ error: "Solo se puede restaurar una distribución archivada.", requestId }, { status: 400 });
      const snapshot = JSON.parse(publication.snapshot) as Partial<AppState>;
      const state = JSON.parse(stateRow.payload) as AppState;
      state.groups = Array.isArray(snapshot.groups) ? snapshot.groups : [];
      state.version = stateRow.revision + 1;
      await db.batch([
        db.prepare("UPDATE published_distributions SET is_current = 0 WHERE is_current = 1"),
        db.prepare("UPDATE published_distributions SET status = 'active', is_current = 1, archived_at = NULL, archived_by = NULL, archive_reason = NULL WHERE id = ?").bind(publication.id),
        db.prepare("UPDATE app_state SET payload = ?, revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1 AND revision = ?").bind(JSON.stringify(state), state.version, stateRow.revision),
      ]);
      await audit("DISTRIBUTION_RESTORED", publication.name, user.displayName, { distributionId: publication.id });
      return Response.json({ ok: true, revision: state.version, requestId });
    }

    if (!reason) return Response.json({ error: "El motivo de eliminación es obligatorio.", requestId }, { status: 400 });
    if (String(body.confirmation || "").trim().toUpperCase() !== "ELIMINAR") {
      return Response.json({ error: "Escribe ELIMINAR para confirmar.", requestId }, { status: 400 });
    }
    const historyCount = await db.prepare("SELECT COUNT(*) AS total FROM history_events WHERE distribution_id = ?").bind(publication.id).first<{ total: number }>();
    const statements = [
      db.prepare("DELETE FROM history_events WHERE distribution_id = ?").bind(publication.id),
      db.prepare("DELETE FROM published_distributions WHERE id = ?").bind(publication.id),
    ];
    if (publication.is_current) {
      const state = JSON.parse(stateRow.payload) as AppState;
      state.groups = [];
      state.activeScheduleId = null;
      state.version = stateRow.revision + 1;
      statements.push(db.prepare("UPDATE app_state SET payload = ?, revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1 AND revision = ?").bind(JSON.stringify(state), state.version, stateRow.revision));
    }
    await db.batch(statements);
    await audit("DISTRIBUTION_DELETED", `${publication.name} · ${reason}`, user.displayName, { distributionId: publication.id, historyRowsRemoved: Number(historyCount?.total || 0) });
    return Response.json({ ok: true, revision: stateRow.revision + (publication.is_current ? 1 : 0), requestId });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error, requestId);
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible completar la operación.", requestId }, { status: 500 });
  }
}
