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

import { EMPTY_STATUS, PluginStatus } from "./types";

const getStatus = callable<[], PluginStatus>("get_status");
const setAutoLaunch = callable<[enabled: boolean], PluginStatus>("set_auto_launch");
const clearLog = callable<[], PluginStatus>("clear_log");
const rescanMedia = callable<[], PluginStatus & { mounts: string[] }>("rescan_media");

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
    const timer = window.setInterval(() => {
      void refresh();
    }, 2500);

    return () => {
      mounted = false;
      window.clearInterval(timer);
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
      toaster.toast({
        title: "Physical Media Launcher",
        body:
          next.mounts?.length > 0
            ? `Found ${next.mounts.length} game card(s)`
            : "No game_info.json media found",
      });
    } catch (err) {
      toaster.toast({
        title: "Physical Media Launcher",
        body: `Rescan failed: ${String(err)}`,
      });
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
      : "No transfers yet. Insert an SD card with game_info.json on the root.";

  return (
    <>
      <PanelSection title="Status">
        <PanelSectionRow>
          <Field label="Plugin status" description={state.busy ? "Working…" : "Idle"}>
            {state.status}
          </Field>
        </PanelSectionRow>

        {(state.status.toLowerCase().includes("copy") || state.progress > 0) && (
          <PanelSectionRow>
            <ProgressBarWithInfo
              label="Transfer"
              layout="inline"
              bottomSeparator="none"
              nProgress={state.progress}
              sOperationText={`${Math.round(state.progress)}%`}
            />
          </PanelSectionRow>
        )}

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

      <PanelSection title="Auto-Launch">
        <PanelSectionRow>
          <ToggleField
            label="Enable Auto-Launch on Insertion"
            description="When enabled, detected games are launched in Steam after copy/shortcut setup."
            checked={state.auto_launch}
            onChange={(checked) => {
              void onToggleAutoLaunch(checked);
            }}
          />
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Actions">
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => void onRescan()}>
            Rescan inserted media
          </ButtonItem>
        </PanelSectionRow>
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
  const onStatus = addEventListener<[PluginStatus]>("pml_status", (status) => {
    // Event-driven updates; the Content component also polls as a fallback.
    console.log("pml_status", status);
  });

  const onProgress = addEventListener<[number, string]>(
    "pml_progress",
    (pct, message) => {
      console.log("pml_progress", pct, message);
    }
  );

  const onLaunched = addEventListener<[string, number]>(
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
      removeEventListener("pml_status", onStatus);
      removeEventListener("pml_progress", onProgress);
      removeEventListener("pml_launched", onLaunched);
      removeEventListener("pml_error", onError);
    },
  };
});
