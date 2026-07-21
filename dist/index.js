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
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
function looksLikeWindowsExe(exePath) {
    return exePath.toLowerCase().endsWith(".exe");
}
function resolveStartDir(req) {
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
function resolveCompatTool(req) {
    const explicit = (req.compat_tool || "").trim();
    if (explicit) {
        return explicit;
    }
    return looksLikeWindowsExe(req.exe || "") ? "proton_experimental" : "";
}
function appMatches(app, appName, exePath) {
    const name = String(app?.display_name ?? app?.strDisplayName ?? app?.name ?? app?.AppName ?? "");
    const exe = String(app?.strExePath ?? app?.exe ?? app?.Exe ?? app?.steam_churn ?? "");
    const appid = asIdString(app?.appid ?? app?.appId ?? app?.unAppID ?? app?.appid_for_shortcut);
    if (!appid) {
        return null;
    }
    const exeNorm = exePath.replace(/"/g, "");
    const exeField = exe.replace(/"/g, "");
    if (name === appName) {
        return appid;
    }
    if (exeNorm && exeField && (exeField.includes(exeNorm) || exeNorm.includes(exeField))) {
        return appid;
    }
    return null;
}
/**
 * Find a Non-Steam shortcut that is already visible in the live Game Mode library.
 * Never treat VDF CRC32 IDs as proof the shortcut is live.
 */
async function findExistingShortcutAppId(appName, exePath) {
    // collectionStore is what Game Mode's library actually uses.
    try {
        const cs = window.collectionStore;
        const bags = [
            cs?.allApps,
            cs?.deckDesktopApps?.allApps,
            cs?.deckDesktopApps?.apps,
            cs?.localGames?.allApps,
            cs?.appsList?.allApps,
        ].filter(Boolean);
        for (const bag of bags) {
            const list = Array.isArray(bag)
                ? bag
                : typeof bag?.values === "function"
                    ? Array.from(bag.values())
                    : typeof bag?.[Symbol.iterator] === "function"
                        ? Array.from(bag)
                        : [];
            for (const app of list) {
                const id = appMatches(app, appName, exePath);
                if (id) {
                    console.log("PML found existing shortcut in collectionStore", id);
                    return id;
                }
            }
        }
    }
    catch (err) {
        console.warn("PML collectionStore scan failed", err);
    }
    const apps = window.SteamClient?.Apps;
    if (apps?.GetAllApps) {
        try {
            const all = await Promise.resolve(apps.GetAllApps());
            if (Array.isArray(all)) {
                for (const app of all) {
                    const id = appMatches(app, appName, exePath);
                    if (id) {
                        console.log("PML found existing shortcut in GetAllApps", id);
                        return id;
                    }
                }
            }
        }
        catch (err) {
            console.warn("PML GetAllApps scan failed", err);
        }
    }
    return null;
}
async function configureShortcut(appId, req) {
    const apps = window.SteamClient?.Apps;
    if (!apps) {
        return;
    }
    const startDir = resolveStartDir(req);
    const numericId = Number(appId);
    try {
        if (typeof apps.SetShortcutName === "function") {
            await Promise.resolve(apps.SetShortcutName(numericId, req.game_name));
        }
    }
    catch {
        // ignore
    }
    try {
        if (typeof apps.SetShortcutExe === "function") {
            // Steam expects quoted exe paths for Non-Steam shortcuts.
            await Promise.resolve(apps.SetShortcutExe(numericId, `"${req.exe}"`));
        }
    }
    catch {
        // ignore
    }
    try {
        if (typeof apps.SetShortcutStartDir === "function" && startDir) {
            await Promise.resolve(apps.SetShortcutStartDir(numericId, `"${startDir}"`));
        }
    }
    catch {
        // ignore
    }
    try {
        if (typeof apps.SetShortcutLaunchOptions === "function") {
            await Promise.resolve(apps.SetShortcutLaunchOptions(numericId, req.launch_options || ""));
        }
    }
    catch {
        // ignore
    }
    // Required for Windows .exe Non-Steam games on Steam Deck.
    const compat = resolveCompatTool(req);
    if (compat && typeof apps.SpecifyCompatTool === "function") {
        const tools = [compat, "proton_experimental", "proton_hotfix", "proton_9"];
        const unique = [...new Set(tools.filter(Boolean))];
        for (const tool of unique) {
            try {
                await Promise.resolve(apps.SpecifyCompatTool(numericId, tool));
                console.log("PML SpecifyCompatTool", appId, tool);
                break;
            }
            catch (err) {
                console.warn("SpecifyCompatTool failed", tool, err);
            }
        }
    }
    await sleep(500);
}
async function runGame(appId, launchOptions = "") {
    const apps = window.SteamClient?.Apps;
    if (!apps || typeof apps.RunGame !== "function") {
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
            await Promise.resolve(apps.RunGame(id, launchOptions || "", param2, launchSource));
            console.log("PML RunGame", id, param2, launchSource);
            return true;
        }
        catch (err) {
            console.warn("RunGame string id failed", id, param2, err);
        }
        try {
            await Promise.resolve(apps.RunGame(Number(id), launchOptions || "", param2, launchSource));
            console.log("PML RunGame(number)", id, param2, launchSource);
            return true;
        }
        catch (err) {
            console.warn("RunGame number id failed", id, param2, err);
        }
    }
    return false;
}
function softRestartSteam() {
    try {
        const sc = window.SteamClient;
        if (typeof sc?.User?.StartRestart === "function") {
            sc.User.StartRestart(false);
            console.log("PML SteamClient.User.StartRestart(false)");
            return true;
        }
    }
    catch (err) {
        console.warn("StartRestart failed", err);
    }
    return false;
}
/**
 * Ensure a Non-Steam shortcut exists in the LIVE Game Mode library.
 * Always calls AddShortcut when the game is not already visible — never trust
 * VDF CRC32 IDs alone (those only show up after a Steam restart).
 */
async function ensureConfiguredShortcut(req) {
    const apps = window.SteamClient?.Apps;
    if (!apps?.AddShortcut) {
        throw new Error("SteamClient.Apps.AddShortcut is unavailable");
    }
    const startDir = resolveStartDir(req);
    let appId = await findExistingShortcutAppId(req.game_name, req.exe);
    const saved = asIdString(req.steam_app_id);
    const vdfId = asIdString(req.shortcut_appid);
    // Reuse a just-created SteamClient AppID from the add handler when the
    // library overview has not refreshed yet. Never reuse the VDF CRC32 id.
    if (!appId && saved && saved !== vdfId && req.needs_add_shortcut === false) {
        console.log("PML reusing just-created SteamClient AppID", saved);
        appId = saved;
    }
    if (!appId) {
        console.log("PML AddShortcut", req.game_name, req.exe, startDir, req.launch_options || "");
        // Documented signature: (appName, executablePath, directory, launchOptions)
        const created = await Promise.resolve(apps.AddShortcut(req.game_name, req.exe, startDir, req.launch_options || ""));
        appId = asIdString(created);
        console.log("PML AddShortcut returned", appId);
    }
    if (!appId) {
        throw new Error("SteamClient.Apps.AddShortcut did not return an AppID");
    }
    await configureShortcut(appId, { ...req, start_dir: startDir });
    // Confirm it became visible; if not, soft-restart so VDF/fallback loads.
    await sleep(300);
    const visible = await findExistingShortcutAppId(req.game_name, req.exe);
    if (visible) {
        return visible;
    }
    console.warn("PML shortcut AppID", appId, "not yet visible in library — returning AddShortcut id anyway");
    return appId;
}
async function addGameToSteam(req) {
    try {
        const appId = await ensureConfiguredShortcut(req);
        return { ok: true, appId: Number(appId) };
    }
    catch (err) {
        // Last resort: VDF was written by backend; soft-restart Steam so it loads.
        const restarted = softRestartSteam();
        return {
            ok: false,
            restarted,
            error: restarted
                ? `${String(err)} — restarting Steam so the Non-Steam shortcut can appear.`
                : String(err),
        };
    }
}
/**
 * Configure shortcut (with Proton for .exe) and launch via RunGame only.
 * Creates the live library entry first when missing.
 */
async function launchSteamGame(req) {
    try {
        if (!req.exe) {
            return {
                ok: false,
                error: "Missing exe path — transfer may not have finished",
            };
        }
        const appId = await ensureConfiguredShortcut(req);
        const ok = await runGame(appId, req.launch_options || "");
        if (!ok) {
            return {
                ok: false,
                appId: Number(appId),
                error: `SteamClient.Apps.RunGame failed for AppID ${appId}`,
            };
        }
        return { ok: true, appId: Number(appId) };
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
            const exe = next.last_exe || "/home/deck/Games/Silksong/Silksong.exe";
            const startDir = exe.includes("/")
                ? exe.slice(0, exe.lastIndexOf("/"))
                : "/home/deck/Games/Silksong";
            const result = await launchSteamGame({
                game_name: next.last_game || "Silksong",
                exe,
                start_dir: startDir,
                launch_options: "",
                compat_tool: "proton_experimental",
                // Force live AddShortcut — do not pass VDF CRC32 as steam_app_id.
                steam_app_id: "0",
                shortcut_appid: next.last_shortcut_appid || "0",
                should_launch: true,
                already_installed: true,
                needs_add_shortcut: true,
            });
            if (result.ok && result.appId) {
                try {
                    await reportSteamAppId(next.last_game || "Silksong", exe, result.appId);
                }
                catch (err) {
                    console.warn("report_steam_appid failed", err);
                }
            }
            if (!next.plugin_build) {
                toaster.toast({
                    title: "Backend not updated",
                    body: "UI is new but Python backend is old. Reinstall + restart Decky.",
                });
            }
            toaster.toast({
                title: result.ok ? "Launching with Proton" : "Launch failed",
                body: result.ok
                    ? `${next.last_game || "game"}${result.appId ? ` (AppID ${result.appId})` : ""}`
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
    const onFixSteamShortcut = async () => {
        try {
            const next = await getStatus();
            setState(next);
            const exe = next.last_exe || "";
            if (!exe) {
                toaster.toast({
                    title: "Nothing to add",
                    body: "Transfer a game first, then try again.",
                });
                return;
            }
            const startDir = exe.includes("/")
                ? exe.slice(0, exe.lastIndexOf("/"))
                : "";
            const result = await addGameToSteam({
                game_name: next.last_game || "Physical Media Game",
                exe,
                start_dir: startDir,
                launch_options: "",
                compat_tool: "proton_experimental",
                steam_app_id: "0",
                shortcut_appid: next.last_shortcut_appid || "0",
                already_installed: true,
                needs_add_shortcut: true,
                should_launch: false,
            });
            if (result.ok && result.appId) {
                try {
                    await reportSteamAppId(next.last_game || "Physical Media Game", exe, result.appId);
                }
                catch (err) {
                    console.warn("report_steam_appid failed", err);
                }
                toaster.toast({
                    title: "Added to Non-Steam",
                    body: `${next.last_game || "game"} (AppID ${result.appId}) — check Library → Non-Steam`,
                });
            }
            else {
                toaster.toast({
                    title: "Add to Steam failed",
                    body: result.error || "Could not add shortcut",
                });
            }
        }
        catch (err) {
            toaster.toast({
                title: "Add to Steam failed",
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
                                    }, children: state.progress_message }) }) })) : null] })) : (SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.Field, { label: "Transfer", description: "Press Start Transfer after a game card is detected.", children: "Idle" }) })) }), SP_JSX.jsxs(DFL.PanelSection, { title: "Transfer", children: [SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ButtonItem, { layout: "below", disabled: transferLocked, onClick: () => void onStartTransfer(false), children: transferLocked ? "Transfer in progress…" : "Start Transfer (SD → SSD)" }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ButtonItem, { layout: "below", disabled: transferLocked, onClick: () => void onStartTransfer(true), children: "Force Re-Copy (overwrite SSD)" }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ButtonItem, { layout: "below", onClick: () => void onLaunchLast(), children: "Launch last game now" }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ButtonItem, { layout: "below", onClick: () => void onFixSteamShortcut(), children: "Add / Fix Non-Steam shortcut" }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ButtonItem, { layout: "below", onClick: () => void onRescan(), children: "Rescan inserted media" }) }), SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ButtonItem, { layout: "below", onClick: () => void onResetBusy(), children: "Reset stuck transfer state" }) })] }), SP_JSX.jsx(DFL.PanelSection, { title: "Auto-Launch", children: SP_JSX.jsx(DFL.PanelSectionRow, { children: SP_JSX.jsx(DFL.ToggleField, { label: "Enable Auto-Launch on Insertion", description: "When ON, reinserting the SD card launches the game automatically (plugin toggle overrides game_info.json AutoLaunch).", checked: state.auto_launch, onChange: (checked) => {
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
            // Live library registration — must call AddShortcut (not VDF-only).
            const result = await addGameToSteam({
                ...payload,
                steam_app_id: "0",
                needs_add_shortcut: true,
            });
            if (result.ok) {
                if (result.appId) {
                    try {
                        await reportSteamAppId(payload.game_name, payload.exe, result.appId);
                    }
                    catch (err) {
                        console.warn("report_steam_appid failed", err);
                    }
                }
                toaster.toast({
                    title: "Added to Non-Steam",
                    body: `${payload.game_name}${result.appId ? ` (AppID ${result.appId})` : ""}`,
                });
                // Add + launch in one shot so we never launch with a VDF-only id.
                if (payload.should_launch) {
                    const launch = await launchSteamGame({
                        ...payload,
                        steam_app_id: result.appId ? String(result.appId) : "0",
                        needs_add_shortcut: false,
                    });
                    if (launch.ok && launch.appId) {
                        try {
                            await reportSteamAppId(payload.game_name, payload.exe, launch.appId);
                        }
                        catch (err) {
                            console.warn("report_steam_appid failed", err);
                        }
                    }
                    toaster.toast({
                        title: launch.ok ? "Launching with Proton" : "Launch failed",
                        body: launch.ok
                            ? `${payload.game_name}${launch.appId ? ` (AppID ${launch.appId})` : ""}`
                            : launch.error || "Could not launch",
                    });
                }
            }
            else {
                toaster.toast({
                    title: "Steam shortcut",
                    body: result.error ||
                        "SteamClient add failed — try Add/Fix Non-Steam shortcut.",
                });
            }
        })();
    });
    const onLaunchGame = addEventListener("pml_launch_game", (payload) => {
        void (async () => {
            const result = await launchSteamGame(payload);
            if (result.ok && result.appId) {
                try {
                    await reportSteamAppId(payload.game_name, payload.exe, result.appId);
                }
                catch (err) {
                    console.warn("report_steam_appid failed", err);
                }
                toaster.toast({
                    title: "Launching with Proton",
                    body: `${payload.game_name} (AppID ${result.appId})`,
                });
            }
            else if (result.ok) {
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
