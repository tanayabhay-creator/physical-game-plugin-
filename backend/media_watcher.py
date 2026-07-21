"""Poll SteamOS removable-media mount points for game SD cards."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Awaitable, Callable, Optional, Set

from .game_info import find_game_info
from .steam_paths import list_removable_mounts

logger = logging.getLogger("physical-media-launcher.watcher")

MountCallback = Callable[[Path], Awaitable[None]]
UnmountCallback = Callable[[str], Awaitable[None]]


class MediaWatcher:
    """Lightweight mount watcher (poll-based for Deck reliability)."""

    def __init__(
        self,
        on_mount: MountCallback,
        *,
        on_unmount: Optional[UnmountCallback] = None,
        poll_interval_sec: float = 2.0,
    ) -> None:
        self._on_mount = on_mount
        self._on_unmount = on_unmount
        self._poll_interval = poll_interval_sec
        self._known: Set[str] = set()
        self._task: Optional[asyncio.Task] = None
        self._running = False

    @property
    def known_mounts(self) -> Set[str]:
        return set(self._known)

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        # Seed known mounts only — do not auto-process at plugin load.
        # Insertion / reinsertion / manual Start Transfer should drive work.
        for mount in self._scan_mounts():
            self._known.add(str(mount))
        self._task = asyncio.create_task(self._loop(), name="pml-media-watcher")
        logger.info("Media watcher started (known mounts: %s)", sorted(self._known))

    async def stop(self) -> None:
        self._running = False
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Media watcher stopped")

    async def scan_once(self) -> dict:
        """Force a scan and return mounts with/without game_info.json."""
        all_mounts: list[str] = []
        game_mounts: list[str] = []
        for mount in self._scan_mounts():
            key = str(mount)
            all_mounts.append(key)
            self._known.add(key)
            info = find_game_info(mount)
            if info is not None:
                game_mounts.append(key)
        return {
            "mounts": game_mounts,
            "all_mounts": all_mounts,
            "game_info_found": len(game_mounts) > 0,
        }

    async def _loop(self) -> None:
        while self._running:
            try:
                current = {str(p): p for p in self._scan_mounts()}
                current_keys = set(current)
                added = current_keys - self._known
                removed = self._known - current_keys
                for key in sorted(removed):
                    self._known.discard(key)
                    logger.info("Media removed: %s", key)
                    if self._on_unmount is not None:
                        try:
                            await self._on_unmount(key)
                        except Exception:
                            logger.exception("Unmount handler failed for %s", key)
                for key in sorted(added):
                    self._known.add(key)
                    mount = current[key]
                    if find_game_info(mount) is not None:
                        logger.info("Game media detected at %s", mount)
                        await self._safe_callback(mount)
                    else:
                        logger.debug("Ignoring non-game media at %s", mount)
            except Exception:
                logger.exception("Media watcher iteration failed")
            await asyncio.sleep(self._poll_interval)

    def _scan_mounts(self) -> list[Path]:
        return list_removable_mounts()

    async def _safe_callback(self, mount: Path) -> None:
        try:
            await self._on_mount(mount)
        except Exception:
            logger.exception("Mount handler failed for %s", mount)
