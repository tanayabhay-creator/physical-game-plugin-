/** Steam client helpers for adding Non-Steam shortcuts in Game Mode. */

export type SteamShortcutRequest = {
  game_name: string;
  exe: string;
  start_dir: string;
  launch_options: string;
  compat_tool?: string;
  should_launch?: boolean;
  vdf_launch_id?: number;
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
};

function getSteamClient(): SteamClientAPI | undefined {
  return (window as Window & { SteamClient?: SteamClientAPI }).SteamClient;
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

    if (req.should_launch) {
      try {
        if (sc.Apps.RunGame) {
          // launchSource enum value; 0 is commonly used by community plugins.
          sc.Apps.RunGame(String(appId), req.launch_options || "", 0, 0);
        } else if (req.vdf_launch_id) {
          window.open(`steam://rungameid/${req.vdf_launch_id}`, "_blank");
        }
      } catch (err) {
        console.warn("Auto-launch after AddShortcut failed", err);
      }
    }

    return { ok: true, appId };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
