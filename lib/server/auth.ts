export type UserRole = "leader" | "analyst";

export type AuthUser = {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  analystId: number | null;
  active: boolean;
};

export type UserListItem = AuthUser & {
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

type UserRow = {
  id: number;
  username: string;
  display_name: string;
  role: string;
  analyst_id: number | null;
  active: number;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  created_at?: string;
  updated_at?: string;
  last_login_at?: string | null;
};

type SessionRow = UserRow & {
  expires_at: string;
};

export class AuthError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = "AUTH_ERROR") {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
  }
}

export const SESSION_COOKIE = "distribution_session";
export const PASSWORD_ITERATIONS = 100_000;
export const SESSION_DURATION_SECONDS = 12 * 60 * 60;

const encoder = new TextEncoder();

export function database() {
  const db = (globalThis as typeof globalThis & { __DISTRIBUTION_DB?: D1Database })
    .__DISTRIBUTION_DB;
  if (!db) {
    throw new Error("La conexión DB no está disponible en este entorno.");
  }
  return db;
}

export async function ensureAuthDatabase() {
  const db = database();
  await db.batch([
    db.prepare(
      "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, username_normalized TEXT NOT NULL, display_name TEXT NOT NULL, role TEXT NOT NULL, analyst_id INTEGER, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, password_iterations INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_login_at TEXT)",
    ),
    db.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS users_username_normalized_unique ON users (username_normalized)",
    ),
    db.prepare("CREATE INDEX IF NOT EXISTS users_role_idx ON users (role)"),
    db.prepare("CREATE INDEX IF NOT EXISTS users_analyst_idx ON users (analyst_id)"),
    db.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS users_analyst_unique ON users (analyst_id)",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS user_sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions (user_id)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS user_sessions_expires_idx ON user_sessions (expires_at)",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS login_attempts (username_normalized TEXT PRIMARY KEY, failures INTEGER NOT NULL DEFAULT 0, blocked_until TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS system_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, level TEXT NOT NULL, module TEXT NOT NULL, action TEXT NOT NULL, message TEXT NOT NULL, actor TEXT NOT NULL DEFAULT '', request_id TEXT NOT NULL DEFAULT '', context TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS system_logs_created_idx ON system_logs (created_at)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS system_logs_level_idx ON system_logs (level)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS system_logs_module_idx ON system_logs (module)",
    ),
  ]);
  await db
    .prepare("DELETE FROM user_sessions WHERE expires_at <= CURRENT_TIMESTAMP")
    .run();
}

export function normalizeUsername(value: string) {
  return value.trim().toLocaleLowerCase("es");
}

export function validateUsername(value: string) {
  const normalized = normalizeUsername(value);
  if (!/^[a-z0-9._@-]{3,64}$/.test(normalized)) {
    throw new AuthError(
      400,
      "El usuario debe tener entre 3 y 64 caracteres y usar solo letras, números, punto, guion, guion bajo o @.",
      "INVALID_USERNAME",
    );
  }
  return normalized;
}

export function validateDisplayName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 120) {
    throw new AuthError(
      400,
      "El nombre debe tener entre 3 y 120 caracteres.",
      "INVALID_DISPLAY_NAME",
    );
  }
  return name;
}

export function validatePassword(value: string) {
  if (value.length < 10 || value.length > 128) {
    throw new AuthError(
      400,
      "La contraseña debe tener entre 10 y 128 caracteres.",
      "INVALID_PASSWORD",
    );
  }
  return value;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function derivePassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password).buffer as ArrayBuffer,
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new Uint8Array(salt).buffer as ArrayBuffer,
      iterations,
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
  validatePassword(password);
  const salt = randomBytes(16);
  const hash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return {
    hash: bytesToBase64(hash),
    salt: bytesToBase64(salt),
    iterations: PASSWORD_ITERATIONS,
  };
}

export async function verifyPassword(
  password: string,
  expectedHash: string,
  saltValue: string,
  iterations: number,
) {
  const actual = await derivePassword(
    password,
    base64ToBytes(saltValue),
    iterations,
  );
  const expected = base64ToBytes(expectedHash);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual[index] ^ expected[index];
  }
  return difference === 0;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

function tokenValue() {
  return bytesToBase64(randomBytes(32))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function cookieValue(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return "";
}

export function sessionCookie(
  request: Request,
  token: string,
  maxAge = SESSION_DURATION_SECONDS,
) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie(request: Request) {
  return sessionCookie(request, "", 0);
}

export async function createSession(userId: number) {
  const token = tokenValue();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_SECONDS * 1000,
  ).toISOString();
  await database()
    .prepare(
      "INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
    )
    .bind(tokenHash, userId, expiresAt)
    .run();
  return token;
}

export async function deleteRequestSession(request: Request) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return;
  await database()
    .prepare("DELETE FROM user_sessions WHERE token_hash = ?")
    .bind(await sha256(token))
    .run();
}

function mapUser(row: UserRow): AuthUser {
  return {
    id: Number(row.id),
    username: row.username,
    displayName: row.display_name,
    role: row.role === "leader" ? "leader" : "analyst",
    analystId:
      row.analyst_id === null || row.analyst_id === undefined
        ? null
        : Number(row.analyst_id),
    active: Boolean(row.active),
  };
}

export function mapUserListItem(row: UserRow): UserListItem {
  return {
    ...mapUser(row),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    lastLoginAt: row.last_login_at || null,
  };
}

export async function getSessionUser(request: Request) {
  await ensureAuthDatabase();
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await database()
    .prepare(
      "SELECT u.id, u.username, u.display_name, u.role, u.analyst_id, u.active, u.password_hash, u.password_salt, u.password_iterations, s.expires_at FROM user_sessions s INNER JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP AND u.active = 1 LIMIT 1",
    )
    .bind(await sha256(token))
    .first<SessionRow>();
  return row ? mapUser(row) : null;
}

export async function requireSession(request: Request) {
  const user = await getSessionUser(request);
  if (!user) {
    throw new AuthError(
      401,
      "Tu sesión terminó. Inicia sesión nuevamente.",
      "SESSION_REQUIRED",
    );
  }
  return user;
}

export async function requireLeader(request: Request) {
  const user = await requireSession(request);
  if (user.role !== "leader") {
    throw new AuthError(
      403,
      "Esta acción está disponible únicamente para líderes.",
      "LEADER_REQUIRED",
    );
  }
  return user;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  if (new URL(origin).origin !== new URL(request.url).origin) {
    throw new AuthError(
      403,
      "La solicitud no proviene de este sitio.",
      "INVALID_ORIGIN",
    );
  }
}

export async function findUserByUsername(username: string) {
  return database()
    .prepare(
      "SELECT id, username, display_name, role, analyst_id, active, password_hash, password_salt, password_iterations, created_at, updated_at, last_login_at FROM users WHERE username_normalized = ? LIMIT 1",
    )
    .bind(normalizeUsername(username))
    .first<UserRow>();
}

export async function userCount() {
  const row = await database()
    .prepare("SELECT COUNT(*) AS total FROM users")
    .first<{ total: number }>();
  return Number(row?.total || 0);
}

export async function writeAuthLog(
  level: "INFO" | "WARN" | "ERROR",
  action: string,
  message: string,
  actor = "",
  requestId = "",
  context: Record<string, unknown> = {},
) {
  try {
    await database()
      .prepare(
        "INSERT INTO system_logs (level, module, action, message, actor, request_id, context) VALUES (?, 'AUTENTICACION', ?, ?, ?, ?, ?)",
      )
      .bind(
        level,
        action.slice(0, 120),
        message.slice(0, 1000),
        actor.slice(0, 120),
        requestId.slice(0, 80),
        JSON.stringify(context).slice(0, 4000),
      )
      .run();
  } catch {
    // El registro nunca debe ocultar el error de autenticación original.
  }
}

export function authErrorResponse(error: unknown, requestId: string) {
  if (error instanceof AuthError) {
    return Response.json(
      { error: error.message, code: error.code, requestId },
      { status: error.status },
    );
  }
  return Response.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "No fue posible completar la operación de acceso.",
      requestId,
    },
    { status: 500 },
  );
}

export function requestIdentifier() {
  return crypto.randomUUID();
}
