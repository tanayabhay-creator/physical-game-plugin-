/** Steam client helpers for adding/launching Non-Steam shortcuts in Game Mode. */

export type SteamShortcutRequest = {
  game_name: string;
  exe: string;
  start_dir: string;
  launch_options: string;
  compat_tool?: string;
  should_launch?: boolean;
  vdf_launch_id?: number | string;
  steam_app_id?: number | string;
  shortcut_appid?: number | string;
  already_installed?: boolean;
  needs_add_shortcut?: boolean;
};

declare global {
  interface Window {
    SteamClient?: any;
    collectionStore?: any;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asIdString(value: number | string | undefined | null): string {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  const text = String(value).trim();
  if (!text || text === "0" || text === "NaN") {
    return "";
  }
  return text;
}

/** Normalize possibly-signed Steam AppIDs to unsigned 32-bit decimal strings. */
export function toUnsignedAppId(id: string | number): string {
  try {
    let n = BigInt(String(id).trim());
    if (n < 0n) {
      n = n + 0x100000000n;
    }
    return (n & 0xffffffffn).toString();
  } catch {
    return String(id);
  }
}

function looksLikeWindowsExe(exePath: string): boolean {
  return exePath.toLowerCase().endsWith(".exe");
}

function resolveStartDir(req: SteamShortcutRequest): string {
  const start = (req.start_dir || "").trim();
  if (start) {
    return start;
  }
  const exe = (req.exe || "").trim();
  if (!exe) {
    return "";
  }
  const idx = Math.max(exe.lastIndexOf("/"), exe.lastIndexOf("\\"));
  return idx > 0 ? exe.slice(0, idx) : exe;
}

function resolveCompatTool(req: SteamShortcutRequest): string {
  const explicit = (req.compat_tool || "").trim();
  if (explicit) {
    return explicit;
  }
  return looksLikeWindowsExe(req.exe || "") ? "proton_experimental" : "";
}

function quotePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed;
  }
  return `"${trimmed}"`;
}

function appMatches(
  app: any,
  appName: string,
  exePath: string
): string | null {
  const name = String(
    app?.display_name ?? app?.strDisplayName ?? app?.name ?? app?.AppName ?? ""
  );
  const exe = String(
    app?.strExePath ?? app?.exe ?? app?.Exe ?? app?.steam_churn ?? ""
  );
  const appid = asIdString(
    app?.appid ?? app?.appId ?? app?.unAppID ?? app?.appid_for_shortcut
  );
  if (!appid) {
    return null;
  }
  const exeNorm = exePath.replace(/"/g, "");
  const exeField = exe.replace(/"/g, "");
  if (name === appName) {
    return toUnsignedAppId(appid);
  }
  if (exeNorm && exeField && (exeField.includes(exeNorm) || exeNorm.includes(exeField))) {
    return toUnsignedAppId(appid);
  }
  return null;
}

async function findExistingShortcutAppId(
  appName: string,
  exePath: string
): Promise<string | null> {
  try {
    const cs = window.collectionStore;
    const bags: any[] = [
      cs?.allApps,
      cs?.deckDesktopApps?.allApps,
      cs?.deckDesktopApps?.apps,
      cs?.localGames?.allApps,
      cs?.appsList?.allApps,
    ].filter(Boolean);

    for (const bag of bags) {
      const list: any[] = Array.isArray(bag)
        ? bag
        : typeof bag?.values === "function"
          ? Array.from(bag.values())
          : typeof bag?.[Symbol.iterator] === "function"
            ? Array.from(bag)
            : [];
      for (const app of list) {
        const id = appMatches(app, appName, exePath);
        if (id) {
          return id;
        }
      }
    }
  } catch (err) {
    console.warn("PML collectionStore scan failed", err);
  }

  return null;
}

async function pickAvailableCompatTool(
  appId: number,
  preferred: string
): Promise<string> {
  const preferredList = [
    preferred,
    "proton_experimental",
    "proton_hotfix",
    "proton_10",
    "proton_9",
    "proton_8",
  ].filter(Boolean);

  const collectNames = (tools: any): string[] => {
    if (!Array.isArray(tools)) {
      return [];
    }
    return tools
      .map((t) => String(t?.strToolName ?? t?.name ?? t?.toolName ?? ""))
      .filter(Boolean);
  };

  const apps = window.SteamClient?.Apps;
  const settings = window.SteamClient?.Settings;
  let names: string[] = [];

  try {
    if (typeof apps?.GetAvailableCompatTools === "function") {
      names = collectNames(
        await Promise.resolve(apps.GetAvailableCompatTools(appId))
      );
    }
  } catch (err) {
    console.warn("GetAvailableCompatTools failed", err);
  }
  if (!names.length) {
    try {
      if (typeof settings?.GetGlobalCompatTools === "function") {
        names = collectNames(await Promise.resolve(settings.GetGlobalCompatTools()));
      }
    } catch (err) {
      console.warn("GetGlobalCompatTools failed", err);
    }
  }

  if (names.length) {
    for (const want of preferredList) {
      const exact = names.find((n) => n === want);
      if (exact) {
        return exact;
      }
    }
    const proton = names.find(
      (n) => /proton/i.test(n) && !/steam.?linux.?runtime/i.test(n)
    );
    if (proton) {
      return proton;
    }
  }

  return preferredList[0] || "proton_experimental";
}

async function configureShortcut(
  appId: string,
  req: SteamShortcutRequest,
  light = false
): Promise<string> {
  const apps = window.SteamClient?.Apps;
  if (!apps) {
    return "";
  }

  const startDir = resolveStartDir(req);
  const unsigned = toUnsignedAppId(appId);
  const numericId = Number(unsigned);

  if (!light) {
    try {
      if (typeof apps.SetShortcutName === "function") {
        await Promise.resolve(apps.SetShortcutName(numericId, req.game_name));
      }
    } catch {
      // ignore
    }
    try {
      if (typeof apps.SetShortcutExe === "function") {
        await Promise.resolve(apps.SetShortcutExe(numericId, quotePath(req.exe)));
      }
    } catch {
      // ignore
    }
    try {
      if (typeof apps.SetShortcutStartDir === "function" && startDir) {
        await Promise.resolve(
          apps.SetShortcutStartDir(numericId, quotePath(startDir))
        );
      }
    } catch {
      // ignore
    }
    try {
      if (typeof apps.SetShortcutLaunchOptions === "function") {
        await Promise.resolve(
          apps.SetShortcutLaunchOptions(numericId, req.launch_options || "")
        );
      }
    } catch {
      // ignore
    }
  }

  let applied = "";
  const preferred = resolveCompatTool(req);
  if (preferred && typeof apps.SpecifyCompatTool === "function") {
    const tool = await pickAvailableCompatTool(numericId, preferred);
    try {
      apps.SpecifyCompatTool(numericId, tool);
      applied = tool;
      console.log("PML SpecifyCompatTool", unsigned, tool);
    } catch (err) {
      console.warn("SpecifyCompatTool failed", tool, err);
    }
  }

  // Short settle only — long waits + multi-launch previously froze Game Mode.
  await sleep(light ? 400 : 800);
  return applied;
}

/**
 * Single safe launch: SteamClient.Apps.RunGame once.
 * Do NOT use location.href / multiple steam:// URIs — that freezes Game Mode
 * (black screen) when fired from a Decky plugin.
 */
async function runGameOnce(appId: string, launchOptions = ""): Promise<boolean> {
  const apps = window.SteamClient?.Apps;
  if (!apps || typeof apps.RunGame !== "function") {
    return false;
  }
  const id = toUnsignedAppId(appId);
  if (!id) {
    return false;
  }

  try {
    // Common Non-Steam / Decky signature.
    apps.RunGame(id, launchOptions || "", -1, 0);
    console.log("PML RunGame once", id);
    return true;
  } catch (err) {
    console.warn("RunGame(-1,0) failed", err);
  }
  try {
    apps.RunGame(id, launchOptions || "", 0, 0);
    console.log("PML RunGame once fallback", id);
    return true;
  } catch (err) {
    console.warn("RunGame(0,0) failed", err);
  }
  return false;
}

export async function ensureConfiguredShortcut(
  req: SteamShortcutRequest,
  opts?: { lightConfigure?: boolean }
): Promise<{ appId: string; compatTool: string }> {
  const apps = window.SteamClient?.Apps;
  if (!apps?.AddShortcut) {
    throw new Error("SteamClient.Apps.AddShortcut is unavailable");
  }

  const startDir = resolveStartDir(req);
  let appId = await findExistingShortcutAppId(req.game_name, req.exe);

  const saved = asIdString(req.steam_app_id);
  const vdfId = asIdString(req.shortcut_appid);

  if (!appId && saved && saved !== vdfId && req.needs_add_shortcut === false) {
    console.log("PML reusing SteamClient AppID", saved);
    appId = toUnsignedAppId(saved);
  }

  if (!appId) {
    console.log(
      "PML AddShortcut",
      req.game_name,
      req.exe,
      startDir,
      req.launch_options || ""
    );
    const created = await Promise.resolve(
      apps.AddShortcut(
        req.game_name,
        req.exe,
        startDir,
        req.launch_options || ""
      )
    );
    appId = toUnsignedAppId(String(created));
    console.log("PML AddShortcut returned", appId);
  }

  if (!appId) {
    throw new Error("SteamClient.Apps.AddShortcut did not return an AppID");
  }

  const compatTool = await configureShortcut(
    appId,
    { ...req, start_dir: startDir },
    opts?.lightConfigure === true
  );

  return { appId, compatTool };
}

export async function addGameToSteam(
  req: SteamShortcutRequest
): Promise<{
  ok: boolean;
  appId?: number;
  compatTool?: string;
  error?: string;
}> {
  try {
    const { appId, compatTool } = await ensureConfiguredShortcut(req);
    return { ok: true, appId: Number(appId), compatTool };
  } catch (err) {
    // Never soft-restart Steam from here — that can black-screen Game Mode.
    return { ok: false, error: String(err) };
  }
}

export async function launchSteamGame(
  req: SteamShortcutRequest
): Promise<{
  ok: boolean;
  appId?: number;
  compatTool?: string;
  error?: string;
}> {
  try {
    if (!req.exe) {
      return {
        ok: false,
        error: "Missing exe path — transfer may not have finished",
      };
    }

    // Prefer existing library entry; only light-touch Proton before one RunGame.
    const existing = await findExistingShortcutAppId(req.game_name, req.exe);
    let appId = existing || "";
    let compatTool = "";

    if (appId) {
      compatTool = await configureShortcut(appId, req, true);
    } else {
      const ensured = await ensureConfiguredShortcut(req, {
        lightConfigure: false,
      });
      appId = ensured.appId;
      compatTool = ensured.compatTool;
    }

    console.log(
      "PML launching once",
      req.game_name,
      "appId=",
      appId,
      "compat=",
      compatTool,
      "exe=",
      req.exe
    );

    const ok = await runGameOnce(appId, req.launch_options || "");
    if (!ok) {
      return {
        ok: false,
        appId: Number(appId),
        compatTool,
        error: `RunGame failed for AppID ${appId}. Open the Non-Steam shortcut manually once.`,
      };
    }
    return { ok: true, appId: Number(appId), compatTool };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
