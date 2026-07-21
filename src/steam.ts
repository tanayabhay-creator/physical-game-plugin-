/** Steam client helpers for adding/launching Non-Steam shortcuts in Game Mode. */

import { Navigation } from "@decky/ui";

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

/**
 * Full configure — only when creating/fixing a shortcut.
 * Do NOT call this immediately before every launch (re-SpecifyCompatTool
 * can make Proton Non-Steam titles start then instantly stop).
 */
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
      apps.SpecifyCompatTool(numericId, tool);
      applied = tool;
      console.log("PML SpecifyCompatTool", unsigned, tool);
    } catch (err) {
      console.warn("SpecifyCompatTool failed", tool, err);
    }
  }

  await sleep(600);
  return applied;
}

function closePluginMenus(): void {
  try {
    Navigation.CloseSideMenus?.();
  } catch (err) {
    console.warn("CloseSideMenus failed", err);
  }
}

function navigateToApp(appId: string): void {
  const id = toUnsignedAppId(appId);
  try {
    Navigation.Navigate(`/library/app/${id}`);
    Navigation.CloseSideMenus?.();
    console.log("PML Navigate library app", id);
  } catch (err) {
    console.warn("Navigate to app failed", err);
    closePluginMenus();
  }
}

/**
 * Listen briefly for Steam LaunchApp errors so we can toast a real reason.
 */
function watchLaunchErrors(
  expectedAppId: string,
  onError: (message: string) => void
): () => void {
  const apps = window.SteamClient?.Apps;
  const unregs: Array<{ unregister?: () => void }> = [];
  const expected = toUnsignedAppId(expectedAppId);

  try {
    if (typeof apps?.RegisterForGameActionShowError === "function") {
      unregs.push(
        apps.RegisterForGameActionShowError(
          (_gid: any, appId: any, action: any, error: any) => {
            const id = toUnsignedAppId(String(appId ?? ""));
            if (id && id !== expected) {
              return;
            }
            onError(
              `Steam launch error (${action || "LaunchApp"}): ${String(
                error || "unknown"
              )}`
            );
          }
        )
      );
    }
  } catch (err) {
    console.warn("RegisterForGameActionShowError failed", err);
  }

  return () => {
    for (const u of unregs) {
      try {
        u?.unregister?.();
      } catch {
        // ignore
      }
    }
  };
}

/**
 * Launch Non-Steam titles via steam://rungameid/<64-bit>.
 * RunGame often returns without starting Non-Steam apps (false success),
 * so it is not used as the primary path.
 * Never use location.href — that freezes Game Mode.
 */
async function launchConfiguredApp(appId: string): Promise<{
  ok: boolean;
  method: string;
  error?: string;
  launch64?: string;
}> {
  const id = toUnsignedAppId(appId);
  if (!id) {
    return { ok: false, method: "none", error: "Missing AppID" };
  }

  const launch64 = toNonSteamLaunchId64(id);
  if (!launch64) {
    return { ok: false, method: "none", error: `Could not build launch id for ${id}` };
  }

  let launchError = "";
  const stopWatch = watchLaunchErrors(id, (msg) => {
    launchError = msg;
    console.warn("PML", msg);
  });

  try {
    closePluginMenus();
    await sleep(200);

    // Primary: ExecuteSteamURL with Non-Steam 64-bit id (Valve-documented form).
    if (window.SteamClient?.URL?.ExecuteSteamURL) {
      try {
        const url = `steam://rungameid/${launch64}`;
        window.SteamClient.URL.ExecuteSteamURL(url);
        console.log("PML ExecuteSteamURL", url);
        await sleep(800);
        if (!launchError) {
          return { ok: true, method: "ExecuteSteamURL", launch64 };
        }
      } catch (err) {
        console.warn("ExecuteSteamURL failed", err);
      }
    }

    // Secondary: RunGame with 32-bit id (library Play equivalent).
    const apps = window.SteamClient?.Apps;
    if (apps && typeof apps.RunGame === "function") {
      try {
        navigateToApp(id);
        await sleep(300);
        apps.RunGame(id, "", -1, 100);
        console.log("PML RunGame secondary", id);
        await sleep(800);
        if (!launchError) {
          return { ok: true, method: "RunGame", launch64 };
        }
      } catch (err) {
        console.warn("RunGame failed", err);
      }
    }

    // Still return launch64 so caller can ask the Python backend to steam:// launch.
    return {
      ok: false,
      method: "needs_backend",
      launch64,
      error:
        launchError ||
        `Frontend launch did not confirm for AppID ${id}; trying backend steam://`,
    };
  } finally {
    stopWatch();
  }
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

  const compatTool = await configureShortcut(appId, {
    ...req,
    start_dir: startDir,
  });

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
    return { ok: false, error: String(err) };
  }
}

/**
 * Launch without re-touching Proton/exe settings.
 * Reconfiguring right before RunGame is a common reason Non-Steam Proton
 * titles appear to "launch" then immediately do nothing.
 */
export async function launchSteamGame(
  req: SteamShortcutRequest
): Promise<{
  ok: boolean;
  appId?: number;
  compatTool?: string;
  method?: string;
  launch64?: string;
  error?: string;
}> {
  try {
    if (!req.exe) {
      return {
        ok: false,
        error: "Missing exe path — transfer may not have finished",
      };
    }

    const saved = asIdString(req.steam_app_id);
    const vdfId = asIdString(req.shortcut_appid);

    let appId =
      (await findExistingShortcutAppId(req.game_name, req.exe)) ||
      (saved && saved !== vdfId ? toUnsignedAppId(saved) : "");

    let compatTool = "";
    if (!appId) {
      const ensured = await ensureConfiguredShortcut(req);
      appId = ensured.appId;
      compatTool = ensured.compatTool;
    }

    console.log(
      "PML launch",
      req.game_name,
      "appId=",
      appId,
      "exe=",
      req.exe
    );

    const result = await launchConfiguredApp(appId);
    return {
      // needs_backend still provides launch64 — treat as soft-ok for caller fallback
      ok: result.ok || result.method === "needs_backend",
      appId: Number(appId),
      compatTool,
      method: result.method,
      launch64: result.launch64,
      error: result.ok ? undefined : result.error,
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Open the Non-Steam game page so the user can press Play manually. */
export async function openGameInLibrary(
  req: Pick<SteamShortcutRequest, "game_name" | "exe" | "steam_app_id">
): Promise<{ ok: boolean; appId?: number; error?: string }> {
  try {
    let appId =
      (await findExistingShortcutAppId(req.game_name, req.exe || "")) ||
      (asIdString(req.steam_app_id)
        ? toUnsignedAppId(String(req.steam_app_id))
        : "");
    if (!appId) {
      return {
        ok: false,
        error: "Game not found in Non-Steam library yet",
      };
    }
    navigateToApp(appId);
    return { ok: true, appId: Number(appId) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
