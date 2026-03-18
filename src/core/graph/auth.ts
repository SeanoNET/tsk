import {
  PublicClientApplication,
  type AuthenticationResult,
  type ICachePlugin,
  type TokenCacheContext,
  type Configuration,
} from "@azure/msal-node";
import { join } from "path";
import { homedir } from "os";
import { readConfig } from "../config.js";

const AUTHORITY = "https://login.microsoftonline.com/common";
const SCOPES = ["Tasks.ReadWrite", "Calendars.ReadWrite", "offline_access", "User.Read"];

function authCachePath(): string {
  // Store outside ~/.tsk/ to avoid committing tokens to git
  let dir: string;
  if (process.platform === "win32") {
    dir = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  } else {
    dir = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  }
  return join(dir, "tsk", "auth.json");
}

function createCachePlugin(): ICachePlugin {
  const cachePath = authCachePath();
  return {
    async beforeCacheAccess(ctx: TokenCacheContext): Promise<void> {
      const file = Bun.file(cachePath);
      if (await file.exists()) {
        const data = await file.text();
        ctx.tokenCache.deserialize(data);
      }
    },
    async afterCacheAccess(ctx: TokenCacheContext): Promise<void> {
      if (ctx.cacheHasChanged) {
        const { mkdir } = await import("fs/promises");
        await mkdir(join(cachePath, ".."), { recursive: true });
        await Bun.write(cachePath, ctx.tokenCache.serialize());
      }
    },
  };
}

function createMsalConfig(clientId: string): Configuration {
  return {
    auth: {
      clientId,
      authority: AUTHORITY,
    },
    cache: {
      cachePlugin: createCachePlugin(),
    },
  };
}

async function resolveClientId(clientId?: string): Promise<string> {
  if (clientId) return clientId;
  const config = await readConfig();
  const id = config.sync?.clientId;
  if (!id) {
    throw new Error(
      "No client ID configured. Set sync.clientId in ~/.tsk/config.toml\n" +
        "  (Register an app at https://portal.azure.com → App registrations → New registration\n" +
        "   with 'Mobile and desktop applications' redirect and 'Accounts in any organizational\n" +
        "   directory and personal Microsoft accounts' audience)"
    );
  }
  return id;
}

// Singleton PCA instance — avoids re-reading the cache file on every call
let cachedApp: PublicClientApplication | null = null;
let cachedClientId: string | null = null;

async function getApp(clientId?: string): Promise<PublicClientApplication> {
  const id = await resolveClientId(clientId);
  if (cachedApp && cachedClientId === id) return cachedApp;
  cachedApp = new PublicClientApplication(createMsalConfig(id));
  cachedClientId = id;
  return cachedApp;
}

export async function login(clientId?: string): Promise<AuthenticationResult> {
  const app = await getApp(clientId);
  const result = await app.acquireTokenByDeviceCode({
    scopes: SCOPES,
    deviceCodeCallback(response) {
      console.log(response.message);
    },
  });
  if (!result) throw new Error("Authentication failed — no result returned");
  return result;
}

export async function getAccessToken(
  clientId?: string,
  forceRefresh = false
): Promise<string> {
  const app = await getApp(clientId);
  const accounts = await app.getTokenCache().getAllAccounts();
  if (accounts.length === 0) {
    throw new Error("Not signed in. Run `tsk auth` to sign in.");
  }
  try {
    const result = await app.acquireTokenSilent({
      scopes: SCOPES,
      account: accounts[0],
      forceRefresh,
    });
    return result.accessToken;
  } catch {
    throw new Error("Token expired. Run `tsk auth` to sign in again.");
  }
}

export async function isAuthenticated(clientId?: string): Promise<boolean> {
  try {
    const app = await getApp(clientId);
    const accounts = await app.getTokenCache().getAllAccounts();
    return accounts.length > 0;
  } catch {
    return false;
  }
}

export async function getAccountInfo(
  clientId?: string
): Promise<{ name: string; email: string } | null> {
  const app = await getApp(clientId);
  const accounts = await app.getTokenCache().getAllAccounts();
  if (accounts.length === 0) return null;
  const account = accounts[0];
  return {
    name: account.name ?? account.username,
    email: account.username,
  };
}

export async function logout(): Promise<void> {
  const path = authCachePath();
  const file = Bun.file(path);
  if (await file.exists()) {
    const { unlink } = await import("fs/promises");
    await unlink(path);
  }
  // Clear cached app so next login starts fresh
  cachedApp = null;
  cachedClientId = null;
}
