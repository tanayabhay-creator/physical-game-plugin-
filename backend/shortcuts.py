"""Non-Steam shortcut injection into Steam's shortcuts.vdf."""

from __future__ import annotations

import logging
import os
import shutil
import tempfile
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

from . import vdf_binary
from .steam_paths import find_shortcuts_vdf

logger = logging.getLogger("physical-media-launcher.shortcuts")


@dataclass
class ShortcutResult:
    created: bool
    appid: int
    steam_launch_id: int
    shortcuts_path: str
    app_name: str
    exe: str


def compute_shortcut_appid(exe: str, app_name: str) -> int:
    """Deterministic Non-Steam appid used by Steam ROM Manager / STL.

    Returns an unsigned 32-bit value with the high bit set.
    """
    payload = f"{exe}{app_name}".encode("utf-8")
    return zlib.crc32(payload) | 0x80000000


def to_signed_appid(appid: int) -> int:
    """Store appid the way Steam writes int32 fields in shortcuts.vdf."""
    value = appid & 0xFFFFFFFF
    if value >= 0x80000000:
        return value - 0x100000000
    return value


def as_unsigned_appid(appid: int) -> int:
    value = int(appid)
    if value < 0:
        return value + 0x100000000
    return value & 0xFFFFFFFF


def to_steam_launch_id(shortcut_appid: int) -> int:
    """Convert a shortcuts.vdf appid into steam://rungameid target."""
    return (as_unsigned_appid(shortcut_appid) << 32) | 0x02000000


def _quote_exe(exe: str) -> str:
    exe = exe.strip()
    if exe.startswith('"') and exe.endswith('"'):
        return exe
    return f'"{exe}"'


def _default_shortcut(
    *,
    app_name: str,
    exe: str,
    start_dir: str,
    launch_options: str,
    appid: int,
) -> Dict[str, Any]:
    return {
        "appid": to_signed_appid(appid),
        "AppName": app_name,
        "Exe": _quote_exe(exe),
        "StartDir": _quote_exe(start_dir) if start_dir else _quote_exe(str(Path(exe).parent)),
        "icon": "",
        "ShortcutPath": "",
        "LaunchOptions": launch_options or "",
        "IsHidden": 0,
        "AllowDesktopConfig": 1,
        "AllowOverlay": 1,
        "OpenVR": 0,
        "Devkit": 0,
        "DevkitGameID": "",
        "DevkitOverrideAppID": 0,
        "LastPlayTime": 0,
        "FlatpakAppID": "",
        "tags": {},
    }


def ensure_non_steam_shortcut(
    *,
    app_name: str,
    exe_path: str,
    start_dir: Optional[str] = None,
    launch_options: str = "",
    shortcuts_path: Optional[Path] = None,
) -> ShortcutResult:
    """Create or update a Non-Steam shortcut and return launch identifiers."""
    path = Path(shortcuts_path) if shortcuts_path else find_shortcuts_vdf()
    if path is None:
        raise FileNotFoundError(
            "Could not locate Steam userdata shortcuts.vdf. "
            "Launch Steam once so a userdata profile exists."
        )

    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_file():
        data = vdf_binary.loads(path.read_bytes())
    else:
        data = {"shortcuts": {}}

    data = vdf_binary.normalize_shortcuts_root(data)
    shortcuts = data["shortcuts"]

    exe_abs = str(Path(exe_path).resolve())
    start = str(Path(start_dir).resolve()) if start_dir else str(Path(exe_abs).parent)
    appid = compute_shortcut_appid(_quote_exe(exe_abs), app_name)

    existing = vdf_binary.find_shortcut(shortcuts, app_name=app_name, exe=exe_abs)
    created = False
    if existing is None:
        index = vdf_binary.next_shortcut_index(shortcuts)
        shortcuts[index] = _default_shortcut(
            app_name=app_name,
            exe=exe_abs,
            start_dir=start,
            launch_options=launch_options,
            appid=appid,
        )
        created = True
        logger.info("Created Non-Steam shortcut %s at index %s", app_name, index)
    else:
        key, entry = existing
        entry["AppName"] = app_name
        entry["Exe"] = _quote_exe(exe_abs)
        entry["StartDir"] = _quote_exe(start)
        entry["LaunchOptions"] = launch_options or entry.get("LaunchOptions", "")
        if "appid" not in entry:
            entry["appid"] = to_signed_appid(appid)
        shortcuts[key] = entry
        # Prefer the stored appid for launch continuity / artwork.
        stored = entry.get("appid")
        if isinstance(stored, int):
            appid = as_unsigned_appid(stored)
        logger.info("Updated existing Non-Steam shortcut %s", app_name)

    _atomic_write_vdf(path, data)
    unsigned = as_unsigned_appid(appid)
    return ShortcutResult(
        created=created,
        appid=unsigned,
        steam_launch_id=to_steam_launch_id(unsigned),
        shortcuts_path=str(path),
        app_name=app_name,
        exe=exe_abs,
    )


def _atomic_write_vdf(path: Path, data: Dict[str, Any]) -> None:
    """Write shortcuts.vdf atomically with a backup of the previous file."""
    payload = vdf_binary.dumps(data)
    # Ensure root ends cleanly — dumps already terminates the root map.
    fd, tmp_name = tempfile.mkstemp(prefix="shortcuts.", suffix=".vdf", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as tmp:
            tmp.write(payload)
            tmp.flush()
            os.fsync(tmp.fileno())
        if path.exists():
            backup = path.with_suffix(".vdf.bak")
            shutil.copy2(path, backup)
        os.replace(tmp_name, path)
    finally:
        if os.path.exists(tmp_name):
            try:
                os.unlink(tmp_name)
            except OSError:
                pass
