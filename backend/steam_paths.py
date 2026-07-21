"""Steam path discovery helpers for Steam Deck / desktop Linux Steam."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable, List, Optional


def decky_user_home() -> Path:
    """Return the interactive Steam Deck user home directory.

    Decky plugins with the ``_root`` flag may run with HOME=/root. Always prefer
    the real deck user home so media mounts resolve under /run/media/deck.
    """
    for key in ("DECKY_USER_HOME",):
        value = os.environ.get(key)
        if value and value != "/root":
            return Path(value)

    home = os.environ.get("HOME") or ""
    if home and home not in {"/root", "/"} and Path(home, "homebrew").exists():
        return Path(home)

    if Path("/home/deck").is_dir():
        return Path("/home/deck")

    if home:
        return Path(home)
    return Path("/home/deck")


def steam_roots() -> List[Path]:
    """Candidate Steam install roots, ordered by preference."""
    home = decky_user_home()
    candidates = [
        home / ".local" / "share" / "Steam",
        home / ".steam" / "steam",
        home / ".steam" / "root",
        Path("/home/deck/.local/share/Steam"),
    ]
    seen = set()
    roots: List[Path] = []
    for path in candidates:
        resolved = path.resolve() if path.exists() else path
        key = str(resolved)
        if key in seen:
            continue
        seen.add(key)
        roots.append(path)
    return roots


def find_steam_root() -> Optional[Path]:
    for root in steam_roots():
        if (root / "steam.sh").exists() or (root / "ubuntu12_32").exists():
            return root
        if (root / "userdata").is_dir():
            return root
    return None


def iter_userdata_dirs() -> Iterable[Path]:
    root = find_steam_root()
    if root is None:
        return []
    userdata = root / "userdata"
    if not userdata.is_dir():
        return []
    for child in sorted(userdata.iterdir()):
        if child.is_dir() and child.name.isdigit() and child.name != "0":
            yield child


def find_shortcuts_vdf() -> Optional[Path]:
    """Pick the most recently modified shortcuts.vdf among local Steam users."""
    best: Optional[Path] = None
    best_mtime = -1.0
    for user_dir in iter_userdata_dirs():
        path = user_dir / "config" / "shortcuts.vdf"
        if not path.is_file():
            # Prefer an existing config dir even if shortcuts.vdf is missing yet.
            config_dir = user_dir / "config"
            if config_dir.is_dir() and best is None:
                best = path
            continue
        mtime = path.stat().st_mtime
        if mtime >= best_mtime:
            best = path
            best_mtime = mtime
    return best


def media_mount_roots() -> List[Path]:
    """Directories where SteamOS typically mounts removable media."""
    home = decky_user_home()
    user = home.name or "deck"
    roots = [
        Path("/run/media/deck"),
        Path("/run/media") / user,
        Path("/media/deck"),
        Path("/media") / user,
        Path("/mnt"),
    ]

    # Also include every user directory under /run/media (covers odd setups).
    run_media = Path("/run/media")
    if run_media.is_dir():
        try:
            for child in run_media.iterdir():
                if child.is_dir() and not child.name.startswith("."):
                    roots.append(child)
        except PermissionError:
            pass

    unique: List[Path] = []
    seen = set()
    for root in roots:
        key = str(root)
        if key in seen:
            continue
        seen.add(key)
        unique.append(root)
    return unique


def list_removable_mounts() -> List[Path]:
    """Return currently mounted removable volumes under known media roots."""
    mounts: List[Path] = []
    seen = set()
    for root in media_mount_roots():
        if not root.is_dir():
            continue
        try:
            children = list(root.iterdir())
        except PermissionError:
            continue
        for child in children:
            if not child.is_dir() or child.name.startswith("."):
                continue
            # Skip nested user roots already covered as roots themselves.
            if child.parent == Path("/run/media"):
                continue
            key = str(child)
            if key in seen:
                continue
            seen.add(key)
            mounts.append(child)
    return mounts
