const manifest = {"name":"Physical Media Launcher"};
const API_VERSION = 2;
const internalAPIConnection = window.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit;
if (!internalAPIConnection) {
    throw new Error('[@decky/api]: Failed to connect to the loader as as the loader API was not initialized. This is likely a bug in Decky Loader.');
}
let api;
try {
    api = internalAPIConnection.connect(API_VERSION, manifest.name);
}
catch {
    api = internalAPIConnection.connect(1, manifest.name);
    console.warn(`[@decky/api] Requested API version ${API_VERSION} but the running loader only supports version 1. Some features may not work.`);
}
if (api._version != API_VERSION) {
    console.warn(`[@decky/api] Requested API version ${API_VERSION} but the running loader only supports version ${api._version}. Some features may not work.`);
}
const callable = api.callable;
const addEventListener = api.addEventListener;
const removeEventListener = api.removeEventListener;
const toaster = api.toaster;
const definePlugin = (fn) => {
    return (...args) => {
        return fn(...args);
    };
};

var DefaultContext = {
  color: undefined,
  size: undefined,
  className: undefined,
  style: undefined,
  attr: undefined
};
var IconContext = SP_REACT.createContext && /*#__PURE__*/SP_REACT.createContext(DefaultContext);

var _excluded = ["attr", "size", "title"];
function _objectWithoutProperties(e, t) { if (null == e) return {}; var o, r, i = _objectWithoutPropertiesLoose(e, t); if (Object.getOwnPropertySymbols) { var n = Object.getOwnPropertySymbols(e); for (r = 0; r < n.length; r++) o = n[r], -1 === t.indexOf(o) && {}.propertyIsEnumerable.call(e, o) && (i[o] = e[o]); } return i; }
function _objectWithoutPropertiesLoose(r, e) { if (null == r) return {}; var t = {}; for (var n in r) if ({}.hasOwnProperty.call(r, n)) { if (-1 !== e.indexOf(n)) continue; t[n] = r[n]; } return t; }
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), true).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: true, configurable: true, writable: true }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function Tree2Element(tree) {
  return tree && tree.map((node, i) => /*#__PURE__*/SP_REACT.createElement(node.tag, _objectSpread({
    key: i
  }, node.attr), Tree2Element(node.child)));
}
function GenIcon(data) {
  return props => /*#__PURE__*/SP_REACT.createElement(IconBase, _extends({
    attr: _objectSpread({}, data.attr)
  }, props), Tree2Element(data.child));
}
function IconBase(props) {
  var elem = conf => {
    var attr = props.attr,
      size = props.size,
      title = props.title,
      svgProps = _objectWithoutProperties(props, _excluded);
    var computedSize = size || conf.size || "1em";
    var className;
    if (conf.className) className = conf.className;
    if (props.className) className = (className ? className + " " : "") + props.className;
    return /*#__PURE__*/SP_REACT.createElement("svg", _extends({
      stroke: "currentColor",
      fill: "currentColor",
      strokeWidth: "0"
    }, conf.attr, attr, svgProps, {
      className: className,
      style: _objectSpread(_objectSpread({
        color: props.color || conf.color
      }, conf.style), props.style),
      height: computedSize,
      width: computedSize,
      xmlns: "http://www.w3.org/2000/svg"
    }), title && /*#__PURE__*/SP_REACT.createElement("title", null, title), props.children);
  };
  return IconContext !== undefined ? /*#__PURE__*/SP_REACT.createElement(IconContext.Consumer, null, conf => elem(conf)) : elem(DefaultContext);
}

// THIS FILE IS AUTO GENERATED
function FaSdCard (props) {
  return GenIcon({"attr":{"viewBox":"0 0 384 512"},"child":[{"tag":"path","attr":{"d":"M320 0H128L0 128v320c0 35.3 28.7 64 64 64h256c35.3 0 64-28.7 64-64V64c0-35.3-28.7-64-64-64zM160 160h-48V64h48v96zm80 0h-48V64h48v96zm80 0h-48V64h48v96z"},"child":[]}]})(props);
}

const EMPTY_STATUS = {
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
function formatBytes(bytes) {
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

/** Steam client helpers for adding/launching Non-Steam shortcuts in Game Mode. */
function getSteamClient() {
    return window.SteamClient;
}
function asIdString(value) {
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
function toVdfLaunchIdString(shortcutAppId) {
    try {
        const app = BigInt(asIdString(shortcutAppId) || "0");
        if (app === 0n) {
            return "";
        }
        const launch = ((app & 0xffffffffn) << 32n) | 0x02000000n;
        return launch.toString();
    }
    catch {
        return "";
    }
}
function launchViaUri(launchId) {
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
    }
    catch (err) {
        console.warn("ExecuteSteamURL failed", err);
    }
    try {
        location.href = url;
    }
    catch (err) {
        console.warn("location.href steam URL failed", err);
    }
}
function runGame(appId, launchOptions = "") {
    const sc = getSteamClient();
    if (!sc?.Apps?.RunGame) {
        return false;
    }
    const id = asIdString(appId);
    if (!id) {
        return false;
    }
    const attempts = [
        [-1, 0],
        [0, 0],
        [-1, 1],
    ];
    for (const [param2, launchSource] of attempts) {
        try {
            sc.Apps.RunGame(id, launchOptions || "", param2, launchSource);
            console.log("PML RunGame", id, param2, launchSource);
            return true;
        }
        catch (err) {
            console.warn("RunGame attempt failed", id, param2, err);
        }
    }
    return false;
}
async function addGameToSteam(req) {
    try {
        const sc = getSteamClient();
        if (!sc?.Apps?.AddShortcut) {
            return {
                ok: false,
                error: "SteamClient.Apps.AddShortcut unavailable (VDF fallback only)",
            };
        }
        const existing = asIdString(req.steam_app_id) || asIdString(req.shortcut_appid);
        const shouldAdd = Boolean(req.needs_add_shortcut) ||
            !req.already_installed ||
            !existing;
        if (!shouldAdd && existing) {
            return { ok: true, appId: Number(existing) };
        }
        const appId = await sc.Apps.AddShortcut(req.game_name, req.exe, req.start_dir, req.launch_options || "");
        const compat = (req.compat_tool || "").trim() ||
            (req.exe.toLowerCase().endsWith(".exe") ? "proton_experimental" : "");
        if (compat && sc.Apps.SpecifyCompatTool) {
            try {
                sc.Apps.SpecifyCompatTool(appId, compat);
            }
            catch (err) {
                console.warn("SpecifyCompatTool failed", err);
            }
        }
        return { ok: true, appId };
    }
    catch (err) {
        return { ok: false, error: String(err) };
    }
}
async function launchSteamGame(req) {
    try {
        let launched = false;
        const steamAppId = asIdString(req.steam_app_id);
        const shortcutAppId = asIdString(req.shortcut_appid);
        const vdfLaunchId = asIdString(req.vdf_launch_id) ||
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
                error: "No AppID available. Open plugin, press Start Transfer once, then Launch again.",
            };
        }
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: String(err) };
    }
}

const getStatus = callable("get_status");
const setAutoLaunch = callable("set_auto_launch");
const clearLog = callable("clear_log");
const rescanMedia = callable("rescan_media");
const startTransfer = callable("start_transfer");
const resetBusy = callable("reset_busy");
const reportSteamAppId = callable("report_steam_appid");
function Content() {
    const [state, setState] = SP_REACT.useState(EMPTY_STATUS);
    SP_REACT.useEffect(() => {
        let mounted = true;
        const refresh = async () => {
            try {
                const next = await getStatus();
                if (mounted) {
                    setState(next);
                }
            }
            catch (err) {
                console.error("Physical Media Launcher: get_status failed", err);
            }
        };
        void refresh();
        const onStatus = addEventListener("pml_status", (status) => {
            if (mounted) {
                setState(status);
            }
        });
        const onProgress = addEventListener("pml_progress", (evt) => {
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
    const onToggleAutoLaunch = async (checked) => {
        try {
            const next = await setAutoLaunch(checked);
            setState(next);
        }
        catch (err) {
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
            let body;
            if (gameMounts.length > 0) {
                body = `Detected ${gameMounts.length} game card(s). Press Start Transfer to copy.`;
            }
            else if (allMounts.length > 0) {
                body =
                    `SD/USB is mounted (${allMounts.length}), but game_info.json is missing from the card root.`;
            }
            else {
                body =
                    "No SD/USB mounts found under /run/media/deck. Insert the card and wait for SteamOS to mount it.";
            }
            toaster.toast({
                title: "Physical Media Launcher",
                body,
            });
        }
        catch (err) {
            toaster.toast({
                title: "Physical Media Launcher",
                body: `Rescan failed: ${String(err)}`,
            });
        }
    };
    const onStartTransfer = async (forceRecopy) => {
        try {
            toaster.toast({
                title: "Physical Media Launcher",
                body: forceRecopy ? "Force re-copy starting…" : "Starting SD → SSD transfer…",
            });
            const mount = (state.detected_mounts && state.detected_mounts[0]) || state.last_mount || "";
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
        }
        catch (err) {
            // Decky sometimes wraps backend failures as a generic "Python exception".
            // Pull the real reason from status/log if possible.
            try {
                const next = await getStatus();
                setState(next);
                toaster.toast({
                    title: "Transfer failed",
                    body: next.last_error || String(err),
                });
            }
            catch {
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
                launch_options: "",
                steam_app_id: next.last_steam_app_id,
                shortcut_appid: next.last_shortcut_appid || next.last_steam_app_id,
                vdf_launch_id: next.last_vdf_launch_id});
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
        }
        catch (err) {
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
        }
        catch (err) {
            console.error(err);
        }
    };
    const onClearLog = async () => {
        try {
            setState(await clearLog());
        }
        catch (err) {
            console.error(err);
        }
    };
    const logText = state.log_lines.length > 0
        ? state.log_lines.slice(-12).join("\n")
        : "No transfers yet. Insert an SD card with game_info.json, then press Start Transfer.";
    const showProgress = state.copying ||
        state.status.toLowerCase().includes("copy") ||
        (state.progress > 0 && state.progress < 100) ||
        (state.bytes_total > 0 && state.bytes_copied > 0);
    const pct = Math.max(0, Math.min(100, Math.round(state.progress || 0)));
    const sizeLabel = state.bytes_total > 0
        ? `${formatBytes(state.bytes_copied)} / ${formatBytes(state.bytes_total)}`
        : state.bytes_copied > 0
            ? formatBytes(state.bytes_copied)
            : "Waiting…";
    const detected = state.detected_mounts || [];
    // Only grey out while an actual copy is running. Detection alone must not
    // permanently disable the button (that was locking users out).
    const transferLocked = state.copying;
    return (SP_JSX.jsxs(SP_JSX.Fragment, { children: [SP_JSX.jsxs(DFL.PanelSection, { title: "Status", children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { label: "Plugin status", description: state.busy ? "Working…" : "Idle", children: state.status }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { label: "Plugin build", children: state.plugin_build || "unknown — please update" }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { label: "Detected game media", children: detected.length > 0 ? `${detected.length} volume(s)` : "None" }) }), detected.length > 0 ? (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { label: "Mount path", description: detected[0] }) })) : null, SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { label: "Last transferred game", children: state.last_game || "—" }) }), state.last_mount ? (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { label: "Last mount", children: state.last_mount }) })) : null, state.last_error ? (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { label: "Last error", description: state.last_error }) })) : null] }), SP_JSX.jsx(DFL.PanelSection, { title: "Copy Progress", children: showProgress ? (SP_JSX.jsxs(SP_JSX.Fragment, { children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ProgressBarWithInfo, { label: "SD \u2192 SSD transfer", description: state.progress_message ||
                                    (state.copying ? "Copying game files…" : "Transfer finished"), layout: "below", bottomSeparator: "none", nProgress: pct, indeterminate: state.copying && pct <= 0, sOperationText: `${pct}%`, sTimeRemaining: sizeLabel }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { label: "Copied", description: state.bytes_total > 0
                                    ? `${pct}% of game data`
                                    : state.copying
                                        ? "Measuring / copying…"
                                        : "—", children: sizeLabel }) }), state.progress_message ? (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { label: "Current file", children: SP_JSX.jsx("span", { style: {
                                        display: "block",
                                        maxWidth: "100%",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }, children: state.progress_message }) }) })) : null] })) : (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { label: "Transfer", description: "Press Start Transfer after a game card is detected.", children: "Idle" }) })) }), SP_JSX.jsxs(DFL.PanelSection, { title: "Transfer", children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ButtonItem, { layout: "below", disabled: transferLocked, onClick: () => void onStartTransfer(false), children: transferLocked ? "Transfer in progress…" : "Start Transfer (SD → SSD)" }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ButtonItem, { layout: "below", disabled: transferLocked, onClick: () => void onStartTransfer(true), children: "Force Re-Copy (overwrite SSD)" }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ButtonItem, { layout: "below", onClick: () => void onLaunchLast(), children: "Launch last game now" }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ButtonItem, { layout: "below", onClick: () => void onRescan(), children: "Rescan inserted media" }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ButtonItem, { layout: "below", onClick: () => void onResetBusy(), children: "Reset stuck transfer state" }) })] }), SP_JSX.jsx(DFL.PanelSection, { title: "Auto-Launch", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ToggleField, { label: "Enable Auto-Launch on Insertion", description: "When ON, reinserting the SD card launches the game automatically (plugin toggle overrides game_info.json AutoLaunch).", checked: state.auto_launch, onChange: (checked) => {
                            void onToggleAutoLaunch(checked);
                        } }) }) }), SP_JSX.jsx(DFL.PanelSection, { title: "Actions", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ButtonItem, { layout: "below", onClick: () => void onClearLog(), children: "Clear log" }) }) }), SP_JSX.jsx(DFL.PanelSection, { title: "Log", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx("pre", { style: {
                            width: "100%",
                            maxHeight: "220px",
                            overflow: "auto",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            fontSize: "12px",
                            lineHeight: 1.35,
                            margin: 0,
                            opacity: 0.9,
                        }, children: logText }) }) })] }));
}
var index = definePlugin(() => {
    const onAddToSteam = addEventListener("pml_add_to_steam", (payload) => {
        void (async () => {
            const result = await addGameToSteam(payload);
            if (result.ok) {
                if (result.appId) {
                    try {
                        await reportSteamAppId(payload.game_name, payload.exe, result.appId);
                    }
                    catch (err) {
                        console.warn("report_steam_appid failed", err);
                    }
                }
                if (!payload.already_installed || payload.needs_add_shortcut) {
                    toaster.toast({
                        title: "Added to Steam",
                        body: `${payload.game_name}${result.appId ? ` (AppID ${result.appId})` : ""}`,
                    });
                }
            }
            else {
                toaster.toast({
                    title: "Steam shortcut",
                    body: result.error ||
                        "SteamClient add failed — shortcuts.vdf fallback was still written.",
                });
            }
        })();
    });
    const onLaunchGame = addEventListener("pml_launch_game", (payload) => {
        void (async () => {
            const result = await launchSteamGame(payload);
            if (result.ok) {
                toaster.toast({
                    title: "Launching",
                    body: payload.game_name,
                });
            }
            else {
                toaster.toast({
                    title: "Launch failed",
                    body: result.error || "Could not launch game",
                });
            }
        })();
    });
    const onLaunched = addEventListener("pml_launched", (gameName, launchId) => {
        toaster.toast({
            title: "Game Launched",
            body: `${gameName} (${launchId})`,
        });
    });
    const onError = addEventListener("pml_error", (message) => {
        toaster.toast({
            title: "Physical Media Launcher",
            body: message,
        });
    });
    return {
        name: "Physical Media Launcher",
        titleView: SP_JSX.jsx("div", { className: DFL.staticClasses.Title, children: "Physical Media Launcher" }),
        content: SP_JSX.jsx(Content, {}),
        icon: SP_JSX.jsx(FaSdCard, {}),
        onDismount() {
            removeEventListener("pml_add_to_steam", onAddToSteam);
            removeEventListener("pml_launch_game", onLaunchGame);
            removeEventListener("pml_launched", onLaunched);
            removeEventListener("pml_error", onError);
        },
    };
});

export { index as default };
//# sourceMappingURL=index.js.map
