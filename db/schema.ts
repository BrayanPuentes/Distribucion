import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const appState = sqliteTable("app_state", {
  id: integer("id").primaryKey(),
  payload: text("payload").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const historyEvents = sqliteTable(
  "history_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    distributionId: integer("distribution_id"),
    effectiveAt: text("effective_at").notNull(),
    shift: text("shift").notNull(),
    task: text("task").notNull(),
    taskDescription: text("task_description").notNull().default(""),
    assignmentNote: text("assignment_note").notNull().default(""),
    analyst: text("analyst").notNull(),
    groupName: text("group_name").notNull(),
    event: text("event").notNull(),
    version: integer("version").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("history_effective_idx").on(table.effectiveAt),
    index("history_task_idx").on(table.task),
    index("history_analyst_idx").on(table.analyst),
    index("history_distribution_idx").on(table.distributionId),
  ],
);

export const publishedDistributions = sqliteTable(
  "published_distributions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    effectiveAt: text("effective_at").notNull(),
    shift: text("shift").notNull(),
    snapshot: text("snapshot").notNull(),
    status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
    isCurrent: integer("is_current", { mode: "boolean" }).notNull().default(false),
    archivedAt: text("archived_at"),
    archivedBy: text("archived_by"),
    archiveReason: text("archive_reason"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("published_status_idx").on(table.status, table.effectiveAt)],
);

export const auditEvents = sqliteTable("audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  action: text("action").notNull(),
  detail: text("detail").notNull().default(""),
  actor: text("actor").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const systemLogs = sqliteTable(
  "system_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    level: text("level").notNull(),
    module: text("module").notNull(),
    action: text("action").notNull(),
    message: text("message").notNull(),
    actor: text("actor").notNull().default(""),
    requestId: text("request_id").notNull().default(""),
    context: text("context").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("system_logs_created_idx").on(table.createdAt),
    index("system_logs_level_idx").on(table.level),
    index("system_logs_module_idx").on(table.module),
  ],
);

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    username: text("username").notNull(),
    usernameNormalized: text("username_normalized").notNull().unique(),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: ["leader", "analyst"] }).notNull(),
    analystId: integer("analyst_id"),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    passwordIterations: integer("password_iterations").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdBy: integer("created_by"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastLoginAt: text("last_login_at"),
  },
  (table) => [
    index("users_role_idx").on(table.role),
    index("users_analyst_idx").on(table.analystId),
    uniqueIndex("users_analyst_unique").on(table.analystId),
  ],
);

export const userSessions = sqliteTable(
  "user_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: integer("user_id").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("user_sessions_user_idx").on(table.userId),
    index("user_sessions_expires_idx").on(table.expiresAt),
  ],
);

export const loginAttempts = sqliteTable("login_attempts", {
  usernameNormalized: text("username_normalized").primaryKey(),
  failures: integer("failures").notNull().default(0),
  blockedUntil: text("blocked_until"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
