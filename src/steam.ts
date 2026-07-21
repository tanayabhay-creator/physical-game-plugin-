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

async function findExistingShortcutAppId(
  appName: string,
  exePath: string
): Promise<string | null> {
  const apps = window.SteamClient?.Apps;
  if (!apps?.GetAllApps) {
    return null;
  }

  try {
    const all = await Promise.resolve(apps.GetAllApps());
    if (!Array.isArray(all)) {
      return null;
    }

    for (const app of all) {
      const name = String(app?.display_name ?? app?.strDisplayName ?? app?.name ?? "");
      const exe = String(app?.strExePath ?? app?.exe ?? app?.Exe ?? "");
      const appid = asIdString(app?.appid ?? app?.appId ?? app?.unAppID);
      if (!appid) {
        continue;
      }
      if (name === appName || (exe && exePath && exe.includes(exePath))) {
        return appid;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

async function configureShortcut(
  appId: string,
  req: SteamShortcutRequest
): Promise<void> {
  const apps = window.SteamClient?.Apps;
  if (!apps) {
    return;
  }

  const startDir = resolveStartDir(req);
  const numericId = Number(appId);

  try {
    if (typeof apps.SetShortcutName === "function") {
      await Promise.resolve(apps.SetShortcutName(numericId, req.game_name));
    }
  } catch {
    // ignore
  }
  try {
    if (typeof apps.SetShortcutExe === "function") {
      await Promise.resolve(apps.SetShortcutExe(numericId, `"${req.exe}"`));
    }
  } catch {
    // ignore
  }
  try {
    if (typeof apps.SetShortcutStartDir === "function" && startDir) {
      await Promise.resolve(apps.SetShortcutStartDir(numericId, `"${startDir}"`));
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

  // Required for Windows .exe Non-Steam games on Steam Deck.
  // Without this, Steam often shows: "Game configuration unavailable".
  const compat = resolveCompatTool(req);
  if (compat && typeof apps.SpecifyCompatTool === "function") {
    const tools = [compat, "proton_experimental", "proton_hotfix", "proton_9"];
    const unique = [...new Set(tools.filter(Boolean))];
    for (const tool of unique) {
      try {
        await Promise.resolve(apps.SpecifyCompatTool(numericId, tool));
        console.log("PML SpecifyCompatTool", appId, tool);
        break;
      } catch (err) {
        console.warn("SpecifyCompatTool failed", tool, err);
      }
    }
  }

  await sleep(400);
}

async function runGame(appId: string, launchOptions = ""): Promise<boolean> {
  const apps = window.SteamClient?.Apps;
  if (!apps || typeof apps.RunGame !== "function") {
    return false;
  }
  const id = asIdString(appId);
  if (!id) {
    return false;
  }

  const attempts: Array<[number, number]> = [
    [-1, 0],
    [0, 0],
    [-1, 1],
  ];
  for (const [param2, launchSource] of attempts) {
    try {
      await Promise.resolve(apps.RunGame(id, launchOptions || "", param2, launchSource));
      console.log("PML RunGame", id, param2, launchSource);
      return true;
    } catch (err) {
      console.warn("RunGame string id failed", id, param2, err);
    }
    try {
      await Promise.resolve(
        apps.RunGame(Number(id), launchOptions || "", param2, launchSource)
      );
      console.log("PML RunGame(number)", id, param2, launchSource);
      return true;
    } catch (err) {
      console.warn("RunGame number id failed", id, param2, err);
    }
  }
  return false;
}

/**
 * Ensure a Non-Steam shortcut exists and is configured (exe/start dir/Proton).
 * Returns the SteamClient AppID that must be used with RunGame.
 */
export async function ensureConfiguredShortcut(
  req: SteamShortcutRequest
): Promise<string> {
  const apps = window.SteamClient?.Apps;
  if (!apps?.AddShortcut) {
    throw new Error("SteamClient.Apps.AddShortcut is unavailable");
  }

  const startDir = resolveStartDir(req);
  let appId =
    asIdString(req.steam_app_id) ||
    (await findExistingShortcutAppId(req.game_name, req.exe));

  if (!appId) {
    // AddShortcut signatures vary across Steam builds; try common ones.
    let created: unknown;
    try {
      created = await Promise.resolve(
        apps.AddShortcut(req.game_name, req.exe, req.launch_options || "", "")
      );
    } catch {
      created = await Promise.resolve(
        apps.AddShortcut(req.game_name, req.exe, startDir, req.launch_options || "")
      );
    }
    appId = asIdString(created as number | string);
  }

  if (!appId) {
    throw new Error("SteamClient did not return a shortcut AppID");
  }

  await configureShortcut(appId, { ...req, start_dir: startDir });
  return appId;
}

export async function addGameToSteam(
  req: SteamShortcutRequest
): Promise<{ ok: boolean; appId?: number; error?: string }> {
  try {
    const appId = await ensureConfiguredShortcut(req);
    return { ok: true, appId: Number(appId) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Configure shortcut (with Proton for .exe) and launch via RunGame only.
 * Do NOT use steam://rungameid with VDF-computed IDs — those cause
 * "Game configuration unavailable" when they don't match SteamClient's AppID.
 */
export async function launchSteamGame(
  req: SteamShortcutRequest
): Promise<{ ok: boolean; appId?: number; error?: string }> {
  try {
    if (!req.exe) {
      return {
        ok: false,
        error: "Missing exe path — transfer may not have finished",
      };
    }

    const appId = await ensureConfiguredShortcut(req);
    const ok = await runGame(appId, req.launch_options || "");
    if (!ok) {
      return {
        ok: false,
        appId: Number(appId),
        error: `SteamClient.Apps.RunGame failed for AppID ${appId}`,
      };
    }
    return { ok: true, appId: Number(appId) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
