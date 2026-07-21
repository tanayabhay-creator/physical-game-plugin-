"""Parse and validate game_info.json from removable media."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional


GAME_INFO_FILENAME = "game_info.json"


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
        # If a Windows executable is targeted and the author supplied a compat
        # tool name, expose it as an env prefix commonly used with Proton.
        if self.compat_tool and "STEAM_COMPAT_TOOL" not in opts:
            prefix = f'STEAM_COMPAT_TOOL_PATH="{self.compat_tool}"'
            if opts:
                if "%command%" in opts:
                    return f"{prefix} {opts}"
                return f"{prefix} {opts}"
            return opts
        return opts


class GameInfoError(ValueError):
    """Invalid or incomplete game_info.json."""


def find_game_info(mount_root: Path) -> Optional[Path]:
    candidate = mount_root / GAME_INFO_FILENAME
    if candidate.is_file():
        return candidate
    return None


def load_game_info(mount_root: Path) -> GameInfo:
    path = find_game_info(mount_root)
    if path is None:
        raise GameInfoError(f"{GAME_INFO_FILENAME} not found on {mount_root}")

    try:
        raw: Dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise GameInfoError(f"Invalid JSON in {path}: {exc}") from exc

    game_name = _require_str(raw, "GameName")
    exe_path = _require_str(raw, "ExePath").replace("\\", "/").lstrip("/")
    target = _require_str(raw, "TargetSSDPath")

    return GameInfo(
        game_name=game_name,
        exe_path=exe_path,
        launch_options=str(raw.get("LaunchOptions") or ""),
        target_ssd_path=target,
        game_folder=str(raw.get("GameFolder") or "").replace("\\", "/").strip("/"),
        start_dir=str(raw.get("StartDir") or "").replace("\\", "/").strip("/"),
        compat_tool=str(raw.get("CompatTool") or raw.get("ProtonPath") or ""),
        auto_launch=raw.get("AutoLaunch") if isinstance(raw.get("AutoLaunch"), bool) else None,
        source_root=mount_root.resolve(),
    )


def _require_str(data: Dict[str, Any], key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise GameInfoError(f"game_info.json missing required string field: {key}")
    return value.strip()
