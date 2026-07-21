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

from backend.game_info import GameInfoError, load_game_info  # noqa: E402
from backend.launcher import launch_steam_app, notify  # noqa: E402
from backend.media_watcher import MediaWatcher  # noqa: E402
from backend.settings_store import SettingsStore  # noqa: E402
from backend.shortcuts import ensure_non_steam_shortcut  # noqa: E402
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
        return {
            "status": self._status,
            "progress": self._progress,
            "progress_message": self._progress_message,
            "bytes_copied": self._bytes_copied,
            "bytes_total": self._bytes_total,
            "copying": self._copying,
            "auto_launch": s.auto_launch,
            "last_game": s.last_game,
            "last_mount": s.last_mount,
            "last_error": s.last_error,
            "log_lines": list(s.log_lines[-50:]),
            "busy": self._busy,
        }

    async def set_auto_launch(self, enabled: bool) -> Dict[str, Any]:
        self._store.update(auto_launch=bool(enabled))
        await self._log(f"Auto-launch {'enabled' if enabled else 'disabled'}")
        return await self.get_status()

    async def clear_log(self) -> Dict[str, Any]:
        self._store.update(log_lines=[], last_error="")
        return await self.get_status()

    async def rescan_media(self) -> Dict[str, Any]:
        mounts = await self._watcher.scan_once()
        await self._log(f"Manual rescan found {len(mounts)} game mount(s)")
        return {"mounts": mounts, **(await self.get_status())}

    async def process_mount(self, mount_path: str) -> Dict[str, Any]:
        await self._handle_mount(Path(mount_path), force=True)
        return await self.get_status()

    # ------------------------------------------------------------------
    # Core pipeline
    # ------------------------------------------------------------------

    async def _on_mount(self, mount: Path) -> None:
        await self._handle_mount(mount, force=False)

    async def _handle_mount(self, mount: Path, *, force: bool) -> None:
        key = str(mount.resolve()) if mount.exists() else str(mount)
        async with self._lock:
            if self._busy:
                await self._log(f"Busy; ignoring mount event for {key}")
                return
            if not force and key in self._handled_mounts:
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

            if destination_ready(dest, exe_rel):
                await self._log(f"Game already on SSD at {dest}; skipping copy")
                self._copying = False
                self._progress_message = "Already on SSD — copy skipped"
                self._bytes_copied = 0
                self._bytes_total = 0
                await self._set_status("Game already on SSD", progress=100.0)
            else:
                if not info.source_exe.is_file():
                    raise FileNotFoundError(
                        f"Source executable not found on media: {info.source_exe}"
                    )
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
                    info.source_game_dir,
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

            await self._set_status("Registering Non-Steam shortcut...", progress=100.0)
            shortcut = ensure_non_steam_shortcut(
                app_name=info.game_name,
                exe_path=str(info.destination_exe),
                start_dir=str(info.resolved_start_dir()),
                launch_options=info.resolved_launch_options(),
            )
            await self._log(
                f"{'Created' if shortcut.created else 'Found'} shortcut "
                f"appid={shortcut.appid} launch_id={shortcut.steam_launch_id}"
            )

            should_launch = self._store.settings.auto_launch
            if info.auto_launch is not None:
                # Per-card override wins when present.
                should_launch = info.auto_launch

            if should_launch:
                await self._set_status("Launching Game...", progress=100.0)
                await self._emit_status()
                # Steam may need a moment to notice shortcuts.vdf changes.
                await asyncio.sleep(1.0)
                await launch_steam_app(shortcut.steam_launch_id)
                await self._set_status("Game Launched", progress=100.0)
                await notify("Physical Media Launcher", f"Launching {info.game_name}")
                await decky.emit("pml_launched", info.game_name, shortcut.steam_launch_id)
            else:
                await self._set_status("Ready (auto-launch off)", progress=100.0)

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
