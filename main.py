"""Physical Media Launcher — Decky Loader backend.

Detects SD/USB media containing game_info.json, copies the game to the
internal SSD when needed, injects a Non-Steam Steam shortcut, and optionally
auto-launches the title.
"""

from __future__ import annotations

import asyncio
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Set

import decky

# Allow `import backend.*` whether Decky sets cwd to the plugin root or not.
PLUGIN_DIR = Path(getattr(decky, "DECKY_PLUGIN_DIR", Path(__file__).resolve().parent))
if str(PLUGIN_DIR) not in sys.path:
    sys.path.insert(0, str(PLUGIN_DIR))

from backend.game_info import GameInfoError, find_game_info, load_game_info  # noqa: E402
from backend.launcher import launch_steam_app, notify  # noqa: E402
from backend.media_watcher import MediaWatcher  # noqa: E402
from backend.settings_store import SettingsStore  # noqa: E402
from backend.shortcuts import ensure_non_steam_shortcut  # noqa: E402
from backend.steam_paths import list_removable_mounts  # noqa: E402
from backend.transfer import copy_game_tree, destination_ready  # noqa: E402

logger = logging.getLogger("physical-media-launcher")


def _settings_path() -> Path:
    settings_dir = Path(
        getattr(decky, "DECKY_PLUGIN_SETTINGS_DIR", PLUGIN_DIR / "settings")
    )
    settings_dir.mkdir(parents=True, exist_ok=True)
    return settings_dir / "settings.json"


class Plugin:
    async def _main(self) -> None:
        self.loop = asyncio.get_event_loop()
        self._store = SettingsStore(_settings_path())
        self._busy = False
        self._handled_mounts: Set[str] = set()
        self._lock = asyncio.Lock()
        self._status = self._store.settings.last_status or "Ready"
        self._progress = 0.0
        self._progress_message = ""
        self._bytes_copied = 0
        self._bytes_total = 0
        self._copying = False
        self._watcher = MediaWatcher(
            self._on_mount,
            on_unmount=self._on_unmount,
            poll_interval_sec=self._store.settings.poll_interval_sec,
        )
        await self._set_status("Ready", progress=0.0)
        await self._watcher.start()
        decky.logger.info("Physical Media Launcher ready")

    async def _unload(self) -> None:
        if getattr(self, "_watcher", None) is not None:
            await self._watcher.stop()
        decky.logger.info("Physical Media Launcher unloaded")

    async def _uninstall(self) -> None:
        await self._unload()

    # ------------------------------------------------------------------
    # Frontend RPC
    # ------------------------------------------------------------------

    async def get_status(self) -> Dict[str, Any]:
        s = self._store.settings
        detected = self._discover_game_mounts()
        return {
            "status": self._status,
            "progress": float(self._progress or 0),
            "progress_message": self._progress_message or "",
            "bytes_copied": int(self._bytes_copied or 0),
            "bytes_total": int(self._bytes_total or 0),
            "copying": bool(self._copying),
            "auto_launch": bool(s.auto_launch),
            "last_game": s.last_game or "",
            "last_mount": s.last_mount or "",
            "last_error": s.last_error or "",
            "last_exe": s.last_exe or "",
            # Stringify large IDs — JS/Decky RPC cannot safely carry 64-bit ints.
            "last_steam_app_id": str(int(s.last_steam_app_id or 0)),
            "last_vdf_launch_id": str(int(s.last_vdf_launch_id or 0)),
            "log_lines": [str(x) for x in list(s.log_lines[-50:])],
            "busy": bool(self._busy),
            "detected_mounts": [str(x) for x in detected],
            "has_detected_media": len(detected) > 0,
        }

    async def set_auto_launch(self, enabled: bool) -> Dict[str, Any]:
        self._store.update(auto_launch=bool(enabled))
        await self._log(f"Auto-launch {'enabled' if enabled else 'disabled'}")
        return await self.get_status()

    async def report_steam_appid(
        self,
        game_name: str,
        exe: str,
        app_id: int,
    ) -> Dict[str, Any]:
        """Save the AppID returned by SteamClient.Apps.AddShortcut."""
        try:
            app_id_i = int(app_id)
            ids = dict(self._store.settings.steam_app_ids)
            if game_name:
                ids[str(game_name)] = app_id_i
            if exe:
                ids[str(exe)] = app_id_i
            self._store.update(
                steam_app_ids=ids,
                last_steam_app_id=app_id_i,
                last_game=game_name or self._store.settings.last_game,
                last_exe=exe or self._store.settings.last_exe,
            )
            await self._log(f"Saved Steam AppID {app_id_i} for '{game_name}'")
        except Exception as exc:  # noqa: BLE001
            logger.exception("report_steam_appid failed")
            try:
                self._store.update(last_error=f"report_steam_appid: {exc}")
            except Exception:
                pass
        return await self.get_status()

    async def launch_last_game(self) -> Dict[str, Any]:
        """Manual launch button — frontend SteamClient does the real launch."""
        try:
            s = self._store.settings
            app_id = int(s.last_steam_app_id or 0)
            launch_id = int(s.last_vdf_launch_id or 0)
            game = s.last_game or "game"
            if not app_id and game in (s.steam_app_ids or {}):
                app_id = int(s.steam_app_ids[game])
            if not app_id and s.last_exe in (s.steam_app_ids or {}):
                app_id = int(s.steam_app_ids[s.last_exe])

            if not app_id and not launch_id:
                self._store.update(
                    last_error=(
                        "No saved Steam AppID yet. Run Start Transfer once "
                        "with the plugin menu open, then try Launch again."
                    )
                )
                await self._set_status("Error", progress=0.0)
                return await self.get_status()

            # Strings only in event payload for Decky/JS safety.
            payload = {
                "game_name": game,
                "exe": s.last_exe or "",
                "start_dir": "",
                "launch_options": "",
                "should_launch": True,
                "steam_app_id": str(app_id),
                "vdf_launch_id": str(launch_id),
                "shortcut_appid": str(app_id),
                "already_installed": True,
            }
            await self._log(
                f"Manual launch requested for '{game}' "
                f"(steam_app_id={app_id}, vdf_launch_id={launch_id})"
            )
            await decky.emit("pml_launch_game", payload)
            self._store.update(last_error="")
            await self._set_status("Launch requested", progress=100.0)
            return await self.get_status()
        except Exception as exc:  # noqa: BLE001
            logger.exception("launch_last_game failed")
            try:
                self._store.update(last_error=f"{type(exc).__name__}: {exc}")
                await self._set_status("Error", progress=0.0)
            except Exception:
                pass
            try:
                return await self.get_status()
            except Exception:
                return {
                    "status": "Error",
                    "progress": 0,
                    "progress_message": "",
                    "bytes_copied": 0,
                    "bytes_total": 0,
                    "copying": False,
                    "auto_launch": True,
                    "last_game": "",
                    "last_mount": "",
                    "last_error": str(exc),
                    "last_exe": "",
                    "last_steam_app_id": "0",
                    "last_vdf_launch_id": "0",
                    "log_lines": [],
                    "busy": False,
                    "detected_mounts": [],
                    "has_detected_media": False,
                }

    async def clear_log(self) -> Dict[str, Any]:
        self._store.update(log_lines=[], last_error="")
        return await self.get_status()

    async def rescan_media(self) -> Dict[str, Any]:
        all_mounts = [str(p) for p in list_removable_mounts()]
        mounts = self._discover_game_mounts()
        await self._log(
            f"Manual rescan: {len(all_mounts)} mount(s), "
            f"{len(mounts)} with game_info.json"
        )
        if all_mounts and not mounts:
            await self._log(
                "Mounted volumes found, but none have game_info.json on/near the root. "
                f"Mounts: {', '.join(all_mounts)}"
            )
        elif not all_mounts:
            await self._log(
                "No removable mounts under /run/media/deck (is the SD card inserted and mounted?)"
            )
        return {
            "mounts": mounts,
            "all_mounts": all_mounts,
            **(await self.get_status()),
        }

    async def start_transfer(
        self,
        mount_path: str,
        force_recopy: bool,
    ) -> Dict[str, Any]:
        """Start SD -> SSD copy in the background and return immediately.

        Decky RPC calls can time out / surface as a generic "Python exception"
        if we await a multi-GB copy inside the callable. Progress continues via
        pml_progress / pml_status events.
        """
        try:
            # Clear a stuck busy flag so the user can always retry from the UI.
            async with self._lock:
                if self._busy and not self._copying:
                    await self._log("Clearing stuck busy flag before manual transfer")
                    self._busy = False
                if self._busy or self._copying:
                    self._store.update(last_error="A transfer is already running")
                    return await self.get_status()

            target = str(mount_path or "").strip()
            if not target:
                detected = self._discover_game_mounts()
                if detected:
                    target = detected[0]
                elif self._store.settings.last_mount:
                    target = self._store.settings.last_mount
                    await self._log(
                        f"No live detection; falling back to last_mount={target}"
                    )

            if not target:
                msg = (
                    "No game SD/USB with game_info.json is mounted. "
                    "Check the card root for game_info.json, then Rescan."
                )
                await self._log(f"Start Transfer failed: {msg}")
                self._store.update(last_error=msg)
                await self._set_status("Error", progress=0.0)
                return await self.get_status()

            mount = Path(target)
            if not mount.exists():
                msg = f"Mount path does not exist: {target}"
                self._store.update(last_error=msg)
                await self._set_status("Error", progress=0.0)
                await self._log(f"Start Transfer failed: {msg}")
                return await self.get_status()

            # Validate metadata quickly so the UI gets a useful error immediately.
            try:
                info = load_game_info(mount)
            except GameInfoError as exc:
                msg = f"Invalid game_info.json: {exc}"
                self._store.update(last_error=msg)
                await self._set_status("Error", progress=0.0)
                await self._log(msg)
                return await self.get_status()

            if not info.source_game_dir.is_dir():
                msg = (
                    f"GameFolder not found on SD: {info.source_game_dir}. "
                    "Fix GameFolder in game_info.json."
                )
                self._store.update(last_error=msg)
                await self._set_status("Error", progress=0.0)
                await self._log(msg)
                return await self.get_status()

            if not info.source_exe.is_file():
                msg = (
                    f"Exe not found on SD: {info.source_exe}. "
                    "Fix ExePath in game_info.json (relative to GameFolder)."
                )
                self._store.update(last_error=msg)
                await self._set_status("Error", progress=0.0)
                await self._log(msg)
                return await self.get_status()

            self._store.update(
                last_mount=str(mount),
                last_game=info.game_name,
                last_error="",
            )
            self._copying = True
            self._progress = 0.0
            self._progress_message = "Starting transfer..."
            await self._set_status("Copying Game...", progress=0.0)
            await self._log(
                f"Manual transfer queued for {target} "
                f"(force_recopy={bool(force_recopy)})"
            )
            await self._emit_status()

            loop = getattr(self, "loop", None) or asyncio.get_event_loop()
            loop.create_task(
                self._handle_mount(
                    mount,
                    force=True,
                    force_recopy=bool(force_recopy),
                ),
                name="pml-start-transfer",
            )
            return await self.get_status()
        except Exception as exc:  # noqa: BLE001 - never raise into Decky RPC
            import traceback

            tb = traceback.format_exc()
            msg = f"{type(exc).__name__}: {exc}"
            logger.exception("start_transfer failed")
            try:
                self._copying = False
                self._busy = False
                self._store.update(last_error=msg)
                self._store.append_log(f"ERROR: {msg}")
                self._store.append_log(tb[-1500:])
                await self._set_status("Error", progress=0.0)
            except Exception:
                pass
            return await self.get_status()

    async def reset_busy(self) -> Dict[str, Any]:
        """Unstick the UI if a previous transfer left busy=true."""
        async with self._lock:
            self._busy = False
            self._copying = False
        await self._log("Busy state reset from UI")
        await self._set_status("Ready", progress=0.0)
        return await self.get_status()

    async def process_mount(self, mount_path: str) -> Dict[str, Any]:
        await self._handle_mount(Path(mount_path), force=True, force_recopy=False)
        return await self.get_status()

    def _discover_game_mounts(self) -> list[str]:
        found: list[str] = []
        for mount in list_removable_mounts():
            if find_game_info(mount) is not None:
                found.append(str(mount))
        return found

    # ------------------------------------------------------------------
    # Core pipeline
    # ------------------------------------------------------------------

    async def _on_mount(self, mount: Path) -> None:
        # Reinsertion must be allowed to launch again.
        await self._handle_mount(mount, force=True, force_recopy=False)

    async def _on_unmount(self, mount_key: str) -> None:
        # Forget this mount so the next insertion runs detect/launch again.
        to_remove = {mount_key}
        try:
            resolved = str(Path(mount_key).resolve())
            to_remove.add(resolved)
        except Exception:
            pass
        before = len(self._handled_mounts)
        self._handled_mounts -= to_remove
        # Also drop any handled entries that share the same mount prefix.
        self._handled_mounts = {
            m for m in self._handled_mounts if m not in to_remove and not m.startswith(mount_key)
        }
        await self._log(
            f"Card removed ({mount_key}); cleared handled state "
            f"({before} -> {len(self._handled_mounts)})"
        )
        await self._set_status("Ready (waiting for card)", progress=0.0, persist=False)
        await self._emit_status()

    async def _handle_mount(
        self,
        mount: Path,
        *,
        force: bool,
        force_recopy: bool = False,
    ) -> None:
        key = str(mount.resolve()) if mount.exists() else str(mount)
        async with self._lock:
            if self._busy:
                await self._log(f"Busy; ignoring mount event for {key}")
                return
            if not force and key in self._handled_mounts:
                await self._log(
                    f"Already processed {key}; use Start Transfer to run again"
                )
                return
            self._busy = True

        try:
            try:
                info = load_game_info(mount)
            except GameInfoError as exc:
                # Non-game media: silently ignore (edge case requirement).
                await self._log(f"Skipping media without valid game_info.json ({exc})")
                return

            self._store.update(last_mount=str(mount), last_game=info.game_name, last_error="")
            await self._set_status(f"Detected: {info.game_name}", progress=0.0)
            await self._emit_status()
            if self._store.settings.notify_on_detect:
                await notify("Physical Media Launcher", f"Detected {info.game_name}")

            dest = info.destination_dir
            exe_rel = info.exe_path
            source_dir = info.source_game_dir
            source_exe = info.source_exe

            await self._log(
                f"Game '{info.game_name}': source={source_dir}, exe={source_exe}, dest={dest}"
            )

            if not source_dir.is_dir():
                raise FileNotFoundError(
                    f"GameFolder not found on SD card: {source_dir}. "
                    f"Check GameFolder in game_info.json."
                )
            if not source_exe.is_file():
                # Helpful listing for common ExePath mistakes.
                raise FileNotFoundError(
                    f"Source executable not found on media: {source_exe}. "
                    f"Check ExePath in game_info.json (path must be relative to GameFolder)."
                )

            already = destination_ready(dest, exe_rel)
            if already and not force_recopy:
                await self._log(f"Game already on SSD at {dest}; skipping copy")
                self._copying = False
                self._progress_message = "Already on SSD — copy skipped"
                self._bytes_copied = 0
                self._bytes_total = 0
                await self._set_status("Game already on SSD", progress=100.0)
            else:
                if already and force_recopy:
                    await self._log(f"Force re-copy requested; replacing {dest}")
                self._copying = True
                self._progress_message = "Preparing copy..."
                self._bytes_copied = 0
                self._bytes_total = 0
                await self._set_status("Copying Game...", progress=0.0)
                await self._emit_status()

                async def on_progress(
                    pct: float,
                    message: str,
                    bytes_copied: int,
                    bytes_total: int,
                ) -> None:
                    self._progress = pct
                    self._progress_message = message
                    self._bytes_copied = int(bytes_copied)
                    self._bytes_total = int(bytes_total)
                    self._copying = True
                    await self._set_status("Copying Game...", progress=pct, persist=False)
                    await decky.emit(
                        "pml_progress",
                        {
                            "progress": pct,
                            "progress_message": message,
                            "bytes_copied": bytes_copied,
                            "bytes_total": bytes_total,
                            "copying": True,
                            "last_game": info.game_name,
                        },
                    )
                    await self._emit_status()

                result = await copy_game_tree(
                    source_dir,
                    dest,
                    progress_cb=on_progress,
                )
                self._copying = False
                self._progress_message = "Copy complete"
                self._bytes_copied = result.bytes_copied
                self._bytes_total = max(self._bytes_total, result.bytes_copied)
                await self._log(
                    f"Copied {info.game_name}: {result.bytes_copied} bytes "
                    f"in {result.duration_sec:.1f}s -> {result.destination}"
                )

            if not info.destination_exe.is_file():
                raise FileNotFoundError(
                    f"Expected executable missing after transfer: {info.destination_exe}"
                )

            await self._set_status("Adding game to Steam...", progress=100.0)
            await self._emit_status()

            # Plugin UI toggle wins. Card AutoLaunch=false was blocking launches.
            should_launch = bool(self._store.settings.auto_launch)
            if info.auto_launch is not None and info.auto_launch != should_launch:
                await self._log(
                    f"Ignoring card AutoLaunch={info.auto_launch}; "
                    f"plugin toggle is {should_launch}"
                )

            # Persist into shortcuts.vdf as a durable fallback.
            shortcut = ensure_non_steam_shortcut(
                app_name=info.game_name,
                exe_path=str(info.destination_exe),
                start_dir=str(info.resolved_start_dir()),
                launch_options=info.resolved_launch_options(),
            )
            await self._log(
                f"{'Created' if shortcut.created else 'Updated'} shortcuts.vdf "
                f"appid={shortcut.appid} launch_id={shortcut.steam_launch_id}"
            )

            # Prefer a previously saved SteamClient AppID for reliable RunGame launches.
            saved_app_id = 0
            ids = self._store.settings.steam_app_ids
            if info.game_name in ids:
                saved_app_id = int(ids[info.game_name])
            elif str(info.destination_exe) in ids:
                saved_app_id = int(ids[str(info.destination_exe)])

            self._store.update(
                last_exe=str(info.destination_exe),
                last_vdf_launch_id=int(shortcut.steam_launch_id),
                last_steam_app_id=int(saved_app_id or self._store.settings.last_steam_app_id or 0),
            )

            steam_payload = {
                "game_name": info.game_name,
                "exe": str(info.destination_exe),
                "start_dir": str(info.resolved_start_dir()),
                "launch_options": info.resolved_launch_options(),
                "compat_tool": info.compat_tool or "",
                "should_launch": bool(should_launch),
                # Strings avoid Decky/JS 64-bit integer RPC issues.
                "vdf_launch_id": str(int(shortcut.steam_launch_id)),
                "steam_app_id": str(int(saved_app_id)),
                "shortcut_appid": str(int(shortcut.appid)),
                "already_installed": bool(already and not force_recopy),
                "needs_add_shortcut": bool(saved_app_id <= 0),
            }

            await decky.emit("pml_add_to_steam", steam_payload)
            await self._log(
                f"Requested Steam registration for '{info.game_name}' "
                f"(saved_app_id={saved_app_id}, needs_add={steam_payload['needs_add_shortcut']}, "
                f"should_launch={should_launch})"
            )

            if should_launch:
                await self._set_status("Launching Game...", progress=100.0)
                await self._emit_status()
                # Give frontend a moment to AddShortcut / resolve AppID first.
                await asyncio.sleep(1.2)
                # Refresh payload with any AppID the frontend may have just saved.
                self._store.load()
                refreshed = int(self._store.settings.last_steam_app_id or saved_app_id or 0)
                steam_payload["steam_app_id"] = str(refreshed)
                await decky.emit("pml_launch_game", steam_payload)
                await self._log(
                    f"Launch emit: steam_app_id={refreshed} "
                    f"vdf_launch_id={shortcut.steam_launch_id}"
                )
                # Frontend SteamClient is primary in Game Mode; backend URI is best-effort.
                try:
                    await launch_steam_app(
                        shortcut.steam_launch_id,
                        shortcut_appid=int(shortcut.appid),
                    )
                except Exception as launch_exc:  # noqa: BLE001
                    await self._log(f"Backend URI launch note: {launch_exc}")
                await self._set_status("Launch requested", progress=100.0)
                await notify("Physical Media Launcher", f"Launching {info.game_name}")
                await decky.emit(
                    "pml_launched", info.game_name, str(shortcut.steam_launch_id)
                )
            else:
                await self._set_status("Added to Steam", progress=100.0)
                await notify(
                    "Physical Media Launcher",
                    f"{info.game_name} added to Steam library",
                )

            self._handled_mounts.add(key)
            await self._emit_status()
        except Exception as exc:  # noqa: BLE001 - surface to UI
            logger.exception("Failed processing mount %s", mount)
            self._copying = False
            self._store.update(last_error=str(exc))
            await self._set_status("Error", progress=self._progress)
            await self._log(f"ERROR: {exc}")
            await decky.emit("pml_error", str(exc))
            await self._emit_status()
        finally:
            self._copying = False
            async with self._lock:
                self._busy = False

    async def _set_status(
        self,
        status: str,
        *,
        progress: Optional[float] = None,
        persist: bool = True,
    ) -> None:
        self._status = status
        if progress is not None:
            self._progress = float(progress)
        if persist:
            self._store.update(last_status=status)

    async def _log(self, message: str) -> None:
        stamp = datetime.now(timezone.utc).astimezone().strftime("%H:%M:%S")
        line = f"[{stamp}] {message}"
        decky.logger.info(message)
        self._store.append_log(line)
        await decky.emit("pml_log", line)

    async def _emit_status(self) -> None:
        await decky.emit("pml_status", await self.get_status())
