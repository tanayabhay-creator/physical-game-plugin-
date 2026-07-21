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

/** Non-Steam steam://rungameid target: (appid << 32) | 0x02000000 */
export function toNonSteamLaunchId64(unsignedAppId: string | number): string {
  try {
    const app = BigInt(toUnsignedAppId(unsignedAppId));
    return ((app << 32n) | 0x02000000n).toString();
  } catch {
    return "";
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
    console.log("PML available compat tools", names);
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
  req: SteamShortcutRequest
): Promise<string> {
  const apps = window.SteamClient?.Apps;
  if (!apps) {
    return "";
  }

  const startDir = resolveStartDir(req);
  const unsigned = toUnsignedAppId(appId);
  const numericId = Number(unsigned);

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

  let applied = "";
  const preferred = resolveCompatTool(req);
  if (preferred && typeof apps.SpecifyCompatTool === "function") {
    const tool = await pickAvailableCompatTool(numericId, preferred);
    try {
      await Promise.resolve(apps.SpecifyCompatTool(numericId, tool));
      applied = tool;
      console.log("PML SpecifyCompatTool", unsigned, tool);
    } catch (err) {
      console.warn("SpecifyCompatTool failed", tool, err);
      // Still try the preferred name once more.
      try {
        await Promise.resolve(apps.SpecifyCompatTool(numericId, preferred));
        applied = preferred;
      } catch (err2) {
        console.warn("SpecifyCompatTool preferred failed", preferred, err2);
      }
    }
  }

  // Give Steam time to persist compat tool + shortcut fields before RunGame.
  await sleep(1500);
  return applied;
}

function launchViaSteamUrl(id: string): boolean {
  const url = `steam://rungameid/${id}`;
  let ok = false;
  try {
    if (window.SteamClient?.URL?.ExecuteSteamURL) {
      window.SteamClient.URL.ExecuteSteamURL(url);
      console.log("PML ExecuteSteamURL", url);
      ok = true;
    }
  } catch (err) {
    console.warn("ExecuteSteamURL failed", url, err);
  }
  try {
    window.location.href = url;
    console.log("PML location.href", url);
    ok = true;
  } catch (err) {
    console.warn("location.href failed", url, err);
  }
  return ok;
}

async function runGame(appId: string, launchOptions = ""): Promise<boolean> {
  const apps = window.SteamClient?.Apps;
  if (!apps || typeof apps.RunGame !== "function") {
    return false;
  }
  const id = toUnsignedAppId(appId);
  if (!id) {
    return false;
  }

  // Documented usage in Decky examples uses param2=0; Non-Steam often needs -1.
  const attempts: Array<[number, number]> = [
    [-1, 0],
    [0, 0],
    [-1, 1],
    [0, 100],
  ];
  for (const [param2, launchSource] of attempts) {
    try {
      apps.RunGame(id, launchOptions || "", param2, launchSource);
      console.log("PML RunGame", id, param2, launchSource);
      return true;
    } catch (err) {
      console.warn("RunGame failed", id, param2, launchSource, err);
    }
  }
  return false;
}

/**
 * Launch using every known Game Mode path for Non-Steam titles.
 * Returns true if at least one launch call was accepted (Steam may still show UI errors).
 */
export async function launchByAppId(
  appId: string,
  launchOptions = ""
): Promise<boolean> {
  const unsigned = toUnsignedAppId(appId);
  const launch64 = toNonSteamLaunchId64(unsigned);
  let launched = false;

  launched = (await runGame(unsigned, launchOptions)) || launched;
  await sleep(250);

  // Plain AppID URI (works for many Non-Steam shortcuts on Deck).
  launched = launchViaSteamUrl(unsigned) || launched;
  await sleep(150);

  // Classic Non-Steam 64-bit launch id derived from the LIVE SteamClient AppID.
  if (launch64) {
    launched = launchViaSteamUrl(launch64) || launched;
  }

  try {
    const launchUrl = `steam://launch/${unsigned}`;
    if (window.SteamClient?.URL?.ExecuteSteamURL) {
      window.SteamClient.URL.ExecuteSteamURL(launchUrl);
      console.log("PML ExecuteSteamURL", launchUrl);
      launched = true;
    }
  } catch (err) {
    console.warn("steam://launch failed", err);
  }

  return launched;
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

export async function ensureConfiguredShortcut(
  req: SteamShortcutRequest
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
    console.log("PML reusing just-created SteamClient AppID", saved);
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

  const compatTool = await configureShortcut(appId, {
    ...req,
    start_dir: startDir,
  });

  await sleep(300);
  const visible = await findExistingShortcutAppId(req.game_name, req.exe);
  if (visible) {
    return { appId: visible, compatTool };
  }
  console.warn(
    "PML shortcut AppID",
    appId,
    "not yet visible in library — returning AddShortcut id anyway"
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
  restarted?: boolean;
}> {
  try {
    const { appId, compatTool } = await ensureConfiguredShortcut(req);
    return { ok: true, appId: Number(appId), compatTool };
  } catch (err) {
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

    const { appId, compatTool } = await ensureConfiguredShortcut(req);
    console.log(
      "PML launching",
      req.game_name,
      "appId=",
      appId,
      "compat=",
      compatTool,
      "exe=",
      req.exe
    );

    const ok = await launchByAppId(appId, req.launch_options || "");
    if (!ok) {
      return {
        ok: false,
        appId: Number(appId),
        compatTool,
        error: `All launch methods failed for AppID ${appId} (compat=${compatTool || "none"})`,
      };
    }
    return { ok: true, appId: Number(appId), compatTool };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
