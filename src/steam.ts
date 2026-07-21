/** Steam client helpers for adding/launching Non-Steam shortcuts in Game Mode. */

export type SteamShortcutRequest = {
  game_name: string;
  exe: string;
  start_dir: string;
  launch_options: string;
  compat_tool?: string;
  should_launch?: boolean;
  vdf_launch_id?: number;
  steam_app_id?: number;
  shortcut_appid?: number;
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

function launchViaUri(launchId: number | string): void {
  const url = `steam://rungameid/${launchId}`;
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
  const id = String(appId);
  // Community plugins use different param2 values (-1 or 0).
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

    const shouldAdd =
      Boolean(req.needs_add_shortcut) ||
      !req.already_installed ||
      !req.steam_app_id;

    if (!shouldAdd && req.steam_app_id) {
      return { ok: true, appId: req.steam_app_id };
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

    if (req.steam_app_id && req.steam_app_id !== 0) {
      launched = runGame(req.steam_app_id, req.launch_options || "") || launched;
    }
    if (req.shortcut_appid && req.shortcut_appid !== 0) {
      launched = runGame(req.shortcut_appid, req.launch_options || "") || launched;
      // unsigned form
      const unsigned = req.shortcut_appid >>> 0;
      launched = runGame(unsigned, req.launch_options || "") || launched;
    }
    if (req.vdf_launch_id) {
      launchViaUri(req.vdf_launch_id);
      launched = true;
    }
    if (req.steam_app_id) {
      launchViaUri(req.steam_app_id);
      launched = true;
    }

    if (!launched) {
      return {
        ok: false,
        error:
          "No AppID available to launch. Use Start Transfer once so Steam AppID can be saved.",
      };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
