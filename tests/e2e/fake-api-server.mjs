import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const port = Number(process.env.FAKE_API_PORT ?? 54321);
const state = {
  users: new Map(),
  tokens: new Map(),
  verificationTokens: new Map(),
  messages: new Map(),
  envelopes: new Map(),
  documents: new Map(),
  devices: new Map(),
  calls: [],
  providerKeySeen: false,
  syncAuthChecks: [],
};

function headers(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "apikey,authorization,content-type,prefer,x-client-info",
  );
  res.setHeader("Access-Control-Max-Age", "3600");
}

function json(res, status, body) {
  headers(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function empty(res, status = 204) {
  headers(res);
  res.writeHead(status);
  res.end();
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.includes("e2e-local-only-provider-key")) state.providerKeySeen = true;
  return raw ? JSON.parse(raw) : {};
}

function userPayload(user) {
  return {
    id: user.id,
    email: user.email,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { display_name: user.name },
    created_at: user.createdAt,
    updated_at: user.updatedAt,
    email_confirmed_at: user.confirmed ? user.confirmedAt : null,
    confirmation_sent_at: user.createdAt,
    identities: [],
    is_anonymous: false,
  };
}

function issueSession(user) {
  const accessToken = `e2e-access-${user.id}`;
  const refreshToken = `e2e-refresh-${user.id}`;
  state.tokens.set(accessToken, user.id);
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: userPayload(user),
  };
}

function userForRequest(req) {
  const authorization = req.headers.authorization ?? "";
  const token = authorization.replace(/^Bearer\s+/iu, "");
  const userId = state.tokens.get(token);
  return userId ? [...state.users.values()].find((user) => user.id === userId) : undefined;
}

function logCall(req, pathname) {
  state.calls.push({ method: req.method, path: pathname });
}

function mailboxFor(email) {
  return state.messages.get(email.toLowerCase()) ?? [];
}

function putMailboxMessage(email, message) {
  const key = email.toLowerCase();
  const messages = mailboxFor(key);
  messages.push(message);
  state.messages.set(key, messages);
}

function collection(map, userId) {
  if (!map.has(userId)) map.set(userId, new Map());
  return map.get(userId);
}

const server = createServer(async (req, res) => {
  headers(res);
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  const pathname = url.pathname;

  if (req.method === "OPTIONS") return empty(res);
  if (pathname === "/__test/health") return json(res, 200, { ok: true });
  if (pathname === "/__test/reset" && req.method === "POST") {
    state.users.clear();
    state.tokens.clear();
    state.verificationTokens.clear();
    state.messages.clear();
    state.envelopes.clear();
    state.documents.clear();
    state.devices.clear();
    state.calls = [];
    state.providerKeySeen = false;
    state.syncAuthChecks = [];
    return json(res, 200, { ok: true });
  }
  if (pathname === "/__test/state") {
    return json(res, 200, {
      users: [...state.users.values()].map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        confirmed: user.confirmed,
      })),
      documents: [...state.documents.values()].flatMap((records) => [...records.values()]),
      devices: [...state.devices.values()].flatMap((records) => [...records.values()]),
      calls: state.calls,
      providerKeySeen: state.providerKeySeen,
      syncAuthChecks: state.syncAuthChecks,
    });
  }
  if (pathname === "/__test/mailbox") {
    return json(res, 200, { messages: mailboxFor(url.searchParams.get("email") ?? "") });
  }

  if (pathname === "/auth/v1/signup" && req.method === "POST") {
    logCall(req, pathname);
    const body = await readBody(req);
    const email = String(body.email ?? "").toLowerCase();
    if (!email || state.users.has(email))
      return json(res, 422, { code: "user_already_exists", msg: "User already registered" });
    const user = {
      id: randomUUID(),
      email,
      name: String(body.data?.display_name ?? ""),
      password: String(body.password ?? ""),
      confirmed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.users.set(email, user);
    const redirectTo = url.searchParams.get("redirect_to") ?? "http://127.0.0.1:4173/app";
    const token = randomUUID();
    state.verificationTokens.set(token, { userId: user.id, type: "signup", redirectTo });
    putMailboxMessage(email, {
      type: "signup",
      link: `http://127.0.0.1:${port}/auth/v1/verify?token=${token}&type=signup&redirect_to=${encodeURIComponent(redirectTo)}`,
    });
    return json(res, 200, { user: userPayload(user), session: null });
  }

  if (pathname === "/auth/v1/verify" && req.method === "GET") {
    logCall(req, pathname);
    const token = url.searchParams.get("token") ?? "";
    const entry = state.verificationTokens.get(token);
    if (!entry)
      return json(res, 400, { code: "otp_expired", msg: "Email link is invalid or expired" });
    const user = [...state.users.values()].find((candidate) => candidate.id === entry.userId);
    if (!user) return json(res, 400, { msg: "User not found" });
    if (entry.type === "signup") {
      user.confirmed = true;
      user.confirmedAt = new Date().toISOString();
    }
    if (entry.type === "recovery") user.recoveryAuthorized = true;
    state.verificationTokens.delete(token);
    const session = issueSession(user);
    const redirectTo = new URL(entry.redirectTo);
    redirectTo.hash = new URLSearchParams({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: String(session.expires_in),
      token_type: "bearer",
      type: entry.type,
    }).toString();
    headers(res);
    res.writeHead(302, { Location: redirectTo.toString() });
    return res.end();
  }

  if (pathname === "/auth/v1/token" && req.method === "POST") {
    logCall(req, pathname);
    const body = await readBody(req);
    const grant = url.searchParams.get("grant_type");
    if (grant === "password") {
      const user = state.users.get(String(body.email ?? "").toLowerCase());
      if (!user || user.password !== body.password)
        return json(res, 400, { code: "invalid_credentials", msg: "Invalid login credentials" });
      if (!user.confirmed)
        return json(res, 400, { code: "email_not_confirmed", msg: "Email not confirmed" });
      return json(res, 200, issueSession(user));
    }
    if (grant === "refresh_token") {
      const token = String(body.refresh_token ?? "");
      const userId = token.startsWith("e2e-refresh-") ? token.slice("e2e-refresh-".length) : "";
      const user = [...state.users.values()].find((candidate) => candidate.id === userId);
      return user
        ? json(res, 200, issueSession(user))
        : json(res, 400, { msg: "Invalid refresh token" });
    }
  }

  if (pathname === "/auth/v1/recover" && req.method === "POST") {
    logCall(req, pathname);
    const body = await readBody(req);
    const user = state.users.get(String(body.email ?? "").toLowerCase());
    if (user) {
      const token = randomUUID();
      const redirectTo =
        url.searchParams.get("redirect_to") ?? "http://127.0.0.1:4173/reset-password";
      state.verificationTokens.set(token, { userId: user.id, type: "recovery", redirectTo });
      putMailboxMessage(user.email, {
        type: "recovery",
        link: `http://127.0.0.1:${port}/auth/v1/verify?token=${token}&type=recovery&redirect_to=${encodeURIComponent(redirectTo)}`,
      });
    }
    return json(res, 200, {});
  }

  if (pathname === "/auth/v1/user" && req.method === "GET") {
    logCall(req, pathname);
    const user = userForRequest(req);
    return user ? json(res, 200, userPayload(user)) : json(res, 401, { msg: "Invalid token" });
  }

  if (pathname === "/auth/v1/user" && (req.method === "PATCH" || req.method === "PUT")) {
    logCall(req, pathname);
    const user = userForRequest(req);
    const body = await readBody(req);
    if (!user || !user.recoveryAuthorized)
      return json(res, 401, { msg: "Recovery session required" });
    if (typeof body.password === "string") {
      user.password = body.password;
      user.updatedAt = new Date().toISOString();
      user.recoveryAuthorized = false;
    }
    return json(res, 200, userPayload(user));
  }

  if (pathname === "/auth/v1/logout" && req.method === "POST") {
    logCall(req, pathname);
    return empty(res);
  }

  if (pathname.startsWith("/md/v1/")) {
    const authorization = req.headers.authorization ?? "";
    const token = authorization.replace(/^Bearer\s+/iu, "");
    const user = userForRequest(req);
    state.syncAuthChecks.push({
      hasAuthorization: Boolean(authorization),
      tokenKnown: state.tokens.has(token),
      matched: Boolean(user),
    });
    if (!user) return json(res, 401, { message: "Sign-in required" });
    logCall(req, pathname);
    const collectionName = pathname.slice("/md/v1/".length).split("/")[0];
    if (collectionName === "key_envelopes") {
      const records = collection(state.envelopes, user.id);
      if (req.method === "GET") return json(res, 200, [...records.values()]);
      if (req.method === "POST") {
        const body = await readBody(req);
        const row = { user_id: user.id, ...body };
        records.set(user.id, row);
        return json(res, 201, [row]);
      }
    }
    if (collectionName === "devices" && req.method === "POST") {
      const body = await readBody(req);
      const records = collection(state.devices, user.id);
      const row = { user_id: user.id, ...body };
      records.set(String(body.device_id), row);
      return json(res, 201, [row]);
    }
    if (collectionName === "documents") {
      const records = collection(state.documents, user.id);
      if (req.method === "GET") return json(res, 200, [...records.values()]);
      if (req.method === "POST") {
        const body = await readBody(req);
        const documentId = String(body.document_id ?? "");
        const previous = records.get(documentId);
        const row = {
          user_id: user.id,
          document_id: documentId,
          device_id: String(body.device_id ?? ""),
          payload_ciphertext: String(body.payload_ciphertext ?? ""),
          payload_iv: String(body.payload_iv ?? ""),
          revision: (previous?.revision ?? 0) + 1,
          updated_at: new Date().toISOString(),
          deleted_at: body.deleted_at ?? null,
        };
        records.set(documentId, row);
        return json(res, previous ? 200 : 201, [row]);
      }
    }
    return json(res, 404, { message: "Unknown fake API route" });
  }

  return json(res, 404, { message: "Unknown fake API route" });
});

server.listen(port, "127.0.0.1");
