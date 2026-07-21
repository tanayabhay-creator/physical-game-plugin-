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

type SteamClientAPI = {
  Apps?: {
    AddShortcut?: (
      name: string,
      exe: string,
      startDir: string,
      args: string
    ) => Promise<number>;
    SpecifyCompatTool?: (appId: number, toolName: string) => void;
    RunGame?: (
      appId: string,
      launchOptions: string,
      param2: number,
      launchSource: number
    ) => void;
  };
  URL?: {
    ExecuteSteamURL?: (url: string) => void;
  };
};

function getSteamClient(): SteamClientAPI | undefined {
  return (window as Window & { SteamClient?: SteamClientAPI }).SteamClient;
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

/** Build Non-Steam steam://rungameid using BigInt (safe for 64-bit). */
export function toVdfLaunchIdString(shortcutAppId: string | number): string {
  try {
    const app = BigInt(asIdString(shortcutAppId) || "0");
    if (app === 0n) {
      return "";
    }
    const launch = ((app & 0xffffffffn) << 32n) | 0x02000000n;
    return launch.toString();
  } catch {
    return "";
  }
}

function launchViaUri(launchId: number | string): void {
  const id = asIdString(launchId);
  if (!id) {
    return;
  }
  const url = `steam://rungameid/${id}`;
  const sc = getSteamClient();
  try {
    if (sc?.URL?.ExecuteSteamURL) {
      sc.URL.ExecuteSteamURL(url);
      console.log("PML ExecuteSteamURL", url);
      return;
    }
  } catch (err) {
    console.warn("ExecuteSteamURL failed", err);
  }
  try {
    location.href = url;
  } catch (err) {
    console.warn("location.href steam URL failed", err);
  }
}

function runGame(appId: number | string, launchOptions = ""): boolean {
  const sc = getSteamClient();
  if (!sc?.Apps?.RunGame) {
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
      sc.Apps.RunGame(id, launchOptions || "", param2, launchSource);
      console.log("PML RunGame", id, param2, launchSource);
      return true;
    } catch (err) {
      console.warn("RunGame attempt failed", id, param2, err);
    }
  }
  return false;
}

export async function addGameToSteam(
  req: SteamShortcutRequest
): Promise<{ ok: boolean; appId?: number; error?: string }> {
  try {
    const sc = getSteamClient();
    if (!sc?.Apps?.AddShortcut) {
      return {
        ok: false,
        error: "SteamClient.Apps.AddShortcut unavailable (VDF fallback only)",
      };
    }

    const existing = asIdString(req.steam_app_id) || asIdString(req.shortcut_appid);
    const shouldAdd =
      Boolean(req.needs_add_shortcut) ||
      !req.already_installed ||
      !existing;

    if (!shouldAdd && existing) {
      return { ok: true, appId: Number(existing) };
    }

    const appId = await sc.Apps.AddShortcut(
      req.game_name,
      req.exe,
      req.start_dir,
      req.launch_options || ""
    );

    const compat =
      (req.compat_tool || "").trim() ||
      (req.exe.toLowerCase().endsWith(".exe") ? "proton_experimental" : "");
    if (compat && sc.Apps.SpecifyCompatTool) {
      try {
        sc.Apps.SpecifyCompatTool(appId, compat);
      } catch (err) {
        console.warn("SpecifyCompatTool failed", err);
      }
    }

    return { ok: true, appId };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function launchSteamGame(
  req: SteamShortcutRequest
): Promise<{ ok: boolean; error?: string }> {
  try {
    let launched = false;
    const steamAppId = asIdString(req.steam_app_id);
    const shortcutAppId = asIdString(req.shortcut_appid);
    const vdfLaunchId =
      asIdString(req.vdf_launch_id) ||
      toVdfLaunchIdString(shortcutAppId || steamAppId);

    // 1) Preferred: RunGame with known AppIDs
    if (steamAppId) {
      launched = runGame(steamAppId, req.launch_options || "") || launched;
    }
    if (shortcutAppId) {
      launched = runGame(shortcutAppId, req.launch_options || "") || launched;
    }

    // 2) steam:// URI with BigInt-safe 64-bit launch id
    if (vdfLaunchId) {
      launchViaUri(vdfLaunchId);
      launched = true;
    }

    if (!launched) {
      return {
        ok: false,
        error:
          "No AppID available. Open plugin, press Start Transfer once, then Launch again.",
      };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
