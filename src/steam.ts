/** Steam client helpers for adding/launching Non-Steam shortcuts in Game Mode. */

export type SteamShortcutRequest = {
  game_name: string;
  exe: string;
  start_dir: string;
  launch_options: string;
  compat_tool?: string;
  should_launch?: boolean;
  vdf_launch_id?: number;
  already_installed?: boolean;
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

function launchViaUri(launchId: number): void {
  const url = `steam://rungameid/${launchId}`;
  const sc = getSteamClient();
  try {
    if (sc?.URL?.ExecuteSteamURL) {
      sc.URL.ExecuteSteamURL(url);
      return;
    }
  } catch (err) {
    console.warn("ExecuteSteamURL failed", err);
  }
  try {
    window.open(url, "_blank");
  } catch (err) {
    console.warn("window.open steam URL failed", err);
  }
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

    // Avoid creating duplicate shortcuts on every card reinsert.
    if (req.already_installed) {
      return { ok: true };
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
    const sc = getSteamClient();

    // Prefer steam://rungameid from shortcuts.vdf — works for existing Non-Steam games.
    if (req.vdf_launch_id) {
      launchViaUri(req.vdf_launch_id);
      // Also try RunGame if we just created a shortcut app id in this session.
      return { ok: true };
    }

    if (sc?.Apps?.RunGame) {
      // Last resort without a launch id — cannot know app id reliably here.
      return {
        ok: false,
        error: "No vdf_launch_id available for launch",
      };
    }

    return { ok: false, error: "No Steam launch method available" };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
