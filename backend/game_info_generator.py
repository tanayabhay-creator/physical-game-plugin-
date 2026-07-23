"""Auto-detect game layout on an SD/USB card and write game_info.json."""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .game_info import GAME_INFO_FILENAME, find_game_info
from .steam_paths import decky_user_home


# Folders that often hold the playable game tree on pirate / GOG / DRM-free cards.
PREFERRED_FOLDER_NAMES = (
    "gamefolder",
    "gamefiles",
    "gamefile",
    "game",
    "games",
    "payload",
    "data",
    "content",
    "files",
    "bin",
    "binaries",
)

SKIP_DIR_NAMES = {
    "system volume information",
    "$recycle.bin",
    "lost+found",
    ".trash",
    ".trashes",
    "uninstall",
    "redist",
    "_redist",
    "directx",
    "support",
    "docs",
    "documentation",
}

# Executables that are almost never the game launcher.
SKIP_EXE_SUBSTRINGS = (
    "uninstall",
    "unins000",
    "unitycrashhandler",
    "crashreport",
    "crashhandler",
    "vcredist",
    "vc_redist",
    "dxsetup",
    "dotnet",
    "oalinst",
    "setup",
    "installer",
    "ue4prereq",
    "easyanticheat",
    "battleye",
)


@dataclass
class GameInfoSuggestion:
    mount: str
    game_name: str
    game_folder: str
    exe_path: str
    target_ssd_path: str
    auto_launch: bool
    confidence: str  # high / medium / low
    notes: str
    existing_info: bool
    candidates: List[str]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def as_game_info_json(self) -> Dict[str, Any]:
        return {
            "GameName": self.game_name,
            "GameFolder": self.game_folder,
            "ExePath": self.exe_path,
            "LaunchOptions": "",
            "TargetSSDPath": self.target_ssd_path,
            "AutoLaunch": self.auto_launch,
        }


class GameInfoGenerateError(ValueError):
    """Could not invent a valid game_info.json for this card."""


def suggest_game_info(mount_root: Path) -> GameInfoSuggestion:
    """Scan a mounted volume and propose game_info.json fields."""
    mount = mount_root.resolve()
    if not mount.is_dir():
        raise GameInfoGenerateError(f"Mount path does not exist: {mount}")

    existing = find_game_info(mount) is not None
    volume_name = mount.name.strip() or "Game"
    game_name = _pretty_game_name(volume_name)

    hits = _find_exe_candidates(mount, max_depth=4)
    if not hits:
        raise GameInfoGenerateError(
            "No Windows .exe found on this card (searched a few folders deep). "
            "Put the game files on the card, then try again."
        )

    scored: List[Tuple[int, Path]] = []
    for exe in hits:
        scored.append((_score_exe(mount, exe, volume_name), exe))
    scored.sort(key=lambda item: (-item[0], len(str(item[1])), item[1].name.lower()))

    best_score, best_exe = scored[0]
    game_folder, exe_rel = _split_game_paths(mount, best_exe)

    target = str(
        (decky_user_home() / "Games" / _sanitize_dir_name(game_name)).resolve()
    )

    if best_score >= 80:
        confidence = "high"
    elif best_score >= 40:
        confidence = "medium"
    else:
        confidence = "low"

    notes = (
        f"Picked {best_exe.name} under "
        f"{game_folder or '(card root)'} "
        f"(score {best_score})."
    )
    candidates = [
        str(path.relative_to(mount)).replace("\\", "/") for _, path in scored[:8]
    ]

    return GameInfoSuggestion(
        mount=str(mount),
        game_name=game_name,
        game_folder=game_folder,
        exe_path=exe_rel,
        target_ssd_path=target,
        auto_launch=True,
        confidence=confidence,
        notes=notes,
        existing_info=existing,
        candidates=candidates,
    )


def write_game_info(
    mount_root: Path,
    *,
    overwrite: bool = False,
    suggestion: Optional[GameInfoSuggestion] = None,
) -> Dict[str, Any]:
    """Write game_info.json onto the card root. Returns suggestion + path."""
    mount = mount_root.resolve()
    suggestion = suggestion or suggest_game_info(mount)
    out_path = mount / GAME_INFO_FILENAME

    if out_path.exists() and not overwrite:
        raise GameInfoGenerateError(
            f"{GAME_INFO_FILENAME} already exists on this card. "
            "Enable overwrite to replace it."
        )

    # If an alias/nested info exists elsewhere, still write the canonical root file.
    payload = suggestion.as_game_info_json()
    text = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    try:
        out_path.write_text(text, encoding="utf-8")
    except OSError as exc:
        raise GameInfoGenerateError(f"Cannot write {out_path}: {exc}") from exc

    result = suggestion.to_dict()
    result["written_path"] = str(out_path)
    result["payload"] = payload
    result["overwrote"] = bool(overwrite and suggestion.existing_info)
    return result


def pick_mount_for_generate(
    mounts: List[Path],
    *,
    preferred: str = "",
) -> Optional[Path]:
    """Choose which inserted volume to write game_info.json onto."""
    if preferred:
        path = Path(preferred)
        if path.is_dir():
            return path.resolve()

    if not mounts:
        return None

    # Prefer cards that do not already have game_info.json.
    without_info = [m for m in mounts if find_game_info(m) is None]
    pool = without_info or list(mounts)
    return pool[0].resolve()


def _find_exe_candidates(root: Path, *, max_depth: int) -> List[Path]:
    found: List[Path] = []
    queue: List[Tuple[Path, int]] = [(root, 0)]
    while queue:
        current, depth = queue.pop(0)
        try:
            entries = list(current.iterdir())
        except OSError:
            continue
        for entry in entries:
            name = entry.name
            if name.startswith("."):
                continue
            lower = name.lower()
            if entry.is_file():
                if lower.endswith(".exe") and not _is_skipped_exe(lower):
                    found.append(entry)
                continue
            if not entry.is_dir():
                continue
            if lower in SKIP_DIR_NAMES:
                continue
            if depth < max_depth:
                queue.append((entry, depth + 1))
    return found


def _score_exe(mount: Path, exe: Path, volume_name: str) -> int:
    score = 0
    name = exe.name.lower()
    try:
        rel = exe.relative_to(mount)
    except ValueError:
        rel = Path(exe.name)
    parts = [p.lower() for p in rel.parts[:-1]]
    depth = len(parts)

    # Prefer shallow trees.
    score += max(0, 30 - depth * 8)

    if parts and parts[0] in PREFERRED_FOLDER_NAMES:
        score += 50
    if "gamefolder" in parts or "gamefiles" in parts:
        score += 20

    vol_token = re.sub(r"[^a-z0-9]+", "", volume_name.lower())
    exe_token = re.sub(r"[^a-z0-9]+", "", name[:-4])
    if vol_token and vol_token in exe_token:
        score += 40
    if exe_token and vol_token and exe_token in vol_token:
        score += 25

    if name.endswith("_steam.exe") or name.endswith("steam.exe"):
        score += 35
    if "launcher" in name or "start" in name:
        score += 10
    if name in {"game.exe", "start.exe", "play.exe"}:
        score += 15

    # Huge tooling / editor leftovers.
    if any(x in name for x in ("editor", "server", "dedicated", "benchmark")):
        score -= 25

    return score


def _split_game_paths(mount: Path, exe: Path) -> Tuple[str, str]:
    """Return (GameFolder, ExePath) relative to the card root."""
    try:
        rel = exe.resolve().relative_to(mount.resolve())
    except ValueError:
        return "", exe.name

    parts = list(rel.parts)
    if len(parts) == 1:
        return "", parts[0]

    top = parts[0]
    # Prefer a single top-level content folder as GameFolder.
    if top.lower() in PREFERRED_FOLDER_NAMES or len(parts) >= 2:
        game_folder = top
        exe_path = "/".join(parts[1:])
        return game_folder, exe_path

    return "", "/".join(parts)


def _is_skipped_exe(name_lower: str) -> bool:
    return any(token in name_lower for token in SKIP_EXE_SUBSTRINGS)


def _pretty_game_name(volume_name: str) -> str:
    cleaned = volume_name.replace("_", " ").strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned or "Physical Media Game"


def _sanitize_dir_name(game_name: str) -> str:
    cleaned = "".join(
        ch if ch.isalnum() or ch in {" ", "-", "_"} else " " for ch in game_name
    )
    cleaned = "_".join(cleaned.split())
    return cleaned.strip("._") or "Game"
