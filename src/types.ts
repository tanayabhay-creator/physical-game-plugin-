export type PluginStatus = {
  status: string;
  progress: number;
  auto_launch: boolean;
  last_game: string;
  last_mount: string;
  last_error: string;
  log_lines: string[];
  busy: boolean;
};

export const EMPTY_STATUS: PluginStatus = {
  status: "Ready",
  progress: 0,
  auto_launch: true,
  last_game: "",
  last_mount: "",
  last_error: "",
  log_lines: [],
  busy: false,
};
