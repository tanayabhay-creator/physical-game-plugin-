import {
  ButtonItem,
  Field,
  PanelSection,
  PanelSectionRow,
  ProgressBarWithInfo,
  staticClasses,
  ToggleField,
} from "@decky/ui";
import {
  addEventListener,
  callable,
  definePlugin,
  removeEventListener,
  toaster,
} from "@decky/api";
import { useEffect, useState } from "react";
import { FaSdCard } from "react-icons/fa";

import {
  EMPTY_STATUS,
  formatBytes,
  PluginStatus,
  ProgressEvent,
} from "./types";
import { addGameToSteam, launchSteamGame, SteamShortcutRequest } from "./steam";

const getStatus = callable<[], PluginStatus>("get_status");
const setAutoLaunch = callable<[enabled: boolean], PluginStatus>("set_auto_launch");
const clearLog = callable<[], PluginStatus>("clear_log");
const rescanMedia = callable<
  [],
  PluginStatus & { mounts: string[]; all_mounts?: string[] }
>("rescan_media");
const startTransfer = callable<[mount_path: string, force_recopy: boolean], PluginStatus>(
  "start_transfer"
);
const resetBusy = callable<[], PluginStatus>("reset_busy");
const reportSteamAppId = callable<
  [game_name: string, exe: string, app_id: number],
  PluginStatus
>("report_steam_appid");

function Content() {
  const [state, setState] = useState<PluginStatus>(EMPTY_STATUS);

  useEffect(() => {
    let mounted = true;

    const refresh = async () => {
      try {
        const next = await getStatus();
        if (mounted) {
          setState(next);
        }
      } catch (err) {
        console.error("Physical Media Launcher: get_status failed", err);
      }
    };

    void refresh();

    const onStatus = addEventListener<[PluginStatus]>("pml_status", (status) => {
      if (mounted) {
        setState(status);
      }
    });

    const onProgress = addEventListener<[ProgressEvent]>("pml_progress", (evt) => {
      if (!mounted) {
        return;
      }
      setState((prev) => ({
        ...prev,
        status: "Copying Game...",
        progress: evt.progress,
        progress_message: evt.progress_message,
        bytes_copied: evt.bytes_copied,
        bytes_total: evt.bytes_total,
        copying: evt.copying,
        last_game: evt.last_game || prev.last_game,
        busy: true,
      }));
    });

    const timer = window.setInterval(() => {
      void refresh();
    }, 3000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
      removeEventListener("pml_status", onStatus);
      removeEventListener("pml_progress", onProgress);
    };
  }, []);

  const onToggleAutoLaunch = async (checked: boolean) => {
    try {
      const next = await setAutoLaunch(checked);
      setState(next);
    } catch (err) {
      toaster.toast({
        title: "Physical Media Launcher",
        body: `Failed to update auto-launch: ${String(err)}`,
      });
    }
  };

  const onRescan = async () => {
    try {
      const next = await rescanMedia();
      setState(next);
      const gameMounts = next.mounts || next.detected_mounts || [];
      const allMounts = next.all_mounts || [];
      let body: string;
      if (gameMounts.length > 0) {
        body = `Detected ${gameMounts.length} game card(s). Press Start Transfer to copy.`;
      } else if (allMounts.length > 0) {
        body =
          `SD/USB is mounted (${allMounts.length}), but game_info.json is missing from the card root.`;
      } else {
        body =
          "No SD/USB mounts found under /run/media/deck. Insert the card and wait for SteamOS to mount it.";
      }
      toaster.toast({
        title: "Physical Media Launcher",
        body,
      });
    } catch (err) {
      toaster.toast({
        title: "Physical Media Launcher",
        body: `Rescan failed: ${String(err)}`,
      });
    }
  };

  const onStartTransfer = async (forceRecopy: boolean) => {
    try {
      toaster.toast({
        title: "Physical Media Launcher",
        body: forceRecopy ? "Force re-copy starting…" : "Starting SD → SSD transfer…",
      });
      const mount =
        (state.detected_mounts && state.detected_mounts[0]) || state.last_mount || "";
      const next = await startTransfer(mount, forceRecopy);
      setState(next);
      if (next.last_error) {
        toaster.toast({
          title: "Transfer failed",
          body: next.last_error,
        });
        return;
      }
      toaster.toast({
        title: "Physical Media Launcher",
        body: "Transfer started — watch Copy Progress below.",
      });
    } catch (err) {
      // Decky sometimes wraps backend failures as a generic "Python exception".
      // Pull the real reason from status/log if possible.
      try {
        const next = await getStatus();
        setState(next);
        toaster.toast({
          title: "Transfer failed",
          body: next.last_error || String(err),
        });
      } catch {
        toaster.toast({
          title: "Transfer failed",
          body: String(err),
        });
      }
    }
  };

  const onLaunchLast = async () => {
    try {
      // Frontend-only launch path — do NOT call launch_last_game RPC
      // (that is what was throwing "Python exception" on Deck).
      const next = await getStatus();
      setState(next);

      // Prefer launching even if backend build field is missing (stale loader).
      const result = await launchSteamGame({
        game_name: next.last_game || "Silksong",
        exe: next.last_exe || "/home/deck/Games/Silksong/Silksong.exe",
        start_dir: "",
        launch_options: "",
        steam_app_id: next.last_steam_app_id,
        shortcut_appid: next.last_shortcut_appid || next.last_steam_app_id,
        vdf_launch_id: next.last_vdf_launch_id,
        should_launch: true,
        already_installed: true,
      });

      if (!next.plugin_build) {
        toaster.toast({
          title: "Backend not updated",
          body: "UI is new but Python backend is old. Reinstall + restart Decky.",
        });
      }

      toaster.toast({
        title: result.ok ? "Launching" : "Launch failed",
        body: result.ok
          ? `${next.last_game || "game"}`
          : result.error || "Could not launch",
      });
    } catch (err) {
      toaster.toast({
        title: "Launch failed",
        body: String(err),
      });
    }
  };

  const onResetBusy = async () => {
    try {
      setState(await resetBusy());
      toaster.toast({
        title: "Physical Media Launcher",
        body: "Transfer state reset. Try Start Transfer again.",
      });
    } catch (err) {
      console.error(err);
    }
  };

  const onClearLog = async () => {
    try {
      setState(await clearLog());
    } catch (err) {
      console.error(err);
    }
  };

  const logText =
    state.log_lines.length > 0
      ? state.log_lines.slice(-12).join("\n")
      : "No transfers yet. Insert an SD card with game_info.json, then press Start Transfer.";

  const showProgress =
    state.copying ||
    state.status.toLowerCase().includes("copy") ||
    (state.progress > 0 && state.progress < 100) ||
    (state.bytes_total > 0 && state.bytes_copied > 0);

  const pct = Math.max(0, Math.min(100, Math.round(state.progress || 0)));
  const sizeLabel =
    state.bytes_total > 0
      ? `${formatBytes(state.bytes_copied)} / ${formatBytes(state.bytes_total)}`
      : state.bytes_copied > 0
        ? formatBytes(state.bytes_copied)
        : "Waiting…";

  const detected = state.detected_mounts || [];
  // Only grey out while an actual copy is running. Detection alone must not
  // permanently disable the button (that was locking users out).
  const transferLocked = state.copying;

  return (
    <>
      <PanelSection title="Status">
        <PanelSectionRow>
          <Field label="Plugin status" description={state.busy ? "Working…" : "Idle"}>
            {state.status}
          </Field>
        </PanelSectionRow>

        <PanelSectionRow>
          <Field label="Plugin build">
            {state.plugin_build || "unknown — please update"}
          </Field>
        </PanelSectionRow>

        <PanelSectionRow>
          <Field label="Detected game media">
            {detected.length > 0 ? `${detected.length} volume(s)` : "None"}
          </Field>
        </PanelSectionRow>

        {detected.length > 0 ? (
          <PanelSectionRow>
            <Field label="Mount path" description={detected[0]} />
          </PanelSectionRow>
        ) : null}

        <PanelSectionRow>
          <Field label="Last transferred game">
            {state.last_game || "—"}
          </Field>
        </PanelSectionRow>

        {state.last_mount ? (
          <PanelSectionRow>
            <Field label="Last mount">{state.last_mount}</Field>
          </PanelSectionRow>
        ) : null}

        {state.last_error ? (
          <PanelSectionRow>
            <Field label="Last error" description={state.last_error} />
          </PanelSectionRow>
        ) : null}
      </PanelSection>

      <PanelSection title="Copy Progress">
        {showProgress ? (
          <>
            <PanelSectionRow>
              <ProgressBarWithInfo
                label="SD → SSD transfer"
                description={
                  state.progress_message ||
                  (state.copying ? "Copying game files…" : "Transfer finished")
                }
                layout="below"
                bottomSeparator="none"
                nProgress={pct}
                indeterminate={state.copying && pct <= 0}
                sOperationText={`${pct}%`}
                sTimeRemaining={sizeLabel}
              />
            </PanelSectionRow>
            <PanelSectionRow>
              <Field
                label="Copied"
                description={
                  state.bytes_total > 0
                    ? `${pct}% of game data`
                    : state.copying
                      ? "Measuring / copying…"
                      : "—"
                }
              >
                {sizeLabel}
              </Field>
            </PanelSectionRow>
            {state.progress_message ? (
              <PanelSectionRow>
                <Field label="Current file">
                  <span
                    style={{
                      display: "block",
                      maxWidth: "100%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {state.progress_message}
                  </span>
                </Field>
              </PanelSectionRow>
            ) : null}
          </>
        ) : (
          <PanelSectionRow>
            <Field
              label="Transfer"
              description="Press Start Transfer after a game card is detected."
            >
              Idle
            </Field>
          </PanelSectionRow>
        )}
      </PanelSection>

      <PanelSection title="Transfer">
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            disabled={transferLocked}
            onClick={() => void onStartTransfer(false)}
          >
            {transferLocked ? "Transfer in progress…" : "Start Transfer (SD → SSD)"}
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            disabled={transferLocked}
            onClick={() => void onStartTransfer(true)}
          >
            Force Re-Copy (overwrite SSD)
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => void onLaunchLast()}>
            Launch last game now
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => void onRescan()}>
            Rescan inserted media
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => void onResetBusy()}>
            Reset stuck transfer state
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Auto-Launch">
        <PanelSectionRow>
          <ToggleField
            label="Enable Auto-Launch on Insertion"
            description="When ON, reinserting the SD card launches the game automatically (plugin toggle overrides game_info.json AutoLaunch)."
            checked={state.auto_launch}
            onChange={(checked) => {
              void onToggleAutoLaunch(checked);
            }}
          />
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Actions">
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => void onClearLog()}>
            Clear log
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Log">
        <PanelSectionRow>
          <pre
            style={{
              width: "100%",
              maxHeight: "220px",
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: "12px",
              lineHeight: 1.35,
              margin: 0,
              opacity: 0.9,
            }}
          >
            {logText}
          </pre>
        </PanelSectionRow>
      </PanelSection>
    </>
  );
}

export default definePlugin(() => {
  const onAddToSteam = addEventListener<[SteamShortcutRequest]>(
    "pml_add_to_steam",
    (payload) => {
      void (async () => {
        const result = await addGameToSteam(payload);
        if (result.ok) {
          if (result.appId) {
            try {
              await reportSteamAppId(payload.game_name, payload.exe, result.appId);
            } catch (err) {
              console.warn("report_steam_appid failed", err);
            }
          }
          if (!payload.already_installed || payload.needs_add_shortcut) {
            toaster.toast({
              title: "Added to Steam",
              body: `${payload.game_name}${
                result.appId ? ` (AppID ${result.appId})` : ""
              }`,
            });
          }
        } else {
          toaster.toast({
            title: "Steam shortcut",
            body:
              result.error ||
              "SteamClient add failed — shortcuts.vdf fallback was still written.",
          });
        }
      })();
    }
  );

  const onLaunchGame = addEventListener<[SteamShortcutRequest]>(
    "pml_launch_game",
    (payload) => {
      void (async () => {
        const result = await launchSteamGame(payload);
        if (result.ok) {
          toaster.toast({
            title: "Launching",
            body: payload.game_name,
          });
        } else {
          toaster.toast({
            title: "Launch failed",
            body: result.error || "Could not launch game",
          });
        }
      })();
    }
  );

  const onLaunched = addEventListener<[string, string | number]>(
    "pml_launched",
    (gameName, launchId) => {
      toaster.toast({
        title: "Game Launched",
        body: `${gameName} (${launchId})`,
      });
    }
  );

  const onError = addEventListener<[string]>("pml_error", (message) => {
    toaster.toast({
      title: "Physical Media Launcher",
      body: message,
    });
  });

  return {
    name: "Physical Media Launcher",
    titleView: <div className={staticClasses.Title}>Physical Media Launcher</div>,
    content: <Content />,
    icon: <FaSdCard />,
    onDismount() {
      removeEventListener("pml_add_to_steam", onAddToSteam);
      removeEventListener("pml_launch_game", onLaunchGame);
      removeEventListener("pml_launched", onLaunched);
      removeEventListener("pml_error", onError);
    },
  };
});
