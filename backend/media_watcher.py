"""Poll SteamOS removable-media mount points for game SD cards."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Awaitable, Callable, Optional, Set

from .steam_paths import media_mount_roots

logger = logging.getLogger("physical-media-launcher.watcher")

MountCallback = Callable[[Path], Awaitable[None]]


class MediaWatcher:
    """Lightweight mount watcher (poll-based for Deck reliability).

    A true udev rule can also notify the plugin (see defaults/udev), but the
    in-process poller works without installing system units and is enough to
    detect SD/USB mounts under /run/media/<user>.
    """

    def __init__(
        self,
        on_mount: MountCallback,
        *,
        poll_interval_sec: float = 2.0,
        game_info_name: str = "game_info.json",
    ) -> None:
        self._on_mount = on_mount
        self._poll_interval = poll_interval_sec
        self._game_info_name = game_info_name
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
        # Seed known mounts so already-inserted non-game cards are ignored,
        # but still process game cards present at plugin load.
        for mount in self._scan_mounts():
            self._known.add(str(mount))
            if (mount / self._game_info_name).is_file():
                await self._safe_callback(mount)
        self._task = asyncio.create_task(self._loop(), name="pml-media-watcher")
        logger.info("Media watcher started")

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

    async def scan_once(self) -> list[str]:
        """Force a scan and return mounts that currently have game_info.json."""
        found: list[str] = []
        for mount in self._scan_mounts():
            self._known.add(str(mount))
            if (mount / self._game_info_name).is_file():
                found.append(str(mount))
                await self._safe_callback(mount)
        return found

    async def _loop(self) -> None:
        while self._running:
            try:
                current = {str(p): p for p in self._scan_mounts()}
                current_keys = set(current)
                added = current_keys - self._known
                removed = self._known - current_keys
                for key in removed:
                    self._known.discard(key)
                for key in sorted(added):
                    self._known.add(key)
                    mount = current[key]
                    if (mount / self._game_info_name).is_file():
                        logger.info("Game media detected at %s", mount)
                        await self._safe_callback(mount)
                    else:
                        logger.debug("Ignoring non-game media at %s", mount)
            except Exception:
                logger.exception("Media watcher iteration failed")
            await asyncio.sleep(self._poll_interval)

    def _scan_mounts(self) -> list[Path]:
        mounts: list[Path] = []
        for root in media_mount_roots():
            if not root.is_dir():
                continue
            try:
                children = list(root.iterdir())
            except PermissionError:
                continue
            for child in children:
                if child.is_dir() and not child.name.startswith("."):
                    mounts.append(child)
        return mounts

    async def _safe_callback(self, mount: Path) -> None:
        try:
            await self._on_mount(mount)
        except Exception:
            logger.exception("Mount handler failed for %s", mount)
