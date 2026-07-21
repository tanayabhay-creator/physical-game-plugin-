"""Launch Non-Steam shortcuts through the local Steam client."""

from __future__ import annotations

import asyncio
import logging
import os
import pwd
import shutil
from pathlib import Path
from typing import Dict, List

from .steam_paths import decky_user_home, find_steam_root

logger = logging.getLogger("physical-media-launcher.launcher")


def _deck_env() -> Dict[str, str]:
    """Build an environment Steam expects for the deck user session."""
    home = str(decky_user_home())
    user = Path(home).name or "deck"
    env = os.environ.copy()
    env["HOME"] = home
    env["USER"] = user
    env["LOGNAME"] = user
    # Game Mode / user session sockets
    try:
        uid = pwd.getpwnam(user).pw_uid
    except KeyError:
        uid = os.getuid()
    env.setdefault("XDG_RUNTIME_DIR", f"/run/user/{uid}")
    env.setdefault("DBUS_SESSION_BUS_ADDRESS", f"unix:path=/run/user/{uid}/bus")
    env.setdefault("DISPLAY", ":0")
    return env


def _steam_command_candidates() -> List[List[str]]:
    """Return argv lists to try for launching a steam:// URI."""
    commands: List[List[str]] = []
    which = shutil.which("steam")
    if which:
        commands.append([which])
    root = find_steam_root()
    if root is not None:
        steam_sh = root / "steam.sh"
        if steam_sh.is_file():
            commands.append([str(steam_sh)])
    if shutil.which("xdg-open"):
        commands.append(["xdg-open"])
    return commands


async def launch_steam_app(steam_launch_id: int, *, shortcut_appid: int | None = None) -> None:
    """Ask Steam to run a Non-Steam shortcut.

    Tries multiple ID forms and runs as the deck user when the plugin is root.
    """
    home = str(decky_user_home())
    user = Path(home).name or "deck"
    env = _deck_env()
    uris = [f"steam://rungameid/{steam_launch_id}"]
    if shortcut_appid is not None:
        # Some Steam builds accept the raw shortcut appid as well.
        uris.append(f"steam://rungameid/{shortcut_appid & 0xFFFFFFFF}")
        uris.append(f"steam://launch/{shortcut_appid & 0xFFFFFFFF}")

    errors: List[str] = []
    running_as_root = os.geteuid() == 0

    for uri in uris:
        for argv in _steam_command_candidates():
            try:
                if running_as_root:
                    cmd = ["sudo", "-u", user, "-E", "--", *argv, uri]
                else:
                    cmd = [*argv, uri]
                logger.info("Trying launch: %s", " ".join(cmd))
                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    env=env,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                _out, err = await asyncio.wait_for(proc.communicate(), timeout=15)
                # steam often returns quickly with 0 even if Game Mode handles it async
                if proc.returncode == 0:
                    logger.info("Launch command accepted for %s", uri)
                    return
                errors.append(
                    f"{' '.join(cmd)} -> rc={proc.returncode} "
                    f"{(err or b'').decode('utf-8', errors='replace')[:200]}"
                )
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{argv}: {exc}")

    # Final attempt: systemd-run in user session
    try:
        uri = uris[0]
        if running_as_root:
            cmd = [
                "sudo",
                "-u",
                user,
                "-E",
                "--",
                "systemd-run",
                "--user",
                "--collect",
                "steam",
                uri,
            ]
        else:
            cmd = ["systemd-run", "--user", "--collect", "steam", uri]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            env=env,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _o, err = await asyncio.wait_for(proc.communicate(), timeout=15)
        if proc.returncode == 0:
            logger.info("Launched via systemd-run --user: %s", uri)
            return
        errors.append(f"systemd-run: {(err or b'').decode('utf-8', errors='replace')[:200]}")
    except Exception as exc:  # noqa: BLE001
        errors.append(f"systemd-run: {exc}")

    raise RuntimeError("Failed to launch Steam URI; tried: " + " | ".join(errors))


async def notify(title: str, body: str) -> None:
    """Best-effort desktop notification (Game Mode may ignore it)."""
    notify_send = shutil.which("notify-send")
    if not notify_send:
        return
    env = _deck_env()
    user = env.get("USER", "deck")
    try:
        argv = [notify_send, "--app-name=Physical Media Launcher", title, body]
        if os.geteuid() == 0:
            argv = ["sudo", "-u", user, "-E", "--", *argv]
        proc = await asyncio.create_subprocess_exec(
            *argv,
            env=env,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.wait(), timeout=5)
    except Exception:
        logger.debug("notify-send failed", exc_info=True)
