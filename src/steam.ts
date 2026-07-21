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
    return appid;
  }
  if (exeNorm && exeField && (exeField.includes(exeNorm) || exeNorm.includes(exeField))) {
    return appid;
  }
  return null;
}

/**
 * Find a Non-Steam shortcut that is already visible in the live Game Mode library.
 * Never treat VDF CRC32 IDs as proof the shortcut is live.
 */
async function findExistingShortcutAppId(
  appName: string,
  exePath: string
): Promise<string | null> {
  // collectionStore is what Game Mode's library actually uses.
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
          console.log("PML found existing shortcut in collectionStore", id);
          return id;
        }
      }
    }
  } catch (err) {
    console.warn("PML collectionStore scan failed", err);
  }

  const apps = window.SteamClient?.Apps;
  if (apps?.GetAllApps) {
    try {
      const all = await Promise.resolve(apps.GetAllApps());
      if (Array.isArray(all)) {
        for (const app of all) {
          const id = appMatches(app, appName, exePath);
          if (id) {
            console.log("PML found existing shortcut in GetAllApps", id);
            return id;
          }
        }
      }
    } catch (err) {
      console.warn("PML GetAllApps scan failed", err);
    }
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
      // Steam expects quoted exe paths for Non-Steam shortcuts.
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

  await sleep(500);
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

export function softRestartSteam(): boolean {
  try {
    const sc = window.SteamClient;
    if (typeof sc?.User?.StartRestart === "function") {
      sc.User.StartRestart(false);
      console.log("PML SteamClient.User.StartRestart(false)");
      return true;
    }
  } catch (err) {
    console.warn("StartRestart failed", err);
  }
  return false;
}

/**
 * Ensure a Non-Steam shortcut exists in the LIVE Game Mode library.
 * Always calls AddShortcut when the game is not already visible — never trust
 * VDF CRC32 IDs alone (those only show up after a Steam restart).
 */
export async function ensureConfiguredShortcut(
  req: SteamShortcutRequest
): Promise<string> {
  const apps = window.SteamClient?.Apps;
  if (!apps?.AddShortcut) {
    throw new Error("SteamClient.Apps.AddShortcut is unavailable");
  }

  const startDir = resolveStartDir(req);
  let appId = await findExistingShortcutAppId(req.game_name, req.exe);

  const saved = asIdString(req.steam_app_id);
  const vdfId = asIdString(req.shortcut_appid);

  // Reuse a just-created SteamClient AppID from the add handler when the
  // library overview has not refreshed yet. Never reuse the VDF CRC32 id.
  if (!appId && saved && saved !== vdfId && req.needs_add_shortcut === false) {
    console.log("PML reusing just-created SteamClient AppID", saved);
    appId = saved;
  }

  if (!appId) {
    console.log(
      "PML AddShortcut",
      req.game_name,
      req.exe,
      startDir,
      req.launch_options || ""
    );
    // Documented signature: (appName, executablePath, directory, launchOptions)
    const created = await Promise.resolve(
      apps.AddShortcut(
        req.game_name,
        req.exe,
        startDir,
        req.launch_options || ""
      )
    );
    appId = asIdString(created as number | string);
    console.log("PML AddShortcut returned", appId);
  }

  if (!appId) {
    throw new Error("SteamClient.Apps.AddShortcut did not return an AppID");
  }

  await configureShortcut(appId, { ...req, start_dir: startDir });

  // Confirm it became visible; if not, soft-restart so VDF/fallback loads.
  await sleep(300);
  const visible = await findExistingShortcutAppId(req.game_name, req.exe);
  if (visible) {
    return visible;
  }
  console.warn(
    "PML shortcut AppID",
    appId,
    "not yet visible in library — returning AddShortcut id anyway"
  );
  return appId;
}

export async function addGameToSteam(
  req: SteamShortcutRequest
): Promise<{ ok: boolean; appId?: number; error?: string; restarted?: boolean }> {
  try {
    const appId = await ensureConfiguredShortcut(req);
    return { ok: true, appId: Number(appId) };
  } catch (err) {
    // Last resort: VDF was written by backend; soft-restart Steam so it loads.
    const restarted = softRestartSteam();
    return {
      ok: false,
      restarted,
      error: restarted
        ? `${String(err)} — restarting Steam so the Non-Steam shortcut can appear.`
        : String(err),
    };
  }
}

/**
 * Configure shortcut (with Proton for .exe) and launch via RunGame only.
 * Creates the live library entry first when missing.
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
