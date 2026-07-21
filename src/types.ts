export type PluginStatus = {
  status: string;
  progress: number;
  progress_message: string;
  bytes_copied: number;
  bytes_total: number;
  copying: boolean;
  auto_launch: boolean;
  last_game: string;
  last_mount: string;
  last_error: string;
  last_exe?: string;
  last_steam_app_id?: number | string;
  last_vdf_launch_id?: number | string;
  last_shortcut_appid?: number | string;
  plugin_build?: string;
  log_lines: string[];
  busy: boolean;
  detected_mounts?: string[];
  has_detected_media?: boolean;
};

export type ProgressEvent = {
  progress: number;
  progress_message: string;
  bytes_copied: number;
  bytes_total: number;
  copying: boolean;
  last_game?: string;
};

export const EMPTY_STATUS: PluginStatus = {
  status: "Ready",
  progress: 0,
  progress_message: "",
  bytes_copied: 0,
  bytes_total: 0,
  copying: false,
  auto_launch: true,
  last_game: "",
  last_mount: "",
  last_error: "",
  log_lines: [],
  busy: false,
  detected_mounts: [],
  has_detected_media: false,
  plugin_build: "",
  last_steam_app_id: "0",
  last_vdf_launch_id: "0",
  last_shortcut_appid: "0",
};

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  const digits = idx === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[idx]}`;
}
