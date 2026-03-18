import { getAccessToken } from "./auth.js";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export async function graphFetch(
  path: string,
  options: RequestInit = {},
  clientId?: string
): Promise<Response> {
  const token = await getAccessToken(clientId);
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");

  let response = await fetch(url, { ...options, headers });

  // Retry once on 401 with forced token refresh
  if (response.status === 401) {
    const freshToken = await getAccessToken(clientId, true);
    headers.set("Authorization", `Bearer ${freshToken}`);
    response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
      throw new Error("Authentication failed. Run `tsk auth` to sign in again.");
    }
  }

  // Respect 429 Retry-After
  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get("Retry-After") ?? "5", 10);
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    response = await fetch(url, { ...options, headers });
  }

  return response;
}

export async function graphGet<T>(path: string, clientId?: string): Promise<T> {
  const response = await graphFetch(path, { method: "GET" }, clientId);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Graph GET ${path} failed (${response.status}): ${body}`);
  }
  return response.json() as Promise<T>;
}

export async function graphPost<T>(path: string, body: unknown, clientId?: string): Promise<T> {
  const response = await graphFetch(
    path,
    { method: "POST", body: JSON.stringify(body) },
    clientId
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Graph POST ${path} failed (${response.status}): ${text}`);
  }
  return response.json() as Promise<T>;
}

export async function graphPatch<T>(path: string, body: unknown, clientId?: string): Promise<T> {
  const response = await graphFetch(
    path,
    { method: "PATCH", body: JSON.stringify(body) },
    clientId
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Graph PATCH ${path} failed (${response.status}): ${text}`);
  }
  return response.json() as Promise<T>;
}

export async function graphDelete(path: string, clientId?: string): Promise<void> {
  const response = await graphFetch(path, { method: "DELETE" }, clientId);
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`Graph DELETE ${path} failed (${response.status}): ${text}`);
  }
}
