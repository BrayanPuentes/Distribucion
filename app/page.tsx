"use client";

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bug,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardPlus,
  Clock3,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  FileText,
  GripVertical,
  History,
  Home,
  Info,
  KeyRound,
  ListChecks,
  LockKeyhole,
  LogOut,
  Menu,
  Moon,
  MoveRight,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Trash2,
  UserPlus,
  UserRound,
  UserCog,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  type Analyst,
  type AnalystStatus,
  type AppState,
  type HydratedGroup,
  type ScheduledDistribution,
  type Task,
  type TaskFamily,
  type CriticalFront,
  activeTasksForAnalystCount,
  assignmentNote,
  buildScheduleLocalRange,
  cloneHydratedGroups,
  generateDraftGroups,
  groupWeight,
  hydrateGroups,
  initialsFor,
  isExclusiveTask,
  nextId,
  reconcileAfterAnalystRemoval,
  schedulesOverlap,
  serializeGroups,
} from "../lib/distribution";

type Page =
  | "Inicio"
  | "Distribuciones"
  | "Programación"
  | "Histórico"
  | "Tareas"
  | "Equipo"
  | "Logs";

type AuthSession = {
  id: number;
  username: string;
  displayName: string;
  role: "leader" | "analyst";
  analystId: number | null;
  active: boolean;
};

type PublishedDistribution = {
  id: number;
  name: string;
  effective_at: string;
  shift: string;
  status: "active" | "archived";
  is_current: number;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
  created_by: string;
  created_at: string;
};

type UserRecord = AuthSession & {
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  schedule: string | null;
  status: AnalystStatus | null;
  operationalActive: boolean | null;
};

type HistoryRecord = {
  id: number;
  effective_at: string;
  valid_until: string | null;
  shift: string;
  task: string;
  task_description: string;
  assignment_note: string;
  analyst: string;
  group_name: string;
  event: string;
  version: number;
  created_by: string;
};

type LogRecord = {
  id: number;
  level: "INFO" | "WARN" | "ERROR";
  module: string;
  action: string;
  message: string;
  actor: string;
  request_id: string;
  context: string;
  created_at: string;
};

type Notice = {
  type: "success" | "warning" | "error" | "info";
  message: string;
  requestId?: string;
};

type SaveOptions = {
  action: string;
  detail: string;
  module: string;
  publish?: boolean;
  effectiveAt?: string;
  shift?: string;
  level?: "INFO" | "WARN" | "ERROR";
};

type ScheduleFormValue = {
  id?: number;
  name: string;
  startsAt: string;
  endsAt: string;
  shift: string;
  note: string;
};

type TaskFormValue = {
  id?: number;
  name: string;
  category: string;
  weight: number;
  description: string;
  defaultAssignmentNote: string;
  minAnalysts: number;
  family: string;
  criticalLane: "" | "news" | "searches" | "in-progress";
  exclusive: boolean;
  qa: boolean;
};

type UserFormValue = {
  id?: number;
  username: string;
  displayName: string;
  role: "leader" | "analyst";
  analystId: number | null;
  password: string;
  confirmPassword: string;
  active: boolean;
  schedule: string;
  status: AnalystStatus;
};

const SHIFT_PRESETS = [
  { label: "Turno 6–2", startTime: "06:00", endTime: "14:00" },
  { label: "Turno 2–10", startTime: "14:00", endTime: "22:00" },
  { label: "Turno 10–6", startTime: "22:00", endTime: "06:00" },
] as const;

const pageMeta: Record<Page, { title: string; description: string }> = {
  Inicio: { title: "Resumen del turno", description: "Estado operativo y próximos cambios" },
  Distribuciones: { title: "Distribución vigente", description: "Consulta y ajusta la asignación operativa actual" },
  Programación: { title: "Programación", description: "Prepara distribuciones futuras y controla su activación" },
  Histórico: { title: "Histórico", description: "Trazabilidad por tarea, grupo, analista y franja" },
  Tareas: { title: "Administración de tareas", description: "Catálogo, pesos y reglas de exclusividad" },
  Equipo: { title: "Equipo y accesos", description: "Personas, usuarios, contraseñas y disponibilidad operativa" },
  Logs: { title: "Logs del sistema", description: "Monitorea acciones, advertencias y errores técnicos" },
};

function dateTimeLocalValue(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function scheduleDefaults(): ScheduleFormValue {
  const start = new Date();
  start.setHours(14, 0, 0, 0);
  const end = new Date(start);
  end.setHours(22, 0, 0, 0);
  return {
    name: "Distribución programada · Turno 2–10",
    startsAt: dateTimeLocalValue(start),
    endsAt: dateTimeLocalValue(end),
    shift: "Turno 2–10",
    note: "",
  };
}

function scheduleDateValue(form: ScheduleFormValue) {
  return form.startsAt.slice(0, 10);
}

function scheduleStartTimeValue(form: ScheduleFormValue) {
  return form.startsAt.slice(11, 16);
}

function scheduleEndTimeValue(form: ScheduleFormValue) {
  return form.endsAt.slice(11, 16);
}

function updateScheduleTiming(
  form: ScheduleFormValue,
  values: { date?: string; startTime?: string; endTime?: string; shift?: string },
) {
  const date = values.date ?? scheduleDateValue(form);
  const startTime = values.startTime ?? scheduleStartTimeValue(form);
  const endTime = values.endTime ?? scheduleEndTimeValue(form);
  const range = buildScheduleLocalRange(date, startTime, endTime);
  return {
    ...form,
    ...range,
    shift: values.shift ?? form.shift,
  };
}

function applyShiftPreset(form: ScheduleFormValue, shift: string) {
  const preset = SHIFT_PRESETS.find((item) => item.label === shift);
  if (!preset) return { ...form, shift };
  return updateScheduleTiming(form, {
    startTime: preset.startTime,
    endTime: preset.endTime,
    shift: preset.label,
  });
}

function resolveScheduleTiming(
  form: ScheduleFormValue,
  scheduled: ScheduledDistribution[],
) {
  const startTimestamp = Date.parse(form.startsAt);
  const endTimestamp = Date.parse(form.endsAt);
  if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) {
    return { error: "Selecciona una fecha y horas válidas para el inicio y el final." };
  }
  const startsAt = new Date(startTimestamp).toISOString();
  const endsAt = new Date(endTimestamp).toISOString();
  if (endTimestamp <= startTimestamp) {
    return { error: "La hora final debe ser posterior a la hora inicial." };
  }
  if (schedulesOverlap(scheduled, startsAt, endsAt, form.id)) {
    return { error: "La franja se superpone con otra distribución programada." };
  }
  return { startsAt, endsAt };
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
}

function findAnalyst(analysts: Analyst[], id: number) {
  return analysts.find((analyst) => analyst.id === id);
}

function suggestUsername(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

function validateDraft(groups: HydratedGroup[], qaEnabled: boolean) {
  if (!groups.length) return "La distribución no contiene grupos.";
  if (groups.some((group) => group.tasks.length === 0)) {
    return "Todos los analistas seleccionados deben tener al menos una tarea.";
  }
  const analystIds = groups.map((group) => group.analystId);
  if (new Set(analystIds).size !== analystIds.length) {
    return "Un analista no puede ser responsable de dos grupos.";
  }
  const taskIds = groups.flatMap((group) => group.tasks.map((task) => task.id));
  if (new Set(taskIds).size !== taskIds.length) {
    return "Una tarea no puede estar asignada a dos grupos.";
  }
  for (const group of groups) {
    const exclusive = group.tasks.find(isExclusiveTask);
    if (exclusive && group.tasks.length > 1) {
      return `${exclusive.name} debe permanecer separada en un grupo exclusivo.`;
    }
    const criticalLanes = group.tasks
      .map((task) => task.criticalLane)
      .filter(Boolean);
    if (new Set(criticalLanes).size > 1) {
      return "News, Búsquedas e In Progress deben permanecer con responsables distintos.";
    }
  }
  if (qaEnabled && !groups.some((group) => group.tasks.some((task) => task.qa))) {
    return "QA está habilitada, pero no fue incluida en la distribución.";
  }
  return null;
}

export default function HomePage() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [authConnectionError, setAuthConnectionError] = useState<string | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [activePage, setActivePage] = useState<Page>("Inicio");
  const [menuOpen, setMenuOpen] = useState(false);
  const [appState, setAppState] = useState<AppState | null>(null);
  const [revision, setRevision] = useState(0);
  const [updatedAt, setUpdatedAt] = useState("");
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);
  const [publishedDistributions, setPublishedDistributions] = useState<PublishedDistribution[]>([]);
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [unlinkedAnalysts, setUnlinkedAnalysts] = useState<Analyst[]>([]);
  const [eligibleAnalystIds, setEligibleAnalystIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [editing, setEditing] = useState<"redistribute" | "new" | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [scheduleIntent, setScheduleIntent] = useState(false);
  const [plannedSchedule, setPlannedSchedule] = useState<ScheduleFormValue | null>(null);
  const [selectedAnalysts, setSelectedAnalysts] = useState<number[]>([]);
  const [qaEnabled, setQaEnabled] = useState(false);
  const [draftGroups, setDraftGroups] = useState<HydratedGroup[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [changeReason, setChangeReason] = useState("Redistribución por carga");
  const [draggedTask, setDraggedTask] = useState<{ taskId: number; fromGroupId: number } | null>(null);
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormValue | null>(null);
  const [scheduleGroups, setScheduleGroups] = useState<HydratedGroup[]>([]);
  const [viewSchedule, setViewSchedule] = useState<ScheduledDistribution | null>(null);
  const [taskForm, setTaskForm] = useState<TaskFormValue | null>(null);
  const [userForm, setUserForm] = useState<UserFormValue | null>(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [distributionAction, setDistributionAction] = useState<{ mode: "archive" | "restore" | "delete"; item: PublishedDistribution } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    kind: "schedule" | "task" | "user";
    id: number;
    name: string;
    title: string;
    message: string;
    confirmLabel: string;
  } | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const savedTheme = window.localStorage.getItem("distribution-theme");
      if (savedTheme === "dark") setTheme("dark");
      setPreferencesReady(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("distribution-theme", theme);
  }, [preferencesReady, theme]);

  const refreshSession = useCallback(async () => {
    try {
      setAuthConnectionError(null);
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          `${data.error || "No fue posible validar el acceso."}${data.requestId ? ` · ID ${data.requestId}` : ""}`,
        );
      }
      setNeedsSetup(Boolean(data.needsSetup));
      setSession(data.authenticated ? (data.user as AuthSession) : null);
    } catch (error) {
      setSession(null);
      setNeedsSetup(false);
      setAuthConnectionError(
        error instanceof Error
          ? error.message
          : "No fue posible conectar con el servicio de acceso.",
      );
    } finally {
      setAuthReady(true);
      setLoading(false);
    }
  }, []);

  const loadData = useCallback(async (showSuccess = false) => {
    try {
      setConnectionError(null);
      const response = await fetch("/api/state", { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) {
        setSession(null);
        setAppState(null);
        setUsers([]);
        setUnlinkedAnalysts([]);
        setEligibleAnalystIds([]);
        throw new Error("Tu sesión terminó. Inicia sesión nuevamente.");
      }
      if (!response.ok) {
        throw new Error(`${data.error || "No fue posible abrir la base de datos."}${data.requestId ? ` · ID ${data.requestId}` : ""}`);
      }
      setAppState(data.state as AppState);
      setRevision(Number(data.revision));
      setUpdatedAt(String(data.updatedAt || ""));
      setHistoryRecords((data.history || []) as HistoryRecord[]);
      setPublishedDistributions((data.publishedDistributions || []) as PublishedDistribution[]);
      setLogs((data.logs || []) as LogRecord[]);
      setEligibleAnalystIds(
        Array.isArray(data.eligibleAnalystIds)
          ? data.eligibleAnalystIds.map(Number)
          : [],
      );
      if (showSuccess) setNotice({ type: "success", message: "Información actualizada desde la base de datos." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error de base de datos.";
      setConnectionError(message);
      setNotice({ type: "error", message });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    const response = await fetch("/api/users", { cache: "no-store" });
    const data = await response.json();
    if (response.status === 401) {
      setSession(null);
      setAppState(null);
      setUsers([]);
      setUnlinkedAnalysts([]);
      setEligibleAnalystIds([]);
      throw new Error("Tu sesión terminó. Inicia sesión nuevamente.");
    }
    if (!response.ok) {
      const error = new Error(data.error || "No fue posible cargar los usuarios.") as Error & {
        requestId?: string;
      };
      error.requestId = data.requestId;
      throw error;
    }
    setUsers((data.users || []) as UserRecord[]);
    setUnlinkedAnalysts((data.unlinkedAnalysts || []) as Analyst[]);
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    const timeout = window.setTimeout(() => void refreshSession(), 0);
    return () => window.clearTimeout(timeout);
  }, [preferencesReady, refreshSession]);

  useEffect(() => {
    if (!session) return;
    const timeout = window.setTimeout(() => {
      setLoading(true);
      void Promise.all([
        loadData(),
        session.role === "leader" ? loadUsers() : Promise.resolve(),
      ]).catch((error) => {
        setNotice({
          type: "error",
          message: error instanceof Error ? error.message : "No fue posible cargar el sistema.",
        });
      });
    }, 0);
    const interval = window.setInterval(() => void loadData(), 60_000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [loadData, loadUsers, session]);

  const recordClientLog = useCallback(
    (level: "INFO" | "WARN" | "ERROR", module: string, action: string, message: string, context: Record<string, unknown> = {}) => {
      if (!session) return;
      void fetch("/api/state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          level,
          module,
          action,
          message,
          context,
        }),
      }).catch(() => undefined);
    },
    [session],
  );

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      recordClientLog(
        "ERROR",
        "INTERFAZ",
        "ERROR_NO_CONTROLADO",
        event.message || "Se produjo un error no controlado en la interfaz.",
        {
          source: event.filename || "",
          line: event.lineno || 0,
          column: event.colno || 0,
        },
      );
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason =
        event.reason instanceof Error
          ? event.reason.message
          : String(event.reason || "Promesa rechazada sin detalle.");
      recordClientLog("ERROR", "INTERFAZ", "PROMESA_NO_CONTROLADA", reason);
    };
    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [recordClientLog]);

  const persistState = useCallback(
    async (nextState: AppState, options: SaveOptions) => {
      if (!session) throw new Error("La sesión no está disponible.");
      if (session.role !== "leader") {
        throw new Error("Solo un líder puede guardar cambios operativos.");
      }
      setBusy(true);
      try {
        const response = await fetch("/api/state", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            state: nextState,
            revision,
            action: options.action,
            detail: options.detail,
            module: options.module,
            publish: options.publish,
            effectiveAt: options.effectiveAt || new Date().toISOString(),
            shift: options.shift || "Turno 2–10",
            level: options.level || "INFO",
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          const error = new Error(data.error || "No fue posible guardar.") as Error & { requestId?: string };
          error.requestId = data.requestId;
          throw error;
        }
        await loadData();
        return data as { revision: number; requestId: string };
      } finally {
        setBusy(false);
      }
    },
    [loadData, revision, session],
  );

  const reportError = useCallback((error: unknown, fallback: string) => {
    const value = error as Error & { requestId?: string };
    setNotice({
      type: "error",
      message: value?.message || fallback,
      requestId: value?.requestId,
    });
  }, []);

  if (!preferencesReady || !authReady) {
    return (
      <main className="loading-page">
        <div className="loading-card"><LockKeyhole size={25} /><strong>Validando acceso</strong><span>Comprobando tu sesión segura…</span></div>
      </main>
    );
  }

  const logout = async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setSession(null);
      setAppState(null);
      setUsers([]);
      setUnlinkedAnalysts([]);
      setEligibleAnalystIds([]);
      setHistoryRecords([]);
      setLogs([]);
      setNotice(null);
      setActivePage("Inicio");
      setBusy(false);
    }
  };

  if (!session) {
    return (
      <LoginScreen
        theme={theme}
        setTheme={setTheme}
        needsSetup={needsSetup}
        connectionError={authConnectionError}
        onAuthenticated={(user) => {
          setSession(user);
          setNeedsSetup(false);
          setAuthConnectionError(null);
          setNotice(null);
          setLoading(true);
        }}
        retryConnection={() => void refreshSession()}
      />
    );
  }

  if (loading && !appState) {
    return (
      <main className="loading-page">
        <div className="loading-card"><Database size={25} /><strong>Abriendo la base de datos</strong><span>Validando información operativa…</span></div>
      </main>
    );
  }

  if (!appState) {
    return (
      <main className="loading-page">
        <div className="loading-card error-card">
          <AlertCircle size={25} />
          <strong>No fue posible iniciar el sistema</strong>
          <span>{connectionError}</span>
          <button className="button-primary" onClick={() => void loadData()}><RefreshCw size={17} /> Reintentar</button>
        </div>
      </main>
    );
  }

  const analysts = appState.analysts;
  const tasks = appState.tasks;
  const groups = hydrateGroups(appState.groups, tasks);
  const scheduled = appState.scheduled;
  const eligibleSet = new Set(eligibleAnalystIds);
  const activeAnalysts = analysts.filter(
    (analyst) =>
      analyst.active &&
      analyst.status !== "Ausente" &&
      eligibleSet.has(analyst.id),
  );
  const assignedTaskIds = new Set(groups.flatMap((group) => group.tasks.map((task) => task.id)));
  const currentQaEnabled = groups.some((group) =>
    group.tasks.some((task) => task.qa),
  );
  const requiredTasks = groups.length
    ? activeTasksForAnalystCount(
        tasks,
        groups.length,
        currentQaEnabled,
      )
    : [];
  const coveredRequired = requiredTasks.filter((task) => assignedTaskIds.has(task.id)).length;
  const coverage = requiredTasks.length
    ? Math.round((coveredRequired / requiredTasks.length) * 100)
    : 0;
  const weights = groups.map(groupWeight);
  const maxWeight = weights.length ? Math.max(...weights) : 0;
  const minWeight = weights.length ? Math.min(...weights) : 0;

  const myGroups =
    session.role === "analyst" && session.analystId
      ? groups.filter((group) => group.analystId === session.analystId)
      : groups;

  const startEditing = (mode: "redistribute" | "new", future = false) => {
    const hasQa = groups.some((group) =>
      group.tasks.some((task) => task.qa),
    );
    setScheduleIntent(future);
    setPlannedSchedule(future ? scheduleDefaults() : null);
    setPreviewOpen(false);
    setChangeReason(mode === "new" ? (future ? "Distribución futura" : "Nueva distribución") : "Redistribución por carga");
    setQaEnabled(hasQa);
    if (mode === "new") {
      const currentOwners = groups
        .map((group) => group.analystId)
        .filter((id) => activeAnalysts.some((analyst) => analyst.id === id));
      setSelectedAnalysts(
        currentOwners.length
          ? currentOwners
          : activeAnalysts.map((analyst) => analyst.id),
      );
      setSetupOpen(true);
      return;
    }
    setDraftGroups(cloneHydratedGroups(groups));
    setEditing(mode);
  };

  const generateDraft = () => {
    if (scheduleIntent) {
      if (!plannedSchedule) {
        const message = "Selecciona la fecha y el horario de la programación.";
        setNotice({ type: "warning", message });
        recordClientLog("WARN", "PROGRAMACION", "VALIDAR_HORARIO", message);
        return;
      }
      const timing = resolveScheduleTiming(plannedSchedule, scheduled);
      if (timing.error) {
        setNotice({ type: "warning", message: timing.error });
        recordClientLog("WARN", "PROGRAMACION", "VALIDAR_HORARIO", timing.error, {
          startsAt: plannedSchedule.startsAt,
          endsAt: plannedSchedule.endsAt,
        });
        return;
      }
    }
    const result = generateDraftGroups(
      selectedAnalysts,
      tasks,
      qaEnabled,
      analysts,
    );
    if (result.error) {
      setNotice({ type: "warning", message: result.error });
      recordClientLog("WARN", "GENERADOR", "GENERAR_BORRADOR", result.error, {
        selectedAnalysts,
        qaEnabled,
      });
      return;
    }
    setDraftGroups(hydrateGroups(result.groups, tasks));
    setSetupOpen(false);
    setEditing("new");
    recordClientLog("INFO", "GENERADOR", "GENERAR_BORRADOR", "Borrador generado correctamente.", {
      analysts: selectedAnalysts.length,
      qaEnabled,
    });
  };

  const moveTask = (taskId: number, fromGroupId: number, toGroupId: number) => {
    if (fromGroupId === toGroupId) return;
    setDraftGroups((current) => {
      const source = current.find((group) => group.id === fromGroupId);
      const target = current.find((group) => group.id === toGroupId);
      const task = source?.tasks.find((item) => item.id === taskId);
      if (!source || !target || !task) return current;
      if (isExclusiveTask(task) && target.tasks.length > 0) {
        const message = `${task.name} debe permanecer en un grupo separado.`;
        setNotice({ type: "warning", message });
        recordClientLog("WARN", "EDITOR", "MOVER_TAREA", message);
        return current;
      }
      const targetExclusive = target.tasks.find(isExclusiveTask);
      if (targetExclusive) {
        const message = `${targetExclusive.name} es exclusiva y no admite tareas adicionales.`;
        setNotice({ type: "warning", message });
        recordClientLog("WARN", "EDITOR", "MOVER_TAREA", message);
        return current;
      }
      if (
        task.criticalLane &&
        target.tasks.some(
          (assigned) =>
            assigned.criticalLane &&
            assigned.criticalLane !== task.criticalLane,
        )
      ) {
        const message =
          "News, Búsquedas e In Progress deben tener responsables distintos.";
        setNotice({ type: "warning", message });
        recordClientLog("WARN", "EDITOR", "MOVER_TAREA", message);
        return current;
      }
      const note = assignmentNote(source, task);
      return current.map((group) => {
        if (group.id === fromGroupId) {
          const nextNotes = { ...group.taskNotes };
          delete nextNotes[taskId];
          return {
            ...group,
            tasks: group.tasks.filter((item) => item.id !== taskId),
            taskNotes: nextNotes,
          };
        }
        if (group.id === toGroupId) {
          return {
            ...group,
            tasks: [...group.tasks, task],
            taskNotes: { ...group.taskNotes, [taskId]: note },
          };
        }
        return group;
      });
    });
  };

  const reassignGroup = (groupId: number, analystId: number) => {
    setDraftGroups((current) => {
      const selected = current.find((group) => group.id === groupId);
      if (!selected || selected.analystId === analystId) return current;
      const previousOwner = selected.analystId;
      return current.map((group) => {
        if (group.id === groupId) return { ...group, analystId };
        if (group.analystId === analystId) return { ...group, analystId: previousOwner };
        return group;
      });
    });
  };

  const removeGroup = (groupId: number) => {
    setDraftGroups((current) => {
      const result = reconcileAfterAnalystRemoval(
        current,
        groupId,
        tasks,
        qaEnabled,
        analysts,
      );
      if (result.error) {
        const message = result.error;
        setNotice({ type: "warning", message });
        recordClientLog("WARN", "EDITOR", "RETIRAR_ANALISTA", message, { groupId });
        return current;
      }
      const removedNames = result.removedTasks.map((task) => task.name);
      setNotice({
        type: "info",
        message: removedNames.length
          ? `Analista retirado. Dejaron de aplicar: ${removedNames.join(", ")}.`
          : "Analista retirado y tareas restantes reequilibradas.",
      });
      recordClientLog(
        "INFO",
        "EDITOR",
        "RETIRAR_ANALISTA",
        "Se retiró un analista y se recalculó el perfil de tareas.",
        { groupId, removedTasks: removedNames },
      );
      return result.groups;
    });
  };

  const addAnalystGroup = (analystId: number) => {
    setDraftGroups((current) => {
      const qaOwner = current.find((group) =>
        group.tasks.some((task) => task.qa),
      )?.analystId;
      const operationalOwners =
        qaEnabled && qaOwner
          ? current
              .filter((group) => group.analystId !== qaOwner)
              .map((group) => group.analystId)
          : current.map((group) => group.analystId);
      const ids =
        qaEnabled && qaOwner
          ? [...operationalOwners, analystId, qaOwner]
          : [...operationalOwners, analystId];
      const generated = generateDraftGroups(
        ids,
        tasks,
        qaEnabled,
        analysts,
      );
      if (generated.error) {
        setNotice({ type: "warning", message: generated.error });
        return current;
      }
      const existingNotes = new Map(
        current.flatMap((group) =>
          group.tasks.map(
            (task) =>
              [task.id, assignmentNote(group, task)] as const,
          ),
        ),
      );
      return hydrateGroups(generated.groups, tasks).map((group) => ({
        ...group,
        taskNotes: Object.fromEntries(
          group.tasks.map((task) => [
            task.id,
            existingNotes.get(task.id) ??
              task.defaultAssignmentNote,
          ]),
        ),
      }));
    });
  };

  const updateTaskNote = (
    groupId: number,
    taskId: number,
    note: string,
  ) => {
    setDraftGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? {
              ...group,
              taskNotes: {
                ...group.taskNotes,
                [taskId]: note,
              },
            }
          : group,
      ),
    );
  };

  const removeTaskFromDraft = (groupId: number, taskId: number) => {
    setDraftGroups((current) =>
      current.map((group) => {
        if (group.id !== groupId) return group;
        const nextNotes = { ...group.taskNotes };
        delete nextNotes[taskId];
        return {
          ...group,
          tasks: group.tasks.filter((task) => task.id !== taskId),
          taskNotes: nextNotes,
        };
      }),
    );
    recordClientLog(
      "INFO",
      "EDITOR",
      "QUITAR_TAREA_BORRADOR",
      "Se quitó una tarea del borrador.",
      { groupId, taskId },
    );
  };

  const openPreview = () => {
    const validationError = validateDraft(draftGroups, qaEnabled);
    if (validationError) {
      setNotice({ type: "warning", message: validationError });
      recordClientLog("WARN", "EDITOR", "PREVISUALIZAR", validationError);
      return;
    }
    if (scheduleIntent && plannedSchedule) {
      const timing = resolveScheduleTiming(plannedSchedule, scheduled);
      if (timing.error) {
        setNotice({ type: "warning", message: timing.error });
        recordClientLog("WARN", "PROGRAMACION", "VALIDAR_HORARIO", timing.error);
        return;
      }
    }
    setPreviewOpen(true);
  };

  const publishDraft = async () => {
    const validationError = validateDraft(draftGroups, qaEnabled);
    if (validationError) {
      setNotice({ type: "warning", message: validationError });
      return;
    }
    try {
      const nextState: AppState = {
        ...appState,
        groups: serializeGroups(draftGroups),
        activeScheduleId: null,
      };
      await persistState(nextState, {
        action: editing === "new" ? "PUBLICAR_DISTRIBUCION" : "REDISTRIBUIR",
        detail: changeReason,
        module: "DISTRIBUCION",
        publish: true,
      });
      setEditing(null);
      setPreviewOpen(false);
      setNotice({ type: "success", message: "La distribución quedó vigente y el histórico fue actualizado." });
    } catch (error) {
      reportError(error, "No fue posible publicar la distribución.");
    }
  };

  const openScheduleFromPreview = () => {
    setScheduleGroups(cloneHydratedGroups(draftGroups));
    setScheduleForm(scheduleDefaults());
  };

  const saveSchedule = async (
    form: ScheduleFormValue,
    groupsToSchedule: HydratedGroup[] = scheduleGroups,
  ) => {
    if (!form.name.trim()) {
      setNotice({ type: "warning", message: "Escribe un nombre para la programación." });
      return;
    }
    const timing = resolveScheduleTiming(form, scheduled);
    if (timing.error || !timing.startsAt || !timing.endsAt) {
      const message = timing.error || "No fue posible interpretar la fecha seleccionada.";
      setNotice({ type: "warning", message });
      recordClientLog("WARN", "PROGRAMACION", "VALIDAR_HORARIO", message, {
        startsAt: form.startsAt,
        endsAt: form.endsAt,
      });
      return;
    }
    const validationError = validateDraft(
      groupsToSchedule,
      groupsToSchedule.some((group) => group.tasks.some((task) => task.qa)),
    );
    if (validationError) {
      setNotice({ type: "warning", message: validationError });
      return;
    }
    const existing = form.id ? scheduled.find((item) => item.id === form.id) : undefined;
    const saved: ScheduledDistribution = {
      id: form.id || nextId(scheduled),
      name: form.name.trim(),
      startsAt: timing.startsAt,
      endsAt: timing.endsAt,
      shift: form.shift.trim() || "Turno por definir",
      status: "Programada",
      analystCount: groupsToSchedule.length,
      groups: serializeGroups(groupsToSchedule),
      createdAt: existing?.createdAt || new Date().toISOString(),
      createdBy: existing?.createdBy || session.displayName,
      note: form.note.trim(),
    };
    const nextScheduled = existing
      ? scheduled.map((item) => (item.id === saved.id ? saved : item))
      : [...scheduled, saved];
    try {
      await persistState({ ...appState, scheduled: nextScheduled }, {
        action: existing ? "REPROGRAMAR_DISTRIBUCION" : "PROGRAMAR_DISTRIBUCION",
        detail: `${saved.name} · ${formatDateTime(saved.startsAt)}`,
        module: "PROGRAMACION",
      });
      setScheduleForm(null);
      setPlannedSchedule(null);
      setPreviewOpen(false);
      setEditing(null);
      setNotice({
        type: "success",
        message:
          Date.parse(saved.endsAt) <= Date.now()
            ? "La distribución anterior quedó registrada y fue agregada al histórico."
            : existing
              ? "La distribución fue reprogramada."
              : "La distribución quedó programada.",
      });
      setActivePage(Date.parse(saved.endsAt) <= Date.now() ? "Histórico" : "Programación");
    } catch (error) {
      reportError(error, "No fue posible guardar la programación.");
    }
  };

  const scheduleDraftFromPreview = () => {
    if (scheduleIntent && plannedSchedule) {
      void saveSchedule(plannedSchedule, cloneHydratedGroups(draftGroups));
      return;
    }
    openScheduleFromPreview();
  };

  const editSchedule = (schedule: ScheduledDistribution, duplicate = false) => {
    const offset = duplicate ? 24 * 60 * 60 * 1000 : 0;
    setScheduleGroups(hydrateGroups(schedule.groups, tasks));
    setScheduleForm({
      id: duplicate ? undefined : schedule.id,
      name: duplicate ? `${schedule.name} (copia)` : schedule.name,
      startsAt: dateTimeLocalValue(new Date(Date.parse(schedule.startsAt) + offset)),
      endsAt: dateTimeLocalValue(new Date(Date.parse(schedule.endsAt) + offset)),
      shift: schedule.shift,
      note: schedule.note,
    });
  };

  const requestDeleteSchedule = (schedule: ScheduledDistribution) => {
    if (schedule.status === "Activada" || schedule.status === "Expirada") {
      setNotice({ type: "warning", message: "Una distribución que estuvo vigente no se puede eliminar; debe conservarse para auditoría." });
      return;
    }
    setConfirmAction({
      kind: "schedule",
      id: schedule.id,
      name: schedule.name,
      title: "Quitar programación",
      message: `Se eliminará “${schedule.name}”. Esta acción no afecta el histórico porque nunca estuvo vigente.`,
      confirmLabel: "Quitar programación",
    });
  };

  const saveTask = async (form: TaskFormValue) => {
    const duplicate = tasks.some(
      (task) => task.id !== form.id && task.name.trim().toLocaleLowerCase("es") === form.name.trim().toLocaleLowerCase("es"),
    );
    if (!form.name.trim() || !form.category.trim()) {
      setNotice({ type: "warning", message: "Completa el nombre y la categoría de la tarea." });
      return;
    }
    if (
      !Number.isInteger(form.minAnalysts) ||
      form.minAnalysts < 3 ||
      form.minAnalysts > 10
    ) {
      setNotice({
        type: "warning",
        message:
          "El umbral debe estar entre 3 y 10 analistas operativos.",
      });
      return;
    }
    if (duplicate) {
      setNotice({ type: "warning", message: "Ya existe una tarea con ese nombre." });
      return;
    }
    if (form.qa && tasks.some((task) => task.qa && task.id !== form.id)) {
      setNotice({ type: "warning", message: "Ya existe una tarea marcada como QA. Edita esa tarea en lugar de crear otra." });
      return;
    }
    const value: Task = {
      id: form.id || nextId(tasks),
      name: form.name.trim(),
      category: form.category.trim(),
      weight: Math.min(10, Math.max(1, Number(form.weight))),
      active: form.id ? tasks.find((task) => task.id === form.id)?.active !== false : true,
      description: form.description.trim(),
      defaultAssignmentNote: form.defaultAssignmentNote.trim(),
      minAnalysts: form.minAnalysts,
      family: form.family.trim() || undefined,
      criticalLane: form.criticalLane || undefined,
      qa: form.qa,
      exclusive: form.exclusive || form.qa,
    };
    const activeGroup = groups.find((group) => group.tasks.some((task) => task.id === value.id));
    if (isExclusiveTask(value) && activeGroup && activeGroup.tasks.length > 1) {
      setNotice({ type: "warning", message: `No puedes volver exclusiva esta tarea mientras comparte ${activeGroup.name}.` });
      return;
    }
    const nextTasks = form.id
      ? tasks.map((task) => (task.id === value.id ? value : task))
      : [...tasks, value];
    try {
      await persistState({ ...appState, tasks: nextTasks }, {
        action: form.id ? "EDITAR_TAREA" : "AGREGAR_TAREA",
        detail: value.name,
        module: "TAREAS",
      });
      setTaskForm(null);
      setNotice({ type: "success", message: form.id ? "La tarea fue actualizada." : "La tarea fue agregada al catálogo." });
    } catch (error) {
      reportError(error, "No fue posible guardar la tarea.");
    }
  };

  const toggleTask = async (task: Task) => {
    const next = { ...task, active: !task.active };
    try {
      await persistState(
        { ...appState, tasks: tasks.map((item) => (item.id === task.id ? next : item)) },
        {
          action: next.active ? "ACTIVAR_TAREA" : "DESACTIVAR_TAREA",
          detail: task.name,
          module: "TAREAS",
        },
      );
      setNotice({ type: "success", message: `${task.name} quedó ${next.active ? "activa" : "inactiva"}.` });
    } catch (error) {
      reportError(error, "No fue posible actualizar la tarea.");
    }
  };

  const requestDeleteTask = (task: Task) => {
    const inCurrent = appState.groups.some((group) => group.taskIds.includes(task.id));
    const inFuture = scheduled.some(
      (schedule) =>
        ["Programada", "Requiere revisión"].includes(schedule.status) &&
        schedule.groups.some((group) => group.taskIds.includes(task.id)),
    );
    if (inCurrent || inFuture) {
      setNotice({
        type: "warning",
        message: "No se puede eliminar una tarea asignada. Retírala primero de la distribución vigente y de las programaciones futuras.",
      });
      return;
    }
    setConfirmAction({
      kind: "task",
      id: task.id,
      name: task.name,
      title: "Eliminar tarea",
      message: `Se eliminará “${task.name}” del catálogo. El histórico conservará su nombre.`,
      confirmLabel: "Eliminar tarea",
    });
  };

  const saveCatalogItem = async (kind: "family" | "front", existing?: TaskFamily | CriticalFront) => {
    const name = window.prompt(`Nombre del ${kind === "family" ? "grupo relacionado" : "frente crítico"}:`, existing?.name || "")?.trim();
    if (!name) return;
    const suggestedId = name.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const id = existing?.id || window.prompt("Identificador interno (sin espacios):", suggestedId)?.trim();
    if (!id) return;
    const description = window.prompt("Descripción:", existing?.description || "")?.trim() || "";
    if (kind === "family") {
      const next: TaskFamily = { id, name, description, active: existing?.active !== false };
      const values = existing ? appState.taskFamilies.map((item) => item.id === existing.id ? next : item) : [...appState.taskFamilies, next];
      await persistState({ ...appState, taskFamilies: values }, { action: existing ? "EDITAR_GRUPO_TAREAS" : "AGREGAR_GRUPO_TAREAS", detail: name, module: "CONFIGURACION" });
    } else {
      const current = existing as CriticalFront | undefined;
      const next: CriticalFront = { id, name, description, active: current?.active !== false, order: current?.order || appState.criticalFronts.length + 1 };
      const values = current ? appState.criticalFronts.map((item) => item.id === current.id ? next : item) : [...appState.criticalFronts, next];
      await persistState({ ...appState, criticalFronts: values }, { action: current ? "EDITAR_FRENTE_CRITICO" : "AGREGAR_FRENTE_CRITICO", detail: name, module: "CONFIGURACION" });
    }
  };

  const toggleCatalogItem = async (kind: "family" | "front", id: string) => {
    const front = appState.criticalFronts.find((item) => item.id === id);
    const deactivatingFront = kind === "front" && front?.active;
    const nextState = kind === "family"
      ? { ...appState, taskFamilies: appState.taskFamilies.map((item) => item.id === id ? { ...item, active: !item.active } : item) }
      : {
          ...appState,
          criticalFronts: appState.criticalFronts.map((item) => item.id === id ? { ...item, active: !item.active } : item),
          tasks: deactivatingFront ? appState.tasks.map((task) => task.criticalLane === id ? { ...task, criticalLane: undefined } : task) : appState.tasks,
        };
    await persistState(nextState, { action: "CAMBIAR_PARAMETRO_OPERATIVO", detail: id, module: "CONFIGURACION" });
  };

  const removeCatalogItem = async (kind: "family" | "front", id: string) => {
    const inUse = tasks.some((task) => kind === "family" ? task.family === id : task.criticalLane === id);
    if (inUse) { setNotice({ type: "warning", message: "Este parámetro está asociado a tareas. Reasigna esas tareas antes de eliminarlo." }); return; }
    if (!window.confirm("¿Eliminar este parámetro?")) return;
    const nextState = kind === "family"
      ? { ...appState, taskFamilies: appState.taskFamilies.filter((item) => item.id !== id) }
      : { ...appState, criticalFronts: appState.criticalFronts.filter((item) => item.id !== id) };
    await persistState(nextState, { action: "ELIMINAR_PARAMETRO_OPERATIVO", detail: id, module: "CONFIGURACION" });
  };

  const runDistributionAction = async (mode: "archive" | "restore" | "delete", item: PublishedDistribution, reason: string, confirmation: string) => {
    setBusy(true);
    try {
      const response = await fetch("/api/distributions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: mode, distributionId: item.id, reason, confirmation, revision }) });
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error(data.error || "No fue posible completar la acción."), { requestId: data.requestId });
      setDistributionAction(null);
      await loadData();
      setNotice({ type: "success", message: mode === "archive" ? "La distribución fue archivada." : mode === "restore" ? "La distribución fue restaurada y quedó vigente." : "La distribución fue eliminada permanentemente." });
    } catch (error) { reportError(error, "No fue posible completar la acción."); }
    finally { setBusy(false); }
  };

  const saveUser = async (form: UserFormValue) => {
    if (!form.username.trim() || !form.displayName.trim()) {
      setNotice({ type: "warning", message: "Completa el nombre y el usuario de acceso." });
      return;
    }
    if (form.role === "analyst" && !form.schedule.trim()) {
      setNotice({
        type: "warning",
        message: "Completa el horario operativo del analista.",
      });
      return;
    }
    if (!form.id && !form.password) {
      setNotice({ type: "warning", message: "Escribe una contraseña inicial." });
      return;
    }
    if (form.password && form.password !== form.confirmPassword) {
      setNotice({ type: "warning", message: "Las contraseñas no coinciden." });
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/users", {
        method: form.id ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          username: form.username,
          displayName: form.displayName,
          role: form.role,
          analystId: form.role === "analyst" ? form.analystId : null,
          password: form.password || undefined,
          active: form.active,
          schedule:
            form.role === "analyst" ? form.schedule : undefined,
          status:
            form.role === "analyst" ? form.status : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.error || "No fue posible guardar la cuenta.") as Error & { requestId?: string };
        error.requestId = data.requestId;
        throw error;
      }
      await Promise.all([loadUsers(), loadData()]);
      if (form.id === session.id) await refreshSession();
      setUserForm(null);
      setNotice({
        type: "success",
        message: form.id ? "La cuenta fue actualizada." : "La cuenta quedó registrada y ya puede iniciar sesión.",
      });
    } catch (error) {
      reportError(error, "No fue posible guardar la cuenta.");
    } finally {
      setBusy(false);
    }
  };

  const toggleUser = async (user: UserRecord) => {
    setBusy(true);
    try {
      const response = await fetch("/api/users", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          analystId: user.analystId,
          active: !user.active,
          schedule: user.schedule,
          status: user.status,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.error || "No fue posible cambiar el estado de la cuenta.") as Error & { requestId?: string };
        error.requestId = data.requestId;
        throw error;
      }
      await Promise.all([loadUsers(), loadData()]);
      setNotice({
        type: "success",
        message: `${user.displayName} quedó ${user.active ? "sin acceso" : "con acceso activo"}.`,
      });
    } catch (error) {
      reportError(error, "No fue posible actualizar la cuenta.");
    } finally {
      setBusy(false);
    }
  };

  const requestDeleteUser = (user: UserRecord) => {
    setConfirmAction({
      kind: "user",
      id: user.id,
      name: user.displayName,
      title: "Eliminar cuenta",
      message:
        user.role === "analyst"
          ? `Se eliminarán juntos el acceso y el perfil operativo de “${user.displayName}”. El histórico se conserva.`
          : `Se eliminará la cuenta “${user.username}”.`,
      confirmLabel: "Eliminar persona",
    });
  };

  const saveOwnPassword = async (currentPassword: string, newPassword: string, confirmPassword: string) => {
    if (newPassword !== confirmPassword) {
      setNotice({ type: "warning", message: "Las contraseñas nuevas no coinciden." });
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.error || "No fue posible cambiar la contraseña.") as Error & { requestId?: string };
        error.requestId = data.requestId;
        throw error;
      }
      setPasswordModalOpen(false);
      setNotice({ type: "success", message: "Tu contraseña fue actualizada y las sesiones anteriores se cerraron." });
    } catch (error) {
      reportError(error, "No fue posible cambiar la contraseña.");
    } finally {
      setBusy(false);
    }
  };

  const executeConfirmedAction = async () => {
    if (!confirmAction) return;
    if (confirmAction.kind === "schedule") {
      await persistState(
        { ...appState, scheduled: scheduled.filter((item) => item.id !== confirmAction.id) },
        {
          action: "ELIMINAR_PROGRAMACION",
          detail: confirmAction.name,
          module: "PROGRAMACION",
          level: "WARN",
        },
      );
      setNotice({ type: "success", message: "La programación fue eliminada." });
    } else if (confirmAction.kind === "task") {
      await persistState(
        { ...appState, tasks: tasks.filter((item) => item.id !== confirmAction.id) },
        {
          action: "ELIMINAR_TAREA",
          detail: confirmAction.name,
          module: "TAREAS",
          level: "WARN",
        },
      );
      setNotice({ type: "success", message: "La tarea fue eliminada." });
    } else {
      setBusy(true);
      try {
        const response = await fetch(`/api/users?id=${confirmAction.id}`, { method: "DELETE" });
        const data = await response.json();
        if (!response.ok) {
          const error = new Error(data.error || "No fue posible eliminar la cuenta.") as Error & { requestId?: string };
          error.requestId = data.requestId;
          throw error;
        }
        await Promise.all([loadUsers(), loadData()]);
        setNotice({ type: "success", message: "La persona fue eliminada." });
      } finally {
        setBusy(false);
      }
    }
  };

  const navigation: Array<{ label: Page; icon: React.ReactNode }> = [
    { label: "Inicio", icon: <Home size={19} /> },
    { label: "Distribuciones", icon: <ListChecks size={19} /> },
    { label: "Programación", icon: <CalendarDays size={19} /> },
    { label: "Histórico", icon: <History size={19} /> },
    ...(session.role === "leader"
      ? [
          { label: "Tareas" as Page, icon: <ClipboardCheck size={19} /> },
          { label: "Equipo" as Page, icon: <Users size={19} /> },
          { label: "Logs" as Page, icon: <Bug size={19} /> },
        ]
      : []),
  ];

  const nextSchedule = [...scheduled]
    .filter((item) => item.status === "Programada")
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];

  return (
    <div className="app-shell">
      {notice && <Toast notice={notice} close={() => setNotice(null)} />}

      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><BarChart3 size={22} /></div>
          <div><strong>Distribución</strong><span>Operativa</span></div>
        </div>
        <nav aria-label="Navegación principal">
          {navigation.map((item) => (
            <button
              key={item.label}
              className={activePage === item.label ? "nav-active" : ""}
              onClick={() => {
                setActivePage(item.label);
                setMenuOpen(false);
              }}
            >
              {item.icon}<span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="signed-user">
            <div className="avatar avatar-small">{initialsFor(session.displayName)}</div>
            <div><strong>{session.displayName}</strong><span>{session.role === "leader" ? "Líder del turno" : "Analista"}</span></div>
          </div>
          <button className="logout-button" onClick={() => setPasswordModalOpen(true)}><KeyRound size={17} /> Cambiar contraseña</button>
          <button className="logout-button" onClick={() => void logout()}><LogOut size={17} /> Cerrar sesión</button>
        </div>
      </aside>

      {menuOpen && <button className="sidebar-overlay" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />}

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu size={22} /></button>
          <div className="topbar-title"><strong>Distribución Operativa</strong><span>Turno Colombia</span></div>
          <div className="turn-context">
            <span><CalendarDays size={17} /> {new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}</span>
            <span><Users size={17} /> {activeAnalysts.length} activos</span>
            <span className={coverage === 100 ? "coverage" : "coverage coverage-warning"}>
              <ShieldCheck size={17} /> {coverage}% cobertura <i />
            </span>
          </div>
          <button
            className="theme-toggle"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            aria-label={theme === "light" ? "Activar fondo oscuro" : "Activar fondo claro"}
          >
            {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
          </button>
        </header>

        <div className="content">
          <section className="page-heading">
            <div>
              <p className="eyebrow">{session.role === "analyst" ? "MI TURNO" : "CONTROL OPERATIVO"}</p>
              <h1>{session.role === "analyst" && activePage === "Inicio" ? "Mis tareas actuales" : pageMeta[activePage].title}</h1>
              <p>{session.role === "analyst" && activePage === "Inicio" ? "Estas son tus responsabilidades vigentes" : pageMeta[activePage].description}</p>
            </div>
            {session.role === "leader" && ["Inicio", "Distribuciones"].includes(activePage) && (
              <div className="heading-actions">
                <button className="button-secondary" onClick={() => startEditing("redistribute")} disabled={busy}>
                  <MoveRight size={17} /> Redistribuir carga
                </button>
                <button className="button-primary" onClick={() => startEditing("new")} disabled={busy}>
                  <Plus size={17} /> Nueva distribución
                </button>
              </div>
            )}
            {session.role === "leader" && activePage === "Programación" && (
              <div className="heading-actions">
                <button className="button-primary" onClick={() => startEditing("new", true)} disabled={busy}>
                  <CalendarPlus size={17} /> Nueva programación
                </button>
              </div>
            )}
          </section>

          {activePage === "Inicio" && (
            <Dashboard
              groups={myGroups}
              analysts={analysts}
              isAnalyst={session.role === "analyst"}
              maxWeight={maxWeight}
              minWeight={minWeight}
              coverage={coverage}
              totalTasks={assignedTaskIds.size}
              activeAnalysts={activeAnalysts.length}
              revision={revision}
              updatedAt={updatedAt}
              nextSchedule={nextSchedule}
              startEditing={startEditing}
            />
          )}
          {activePage === "Distribuciones" && (
            <section className="board-panel">
              <div className="section-title">
                <div><h2>Versión vigente</h2><p>Versión {revision} · actualizada {updatedAt ? formatDateTime(updatedAt) : "ahora"}</p></div>
                <span className={coverage === 100 ? "success-pill" : "warning-pill"}>{coverage}% de cobertura</span>
              </div>
              <DistributionBoard groups={groups} analysts={analysts} compact={false} isAnalyst={false} />
              <PublishedDistributionsPanel items={publishedDistributions} isLeader={session.role === "leader"} action={(mode, item) => setDistributionAction({ mode, item })} />
            </section>
          )}
          {activePage === "Programación" && (
            <SchedulePage
              scheduled={scheduled}
              tasks={tasks}
              analysts={analysts}
              isLeader={session.role === "leader"}
              createSchedule={() => startEditing("new", true)}
              view={setViewSchedule}
              edit={(item) => editSchedule(item)}
              duplicate={(item) => editSchedule(item, true)}
              remove={requestDeleteSchedule}
            />
          )}
          {activePage === "Histórico" && (
            <HistoryPage
              records={historyRecords}
              currentAnalystName={
                session.role === "analyst" && session.analystId
                  ? findAnalyst(analysts, session.analystId)?.name
                  : undefined
              }
            />
          )}
          {activePage === "Tareas" && session.role === "leader" && (
            <TasksPage
              tasks={tasks}
              families={appState.taskFamilies}
              fronts={appState.criticalFronts}
              assignedTaskIds={assignedTaskIds}
              openCreate={() => setTaskForm({
                name: "",
                category: "General",
                weight: 1,
                description: "",
                defaultAssignmentNote: "",
                minAnalysts: 3,
                family: "",
                criticalLane: "",
                exclusive: false,
                qa: false,
              })}
              openEdit={(task) => setTaskForm({
                id: task.id,
                name: task.name,
                category: task.category,
                weight: task.weight,
                description: task.description,
                defaultAssignmentNote: task.defaultAssignmentNote,
                minAnalysts: task.minAnalysts,
                family: task.family || "",
                criticalLane: task.criticalLane || "",
                exclusive: Boolean(task.exclusive),
                qa: Boolean(task.qa),
              })}
              toggle={toggleTask}
              remove={requestDeleteTask}
              busy={busy}
              saveCatalog={(kind, item) => void saveCatalogItem(kind, item)}
              toggleCatalog={(kind, id) => void toggleCatalogItem(kind, id)}
              removeCatalog={(kind, id) => void removeCatalogItem(kind, id)}
            />
          )}
          {activePage === "Equipo" && session.role === "leader" && (
            <TeamPage
              users={users}
              analysts={analysts}
              unlinkedAnalysts={unlinkedAnalysts}
              groups={groups}
              currentUserId={session.id}
              openCreate={(role) => setUserForm({
                username: "",
                displayName: "",
                role,
                analystId: null,
                password: "",
                confirmPassword: "",
                active: true,
                schedule: "2:00 p. m.–10:00 p. m.",
                status: "Disponible",
              })}
              openEdit={(user) => setUserForm({
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                role: user.role,
                analystId: user.analystId,
                password: "",
                confirmPassword: "",
                active: user.active,
                schedule: user.schedule || "2:00 p. m.–10:00 p. m.",
                status: user.status || "Disponible",
              })}
              completeAccess={(analyst) => setUserForm({
                username: suggestUsername(analyst.name),
                displayName: analyst.name,
                role: "analyst",
                analystId: analyst.id,
                password: "",
                confirmPassword: "",
                active: true,
                schedule: analyst.schedule,
                status: analyst.status,
              })}
              toggle={(user) => void toggleUser(user)}
              remove={requestDeleteUser}
              busy={busy}
            />
          )}
          {activePage === "Logs" && session.role === "leader" && (
            <LogsPage logs={logs} refresh={() => void loadData(true)} />
          )}
        </div>
      </main>

      {editing && (
        <EditorDrawer
          mode={editing}
          groups={draftGroups}
          analysts={activeAnalysts}
          scheduledFor={scheduleIntent ? plannedSchedule : null}
          changeReason={changeReason}
          setChangeReason={setChangeReason}
          moveTask={moveTask}
          reassignGroup={reassignGroup}
          removeGroup={removeGroup}
          addAnalystGroup={addAnalystGroup}
          updateTaskNote={updateTaskNote}
          removeTask={removeTaskFromDraft}
          draggedTask={draggedTask}
          setDraggedTask={setDraggedTask}
          close={() => setEditing(null)}
          preview={openPreview}
        />
      )}

      {previewOpen && (
        <PreviewModal
          groups={draftGroups}
          originalGroups={groups}
          analysts={analysts}
          reason={changeReason}
          scheduleIntent={scheduleIntent}
          scheduledFor={scheduleIntent ? plannedSchedule : null}
          back={() => setPreviewOpen(false)}
          publish={() => void publishDraft()}
          schedule={scheduleDraftFromPreview}
          busy={busy}
        />
      )}

      {setupOpen && (
        <DistributionSetup
          analysts={activeAnalysts}
          tasks={tasks}
          selected={selectedAnalysts}
          setSelected={setSelectedAnalysts}
          qaEnabled={qaEnabled}
          setQaEnabled={setQaEnabled}
          future={scheduleIntent}
          scheduleValue={plannedSchedule}
          setScheduleValue={setPlannedSchedule}
          close={() => {
            setSetupOpen(false);
            setPlannedSchedule(null);
          }}
          generate={generateDraft}
        />
      )}

      {scheduleForm && (
        <ScheduleModal
          value={scheduleForm}
          groups={scheduleGroups}
          analysts={analysts}
          close={() => setScheduleForm(null)}
          save={(value) => void saveSchedule(value)}
          busy={busy}
        />
      )}

      {viewSchedule && (
        <ScheduleDetails
          schedule={viewSchedule}
          groups={hydrateGroups(viewSchedule.groups, tasks)}
          analysts={analysts}
          close={() => setViewSchedule(null)}
        />
      )}

      {taskForm && (
        <TaskModal
          value={taskForm}
          families={appState.taskFamilies}
          fronts={appState.criticalFronts}
          close={() => setTaskForm(null)}
          save={(value) => void saveTask(value)}
          busy={busy}
        />
      )}

      {distributionAction && (
        <DistributionActionModal
          mode={distributionAction.mode}
          item={distributionAction.item}
          busy={busy}
          close={() => setDistributionAction(null)}
          confirm={(reason, confirmation) => void runDistributionAction(distributionAction.mode, distributionAction.item, reason, confirmation)}
        />
      )}

      {userForm && (
        <UserModal
          value={userForm}
          currentUserId={session.id}
          close={() => setUserForm(null)}
          save={(value) => void saveUser(value)}
          busy={busy}
        />
      )}

      {passwordModalOpen && (
        <PasswordModal
          close={() => setPasswordModalOpen(false)}
          save={(currentPassword, newPassword, confirmPassword) =>
            void saveOwnPassword(currentPassword, newPassword, confirmPassword)
          }
          busy={busy}
        />
      )}

      {confirmAction && (
        <ConfirmModal
          title={confirmAction.title}
          message={confirmAction.message}
          confirmLabel={confirmAction.confirmLabel}
          close={() => setConfirmAction(null)}
          confirm={async () => {
            try {
              await executeConfirmedAction();
              setConfirmAction(null);
            } catch (error) {
              reportError(error, "No fue posible completar la acción.");
            }
          }}
          busy={busy}
        />
      )}

      {busy && <div className="database-status"><RefreshCw className="spin" size={15} /> Guardando cambios…</div>}
    </div>
  );
}

function Toast({ notice, close }: { notice: Notice; close: () => void }) {
  const icon =
    notice.type === "error" ? <AlertCircle size={18} /> :
      notice.type === "warning" ? <AlertTriangle size={18} /> :
        notice.type === "info" ? <Info size={18} /> :
          <CheckCircle2 size={18} />;
  return (
    <div className={`toast toast-${notice.type}`} role={notice.type === "error" ? "alert" : "status"}>
      {icon}
      <span>{notice.message}{notice.requestId && <small>ID: {notice.requestId}</small>}</span>
      <button onClick={close} aria-label="Cerrar aviso"><X size={16} /></button>
    </div>
  );
}

function LoginScreen({
  theme,
  setTheme,
  needsSetup,
  connectionError,
  onAuthenticated,
  retryConnection,
}: {
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
  needsSetup: boolean;
  connectionError: string | null;
  onAuthenticated: (user: AuthSession) => void;
  retryConnection: () => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (needsSetup && password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(needsSetup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: needsSetup ? displayName : undefined,
          username,
          password,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          `${data.error || "No fue posible iniciar sesión."}${data.requestId ? ` · ID ${data.requestId}` : ""}`,
        );
      }
      onAuthenticated(data.user as AuthSession);
    } catch (value) {
      setError(value instanceof Error ? value.message : "No fue posible iniciar sesión.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <button className="theme-toggle login-theme" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="Cambiar fondo">
        {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
      </button>
      <section className="login-card">
        <div className="login-brand">
          <div className="brand-mark"><BarChart3 size={23} /></div>
          <div><strong>Distribución Operativa</strong><span>Control de tareas por turno</span></div>
        </div>
        <div className="login-copy">
          <p className="eyebrow">{needsSetup ? "CONFIGURACIÓN INICIAL" : "ACCESO SEGURO"}</p>
          <h1>{needsSetup ? "Crea el primer líder" : "Bienvenido"}</h1>
          <p>
            {needsSetup
              ? "Esta cuenta podrá registrar líderes y analistas, además de administrar la operación."
              : "Ingresa con el usuario y la contraseña asignados por un líder."}
          </p>
        </div>
        <div className="database-health">
          <span className={!connectionError ? "health-dot ready" : "health-dot"} />
          <div>
            <strong>{!connectionError ? "Base de datos conectada" : "Base de datos no disponible"}</strong>
            <small>{connectionError || "Usuarios, sesiones y trazabilidad activas"}</small>
          </div>
          {connectionError && <button className="icon-button" onClick={retryConnection} aria-label="Reintentar conexión"><RefreshCw size={16} /></button>}
        </div>
        <form className="login-form" onSubmit={(event) => void submit(event)}>
          {needsSetup && (
            <label>
              Nombre del líder
              <span className="login-input"><UserRound size={17} /><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" placeholder="Nombre y apellido" required autoFocus /></span>
            </label>
          )}
          <label>
            Usuario
            <span className="login-input"><UserCog size={17} /><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="usuario o correo" required autoFocus={!needsSetup} /></span>
          </label>
          <label>
            Contraseña
            <span className="login-input">
              <LockKeyhole size={17} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={needsSetup ? "new-password" : "current-password"}
                placeholder={needsSetup ? "Mínimo 10 caracteres" : "Tu contraseña"}
                minLength={needsSetup ? 10 : undefined}
                required
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>
          {needsSetup && (
            <label>
              Confirmar contraseña
              <span className="login-input"><ShieldCheck size={17} /><input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder="Repite la contraseña" minLength={10} required /></span>
            </label>
          )}
          {error && <div className="login-error" role="alert"><AlertCircle size={16} /><span>{error}</span></div>}
          <button className="login-submit" type="submit" disabled={busy || Boolean(connectionError)}>
            {busy ? <RefreshCw className="spin" size={18} /> : needsSetup ? <UserCheck size={18} /> : <KeyRound size={18} />}
            {busy ? "Validando…" : needsSetup ? "Crear líder e ingresar" : "Iniciar sesión"}
            {!busy && <ArrowRight size={18} />}
          </button>
        </form>
        <p className="login-note"><ShieldCheck size={15} /> La contraseña se almacena cifrada y la sesión usa una cookie segura.</p>
      </section>
    </main>
  );
}

function Dashboard({
  groups,
  analysts,
  isAnalyst,
  maxWeight,
  minWeight,
  coverage,
  totalTasks,
  activeAnalysts,
  revision,
  updatedAt,
  nextSchedule,
  startEditing,
}: {
  groups: HydratedGroup[];
  analysts: Analyst[];
  isAnalyst: boolean;
  maxWeight: number;
  minWeight: number;
  coverage: number;
  totalTasks: number;
  activeAnalysts: number;
  revision: number;
  updatedAt: string;
  nextSchedule?: ScheduledDistribution;
  startEditing: (mode: "redistribute" | "new") => void;
}) {
  const currentAnalyst = groups[0] ? findAnalyst(analysts, groups[0].analystId) : undefined;
  return (
    <>
      {!isAnalyst && (
        <section className="summary-grid">
          <article className="summary-card"><span className="summary-icon blue"><Users /></span><div><strong>{activeAnalysts}</strong><span>analistas activos</span></div></article>
          <article className="summary-card"><span className="summary-icon teal"><ShieldCheck /></span><div><strong>{coverage}%</strong><span>cobertura</span></div></article>
          <article className="summary-card"><span className="summary-icon blue"><ListChecks /></span><div><strong>{totalTasks}</strong><span>tareas cubiertas</span></div></article>
          <article className="scheduled-change">
            <span className="summary-icon outline"><Clock3 /></span>
            <div>
              <strong>{nextSchedule ? formatDateTime(nextSchedule.startsAt) : "Sin cambios pendientes"}</strong>
              <span>{nextSchedule?.name || "No hay distribuciones programadas"}</span>
            </div>
            {nextSchedule && <span className="status-pill">Programado</span>}
          </article>
        </section>
      )}

      {isAnalyst && currentAnalyst && (
        <section className="analyst-banner">
          <div><span className="avatar">{currentAnalyst.initials}</span><div><strong>{currentAnalyst.name}</strong><span>{groups[0]?.name} · distribución vigente</span></div></div>
          <span className="success-pill"><Check size={15} /> Distribución vigente</span>
        </section>
      )}

      <section className="board-panel">
        <div className="section-title">
          <div>
            <h2>{isAnalyst ? "Responsabilidades asignadas" : "Distribución vigente"}</h2>
            <p>Versión {revision} · {updatedAt ? `actualizada ${formatDateTime(updatedAt)}` : "sincronizando"}</p>
          </div>
          {!isAnalyst && <button className="text-button" onClick={() => startEditing("redistribute")}>Editar composición <ArrowRight size={16} /></button>}
        </div>
        <DistributionBoard groups={groups} analysts={analysts} compact isAnalyst={isAnalyst} />
      </section>

      {!isAnalyst && (
        <section className="load-panel">
          <div className="section-title">
            <div><h2>Balance de carga</h2><p>Diferencia actual: {maxWeight - minWeight} puntos</p></div>
            <span className={maxWeight - minWeight > 3 ? "warning-pill" : "success-pill"}>
              {maxWeight - minWeight > 3 ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
              {maxWeight - minWeight > 3 ? "Requiere ajuste" : "Carga equilibrada"}
            </span>
          </div>
          <div className="load-bars">
            {groups.map((group) => (
              <div className="load-row" key={group.id}>
                <span>{group.name}</span>
                <div><i style={{ width: `${maxWeight ? Math.max(12, (groupWeight(group) / maxWeight) * 100) : 0}%` }} /></div>
                <strong>{groupWeight(group)}</strong>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function DistributionBoard({
  groups,
  analysts,
  compact,
  isAnalyst,
}: {
  groups: HydratedGroup[];
  analysts: Analyst[];
  compact: boolean;
  isAnalyst: boolean;
}) {
  if (!groups.length) {
    return <EmptyState icon={<ListChecks size={24} />} title="No hay grupos visibles" detail="Genera o publica una distribución para comenzar." />;
  }
  return (
    <div className={`groups-grid ${compact ? "groups-compact" : ""} ${isAnalyst ? "single-group" : ""}`}>
      {groups.map((group) => {
        const analyst = findAnalyst(analysts, group.analystId);
        const weight = groupWeight(group);
        return (
          <article className="group-card" key={group.id}>
            <div className="group-card-head">
              <div>
                <span className="group-number">{group.name}</span>
                <div className="analyst-name"><span className="avatar">{analyst?.initials || "?"}</span><strong>{analyst?.name || "Analista no disponible"}</strong></div>
              </div>
              <span className={`weight-badge ${weight >= 9 ? "high" : ""}`}>Peso {weight}</span>
            </div>
            <div className="task-list">
              {group.tasks.map((task) => (
                <div className="task-row" key={task.id}>
                  <span className="task-icon"><ClipboardCheck size={16} /></span>
                  <span>
                    {task.name}
                    {isExclusiveTask(task) && <small className="exclusive-mark">Exclusiva</small>}
                    {assignmentNote(group, task) && (
                      <small className="task-assignment-note">
                        {assignmentNote(group, task)}
                      </small>
                    )}
                  </span>
                  <small>{task.weight}</small>
                </div>
              ))}
            </div>
            <footer>
              <span>{group.tasks.length} {group.tasks.length === 1 ? "tarea" : "tareas"}</span>
              {weight >= 9 ? <span className="load-high"><BarChart3 size={14} /> Carga alta</span> : <span>Cobertura completa</span>}
            </footer>
          </article>
        );
      })}
    </div>
  );
}

function SchedulePage({
  scheduled,
  tasks,
  analysts,
  isLeader,
  createSchedule,
  view,
  edit,
  duplicate,
  remove,
}: {
  scheduled: ScheduledDistribution[];
  tasks: Task[];
  analysts: Analyst[];
  isLeader: boolean;
  createSchedule: () => void;
  view: (item: ScheduledDistribution) => void;
  edit: (item: ScheduledDistribution) => void;
  duplicate: (item: ScheduledDistribution) => void;
  remove: (item: ScheduledDistribution) => void;
}) {
  const upcoming = [...scheduled]
    .filter((item) => ["Programada", "Requiere revisión"].includes(item.status))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const recent = [...scheduled]
    .filter((item) => ["Activada", "Expirada", "Cancelada"].includes(item.status))
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))
    .slice(0, 5);
  return (
    <section className="schedule-layout">
      <div className="board-panel">
        <div className="section-title">
          <div><h2>Próximas distribuciones</h2><p>Se validan y activan automáticamente al abrir o actualizar el sistema</p></div>
          <span className="count-pill">{upcoming.length} programadas</span>
        </div>
        {upcoming.length ? (
          <div className="schedule-list schedule-list-actions">
            {upcoming.map((item) => (
              <article key={item.id}>
                <span className="schedule-date"><CalendarDays size={18} />{formatDate(item.startsAt)}</span>
                <div><strong>{item.name}</strong><span>{formatTime(item.startsAt)}–{formatTime(item.endsAt)} · {item.shift}</span></div>
                <div><strong>{item.analystCount} analistas</strong><span>{item.groups.flatMap((group) => group.taskIds).length} tareas</span></div>
                <span className={item.status === "Programada" ? "success-pill" : "warning-pill"}>{item.status}</span>
                <div className="row-actions">
                  <button className="icon-button" onClick={() => view(item)} aria-label={`Ver ${item.name}`} title="Ver"><Eye size={16} /></button>
                  {isLeader && <button className="icon-button" onClick={() => edit(item)} aria-label={`Editar ${item.name}`} title="Reprogramar"><Pencil size={16} /></button>}
                  {isLeader && <button className="icon-button" onClick={() => duplicate(item)} aria-label={`Duplicar ${item.name}`} title="Duplicar"><Copy size={16} /></button>}
                  {isLeader && <button className="icon-button danger" onClick={() => remove(item)} aria-label={`Quitar ${item.name}`} title="Quitar"><Trash2 size={16} /></button>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon={<CalendarPlus size={25} />} title="No hay distribuciones futuras" detail="Crea una propuesta, previsualízala y selecciona Programar." action={isLeader ? createSchedule : undefined} actionLabel="Nueva programación" />
        )}
      </div>

      <aside className="weekend-card">
        <span className="summary-icon teal"><CalendarDays /></span>
        <p className="eyebrow">PLANIFICACIÓN</p>
        <h2>Preparar próximos turnos</h2>
        <p>Genera la distribución, revisa cada grupo y define la fecha de activación. Los borradores no crean histórico.</p>
        {isLeader ? (
          <button className="button-primary" onClick={createSchedule}>Crear programación <ArrowRight size={17} /></button>
        ) : (
          <span className="muted-note">Solo los líderes pueden modificar la programación.</span>
        )}
      </aside>

      {recent.length > 0 && (
        <div className="board-panel recent-schedules">
          <div className="section-title"><div><h2>Programaciones anteriores</h2><p>Se conservan para trazabilidad</p></div></div>
          <div className="compact-schedule-table">
            {recent.map((item) => (
              <button key={item.id} onClick={() => isLeader ? edit(item) : view(item)} title={isLeader ? "Editar distribución anterior" : "Ver distribución"}>
                <span>{formatDate(item.startsAt)} · {formatTime(item.startsAt)}–{formatTime(item.endsAt)}</span><strong>{item.name}</strong><i>{item.status}</i>{isLeader ? <Pencil size={15} /> : <Eye size={15} />}
              </button>
            ))}
          </div>
        </div>
      )}
      <span className="sr-only">{tasks.length} tareas y {analysts.length} analistas disponibles</span>
    </section>
  );
}

function HistoryPage({
  records: source,
  currentAnalystName,
}: {
  records: HistoryRecord[];
  currentAnalystName?: string;
}) {
  const records = source.map((record) => ({
    id: record.id,
    dateValue: record.effective_at.slice(0, 10),
    date: formatDate(record.effective_at),
    time: formatTime(record.effective_at),
    endTime: record.valid_until ? formatTime(record.valid_until) : "Sin hora final",
    shift: record.shift,
    task: record.task,
    description: record.task_description || "",
    particularity: record.assignment_note || "",
    analyst: record.analyst,
    group: record.group_name,
    event: record.event,
    version: record.version,
    createdBy: record.created_by,
  }));
  const [query, setQuery] = useState("");
  const [date, setDate] = useState("");
  const [shift, setShift] = useState("");
  const [analyst, setAnalyst] = useState(currentAnalystName || "");
  const [task, setTask] = useState("");
  const [group, setGroup] = useState("");
  const normalized = query.trim().toLocaleLowerCase("es");
  const filtered = records.filter((record) => {
    const fullText = Object.values(record).join(" ").toLocaleLowerCase("es");
    return (!normalized || fullText.includes(normalized)) &&
      (!date || record.dateValue === date) &&
      (!shift || record.shift === shift) &&
      (!analyst || record.analyst === analyst) &&
      (!task || record.task === task) &&
      (!group || record.group === group);
  });
  const unique = (field: "shift" | "analyst" | "task" | "group") =>
    Array.from(new Set(records.map((record) => record[field]))).sort();
  const clearFilters = () => {
    setQuery(""); setDate(""); setShift(""); setAnalyst(""); setTask(""); setGroup("");
  };
  return (
    <section className="board-panel">
      {currentAnalystName && (
        <div className="history-scope">
          <div>
            <strong>Alcance de la consulta</strong>
            <span>Revisa primero tu trazabilidad o amplía la vista a todo el equipo.</span>
          </div>
          <div className="scope-buttons">
            <button
              className={analyst === currentAnalystName ? "scope-active" : ""}
              onClick={() => setAnalyst(currentAnalystName)}
            >
              <UserRound size={15} /> Mi histórico
            </button>
            <button
              className={!analyst ? "scope-active" : ""}
              onClick={() => setAnalyst("")}
            >
              <Users size={15} /> Histórico grupal
            </button>
          </div>
        </div>
      )}
      <div className="filter-bar">
        <label className="history-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en cualquier campo" /></label>
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="Filtrar por fecha" />
        <select value={shift} onChange={(event) => setShift(event.target.value)}><option value="">Todos los turnos</option>{unique("shift").map((value) => <option key={value}>{value}</option>)}</select>
        <select value={analyst} onChange={(event) => setAnalyst(event.target.value)}><option value="">Todos los analistas</option>{unique("analyst").map((value) => <option key={value}>{value}</option>)}</select>
        <select value={task} onChange={(event) => setTask(event.target.value)}><option value="">Todas las tareas</option>{unique("task").map((value) => <option key={value}>{value}</option>)}</select>
        <select value={group} onChange={(event) => setGroup(event.target.value)}><option value="">Todos los grupos</option>{unique("group").map((value) => <option key={value}>{value}</option>)}</select>
        <button className="filter-clear" onClick={clearFilters}><X size={15} /> Limpiar</button>
      </div>
      <div className="filter-results"><strong>{filtered.length}</strong> registros encontrados</div>
      <div className="history-table-wrap">
        <table className="history-table">
          <thead><tr><th>Fecha y rango de vigencia</th><th>Tarea y alcance</th><th>Particularidad asignada</th><th>Responsable</th><th>Grupo</th><th>Motivo / evento</th><th>Versión</th></tr></thead>
          <tbody>
            {filtered.map((record) => (
              <tr key={record.id}>
                <td><strong>{record.date}</strong><span>{record.time}–{record.endTime}</span></td>
                <td><span className="task-table"><ClipboardCheck size={15} /><span><strong>{record.task}</strong>{record.description && <small>{record.description}</small>}</span></span></td>
                <td><span className={record.particularity ? "history-note" : "history-note history-note-empty"}>{record.particularity || "Sin particularidad registrada"}</span></td>
                <td>{record.analyst}</td>
                <td>{record.group}</td>
                <td><span className={record.event.toLocaleLowerCase("es").includes("redistrib") ? "warning-pill" : "neutral-pill"}>{record.event}</span></td>
                <td>V{record.version}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} className="empty-history">No hay registros que coincidan con los filtros.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="table-note"><ShieldCheck size={15} /> Solo aparecen distribuciones que estuvieron vigentes. Los borradores y previsualizaciones no generan histórico.</p>
    </section>
  );
}

function TasksPage({
  tasks,
  families,
  fronts,
  assignedTaskIds,
  openCreate,
  openEdit,
  toggle,
  remove,
  busy,
  saveCatalog,
  toggleCatalog,
  removeCatalog,
}: {
  tasks: Task[];
  families: TaskFamily[];
  fronts: CriticalFront[];
  assignedTaskIds: Set<number>;
  openCreate: () => void;
  openEdit: (task: Task) => void;
  toggle: (task: Task) => void;
  remove: (task: Task) => void;
  busy: boolean;
  saveCatalog: (kind: "family" | "front", item?: TaskFamily | CriticalFront) => void;
  toggleCatalog: (kind: "family" | "front", id: string) => void;
  removeCatalog: (kind: "family" | "front", id: string) => void;
}) {
  return (
    <section className="board-panel">
      <div className="parameter-grid">
        <section className="parameter-card">
          <div className="section-title section-title-compact"><div><h3>Grupos relacionados</h3><p>Controlan variantes y evitan asignarlas juntas.</p></div><button className="button-secondary" onClick={() => saveCatalog("family")}><Plus size={15} /> Agregar</button></div>
          {families.map((item) => <div className={`parameter-row ${!item.active ? "parameter-inactive" : ""}`} key={item.id}><div><strong>{item.name}</strong><span>{item.description || item.id}</span></div><div className="card-actions"><button className="icon-text-button" onClick={() => saveCatalog("family", item)}><Pencil size={14} /> Editar</button><button className={`toggle ${item.active ? "toggle-active" : ""}`} onClick={() => toggleCatalog("family", item.id)}><i /></button><button className="icon-button danger" onClick={() => removeCatalog("family", item.id)}><Trash2 size={14} /></button></div></div>)}
        </section>
        <section className="parameter-card">
          <div className="section-title section-title-compact"><div><h3>Frentes críticos</h3><p>Cada frente activo queda en un responsable diferente.</p></div><button className="button-secondary" onClick={() => saveCatalog("front")}><Plus size={15} /> Agregar</button></div>
          {fronts.sort((a, b) => a.order - b.order).map((item) => <div className={`parameter-row ${!item.active ? "parameter-inactive" : ""}`} key={item.id}><div><strong>{item.order}. {item.name}</strong><span>{item.description || item.id}</span></div><div className="card-actions"><button className="icon-text-button" onClick={() => saveCatalog("front", item)}><Pencil size={14} /> Editar</button><button className={`toggle ${item.active ? "toggle-active" : ""}`} onClick={() => toggleCatalog("front", item.id)}><i /></button><button className="icon-button danger" onClick={() => removeCatalog("front", item.id)}><Trash2 size={14} /></button></div></div>)}
        </section>
      </div>
      <div className="section-title">
        <div><h2>Catálogo normalizado</h2><p>{tasks.filter((task) => task.active).length} tareas activas · {tasks.filter(isExclusiveTask).length} exclusivas</p></div>
        <button className="button-primary" onClick={openCreate} disabled={busy}><ClipboardPlus size={17} /> Agregar tarea</button>
      </div>
      <div className="task-admin-grid">
        {tasks.map((task) => (
          <article key={task.id} className={!task.active ? "task-inactive" : ""}>
            <div className="task-admin-main">
              <span className="task-icon"><ClipboardCheck size={17} /></span>
              <div>
                <strong>{task.name}</strong>
                <span>{task.category}{isExclusiveTask(task) ? " · Exclusiva" : ""}{task.qa ? " · QA opcional" : ""}</span>
                {task.description && <small className="task-description">{task.description}</small>}
                {task.defaultAssignmentNote && <small className="task-particularity">Sugerencia: {task.defaultAssignmentNote}</small>}
              </div>
            </div>
            <div className="task-metadata">
              <span>Peso <strong>{task.weight}</strong></span>
              {!task.qa && <span>Desde <strong>{task.minAnalysts}</strong> analistas</span>}
              <span className={assignedTaskIds.has(task.id) ? "success-pill" : "neutral-pill"}>{assignedTaskIds.has(task.id) ? "Asignada" : "Sin asignar"}</span>
            </div>
            <div className="card-actions">
              <button className="icon-text-button" onClick={() => openEdit(task)} disabled={busy}><Pencil size={15} /> Editar</button>
              <button className={`toggle ${task.active ? "toggle-active" : ""}`} onClick={() => void toggle(task)} disabled={busy} aria-label={`${task.active ? "Desactivar" : "Activar"} ${task.name}`}><i /></button>
              <button className="icon-button danger" onClick={() => remove(task)} disabled={busy} aria-label={`Eliminar ${task.name}`}><Trash2 size={15} /></button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PublishedDistributionsPanel({ items, isLeader, action }: { items: PublishedDistribution[]; isLeader: boolean; action: (mode: "archive" | "restore" | "delete", item: PublishedDistribution) => void }) {
  const [showArchived, setShowArchived] = useState(false);
  const visible = items.filter((item) => showArchived || item.status !== "archived");
  return (
    <section className="published-panel">
      <div className="section-title section-title-compact"><div><h3>Distribuciones publicadas</h3><p>Versiones que llegaron a estar vigentes.</p></div><label className="archive-toggle"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Mostrar archivadas</label></div>
      <div className="published-list">
        {visible.map((item) => <article key={item.id} className={item.status === "archived" ? "published-archived" : ""}><div><strong>{item.name}</strong><span>{formatDate(item.effective_at)} · {formatTime(item.effective_at)}–{item.valid_until ? formatTime(item.valid_until) : "sin hora final"} · {item.shift} · por {item.created_by}</span>{item.archive_reason && <small>Archivada por {item.archived_by}: {item.archive_reason}</small>}</div><div className="card-actions">{item.is_current ? <span className="success-pill">Vigente</span> : item.status === "archived" ? <span className="neutral-pill">Archivada</span> : <span className="neutral-pill">Anterior</span>}{isLeader && item.status === "archived" && <button className="icon-text-button" onClick={() => action("restore", item)}><RotateCcw size={15} /> Restaurar</button>}{isLeader && item.status !== "archived" && <button className="icon-text-button" onClick={() => action("archive", item)}><History size={15} /> Archivar</button>}{isLeader && <button className="icon-text-button danger" onClick={() => action("delete", item)}><Trash2 size={15} /> Eliminar</button>}</div></article>)}
        {!visible.length && <p className="empty-history">No hay distribuciones publicadas en este filtro.</p>}
      </div>
    </section>
  );
}

function DistributionActionModal({ mode, item, busy, close, confirm }: { mode: "archive" | "restore" | "delete"; item: PublishedDistribution; busy: boolean; close: () => void; confirm: (reason: string, confirmation: string) => void }) {
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const destructive = mode === "delete";
  const valid = mode === "restore" || (reason.trim() && (!destructive || confirmation.trim().toUpperCase() === "ELIMINAR"));
  return <FormModal eyebrow="CONTROL DE DISTRIBUCIONES" title={mode === "archive" ? "Archivar distribución" : mode === "restore" ? "Restaurar distribución" : "Eliminar permanentemente"} description={item.name} close={close} footer={<><button className="button-secondary" onClick={close}>Cancelar</button><button className={destructive ? "button-danger" : "button-primary"} disabled={busy || !valid} onClick={() => confirm(reason, confirmation)}>{mode === "archive" ? "Archivar" : mode === "restore" ? "Restaurar y dejar vigente" : "Eliminar permanentemente"}</button></>}>
    <div className={destructive ? "destructive-warning" : "changes-box neutral"}>{destructive ? "Esta acción elimina la publicación y su histórico asociado. El registro de auditoría se conserva." : mode === "archive" ? "Se ocultará de la operación, pero conservará su histórico y podrá restaurarse." : "La composición guardada volverá a quedar como distribución vigente."}</div>
    {mode !== "restore" && <label>Motivo<textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo obligatorio" /></label>}
    {destructive && <label>Escribe ELIMINAR para confirmar<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label>}
  </FormModal>;
}

function TeamPage({
  users,
  analysts,
  unlinkedAnalysts,
  groups,
  currentUserId,
  openCreate,
  openEdit,
  completeAccess,
  toggle,
  remove,
  busy,
}: {
  users: UserRecord[];
  analysts: Analyst[];
  unlinkedAnalysts: Analyst[];
  groups: HydratedGroup[];
  currentUserId: number;
  openCreate: (role: "leader" | "analyst") => void;
  openEdit: (user: UserRecord) => void;
  completeAccess: (analyst: Analyst) => void;
  toggle: (user: UserRecord) => void;
  remove: (user: UserRecord) => void;
  busy: boolean;
}) {
  const leaders = users.filter((user) => user.role === "leader" && user.active).length;
  const analystAccounts = users.filter((user) => user.role === "analyst" && user.active).length;
  return (
    <section className="board-panel users-panel">
      <div className="section-title">
        <div>
          <h2>Personas registradas</h2>
          <p>{leaders} líderes activos · {analystAccounts} analistas con acceso · {unlinkedAnalysts.length} pendientes de unificar</p>
        </div>
        <div className="heading-actions">
          <button className="button-secondary" onClick={() => openCreate("leader")} disabled={busy}><ShieldCheck size={17} /> Agregar líder</button>
          <button className="button-primary" onClick={() => openCreate("analyst")} disabled={busy}><UserPlus size={17} /> Agregar analista</button>
        </div>
      </div>
      <div className="users-security-note">
        <ShieldCheck size={18} />
        <div>
          <strong>Un analista, un solo registro</strong>
          <span>Nombre, usuario, contraseña, horario, disponibilidad y estado de acceso se guardan juntos. Sin una cuenta activa, el analista no aparece en el generador.</span>
        </div>
      </div>
      <div className="users-grid">
        {users.map((user) => {
          const linkedAnalyst = user.analystId
            ? analysts.find((analyst) => analyst.id === user.analystId)
            : undefined;
          const assignedGroup = linkedAnalyst
            ? groups.find((group) => group.analystId === linkedAnalyst.id)
            : undefined;
          const current = user.id === currentUserId;
          return (
            <article key={user.id} className={!user.active ? "user-inactive" : ""}>
              <header>
                <span className={`user-role-icon ${user.role}`}>
                  {user.role === "leader" ? <ShieldCheck size={18} /> : <UserRound size={18} />}
                </span>
                <div>
                  <strong>{user.displayName}</strong>
                  <span>@{user.username}</span>
                </div>
                <span className={user.active ? "success-pill" : "error-pill"}>{user.active ? "Activa" : "Sin acceso"}</span>
              </header>
              <div className="user-details-grid">
                <div><span>Rol</span><strong>{user.role === "leader" ? "Líder" : "Analista"}</strong></div>
                <div><span>Estado operativo</span><strong>{linkedAnalyst?.status || (user.role === "leader" ? "No aplica" : "Sin perfil")}</strong></div>
                <div><span>Horario</span><strong>{linkedAnalyst?.schedule || "No aplica"}</strong></div>
                <div><span>Grupo vigente</span><strong>{assignedGroup?.name || "Sin grupo"}</strong></div>
                <div><span>Último ingreso</span><strong>{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Aún no ingresa"}</strong></div>
              </div>
              <footer>
                {current && <span className="current-session-pill"><Check size={13} /> Esta sesión</span>}
                <div className="card-actions">
                  <button className="icon-text-button" onClick={() => openEdit(user)} disabled={busy}><Pencil size={15} /> Editar / contraseña</button>
                  <button className={`toggle ${user.active ? "toggle-active" : ""}`} onClick={() => toggle(user)} disabled={busy || current} aria-label={`${user.active ? "Desactivar" : "Activar"} ${user.displayName}`} title={current ? "No puedes desactivar tu sesión actual" : undefined}><i /></button>
                  <button className="icon-button danger" onClick={() => remove(user)} disabled={busy || current} aria-label={`Eliminar ${user.displayName}`}><Trash2 size={15} /></button>
                </div>
              </footer>
            </article>
          );
        })}
      </div>
      {unlinkedAnalysts.length > 0 && (
        <section className="legacy-analysts">
          <div className="section-title section-title-compact">
            <div>
              <h3>Analistas anteriores sin cuenta</h3>
              <p>Estos registros provienen de una versión anterior y no pueden seleccionarse hasta completar su acceso.</p>
            </div>
          </div>
          <div className="analysts-grid">
            {unlinkedAnalysts.map((analyst) => (
              <article key={analyst.id} className="analyst-inactive">
                <div className="avatar">{analyst.initials}</div>
                <div className="analyst-details"><strong>{analyst.name}</strong><span>{analyst.schedule}</span></div>
                <span className="warning-pill">Cuenta pendiente</span>
                <div className="group-assignment"><span>Disponibilidad</span><strong>No elegible para distribuir</strong></div>
                <div className="card-actions">
                  <button className="button-primary" onClick={() => completeAccess(analyst)} disabled={busy}><KeyRound size={15} /> Completar usuario</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {!users.length && !unlinkedAnalysts.length && (
        <EmptyState
          icon={<UserCog size={25} />}
          title="Aún no hay equipo operativo"
          detail="Agrega el primer analista con su usuario, contraseña y horario."
          action={() => openCreate("analyst")}
          actionLabel="Agregar analista"
        />
      )}
    </section>
  );
}

function LogsPage({ logs, refresh }: { logs: LogRecord[]; refresh: () => void }) {
  const [level, setLevel] = useState("");
  const [module, setModule] = useState("");
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("es");
  const filtered = logs.filter((log) => {
    const text = `${log.action} ${log.message} ${log.actor} ${log.request_id} ${log.context}`.toLocaleLowerCase("es");
    return (!level || log.level === level) && (!module || log.module === module) && (!normalized || text.includes(normalized));
  });
  const modules = Array.from(new Set(logs.map((log) => log.module))).sort();

  const downloadCsv = () => {
    const rows = [
      ["Fecha", "Nivel", "Módulo", "Acción", "Mensaje", "Actor", "ID solicitud", "Contexto"],
      ...filtered.map((log) => [log.created_at, log.level, log.module, log.action, log.message, log.actor, log.request_id, log.context]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `logs-distribucion-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="board-panel logs-panel">
      <div className="section-title">
        <div><h2>Eventos registrados</h2><p>La base conserva las últimas 2.000 entradas visibles</p></div>
        <div className="heading-actions">
          <button className="button-secondary" onClick={refresh}><RefreshCw size={16} /> Actualizar</button>
          <button className="button-primary" onClick={downloadCsv} disabled={!filtered.length}><Download size={16} /> Exportar CSV</button>
        </div>
      </div>
      <div className="log-summary">
        <article><Activity size={18} /><div><strong>{logs.length}</strong><span>Total visible</span></div></article>
        <article><Info size={18} /><div><strong>{logs.filter((log) => log.level === "INFO").length}</strong><span>Información</span></div></article>
        <article><AlertTriangle size={18} /><div><strong>{logs.filter((log) => log.level === "WARN").length}</strong><span>Advertencias</span></div></article>
        <article><AlertCircle size={18} /><div><strong>{logs.filter((log) => log.level === "ERROR").length}</strong><span>Errores</span></div></article>
      </div>
      <div className="filter-bar log-filters">
        <label className="history-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar mensaje, acción o ID" /></label>
        <select value={level} onChange={(event) => setLevel(event.target.value)}><option value="">Todos los niveles</option><option>INFO</option><option>WARN</option><option>ERROR</option></select>
        <select value={module} onChange={(event) => setModule(event.target.value)}><option value="">Todos los módulos</option>{modules.map((value) => <option key={value}>{value}</option>)}</select>
        <button className="filter-clear" onClick={() => { setQuery(""); setLevel(""); setModule(""); }}><X size={15} /> Limpiar</button>
      </div>
      <div className="filter-results"><strong>{filtered.length}</strong> eventos encontrados</div>
      <div className="logs-list">
        {filtered.map((log) => (
          <details key={log.id} className={`log-row log-${log.level.toLocaleLowerCase()}`}>
            <summary>
              <span className={`log-level ${log.level.toLocaleLowerCase()}`}>{log.level}</span>
              <span className="log-time">{formatDateTime(log.created_at)}</span>
              <strong>{log.action}</strong>
              <span>{log.message}</span>
              <i>{log.module}</i>
            </summary>
            <div className="log-detail">
              <div><span>Actor</span><strong>{log.actor || "Sistema"}</strong></div>
              <div><span>ID de solicitud</span><code>{log.request_id || "No aplica"}</code></div>
              <div className="log-context"><span>Contexto</span><pre>{formatLogContext(log.context)}</pre></div>
              {log.request_id && (
                <button className="icon-text-button" onClick={() => void navigator.clipboard.writeText(log.request_id)}>
                  <Copy size={14} /> Copiar ID
                </button>
              )}
            </div>
          </details>
        ))}
        {!filtered.length && <EmptyState icon={<FileText size={24} />} title="No hay logs con esos filtros" detail="Limpia los filtros o ejecuta una acción para generar nuevos eventos." />}
      </div>
    </section>
  );
}

function formatLogContext(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value || "{}";
  }
}

function DistributionSetup({
  analysts,
  tasks,
  selected,
  setSelected,
  qaEnabled,
  setQaEnabled,
  future,
  scheduleValue,
  setScheduleValue,
  close,
  generate,
}: {
  analysts: Analyst[];
  tasks: Task[];
  selected: number[];
  setSelected: (ids: number[]) => void;
  qaEnabled: boolean;
  setQaEnabled: (enabled: boolean) => void;
  future: boolean;
  scheduleValue: ScheduleFormValue | null;
  setScheduleValue: (value: ScheduleFormValue | null) => void;
  close: () => void;
  generate: () => void;
}) {
  const minimum = qaEnabled ? 4 : 3;
  const maximum = Math.min(10, analysts.length);
  const applicableTasks = activeTasksForAnalystCount(
    tasks,
    selected.length,
    qaEnabled,
  );
  const toggleAnalyst = (id: number) => {
    setSelected(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  };
  const qaAnalystId = qaEnabled ? selected.at(-1) : undefined;
  const selectQaOwner = (id: number) => {
    setSelected([...selected.filter((item) => item !== id), id]);
  };
  const valid = selected.length >= minimum && selected.length <= maximum;
  return (
    <div className="modal-layer">
      <section className="setup-modal" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <header>
          <div>
            <p className="eyebrow">{future ? "PROGRAMACIÓN FUTURA" : "CONFIGURACIÓN PREVIA"}</p>
            <h2 id="setup-title">¿Quiénes están disponibles?</h2>
            <p>Selecciona el equipo antes de generar el borrador. Cada persona tendrá un único grupo.</p>
          </div>
          <button className="icon-button" onClick={close} aria-label="Cerrar"><X size={20} /></button>
        </header>
        {future && scheduleValue && (
          <section className="schedule-setup-card" aria-labelledby="schedule-setup-title">
            <div className="schedule-setup-heading">
              <span><CalendarPlus size={20} /></span>
              <div>
                <strong id="schedule-setup-title">¿Para qué fecha quedará programada?</strong>
                <small>La distribución se activará automáticamente, aunque el líder no esté conectado.</small>
              </div>
            </div>
            <ScheduleTimingFields form={scheduleValue} setForm={(value) => setScheduleValue(value)} includeName />
            <div className="schedule-setup-summary">
              <Clock3 size={16} />
              <span>
                Activación: <strong>{formatDateTime(scheduleValue.startsAt)}</strong>
                {" · "}Finalización: <strong>{formatDateTime(scheduleValue.endsAt)}</strong>
              </span>
            </div>
          </section>
        )}
        <div className="analyst-count-card">
          <span><Users size={22} /></span>
          <div><strong>{selected.length} analistas seleccionados</strong><small>{applicableTasks.length} tareas aplican para esta capacidad · permitido: {minimum}–{maximum}</small></div>
        </div>
        <div className="setup-analysts">
          {analysts.map((analyst) => {
            const checked = selected.includes(analyst.id);
            return (
              <button type="button" key={analyst.id} className={checked ? "selected" : ""} onClick={() => toggleAnalyst(analyst.id)}>
                <span className="avatar">{analyst.initials}</span>
                <span><strong>{analyst.name}</strong><small>{analyst.schedule}</small></span>
                <i>{checked && <Check size={15} />}</i>
              </button>
            );
          })}
        </div>
        <label className="qa-option">
          <input type="checkbox" checked={qaEnabled} onChange={(event) => setQaEnabled(event.target.checked)} />
          <span className="check-visual">{qaEnabled && <Check size={15} />}</span>
          <span><strong>Habilitar tarea QA</strong><small>QA quedará separada y asignada exclusivamente a un analista.</small></span>
        </label>
        {qaEnabled && selected.length > 0 && (
          <label className="qa-owner-field">
            Responsable de QA
            <select value={qaAnalystId} onChange={(event) => selectQaOwner(Number(event.target.value))}>
              {selected.map((id) => {
                const analyst = analysts.find((item) => item.id === id);
                return analyst ? <option key={id} value={id}>{analyst.name}</option> : null;
              })}
            </select>
            <small>Las demás personas determinan las tareas operativas y sus variantes.</small>
          </label>
        )}
        <div className="setup-rule"><ShieldCheck size={17} /><span>News, Búsquedas e In Progress tendrán responsables distintos; QA, si se habilita, permanecerá sola. Las variantes aparecerán o desaparecerán según el número de analistas operativos.</span></div>
        {!valid && <div className="inline-warning"><AlertTriangle size={16} /> Selecciona entre {minimum} y {maximum} analistas para generar una distribución completa.</div>}
        <footer>
          <button className="button-secondary" onClick={close}>Cancelar</button>
          <button className="button-primary" disabled={!valid} onClick={generate}>
            <SlidersHorizontal size={17} /> {future ? "Generar programación" : "Generar borrador"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function EditorDrawer({
  mode,
  groups,
  analysts,
  scheduledFor,
  changeReason,
  setChangeReason,
  moveTask,
  reassignGroup,
  removeGroup,
  addAnalystGroup,
  updateTaskNote,
  removeTask,
  draggedTask,
  setDraggedTask,
  close,
  preview,
}: {
  mode: "redistribute" | "new";
  groups: HydratedGroup[];
  analysts: Analyst[];
  scheduledFor: ScheduleFormValue | null;
  changeReason: string;
  setChangeReason: (reason: string) => void;
  moveTask: (taskId: number, fromGroupId: number, toGroupId: number) => void;
  reassignGroup: (groupId: number, analystId: number) => void;
  removeGroup: (groupId: number) => void;
  addAnalystGroup: (analystId: number) => void;
  updateTaskNote: (groupId: number, taskId: number, note: string) => void;
  removeTask: (groupId: number, taskId: number) => void;
  draggedTask: { taskId: number; fromGroupId: number } | null;
  setDraggedTask: (task: { taskId: number; fromGroupId: number } | null) => void;
  close: () => void;
  preview: () => void;
}) {
  const assignedIds = groups.map((group) => group.analystId);
  const availableAnalysts = analysts.filter((analyst) => !assignedIds.includes(analyst.id));
  return (
    <div className="drawer-layer">
      <button className="drawer-backdrop" onClick={close} aria-label="Cerrar editor" />
      <section className="editor-drawer">
        <header>
          <div>
            <p className="eyebrow">{mode === "new" ? "NUEVO BORRADOR" : "BORRADOR DE CAMBIO"}</p>
            <h2>{mode === "new" ? "Nueva distribución" : "Redistribuir carga"}</h2>
            <p>Mueve tareas, ajusta su particularidad o retira un analista para recalcular automáticamente las variantes.</p>
          </div>
          <button className="icon-button" onClick={close} aria-label="Cerrar"><X size={20} /></button>
        </header>
        {scheduledFor && (
          <div className="editor-schedule-banner">
            <CalendarDays size={18} />
            <span>
              <strong>Programada para {formatDateTime(scheduledFor.startsAt)}</strong>
              <small>{scheduledFor.shift} · finaliza {formatDateTime(scheduledFor.endsAt)}</small>
            </span>
          </div>
        )}
        <div className="editor-toolbar">
          <label>
            Motivo del cambio
            <select value={changeReason} onChange={(event) => setChangeReason(event.target.value)}>
              <option>Redistribución por carga</option>
              <option>Salida de analista</option>
              <option>Refuerzo temporal</option>
              <option>Nueva distribución</option>
              <option>Distribución futura</option>
              <option>Cambio operativo</option>
            </select>
          </label>
          <div className="draft-message"><ShieldCheck size={16} /><span>Este borrador todavía no genera histórico.</span></div>
          {availableAnalysts.length > 0 && (
            <label>
              Agregar analista
              <select value="" onChange={(event) => event.target.value && addAnalystGroup(Number(event.target.value))}>
                <option value="">Seleccionar…</option>
                {availableAnalysts.map((analyst) => <option key={analyst.id} value={analyst.id}>{analyst.name}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="editor-groups">
          {groups.map((group) => {
            const weight = groupWeight(group);
            return (
              <article
                key={group.id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggedTask) moveTask(draggedTask.taskId, draggedTask.fromGroupId, group.id);
                  setDraggedTask(null);
                }}
              >
                <div className="editor-group-head">
                  <div><span>{group.name}</span><strong>Peso {weight}</strong></div>
                  <label>
                    Responsable único
                    <select value={group.analystId} onChange={(event) => reassignGroup(group.id, Number(event.target.value))}>
                      {analysts.map((analyst) => <option key={analyst.id} value={analyst.id}>{analyst.name}</option>)}
                    </select>
                  </label>
                  <button className="remove-analyst" onClick={() => removeGroup(group.id)} title="Retirar analista y recalcular tareas">
                    <X size={15} /> Retirar
                  </button>
                </div>
                <div className="editor-task-list">
                  {group.tasks.map((task) => (
                    <div className="editor-task" draggable key={task.id} onDragStart={() => setDraggedTask({ taskId: task.id, fromGroupId: group.id })}>
                      <GripVertical size={17} />
                      <span className="editor-task-copy">
                        <strong>{task.name}</strong>
                        <small>Peso {task.weight}{isExclusiveTask(task) ? " · Exclusiva" : ""}{task.minAnalysts > 3 ? ` · desde ${task.minAnalysts} analistas` : ""}</small>
                        {task.description && <small className="editor-task-description">{task.description}</small>}
                        <label>
                          Particularidad de esta asignación
                          <textarea
                            rows={2}
                            draggable={false}
                            value={assignmentNote(group, task)}
                            onChange={(event) => updateTaskNote(group.id, task.id, event.target.value)}
                            placeholder="Indica el alcance específico para este analista"
                          />
                        </label>
                      </span>
                      <select value={group.id} aria-label={`Mover ${task.name}`} onChange={(event) => moveTask(task.id, group.id, Number(event.target.value))}>
                        {groups.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
                      </select>
                      <button className="icon-button danger" onClick={() => removeTask(group.id, task.id)} aria-label={`Quitar ${task.name} del borrador`} title="Quitar de esta distribución"><Trash2 size={15} /></button>
                    </div>
                  ))}
                  {group.tasks.length === 0 && <div className="drop-zone">Suelta una tarea aquí para poder conservar al analista</div>}
                </div>
              </article>
            );
          })}
        </div>
        <footer>
          <button className="button-secondary" onClick={close}>Cancelar</button>
          <button className="button-primary" onClick={preview}><Search size={17} /> Previsualizar distribución</button>
        </footer>
      </section>
    </div>
  );
}

function PreviewModal({
  groups,
  originalGroups,
  analysts,
  reason,
  scheduleIntent,
  scheduledFor,
  back,
  publish,
  schedule,
  busy,
}: {
  groups: HydratedGroup[];
  originalGroups: HydratedGroup[];
  analysts: Analyst[];
  reason: string;
  scheduleIntent: boolean;
  scheduledFor: ScheduleFormValue | null;
  back: () => void;
  publish: () => void;
  schedule: () => void;
  busy: boolean;
}) {
  const originalByTask = new Map(originalGroups.flatMap((group) => group.tasks.map((task) => [task.id, group.name])));
  const movedTasks = groups.flatMap((group) =>
    group.tasks
      .filter((task) => originalByTask.get(task.id) !== group.name)
      .map((task) => ({ task: task.name, from: originalByTask.get(task.id), to: group.name })),
  );
  return (
    <div className="modal-layer modal-layer-top">
      <section className="preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title">
        <header>
          <div>
            <p className="eyebrow">PREVISUALIZACIÓN · NO PUBLICADA</p>
            <h2 id="preview-title">Así verá el equipo la distribución</h2>
            <p>Revisa responsables, tareas y pesos. Después decide si entra en vigencia o queda programada.</p>
          </div>
          <button className="icon-button" onClick={back} aria-label="Cerrar"><X size={20} /></button>
        </header>
        <div className="preview-summary">
          <span><RotateCcw size={16} /> Motivo: {reason}</span>
          <span><Users size={16} /> {groups.length} responsables únicos</span>
          <span><ClipboardCheck size={16} /> {groups.flatMap((group) => group.tasks).length} tareas</span>
        </div>
        {scheduledFor && (
          <div className="preview-schedule-card">
            <CalendarDays size={20} />
            <div>
              <strong>Se activará el {formatDateTime(scheduledFor.startsAt)}</strong>
              <span>{scheduledFor.shift} · finalizará el {formatDateTime(scheduledFor.endsAt)}</span>
            </div>
            <span className="success-pill">Activación automática</span>
          </div>
        )}
        {movedTasks.length > 0 ? (
          <div className="changes-box">
            <strong>{movedTasks.length} cambios detectados</strong>
            {movedTasks.slice(0, 8).map((item) => <span key={`${item.task}-${item.to}`}><MoveRight size={15} /> {item.task}: {item.from || "sin grupo"} → {item.to}</span>)}
            {movedTasks.length > 8 && <span>Y {movedTasks.length - 8} cambios adicionales.</span>}
          </div>
        ) : (
          <div className="changes-box neutral"><strong>Sin movimientos de tareas</strong><span>La composición coincide con la distribución vigente.</span></div>
        )}
        <div className="preview-board"><DistributionBoard groups={groups} analysts={analysts} compact={false} isAnalyst={false} /></div>
        <footer>
          <span><ShieldCheck size={16} /> Programar no crea histórico hasta que llegue la hora de activación.</span>
          <div>
            <button className="button-secondary" onClick={back}>Volver a editar</button>
            <button className={scheduleIntent ? "button-primary" : "button-secondary"} onClick={schedule} disabled={busy}>
              <CalendarPlus size={17} /> {scheduleIntent && scheduledFor ? `Programar para ${formatDate(scheduledFor.startsAt)}` : "Programar"}
            </button>
            {!scheduleIntent && <button className="button-primary" onClick={publish} disabled={busy}><Check size={17} /> Publicar ahora</button>}
          </div>
        </footer>
      </section>
    </div>
  );
}

function ScheduleModal({
  value,
  groups,
  analysts,
  close,
  save,
  busy,
}: {
  value: ScheduleFormValue;
  groups: HydratedGroup[];
  analysts: Analyst[];
  close: () => void;
  save: (value: ScheduleFormValue) => void;
  busy: boolean;
}) {
  const [form, setForm] = useState(value);
  return (
    <FormModal
      eyebrow={form.id ? "REPROGRAMAR" : "PROGRAMACIÓN FUTURA"}
      title={form.id ? "Editar horario programado" : "Programar distribución"}
      description="Define la franja exacta. La composición quedará congelada hasta su activación."
      close={close}
      footer={
        <>
          <button className="button-secondary" onClick={close}>Cancelar</button>
          <button className="button-primary" onClick={() => save(form)} disabled={busy}><CalendarPlus size={17} /> {form.id ? "Guardar cambios" : "Programar distribución"}</button>
        </>
      }
    >
      <ScheduleTimingFields form={form} setForm={setForm} includeName />
      <div className="form-grid schedule-note-grid">
        <label className="field-span-2">Nota<textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Motivo, condiciones o indicaciones" rows={3} /></label>
      </div>
      <div className="form-preview-note">
        <CalendarDays size={16} />
        <span>Se activará automáticamente el <strong>{formatDateTime(form.startsAt)}</strong> y finalizará el <strong>{formatDateTime(form.endsAt)}</strong>.</span>
      </div>
      <div className="form-preview-note"><Users size={16} /> Se guardarán {groups.length} analistas, {groups.flatMap((group) => group.tasks).length} tareas y {analysts.length} analistas disponibles en el catálogo.</div>
    </FormModal>
  );
}

function ScheduleTimingFields({
  form,
  setForm,
  includeName = false,
}: {
  form: ScheduleFormValue;
  setForm: (value: ScheduleFormValue) => void;
  includeName?: boolean;
}) {
  const knownShift = SHIFT_PRESETS.some((item) => item.label === form.shift);
  return (
    <div className="form-grid schedule-timing-fields">
      {includeName && (
        <label className="field-span-2">
          Nombre de la programación
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Ej. Sábado turno 2–10"
          />
        </label>
      )}
      <label>
        Fecha de activación
        <input
          type="date"
          value={scheduleDateValue(form)}
          onInput={(event) => {
            const date = event.currentTarget.value;
            setForm(updateScheduleTiming(form, { date }));
          }}
        />
      </label>
      <label>
        Turno
        <select value={knownShift ? form.shift : "Horario personalizado"} onChange={(event) => setForm(applyShiftPreset(form, event.target.value))}>
          {SHIFT_PRESETS.map((preset) => <option key={preset.label} value={preset.label}>{preset.label}</option>)}
          <option value="Horario personalizado">Horario personalizado</option>
        </select>
      </label>
      <label>
        Hora de inicio
        <input
          type="time"
          value={scheduleStartTimeValue(form)}
          onInput={(event) => {
            const startTime = event.currentTarget.value;
            setForm(updateScheduleTiming(form, {
              startTime,
              shift: "Horario personalizado",
            }));
          }}
        />
      </label>
      <label>
        Hora final
        <input
          type="time"
          value={scheduleEndTimeValue(form)}
          onInput={(event) => {
            const endTime = event.currentTarget.value;
            setForm(updateScheduleTiming(form, {
              endTime,
              shift: "Horario personalizado",
            }));
          }}
        />
      </label>
    </div>
  );
}

function ScheduleDetails({
  schedule,
  groups,
  analysts,
  close,
}: {
  schedule: ScheduledDistribution;
  groups: HydratedGroup[];
  analysts: Analyst[];
  close: () => void;
}) {
  return (
    <FormModal
      eyebrow="DETALLE DE PROGRAMACIÓN"
      title={schedule.name}
      description={`${formatDateTime(schedule.startsAt)}–${formatTime(schedule.endsAt)} · ${schedule.shift}`}
      close={close}
      footer={<button className="button-primary" onClick={close}>Cerrar</button>}
      wide
    >
      <div className="preview-summary">
        <span><CalendarDays size={16} /> {schedule.status}</span>
        <span><Users size={16} /> {schedule.analystCount} analistas</span>
        <span><UserRound size={16} /> Creada por {schedule.createdBy}</span>
      </div>
      {schedule.note && <div className="changes-box neutral"><strong>Nota</strong><span>{schedule.note}</span></div>}
      <DistributionBoard groups={groups} analysts={analysts} compact={false} isAnalyst={false} />
    </FormModal>
  );
}

function TaskModal({
  value,
  families,
  fronts,
  close,
  save,
  busy,
}: {
  value: TaskFormValue;
  families: TaskFamily[];
  fronts: CriticalFront[];
  close: () => void;
  save: (value: TaskFormValue) => void;
  busy: boolean;
}) {
  const [form, setForm] = useState(value);
  return (
    <FormModal
      eyebrow="CATÁLOGO DE TAREAS"
      title={form.id ? "Editar tarea" : "Agregar tarea"}
      description="Los cambios estructurales se aplicarán a nuevos borradores."
      close={close}
      footer={<><button className="button-secondary" onClick={close}>Cancelar</button><button className="button-primary" onClick={() => save(form)} disabled={busy}><ClipboardCheck size={17} /> Guardar tarea</button></>}
    >
      <div className="form-grid">
        <label className="field-span-2">Nombre<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nombre normalizado" autoFocus /></label>
        <label>Categoría<input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Ej. Alertas" /></label>
        <label>Peso<input type="number" min={1} max={10} value={form.weight} onChange={(event) => setForm({ ...form, weight: Number(event.target.value) })} /></label>
        <label className="field-span-2">Descripción general del alcance<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Qué debe cubrir siempre esta tarea" rows={3} /></label>
        <label className="field-span-2">Particularidad sugerida<textarea value={form.defaultAssignmentNote} onChange={(event) => setForm({ ...form, defaultAssignmentNote: event.target.value })} placeholder="Ej. Respuestas de Cloudflare o clientes del día" rows={2} /></label>
        <label>
          Aparece desde
          <select value={form.minAnalysts} onChange={(event) => setForm({ ...form, minAnalysts: Number(event.target.value) })}>
            {[3, 4, 5, 6, 7, 8, 9, 10].map((count) => <option key={count} value={count}>{count} analistas operativos</option>)}
          </select>
        </label>
        <label>
          Frente relacionado
          <select value={form.family} onChange={(event) => setForm({ ...form, family: event.target.value })}>
            <option value="">Sin variante relacionada</option>
            {families.filter((item) => item.active || item.id === form.family).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="field-span-2">
          Separación crítica
          <select value={form.criticalLane} onChange={(event) => setForm({ ...form, criticalLane: event.target.value as TaskFormValue["criticalLane"] })}>
            <option value="">No es un frente crítico principal</option>
            {fronts.filter((item) => item.active || item.id === form.criticalLane).sort((a, b) => a.order - b.order).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </div>
      <label className="form-check"><input type="checkbox" checked={form.exclusive} onChange={(event) => setForm({ ...form, exclusive: event.target.checked })} /><span><strong>Tarea exclusiva</strong><small>Debe permanecer sola en su grupo.</small></span></label>
      <label className="form-check"><input type="checkbox" checked={form.qa} onChange={(event) => setForm({ ...form, qa: event.target.checked, exclusive: event.target.checked || form.exclusive, criticalLane: event.target.checked ? "" : form.criticalLane })} /><span><strong>Es la tarea QA</strong><small>Será opcional al generar y siempre exclusiva.</small></span></label>
    </FormModal>
  );
}

function UserModal({
  value,
  currentUserId,
  close,
  save,
  busy,
}: {
  value: UserFormValue;
  currentUserId: number;
  close: () => void;
  save: (value: UserFormValue) => void;
  busy: boolean;
}) {
  const [form, setForm] = useState(value);
  const [showPassword, setShowPassword] = useState(false);
  const isCurrentUser = form.id === currentUserId;
  return (
    <FormModal
      eyebrow="EQUIPO Y ACCESOS"
      title={form.id ? "Editar persona" : form.role === "leader" ? "Agregar líder" : "Agregar analista"}
      description={
        form.id
          ? "Los datos de acceso y, cuando aplica, el perfil operativo se actualizan juntos."
          : form.analystId
            ? "Completa el acceso del registro operativo anterior."
            : "La persona podrá iniciar sesión inmediatamente después de guardar."
      }
      close={close}
      footer={<><button className="button-secondary" onClick={close}>Cancelar</button><button className="button-primary" onClick={() => save(form)} disabled={busy}><UserCheck size={17} /> {form.id ? "Guardar cambios" : "Registrar persona"}</button></>}
      wide
    >
      <div className="form-grid user-form-grid">
        <label>Nombre para mostrar<input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="Nombre y apellido" autoFocus /></label>
        <label>Usuario<input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="nombre.apellido" autoComplete="off" /></label>
        <label>
          Rol
          <select
            value={form.role}
            disabled={Boolean(form.id)}
            onChange={(event) => {
              const role = event.target.value as "leader" | "analyst";
              setForm({ ...form, role, analystId: role === "leader" ? null : form.analystId });
            }}
          >
            <option value="analyst">Analista</option>
            <option value="leader">Líder</option>
          </select>
        </label>
        {form.role === "analyst" && (
          <>
            <label>Horario operativo<input value={form.schedule} onChange={(event) => setForm({ ...form, schedule: event.target.value })} placeholder="Ej. 2:00 p. m.–10:00 p. m." /></label>
            <label>
              Disponibilidad
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as AnalystStatus })}>
                <option>Disponible</option>
                <option>Horario parcial</option>
                <option>Ausente</option>
              </select>
            </label>
          </>
        )}
        <label>
          {form.id ? "Nueva contraseña (opcional)" : "Contraseña inicial"}
          <span className="password-field">
            <input
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              placeholder={isCurrentUser ? "Usa “Cambiar contraseña”" : form.id ? "Dejar vacía para conservar" : "Mínimo 10 caracteres"}
              autoComplete="new-password"
              disabled={isCurrentUser}
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </span>
        </label>
        <label>
          Confirmar contraseña
          <input
            type={showPassword ? "text" : "password"}
            value={form.confirmPassword}
            onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
            placeholder="Repite la contraseña"
            autoComplete="new-password"
            disabled={isCurrentUser}
          />
        </label>
      </div>
      {form.id && (
        <label className={`form-check ${isCurrentUser ? "form-check-disabled" : ""}`}>
          <input
            type="checkbox"
            checked={form.active}
            disabled={isCurrentUser}
            onChange={(event) => setForm({ ...form, active: event.target.checked })}
          />
          <span><strong>Cuenta activa</strong><small>{isCurrentUser ? "No puedes desactivar la cuenta de tu sesión actual." : "Al desactivarla se cerrarán sus sesiones y no podrá ingresar."}</small></span>
        </label>
      )}
      {form.role === "analyst" && (
        <div className="security-form-note"><UserCheck size={17} /><span>Al guardar se actualizarán juntos su cuenta y su disponibilidad operativa. Una cuenta desactivada deja de aparecer en el generador.</span></div>
      )}
      <div className="security-form-note"><LockKeyhole size={17} /><span>Las contraseñas se derivan con PBKDF2 y nunca se guardan como texto visible. Al restablecer una contraseña se cierran las sesiones anteriores.</span></div>
    </FormModal>
  );
}

function PasswordModal({
  close,
  save,
  busy,
}: {
  close: () => void;
  save: (currentPassword: string, newPassword: string, confirmPassword: string) => void;
  busy: boolean;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  return (
    <FormModal
      eyebrow="SEGURIDAD DE LA CUENTA"
      title="Cambiar mi contraseña"
      description="La nueva contraseña debe tener al menos 10 caracteres."
      close={close}
      footer={<><button className="button-secondary" onClick={close}>Cancelar</button><button className="button-primary" onClick={() => save(currentPassword, newPassword, confirmPassword)} disabled={busy}><KeyRound size={17} /> Actualizar contraseña</button></>}
    >
      <div className="form-grid password-change-grid">
        <label className="field-span-2">Contraseña actual<input type={showPassword ? "text" : "password"} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" autoFocus /></label>
        <label>Nueva contraseña<input type={showPassword ? "text" : "password"} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" /></label>
        <label>Confirmar contraseña<input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /></label>
      </div>
      <label className="form-check">
        <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
        <span><strong>Mostrar contraseñas</strong><small>Úsalo solo si nadie más puede ver tu pantalla.</small></span>
      </label>
    </FormModal>
  );
}

function ConfirmModal({
  title,
  message,
  confirmLabel,
  close,
  confirm,
  busy,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  close: () => void;
  confirm: () => void;
  busy: boolean;
}) {
  return (
    <FormModal
      eyebrow="CONFIRMACIÓN"
      title={title}
      description={message}
      close={close}
      footer={<><button className="button-secondary" onClick={close}>Cancelar</button><button className="button-danger" onClick={confirm} disabled={busy}><Trash2 size={16} /> {confirmLabel}</button></>}
    >
      <div className="confirm-warning"><AlertTriangle size={20} /><span>La acción quedará registrada en los logs del sistema.</span></div>
    </FormModal>
  );
}

function FormModal({
  eyebrow,
  title,
  description,
  close,
  footer,
  children,
  wide = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  close: () => void;
  footer: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="modal-layer modal-layer-top">
      <section className={`form-modal ${wide ? "form-modal-wide" : ""}`} role="dialog" aria-modal="true">
        <header>
          <div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{description}</p></div>
          <button className="icon-button" onClick={close} aria-label="Cerrar"><X size={20} /></button>
        </header>
        <div className="form-modal-body">{children}</div>
        <footer>{footer}</footer>
      </section>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  detail,
  action,
  actionLabel,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="empty-state">
      <span>{icon}</span><strong>{title}</strong><p>{detail}</p>
      {action && <button className="button-primary" onClick={action}><Plus size={16} /> {actionLabel}</button>}
    </div>
  );
}
