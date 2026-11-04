const SESSION_COOKIE = "soms_admin_session";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const encoder = new TextEncoder();

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function encodeBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function createSigningKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function readCookie(request, name) {
  const cookies = request.headers.get("cookie") || "";
  const entry = cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : "";
}

async function hasValidSession(request, secret) {
  const [expiresAt, signature, extra] = readCookie(request, SESSION_COOKIE).split(".");
  if (extra !== undefined || !/^\d{13}$/.test(expiresAt) || !/^[A-Za-z0-9_-]+$/.test(signature)) return false;
  const expiration = Number(expiresAt);
  if (expiration <= Date.now() || expiration > Date.now() + SESSION_DURATION_MS) return false;

  try {
    const key = await createSigningKey(secret);
    return await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(signature),
      encoder.encode(`soms-fragrance-admin:${expiresAt}`),
    );
  } catch {
    return false;
  }
}

async function passwordsMatch(candidate, expected) {
  const candidateDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(candidate)));
  const expectedDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(expected)));
  let difference = 0;
  for (let index = 0; index < candidateDigest.length; index += 1) {
    difference |= candidateDigest[index] ^ expectedDigest[index];
  }
  return difference === 0;
}

function isSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export default async function adminAccess(request, context) {
  const url = new URL(request.url);
  const isAdminPage = ["/admin", "/admin/", "/admin.html"].includes(url.pathname);
  const isLogin = url.pathname === "/admin-login";
  const isLogout = url.pathname === "/admin-logout";
  const isCatalogApi = url.pathname === "/api/catalog";
  if (!isAdminPage && !isLogin && !isLogout && !isCatalogApi) return;

  if ((isLogin || isLogout) && request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
  }
  if (isCatalogApi && !["GET", "PUT"].includes(request.method)) {
    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET, PUT" });
  }
  if ((isLogin || isLogout || (isCatalogApi && request.method === "PUT")) && !isSameOrigin(request)) {
    return jsonResponse({ error: "Request rejected." }, 403);
  }

  const password = Netlify.env.get("ADMIN_PASSWORD");
  const sessionSecret = Netlify.env.get("ADMIN_SESSION_SECRET");
  if (!password || !sessionSecret || sessionSecret.length < 32 || sessionSecret === password) {
    return isAdminPage
      ? new Response("Admin access is not configured.", { status: 503, headers: { "Cache-Control": "no-store" } })
      : jsonResponse({ error: "Secure admin access is not configured on Netlify yet." }, 503);
  }

  if (isLogin) {
    let rawBody;
    let body;
    try {
      rawBody = await request.text();
      if (rawBody.length > 4096) return jsonResponse({ error: "Request is too large." }, 413);
      body = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: "Invalid request." }, 400);
    }

    const submittedPassword = typeof body?.password === "string" ? body.password : "";
    if (!await passwordsMatch(submittedPassword, password)) {
      return jsonResponse({ error: "The password is incorrect." }, 401);
    }

    const expiresAt = String(Date.now() + SESSION_DURATION_MS);
    const key = await createSigningKey(sessionSecret);
    const signature = new Uint8Array(await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`soms-fragrance-admin:${expiresAt}`),
    ));
    const cookie = `${SESSION_COOKIE}=${expiresAt}.${encodeBase64Url(signature)}; Path=/; Max-Age=${SESSION_DURATION_MS / 1000}; HttpOnly; Secure; SameSite=Strict`;
    return jsonResponse({ ok: true }, 200, { "Set-Cookie": cookie });
  }

  if (isLogout) {
    return jsonResponse({ ok: true }, 200, {
      "Set-Cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
    });
  }

  if (!await hasValidSession(request, sessionSecret)) {
    return Response.redirect(new URL("/?admin=1", request.url), 303);
  }

  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const config = {
  path: ["/admin", "/admin/", "/admin.html", "/admin-login", "/admin-logout", "/api/catalog"],
};
