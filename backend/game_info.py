"""Parse and validate game_info.json from removable media."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional


GAME_INFO_FILENAME = "game_info.json"
# Common mistakes we still accept on the card root.
GAME_INFO_ALIASES = (
    "game_info.json",
    "Game_Info.json",
    "GAME_INFO.JSON",
    "game-info.json",
    "gameinfo.json",
)


@dataclass
class GameInfo:
    game_name: str
    exe_path: str
    launch_options: str
    target_ssd_path: str
    game_folder: str
    start_dir: str
    compat_tool: str
    auto_launch: Optional[bool]
    source_root: Path
    info_path: Path

    @property
    def source_game_dir(self) -> Path:
        if self.game_folder:
            return (self.source_root / self.game_folder).resolve()
        # Default: treat the media root itself as the game folder.
        return self.source_root.resolve()

    @property
    def source_exe(self) -> Path:
        return (self.source_game_dir / self.exe_path).resolve()

    @property
    def destination_dir(self) -> Path:
        return Path(self.target_ssd_path).expanduser().resolve()

    @property
    def destination_exe(self) -> Path:
        return (self.destination_dir / self.exe_path).resolve()

    def resolved_start_dir(self) -> Path:
        if self.start_dir:
            return (self.destination_dir / self.start_dir).resolve()
        return self.destination_exe.parent

    def resolved_launch_options(self) -> str:
        """Build LaunchOptions, including optional Proton compat hints."""
        opts = (self.launch_options or "").strip()
        if self.compat_tool and "STEAM_COMPAT_TOOL" not in opts:
            prefix = f'STEAM_COMPAT_TOOL_PATH="{self.compat_tool}"'
            if opts:
                return f"{prefix} {opts}"
            return opts
        return opts


class GameInfoError(ValueError):
    """Invalid or incomplete game_info.json."""


def find_game_info(mount_root: Path) -> Optional[Path]:
    """Locate game metadata on a mounted volume.

    Looks on the mount root first (required layout), then one level deep in
    case the user put the JSON inside the game folder by mistake.
    """
    # Exact + alias match on the root (case-insensitive scan).
    try:
        root_files = {p.name.lower(): p for p in mount_root.iterdir() if p.is_file()}
    except PermissionError:
        root_files = {}

    for alias in GAME_INFO_ALIASES:
        hit = root_files.get(alias.lower())
        if hit is not None:
            return hit

    # Fallback: search one directory deep for game_info.json.
    try:
        for child in mount_root.iterdir():
            if not child.is_dir() or child.name.startswith("."):
                continue
            try:
                nested = {
                    p.name.lower(): p for p in child.iterdir() if p.is_file()
                }
            except PermissionError:
                continue
            for alias in GAME_INFO_ALIASES:
                hit = nested.get(alias.lower())
                if hit is not None:
                    return hit
    except PermissionError:
        pass
    return None


def load_game_info(mount_root: Path) -> GameInfo:
    path = find_game_info(mount_root)
    if path is None:
        raise GameInfoError(f"{GAME_INFO_FILENAME} not found on {mount_root}")

    try:
        text = path.read_text(encoding="utf-8-sig")
    except OSError as exc:
        raise GameInfoError(f"Cannot read {path}: {exc}") from exc

    # Fix common copy/paste damage from phones / Word / WhatsApp.
    text = (
        text.replace("\ufeff", "")
        .replace("“", '"')
        .replace("”", '"')
        .replace("‘", "'")
        .replace("’", "'")
        .replace("：", ":")
        .strip()
    )

    try:
        raw_obj = json.loads(text)
    except json.JSONDecodeError as exc:
        raise GameInfoError(
            f"Broken JSON syntax in {path.name} at line {exc.lineno}: {exc.msg}. "
            "Rewrite the file with the exact template (plain ASCII double quotes)."
        ) from exc

    if not isinstance(raw_obj, dict):
        raise GameInfoError(
            f"{path.name} must contain a JSON object {{...}}, not {type(raw_obj).__name__}"
        )

    raw: Dict[str, Any] = raw_obj
    # Allow lowercase / snake_case keys people often type by mistake.
    normalized = {_norm_key(k): v for k, v in raw.items()}

    game_name = _require_str(normalized, "gamename", aliases=("name", "title"))
    exe_path = _require_str(
        normalized, "exepath", aliases=("exe", "executable")
    ).replace("\\", "/").lstrip("/")

    # TargetSSDPath is required in the template, but cards often use TargetSDPath
    # (one "S") or omit it. Accept common aliases, then default under ~/Games.
    target = _optional_str(
        normalized,
        "targetssdpath",
        aliases=(
            "targetsdpath",  # common typo / TargetSDPath
            "targetssd",
            "targetpath",
            "ssdpath",
            "installpath",
            "installdir",
            "target",
            "destination",
            "destinationpath",
            "dest",
            "path",
        ),
    )
    if not target:
        target = _default_target_ssd_path(game_name)

    game_folder = str(
        normalized.get("gamefolder")
        or normalized.get("folder")
        or ""
    ).replace("\\", "/").strip("/")

    info_parent = path.parent.resolve()
    mount_resolved = mount_root.resolve()
    if not game_folder and info_parent != mount_resolved:
        try:
            game_folder = str(info_parent.relative_to(mount_resolved)).replace("\\", "/")
        except ValueError:
            game_folder = ""

    auto_raw = normalized.get("autolaunch")
    auto_launch: Optional[bool]
    if isinstance(auto_raw, bool):
        auto_launch = auto_raw
    elif isinstance(auto_raw, str) and auto_raw.strip().lower() in {"true", "false"}:
        auto_launch = auto_raw.strip().lower() == "true"
    else:
        auto_launch = None

    return GameInfo(
        game_name=game_name,
        exe_path=exe_path,
        launch_options=str(
            normalized.get("launchoptions") or normalized.get("launch") or ""
        ),
        target_ssd_path=target,
        game_folder=game_folder,
        start_dir=str(normalized.get("startdir") or "").replace("\\", "/").strip("/"),
        compat_tool=str(
            normalized.get("compattool")
            or normalized.get("protonpath")
            or normalized.get("proton")
            or ""
        ),
        auto_launch=auto_launch,
        source_root=mount_root.resolve(),
        info_path=path,
    )


def _norm_key(key: Any) -> str:
    return str(key).strip().lower().replace("_", "").replace("-", "").replace(" ", "")


def _sanitize_game_dir_name(game_name: str) -> str:
    cleaned = "".join(
        ch if ch.isalnum() or ch in {" ", "-", "_"} else " " for ch in game_name
    )
    cleaned = "_".join(cleaned.split())
    return cleaned.strip("._") or "Game"


def _default_target_ssd_path(game_name: str) -> str:
    """Fallback when TargetSSDPath is missing: /home/deck/Games/<GameName>."""
    from .steam_paths import decky_user_home

    home = decky_user_home()
    return str((home / "Games" / _sanitize_game_dir_name(game_name)).resolve())


def _optional_str(
    data: Dict[str, Any],
    key: str,
    *,
    aliases: tuple[str, ...] = (),
) -> str:
    value = data.get(key)
    if value is None:
        for alias in aliases:
            value = data.get(_norm_key(alias))
            if value is not None:
                break
    if isinstance(value, (int, float)):
        value = str(value)
    if not isinstance(value, str) or not value.strip():
        return ""
    return value.strip()


def _require_str(
    data: Dict[str, Any],
    key: str,
    *,
    aliases: tuple[str, ...] = (),
) -> str:
    value = _optional_str(data, key, aliases=aliases)
    if not value:
        found = ", ".join(sorted(data.keys())) or "(none)"
        raise GameInfoError(
            f"missing required field '{key}' "
            f"(also accepted: {', '.join(aliases) or 'n/a'}). "
            "Required fields: GameName, ExePath, TargetSSDPath. "
            f"Keys found in game_info.json: {found}"
        )
    return value
