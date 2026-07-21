"""Launch Non-Steam shortcuts through the local Steam client."""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
from pathlib import Path
from typing import List

from .steam_paths import decky_user_home, find_steam_root

logger = logging.getLogger("physical-media-launcher.launcher")


def _steam_command_candidates() -> List[str]:
    candidates: List[str] = []
    which = shutil.which("steam")
    if which:
        candidates.append(which)
    root = find_steam_root()
    if root is not None:
        steam_sh = root / "steam.sh"
        if steam_sh.is_file():
            candidates.append(str(steam_sh))
    # Flatpak Steam on some setups
    flatpak = shutil.which("flatpak")
    if flatpak:
        candidates.append("flatpak-steam")
    return candidates


async def launch_steam_app(steam_launch_id: int) -> None:
    """Ask Steam to run a library / Non-Steam shortcut by launch id."""
    uri = f"steam://rungameid/{steam_launch_id}"
    home = str(decky_user_home())
    env = os.environ.copy()
    env.setdefault("HOME", home)
    env.setdefault("USER", Path(home).name)

    errors: List[str] = []
    for candidate in _steam_command_candidates():
        try:
            if candidate == "flatpak-steam":
                proc = await asyncio.create_subprocess_exec(
                    "flatpak",
                    "run",
                    "com.valvesoftware.Steam",
                    uri,
                    env=env,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.PIPE,
                )
            else:
                proc = await asyncio.create_subprocess_exec(
                    candidate,
                    uri,
                    env=env,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.PIPE,
                )
            _stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=20)
            if proc.returncode == 0:
                logger.info("Launched %s via %s", uri, candidate)
                return
            err = (stderr or b"").decode("utf-8", errors="replace").strip()
            errors.append(f"{candidate}: rc={proc.returncode} {err}")
        except Exception as exc:  # noqa: BLE001 - collect and try next
            errors.append(f"{candidate}: {exc}")

    # Last resort: xdg-open
    try:
        proc = await asyncio.create_subprocess_exec(
            "xdg-open",
            uri,
            env=env,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.wait(), timeout=10)
        logger.info("Launched %s via xdg-open", uri)
        return
    except Exception as exc:  # noqa: BLE001
        errors.append(f"xdg-open: {exc}")

    raise RuntimeError("Failed to launch Steam URI; tried: " + " | ".join(errors))


async def notify(title: str, body: str) -> None:
    """Best-effort desktop notification (Game Mode may ignore it)."""
    notify_send = shutil.which("notify-send")
    if not notify_send:
        return
    try:
        proc = await asyncio.create_subprocess_exec(
            notify_send,
            "--app-name=Physical Media Launcher",
            title,
            body,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.wait(), timeout=5)
    except Exception:
        logger.debug("notify-send failed", exc_info=True)
