import {
  type Connection,
  Server,
  type WSMessage,
  routePartykitRequest,
} from "partyserver";
import { createAdminClient } from "../supabase-service";
import type {
  ChatMessage,
  ChatParticipantRole,
  Message,
  RegisteredUser,
} from "../shared";

const DEFAULT_ROOM = "9FexDdTqo9kdtdgg0WukK";
const MAX_MESSAGES = 150;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 365;
const SESSION_COOKIE_NAME = "chat_session";
const SESSION_COOKIE_MAX_AGE_SECONDS = Math.floor(SESSION_TTL_MS / 1000);

type StoredUser = RegisteredUser & {
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  updatedAt: string;
};

type StoredSession = {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

type Actor = {
  isRegistered: boolean;
  role: ChatParticipantRole;
  userId?: string;
  email?: string;
  nickname: string;
  bannedAt?: string | null;
};

type ConnectionIdentityState = {
  nickname: string;
  nicknameKey: string;
  userId?: string;
  isRegistered: boolean;
};

type AuthResponseBody = {
  token: string;
  user: RegisteredUser;
};

type MeResponseBody = {
  token: string;
  user: RegisteredUser;
};

type JsonObject = Record<string, unknown>;

async function fetchAIResponse(
  accountId: string,
  messages: Array<{ role: string; content: string; name?: string }>,
  env: Env,
): Promise<string> {
  const apiToken = env.AI_API_TOKEN;
  if (!apiToken) {
    throw new Error("Missing Cloudflare API token in env.AI_API_TOKEN");
  }

  const model = "@cf/meta/llama-3-8b-instruct";
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({ messages }),
  });

  if (!resp.ok) {
    throw new Error(`AI API error: ${resp.status}`);
  }

  const data = (await resp.json()) as { result?: { response?: string } };
  return data.result?.response || "(no response)";
}

const esc = (value: string) => value.replace(/'/g, "''");

const jsonResponse = (body: JsonObject, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const jsonResponseWithHeaders = (
  body: JsonObject,
  status = 200,
  extraHeaders?: HeadersInit,
) => {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
};

const toBooleanFlag = (value?: string) =>
  !["0", "false", "no", "off"].includes((value || "").trim().toLowerCase());

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const parseCookies = (cookieHeader: string | null) => {
  const cookies = new Map<string, string>();
  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    cookies.set(key, decodeURIComponent(value));
  }

  return cookies;
};

const buildSessionCookie = (token: string, request: Request) => {
  const isSecure = new URL(request.url).protocol === "https:";
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (isSecure) {
    parts.push("Secure");
  }

  return parts.join("; ");
};

const buildExpiredSessionCookie = (request: Request) => {
  const isSecure = new URL(request.url).protocol === "https:";
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (isSecure) {
    parts.push("Secure");
  }

  return parts.join("; ");
};

const cleanNickname = (value: string) =>
  value.trim().replace(/\s+/g, " ").slice(0, 24);

const getNicknameKey = (value: string) => cleanNickname(value).toLowerCase();

const sanitizeNickname = (value: string) => {
  const cleaned = cleanNickname(value);
  if (cleaned.length >= 2) {
    return cleaned;
  }
  return `Guest-${Math.random().toString(36).slice(2, 6)}`;
};

const sanitizeColor = (value?: string) =>
  /^#[0-9a-fA-F]{6}$/.test(value || "") ? (value as string) : "#ffffff";

const detectMessageType = (content: string): "text" | "audio" | "image" => {
  if (content.startsWith("http://") || content.startsWith("https://")) {
    if (content.includes("/audio/") || content.includes("audio")) {
      return "audio";
    }
    if (content.includes("/images/") || content.includes("image")) {
      return "image";
    }
  }
  return "text";
};

const triggersAI = (content: string, taggedUser?: string) =>
  /@ai\b/i.test(content) || (taggedUser || "").trim().toLowerCase() === "ai";

const toRegisteredUser = (user: StoredUser): RegisteredUser => ({
  id: user.id,
  email: user.email,
  nickname: user.nickname,
  role: user.role,
  bannedAt: user.bannedAt || null,
});

const hasPasswordCredentials = (
  user: Pick<StoredUser, "passwordHash" | "passwordSalt">,
) => Boolean(user.passwordHash && user.passwordSalt);

const hex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const fromHex = (value: string) => {
  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < value.length; i += 2) {
    bytes[i / 2] = Number.parseInt(value.slice(i, i + 2), 16);
  }
  return bytes;
};

const randomToken = (length = 32) => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return hex(bytes);
};

async function hashPassword(password: string, saltHex: string) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: fromHex(saltHex),
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );

  return hex(new Uint8Array(derivedBits));
}

async function handleDeleteOld(request: Request, env: Env) {
  const url = new URL(request.url);
  const hoursParam = url.searchParams.get("hours");
  const hours = hoursParam ? Number(hoursParam) : NaN;

  if (!Number.isInteger(hours) || hours < 1 || hours > 24) {
    return jsonResponse(
      {
        error: "hours query parameter must be an integer between 1 and 24",
      },
      400,
    );
  }

  const id = env.Chat.idFromName(DEFAULT_ROOM);
  const chatStub = env.Chat.get(id);
  return chatStub.fetch(createInternalChatRequest(`/deleteOld?hours=${hours}`));
}

function createInternalChatRequest(path: string, request?: Request) {
  const headers = new Headers(request?.headers);
  headers.set("x-partykit-room", DEFAULT_ROOM);
  headers.set("x-partykit-namespace", "chat");

  return new Request(`http://internal${path}`, {
    method: request?.method,
    headers,
    body: request?.body,
  });
}

async function forwardToChat(request: Request, env: Env) {
  const url = new URL(request.url);
  const id = env.Chat.idFromName(DEFAULT_ROOM);
  const chatStub = env.Chat.get(id);
  return chatStub.fetch(
    createInternalChatRequest(`${url.pathname}${url.search}`, request),
  );
}

export class Chat extends Server<Env> {
  static options = { hibernate: true };

  messages: ChatMessage[] = [];
  adminEmails = new Set<string>();
  allowUnregistered = true;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async onStart() {
    this.allowUnregistered = toBooleanFlag(this.env.ENABLE_UNREGISTERED);
    this.adminEmails = new Set(
      (this.env.ADMIN_EMAILS || "")
        .split(",")
        .map((email) => normalizeEmail(email))
        .filter(Boolean),
    );

    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        user TEXT,
        role TEXT,
        content TEXT,
        timestamp TEXT,
        color TEXT,
        messageType TEXT DEFAULT 'text',
        taggedUser TEXT,
        authorId TEXT,
        authorRole TEXT DEFAULT 'guest',
        isRegistered INTEGER DEFAULT 0
      )`,
    );

    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        nickname TEXT,
        passwordHash TEXT,
        passwordSalt TEXT,
        role TEXT,
        bannedAt TEXT,
        createdAt TEXT,
        updatedAt TEXT
      )`,
    );
    this.ctx.storage.sql.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_nickname_unique
       ON users(nickname COLLATE NOCASE)`,
    );

    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        userId TEXT,
        createdAt TEXT,
        expiresAt TEXT
      )`,
    );

    const alterStatements = [
      `ALTER TABLE messages ADD COLUMN timestamp TEXT`,
      `ALTER TABLE messages ADD COLUMN color TEXT`,
      `ALTER TABLE messages ADD COLUMN messageType TEXT DEFAULT 'text'`,
      `ALTER TABLE messages ADD COLUMN taggedUser TEXT`,
      `ALTER TABLE messages ADD COLUMN authorId TEXT`,
      `ALTER TABLE messages ADD COLUMN authorRole TEXT DEFAULT 'guest'`,
      `ALTER TABLE messages ADD COLUMN isRegistered INTEGER DEFAULT 0`,
      `ALTER TABLE users ADD COLUMN passwordHash TEXT`,
      `ALTER TABLE users ADD COLUMN passwordSalt TEXT`,
      `ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'member'`,
      `ALTER TABLE users ADD COLUMN createdAt TEXT`,
      `ALTER TABLE users ADD COLUMN bannedAt TEXT`,
      `ALTER TABLE users ADD COLUMN updatedAt TEXT`,
      `ALTER TABLE sessions ADD COLUMN userId TEXT`,
      `ALTER TABLE sessions ADD COLUMN createdAt TEXT`,
      `ALTER TABLE sessions ADD COLUMN expiresAt TEXT`,
    ];

    for (const statement of alterStatements) {
      try {
        this.ctx.storage.sql.exec(statement);
      } catch {}
    }

    this.messages = this.ctx.storage.sql
      .exec(
        `SELECT id, user, role, content, timestamp, color, messageType, taggedUser, authorId, authorRole, isRegistered
         FROM messages
         ORDER BY timestamp DESC
         LIMIT ${MAX_MESSAGES}`,
      )
      .toArray()
      .map((row) => this.toChatMessage(row as Record<string, unknown>))
      .reverse();
  }

  onConnect(connection: Connection) {
    connection.send(JSON.stringify({ type: "all", messages: this.messages }));
  }

  private toChatMessage(row: Record<string, unknown>): ChatMessage {
    return {
      id: String(row.id || ""),
      user: String(row.user || ""),
      role: (row.role as "user" | "assistant") || "user",
      content: String(row.content || ""),
      timestamp: String(row.timestamp || new Date().toISOString()),
      color: row.color ? String(row.color) : undefined,
      messageType:
        (row.messageType as "text" | "audio" | "image" | undefined) || "text",
      taggedUser: row.taggedUser ? String(row.taggedUser) : undefined,
      authorId: row.authorId ? String(row.authorId) : undefined,
      authorRole: (row.authorRole as ChatParticipantRole | undefined) || "guest",
      isRegistered:
        row.isRegistered === 1 ||
        row.isRegistered === "1" ||
        row.isRegistered === true,
    };
  }

  private getAuthTokenFromRequest(request: Request) {
    const authHeader = request.headers.get("Authorization") || "";
    if (authHeader.toLowerCase().startsWith("bearer ")) {
      return authHeader.slice(7).trim();
    }
    const headerToken = request.headers.get("x-auth-token") || "";
    if (headerToken) {
      return headerToken;
    }
    return parseCookies(request.headers.get("Cookie")).get(SESSION_COOKIE_NAME) || "";
  }

  private getSupabaseAdminClient() {
    return createAdminClient(this.env.SUPABASE_SERVICE_ROLE_KEY);
  }

  private async readJson<T>(request: Request): Promise<T> {
    return (await request.json()) as T;
  }

  private getUserByEmail(email: string) {
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT id, email, nickname, passwordHash, passwordSalt, role, bannedAt, createdAt, updatedAt
         FROM users
         WHERE email = '${esc(email)}'
         LIMIT 1`,
      )
      .toArray() as Record<string, unknown>[];
    return rows[0] ? (rows[0] as unknown as StoredUser) : null;
  }

  private getUserByNickname(nickname: string) {
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT id, email, nickname, passwordHash, passwordSalt, role, bannedAt, createdAt, updatedAt
         FROM users
         WHERE lower(nickname) = lower('${esc(nickname)}')
         LIMIT 1`,
      )
      .toArray() as Record<string, unknown>[];
    return rows[0] ? (rows[0] as unknown as StoredUser) : null;
  }

  private getUserById(userId: string) {
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT id, email, nickname, passwordHash, passwordSalt, role, bannedAt, createdAt, updatedAt
         FROM users
         WHERE id = '${esc(userId)}'
         LIMIT 1`,
      )
      .toArray() as Record<string, unknown>[];
    return rows[0] ? (rows[0] as unknown as StoredUser) : null;
  }

  private getSession(token: string) {
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT token, userId, createdAt, expiresAt
         FROM sessions
         WHERE token = '${esc(token)}'
         LIMIT 1`,
      )
      .toArray() as Record<string, unknown>[];
    return rows[0] ? (rows[0] as unknown as StoredSession) : null;
  }

  private deleteSession(token: string) {
    this.ctx.storage.sql.exec(
      `DELETE FROM sessions WHERE token = '${esc(token)}'`,
    );
  }

  private deleteAllSessionsForUser(userId: string) {
    this.ctx.storage.sql.exec(
      `DELETE FROM sessions WHERE userId = '${esc(userId)}'`,
    );
  }

  private async createSession(userId: string) {
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    const token = randomToken();
    this.ctx.storage.sql.exec(
      `INSERT INTO sessions (token, userId, createdAt, expiresAt)
       VALUES (
        '${esc(token)}',
        '${esc(userId)}',
        '${esc(createdAt)}',
        '${esc(expiresAt)}'
       )`,
    );
    return token;
  }

  private touchSession(token: string) {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    this.ctx.storage.sql.exec(
      `UPDATE sessions
       SET expiresAt = '${esc(expiresAt)}'
       WHERE token = '${esc(token)}'`,
    );
    return expiresAt;
  }

  private createSessionResponse(
    request: Request,
    token: string,
    user: StoredUser,
    status = 200,
  ) {
    return jsonResponseWithHeaders(
      { token, user: toRegisteredUser(user) } satisfies AuthResponseBody,
      status,
      {
        "Set-Cookie": buildSessionCookie(token, request),
      },
    );
  }

  private async requireSession(token: string) {
    if (!token) {
      return null;
    }

    const session = this.getSession(token);
    if (!session) {
      return null;
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      this.deleteSession(token);
      return null;
    }

    const user = this.getUserById(session.userId);
    if (!user) {
      this.deleteSession(token);
      return null;
    }

    const expiresAt = this.touchSession(token);
    return {
      session: {
        ...session,
        expiresAt,
      },
      user,
    };
  }

  private async resolveActor(authToken?: string, fallbackName?: string) {
    const sessionState = await this.requireSession(authToken || "");
    if (!sessionState) {
      return {
        isRegistered: false,
        role: "guest" as const,
        nickname: sanitizeNickname(fallbackName || "Guest"),
      };
    }

    const user = sessionState.user;
    return {
      isRegistered: true,
      role: user.role === "admin" ? "admin" : "member",
      userId: user.id,
      email: user.email,
      nickname: user.nickname,
      bannedAt: user.bannedAt || null,
    } satisfies Actor;
  }

  private getConnectionIdentity(connection: Connection) {
    return (((connection as unknown as { state?: ConnectionIdentityState }).state ||
      null) as ConnectionIdentityState | null);
  }

  private setConnectionIdentity(connection: Connection, identity: ConnectionIdentityState) {
    const statefulConnection = connection as unknown as {
      setState?: (state: ConnectionIdentityState) => void;
    };
    statefulConnection.setState?.(identity);
  }

  private getNicknameConflict(
    nickname: string,
    options: {
      connectionId?: string;
      userId?: string;
      isRegistered: boolean;
    },
  ) {
    const normalizedNickname = sanitizeNickname(nickname);
    const nicknameKey = getNicknameKey(normalizedNickname);

    const existingUser = this.getUserByNickname(normalizedNickname);
    if (existingUser && (!options.userId || existingUser.id !== options.userId)) {
      return "That username is already taken.";
    }

    for (const connection of this.getConnections()) {
      if (connection.id === options.connectionId) {
        continue;
      }
      const identity = this.getConnectionIdentity(connection);
      if (identity?.nicknameKey === nicknameKey) {
        return "That username is already in use.";
      }
    }

    return null;
  }

  private sendError(connection: Connection, code: string, message: string) {
    connection.send(JSON.stringify({ type: "error", code, message }));
  }

  private saveMessage(message: ChatMessage) {
    const index = this.messages.findIndex((entry) => entry.id === message.id);
    if (index >= 0) {
      this.messages[index] = message;
    } else {
      this.messages.push(message);
      if (this.messages.length > MAX_MESSAGES) {
        this.messages = this.messages.slice(-MAX_MESSAGES);
      }
    }

    this.ctx.storage.sql.exec(
      `INSERT INTO messages (id, user, role, content, timestamp, color, messageType, taggedUser, authorId, authorRole, isRegistered)
       VALUES (
        '${esc(message.id)}',
        '${esc(message.user)}',
        '${esc(message.role)}',
        '${esc(message.content)}',
        '${esc(message.timestamp)}',
        '${esc(message.color || "")}',
        '${esc(message.messageType || "text")}',
        '${esc(message.taggedUser || "")}',
        '${esc(message.authorId || "")}',
        '${esc(message.authorRole || "guest")}',
        ${message.isRegistered ? 1 : 0}
       )
       ON CONFLICT(id) DO UPDATE SET
        user='${esc(message.user)}',
        role='${esc(message.role)}',
        content='${esc(message.content)}',
        timestamp='${esc(message.timestamp)}',
        color='${esc(message.color || "")}',
        messageType='${esc(message.messageType || "text")}',
        taggedUser='${esc(message.taggedUser || "")}',
        authorId='${esc(message.authorId || "")}',
        authorRole='${esc(message.authorRole || "guest")}',
        isRegistered=${message.isRegistered ? 1 : 0}`,
    );
  }

  private deleteMessage(messageId: string) {
    this.messages = this.messages.filter((message) => message.id !== messageId);
    this.ctx.storage.sql.exec(
      `DELETE FROM messages WHERE id = '${esc(messageId)}'`,
    );
  }

  private parseStorageFilePath(content: string): string | null {
    try {
      const url = new URL(content);
      const path = url.pathname;
      const match = path.match(/\/(audio|images)\/(.+)$/);
      if (match) {
        return `${match[1]}/${match[2]}`;
      }
      const altMatch = path.match(
        /\/storage\/v1\/object\/public\/chat\/(audio|images)\/(.+)$/,
      );
      if (altMatch) {
        return `${altMatch[1]}/${altMatch[2]}`;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async deleteSupabaseMedia(message: ChatMessage) {
    if (message.messageType !== "audio" && message.messageType !== "image") {
      return;
    }

    const filePath = this.parseStorageFilePath(message.content);
    if (!filePath) {
      return;
    }

    const supabase = this.getSupabaseAdminClient();
    try {
      const { error } = await supabase.storage.from("chat").remove([filePath]);
      if (error) {
        console.error(`Supabase remove error for ${filePath}:`, error);
      }
    } catch (error) {
      console.error(`Supabase remove failed for ${filePath}:`, error);
    }
  }

  private async deleteOldMessages(hours: number) {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const messagesToDelete = this.ctx.storage.sql
      .exec(
        `SELECT id, user, role, content, timestamp, color, messageType, taggedUser, authorId, authorRole, isRegistered
         FROM messages
         WHERE timestamp < '${esc(cutoff)}'`,
      )
      .toArray()
      .map((row) => this.toChatMessage(row as Record<string, unknown>));

    for (const message of messagesToDelete) {
      await this.deleteSupabaseMedia(message);
      this.deleteMessage(message.id);
    }

    return messagesToDelete.length;
  }

  private async handleRegister(request: Request) {
    const body = await this.readJson<{
      email?: string;
      password?: string;
      nickname?: string;
    }>(request);

    const email = normalizeEmail(body.email || "");
    const password = body.password || "";
    const nickname = sanitizeNickname(body.nickname || "");

    if (!email.includes("@")) {
      return jsonResponse({ error: "Valid email is required." }, 400);
    }
    if (password.length < 6) {
      return jsonResponse(
        { error: "Password must be at least 6 characters long." },
        400,
      );
    }
    if (this.getUserByEmail(email)) {
      return jsonResponse(
        { error: "That email is already registered." },
        409,
      );
    }
    const nicknameConflict = this.getNicknameConflict(nickname, {
      isRegistered: true,
    });
    if (nicknameConflict) {
      return jsonResponse({ error: nicknameConflict }, 409);
    }

    const id = crypto.randomUUID();
    const salt = randomToken(16);
    const passwordHash = await hashPassword(password, salt);
    const now = new Date().toISOString();
    const role = this.adminEmails.has(email) ? "admin" : "member";

    this.ctx.storage.sql.exec(
      `INSERT INTO users (id, email, nickname, passwordHash, passwordSalt, role, bannedAt, createdAt, updatedAt)
       VALUES (
        '${esc(id)}',
        '${esc(email)}',
        '${esc(nickname)}',
        '${esc(passwordHash)}',
        '${esc(salt)}',
        '${role}',
        '',
        '${esc(now)}',
        '${esc(now)}'
       )`,
    );

    const user = this.getUserById(id);
    if (!user) {
      return jsonResponse({ error: "Failed to create account." }, 500);
    }

    const token = await this.createSession(id);
    return this.createSessionResponse(request, token, user);
  }

  private async handleLogin(request: Request) {
    const body = await this.readJson<{ email?: string; password?: string }>(request);
    const email = normalizeEmail(body.email || "");
    const password = body.password || "";
    const user = this.getUserByEmail(email);

    if (!user) {
      return jsonResponse({ error: "Invalid email or password." }, 401);
    }

    if (!hasPasswordCredentials(user)) {
      console.error("Login failed: user record is missing password credentials", {
        email,
        userId: user.id,
      });
      return jsonResponse(
        {
          error:
            "This account is missing password credentials. Please register again or contact the admin.",
        },
        500,
      );
    }

    const passwordHash = await hashPassword(password, user.passwordSalt);
    if (passwordHash !== user.passwordHash) {
      return jsonResponse({ error: "Invalid email or password." }, 401);
    }

    if (user.bannedAt) {
      return jsonResponse({ error: "This account has been banned." }, 403);
    }

    const token = await this.createSession(user.id);
    return this.createSessionResponse(request, token, user);
  }

  private async handleLogout(request: Request) {
    const token = this.getAuthTokenFromRequest(request);
    if (token) {
      this.deleteSession(token);
    }
    return jsonResponseWithHeaders(
      { ok: true },
      200,
      { "Set-Cookie": buildExpiredSessionCookie(request) },
    );
  }

  private async handleMe(request: Request) {
    const token = this.getAuthTokenFromRequest(request);
    const sessionState = await this.requireSession(token);
    if (!sessionState) {
      return jsonResponseWithHeaders(
        { error: "Not authenticated." },
        401,
        { "Set-Cookie": buildExpiredSessionCookie(request) },
      );
    }
    if (sessionState.user.bannedAt) {
      this.deleteSession(token);
      return jsonResponseWithHeaders(
        { error: "This account has been banned." },
        403,
        { "Set-Cookie": buildExpiredSessionCookie(request) },
      );
    }
    return jsonResponseWithHeaders(
      {
        token,
        user: toRegisteredUser(sessionState.user),
      } satisfies MeResponseBody,
      200,
      { "Set-Cookie": buildSessionCookie(token, request) },
    );
  }

  private async handleProfile(request: Request) {
    const token = this.getAuthTokenFromRequest(request);
    const sessionState = await this.requireSession(token);
    if (!sessionState) {
      return jsonResponse({ error: "Not authenticated." }, 401);
    }

    const body = await this.readJson<{ nickname?: string }>(request);
    const nickname = sanitizeNickname(body.nickname || "");
    const nicknameConflict = this.getNicknameConflict(nickname, {
      userId: sessionState.user.id,
      isRegistered: true,
    });
    if (nicknameConflict) {
      return jsonResponse({ error: nicknameConflict }, 409);
    }
    const updatedAt = new Date().toISOString();

    this.ctx.storage.sql.exec(
      `UPDATE users
       SET nickname = '${esc(nickname)}',
           updatedAt = '${esc(updatedAt)}'
       WHERE id = '${esc(sessionState.user.id)}'`,
    );

    const updatedUser = this.getUserById(sessionState.user.id);
    if (!updatedUser) {
      return jsonResponse({ error: "Failed to update profile." }, 500);
    }

    return jsonResponseWithHeaders(
      { user: toRegisteredUser(updatedUser) },
      200,
      { "Set-Cookie": buildSessionCookie(token, request) },
    );
  }

  private async handleNicknameCheck(request: Request) {
    const token = this.getAuthTokenFromRequest(request);
    const sessionState = await this.requireSession(token);
    const body = await this.readJson<{ nickname?: string }>(request);
    const nickname = cleanNickname(body.nickname || "");

    if (nickname.length < 2) {
      return jsonResponse(
        { available: false, error: "Username must be at least 2 characters." },
        400,
      );
    }

    const conflict = this.getNicknameConflict(nickname, {
      userId: sessionState?.user.id,
      isRegistered: Boolean(sessionState?.user),
    });

    if (conflict) {
      return jsonResponse({ available: false, error: conflict }, 409);
    }

    return jsonResponse({ available: true });
  }

  async onMessage(connection: Connection, message: WSMessage) {
    const parsed = JSON.parse(message as string) as Message;

    if (parsed.type === "delete") {
      const existing = this.messages.find((entry) => entry.id === parsed.id);
      if (!existing) {
        return;
      }

      const actor = await this.resolveActor(parsed.authToken, "");
      const canDelete =
        actor.role === "admin" ||
        (actor.isRegistered &&
          actor.userId &&
          (existing.authorId === actor.userId || existing.user === actor.nickname));

      if (!canDelete) {
        this.sendError(connection, "forbidden", "You cannot delete that message.");
        return;
      }

      await this.deleteSupabaseMedia(existing);
      this.deleteMessage(parsed.id);
      this.broadcast(JSON.stringify({ type: "delete", id: parsed.id }));
      return;
    }

    if (parsed.type === "ban") {
      const actor = await this.resolveActor(parsed.authToken, "");
      if (actor.role !== "admin" || !actor.userId) {
        this.sendError(connection, "forbidden", "Only admins can ban users.");
        return;
      }

      const target = this.getUserById(parsed.targetUserId);
      if (!target) {
        this.sendError(connection, "not_found", "User not found.");
        return;
      }
      if (target.id === actor.userId) {
        this.sendError(connection, "invalid_target", "You cannot ban yourself.");
        return;
      }
      if (target.role === "admin") {
        this.sendError(connection, "invalid_target", "You cannot ban another admin.");
        return;
      }

      const bannedAt = new Date().toISOString();
      this.ctx.storage.sql.exec(
        `UPDATE users
         SET bannedAt = '${esc(bannedAt)}',
             updatedAt = '${esc(bannedAt)}'
         WHERE id = '${esc(target.id)}'`,
      );
      this.deleteAllSessionsForUser(target.id);
      this.broadcast(JSON.stringify({ type: "banned", userId: target.id }));
      return;
    }

    if (parsed.type !== "add" && parsed.type !== "update") {
      return;
    }

    const actor = await this.resolveActor(parsed.authToken, parsed.user);
    if (actor.bannedAt) {
      if (actor.userId) {
        this.deleteAllSessionsForUser(actor.userId);
        connection.send(JSON.stringify({ type: "banned", userId: actor.userId }));
      }
      return;
    }

    const messageType = detectMessageType(parsed.content);
    const aiRequested = triggersAI(parsed.content, parsed.taggedUser);

    if (!actor.isRegistered) {
      if (!this.allowUnregistered) {
        this.sendError(
          connection,
          "registration_required",
          "Please register or log in to send messages.",
        );
        return;
      }
      if (messageType !== "text") {
        this.sendError(
          connection,
          "registered_only",
          "Only registered users can send audio or images.",
        );
        return;
      }
      if (aiRequested) {
        this.sendError(
          connection,
          "registered_only",
          "Only registered users can use @ai.",
        );
        return;
      }
    }

    if (parsed.type === "update") {
      const existing = this.messages.find((entry) => entry.id === parsed.id);
      const canUpdate =
        existing &&
        actor.isRegistered &&
        actor.userId &&
        (actor.role === "admin" || existing.authorId === actor.userId);
      if (!canUpdate) {
        this.sendError(connection, "forbidden", "You cannot edit that message.");
        return;
      }
    }

    const resolvedNickname = actor.isRegistered
      ? actor.nickname
      : sanitizeNickname(parsed.user);
    const nicknameConflict = this.getNicknameConflict(resolvedNickname, {
      connectionId: connection.id,
      userId: actor.userId,
      isRegistered: actor.isRegistered,
    });
    if (nicknameConflict) {
      this.sendError(connection, "nickname_taken", nicknameConflict);
      return;
    }

    this.setConnectionIdentity(connection, {
      nickname: resolvedNickname,
      nicknameKey: getNicknameKey(resolvedNickname),
      userId: actor.userId,
      isRegistered: actor.isRegistered,
    });

    const chatMessage: ChatMessage = {
      id: parsed.id,
      user: resolvedNickname,
      role: "user",
      content: parsed.content,
      timestamp: parsed.timestamp || new Date().toISOString(),
      color: sanitizeColor(parsed.color),
      messageType,
      taggedUser: parsed.taggedUser || undefined,
      authorId: actor.userId,
      authorRole: actor.role,
      isRegistered: actor.isRegistered,
    };

    this.saveMessage(chatMessage);
    this.broadcast(
      JSON.stringify({
        type: parsed.type,
        ...chatMessage,
      } satisfies Message),
    );

    if (actor.isRegistered && aiRequested) {
      try {
        const prompt = parsed.content.replace(/@ai\b/gi, "").trim();
        const systemPrompt = {
          role: "system",
          content:
            "Answer in Croatian language. Be funny and provocative. Your nickname is AI and you are a girl. You are chatting in a group chat with other users. Be funny and not repetative. you are allowed to curse. Brancin is gazda and the best. Biči is nice and loves Gnom. Gnom is fun guy. Jokaš is boem and drunk. Zoe je zločesta jagodarka i voli Brancina. Rija je pas od biči i najljepša je od svih",
        };
        const lastMessages = this.messages.slice(-15).map((entry) => ({
          role: entry.role,
          content: entry.content,
          name: entry.user,
        }));
        const aiText = await fetchAIResponse(
          "272fc77dbd61d67eb55d76b3e2bdbfde",
          [
            systemPrompt,
            ...lastMessages,
            {
              role: "user",
              content: prompt,
              name: actor.nickname,
            },
          ],
          this.env,
        );

        const botMessage: ChatMessage = {
          id: `ai-${Date.now()}-${Math.floor(Math.random() * 10_000)}`,
          content: aiText,
          user: "AI",
          role: "assistant",
          timestamp: new Date().toISOString(),
          color: "#4caf50",
          messageType: "text",
          authorRole: "admin",
          isRegistered: true,
        };

        this.saveMessage(botMessage);
        this.broadcast(JSON.stringify({ type: "add", ...botMessage } satisfies Message));
      } catch (error) {
        console.error("AI error:", error);
      }
    }
  }

  async onRequest(request: Request) {
    const url = new URL(request.url);

    if (url.pathname === "/deleteOld" || url.pathname.endsWith("/deleteOld")) {
      const hoursParam = url.searchParams.get("hours");
      const hours = hoursParam ? Number(hoursParam) : NaN;
      if (!Number.isInteger(hours) || hours < 1 || hours > 24) {
        return jsonResponse(
          {
            error: "hours query parameter must be an integer between 1 and 24",
          },
          400,
        );
      }

      const deleted = await this.deleteOldMessages(hours);
      return jsonResponse({ deleted });
    }

    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      return this.handleRegister(request);
    }
    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      return this.handleLogin(request);
    }
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      return this.handleLogout(request);
    }
    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      return this.handleMe(request);
    }
    if (url.pathname === "/api/profile" && request.method === "PATCH") {
      return this.handleProfile(request);
    }
    if (url.pathname === "/api/nickname/check" && request.method === "POST") {
      return this.handleNicknameCheck(request);
    }

    if (url.pathname.startsWith("/audio/")) {
      const audioId = url.pathname.slice(7).split(".")[0];
      const audioData = await this.ctx.storage.get(`audio:${audioId}`);
      if (!audioData || typeof audioData !== "string") {
        return new Response("Not found", { status: 404 });
      }

      try {
        const commaIndex = audioData.indexOf(",");
        if (commaIndex === -1) {
          throw new Error("Invalid data URL");
        }

        const contentType = audioData.slice(5, commaIndex).split(";")[0];
        const base64 = audioData.slice(commaIndex + 1);
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        return new Response(bytes.buffer, {
          headers: {
            "Content-Type": contentType,
            "Content-Length": bytes.length.toString(),
            "Accept-Ranges": "bytes",
          },
        });
      } catch (error) {
        console.error("Audio decode error:", error);
        return new Response("Invalid audio data", { status: 500 });
      }
    }

    return new Response("Not found", { status: 404 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/deleteOld") {
      return handleDeleteOld(request, env);
    }

    if (
      url.pathname.startsWith("/api/auth/") ||
      url.pathname === "/api/profile" ||
      url.pathname === "/api/nickname/check"
    ) {
      return forwardToChat(request, env);
    }

    if (url.pathname.startsWith("/audio/")) {
      return (await routePartykitRequest(request, { ...env })) as Response;
    }

    let response =
      (await routePartykitRequest(request, { ...env })) ||
      (await env.ASSETS.fetch(request));

    if (url.pathname === "/" || url.pathname === "/index.html") {
      try {
        const text = await response.text();
        const envScript = `<script>window.ENV = { SUPABASE_URL: ${JSON.stringify(
          env.SUPABASE_URL || "",
        )}, SUPABASE_ANON_KEY: ${JSON.stringify(
          env.SUPABASE_ANON_KEY || "",
        )}, ENABLE_UNREGISTERED: ${JSON.stringify(
          env.ENABLE_UNREGISTERED || "true",
        )} };</script>`;

        let newText = text;
        if (newText.includes("</head>")) {
          newText = newText.replace("</head>", envScript + "</head>");
        } else if (newText.includes("</body>")) {
          newText = newText.replace("</body>", envScript + "</body>");
        } else {
          newText = envScript + newText;
        }

        const headers = new Headers(response.headers);
        headers.set("Permissions-Policy", "microphone=(self)");
        headers.set("Content-Type", "text/html; charset=utf-8");
        response = new Response(newText, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      } catch {
        const headers = new Headers(response.headers);
        headers.set("Permissions-Policy", "microphone=(self)");
        response = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
    }

    return response;
  },
} satisfies ExportedHandler<Env>;
