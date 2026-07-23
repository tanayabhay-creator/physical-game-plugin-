"""Parse and validate game_info.json from removable media."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


GAME_INFO_FILENAME = "game_info.json"
# Common mistakes we still accept on the card root.
GAME_INFO_ALIASES = (
    "game_info.json",
    "Game_Info.json",
    "GAME_INFO.JSON",
    "game-info.json",
    "gameinfo.json",
)

# Folder names people often put in GameFolder even when layout differs.
COMMON_GAME_FOLDER_NAMES = (
    "gamefiles",
    "gamefile",
    "game",
    "games",
    "payload",
    "data",
    "content",
    "files",
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
            resolved = _resolve_case_insensitive(self.source_root, self.game_folder)
            if resolved is not None:
                return resolved
            return (self.source_root / self.game_folder).resolve()
        # Default: treat the media root itself as the game folder.
        return self.source_root.resolve()

    @property
    def source_exe(self) -> Path:
        resolved = _resolve_case_insensitive(self.source_game_dir, self.exe_path)
        if resolved is not None:
            return resolved
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
    exe_path = _clean_rel_path(
        _require_str(
            normalized, "exepath", aliases=("exe", "executable")
        )
    )

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

    game_folder = _clean_rel_path(
        str(
            normalized.get("gamefolder")
            or normalized.get("folder")
            or normalized.get("gamedir")
            or normalized.get("sourcedir")
            or ""
        )
    )

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

    game_folder, exe_path = _fix_game_paths(mount_resolved, game_folder, exe_path)

    return GameInfo(
        game_name=game_name,
        exe_path=exe_path,
        launch_options=str(
            normalized.get("launchoptions") or normalized.get("launch") or ""
        ),
        target_ssd_path=target,
        game_folder=game_folder,
        start_dir=_clean_rel_path(str(normalized.get("startdir") or "")),
        compat_tool=str(
            normalized.get("compattool")
            or normalized.get("protonpath")
            or normalized.get("proton")
            or ""
        ),
        auto_launch=auto_launch,
        source_root=mount_resolved,
        info_path=path,
    )


def describe_mount_layout(mount_root: Path, *, limit: int = 12) -> str:
    """Short listing of top-level dirs/files for error messages."""
    try:
        entries = sorted(mount_root.iterdir(), key=lambda p: p.name.lower())
    except OSError as exc:
        return f"(cannot list mount: {exc})"
    parts: List[str] = []
    for entry in entries:
        if entry.name.startswith("."):
            continue
        mark = "/" if entry.is_dir() else ""
        parts.append(f"{entry.name}{mark}")
        if len(parts) >= limit:
            break
    return ", ".join(parts) if parts else "(empty)"


def _fix_game_paths(
    mount_root: Path, game_folder: str, exe_path: str
) -> Tuple[str, str]:
    """Make GameFolder + ExePath match what is actually on the card.

    Detection already succeeded (game_info.json found). Cards often have:
    - wrong GameFolder casing (GameFiles vs gamefiles)
    - GameFolder set AND ExePath that already includes that folder
    - GameFolder pointing at a missing/renamed directory
    - Windows absolute paths pasted into GameFolder
    """
    # 1) Direct resolve (case-insensitive).
    fixed = _try_paths(mount_root, game_folder, exe_path)
    if fixed is not None:
        return fixed

    # 2) ExePath already includes the game folder → treat mount root as folder.
    #    e.g. GameFolder="GameFiles", ExePath="GameFiles/Silksong.exe"
    if game_folder:
        gf_l = game_folder.lower().rstrip("/")
        ep_l = exe_path.lower().replace("\\", "/")
        if ep_l == gf_l or ep_l.startswith(gf_l + "/"):
            trimmed = exe_path[len(game_folder) :].lstrip("/\\")
            fixed = _try_paths(mount_root, game_folder, trimmed)
            if fixed is not None:
                return fixed
            fixed = _try_paths(mount_root, "", exe_path)
            if fixed is not None:
                return fixed

    # 3) Ignore broken GameFolder; look for ExePath from the card root.
    fixed = _try_paths(mount_root, "", exe_path)
    if fixed is not None:
        return fixed

    # 4) Match top-level dir by case-insensitive / common-name heuristics.
    guessed_folder = _guess_game_folder(mount_root, game_folder, exe_path)
    if guessed_folder is not None:
        # Exe relative to guessed folder, or still full from root.
        for candidate_folder, candidate_exe in (
            (guessed_folder, exe_path),
            (guessed_folder, Path(exe_path).name),
            ("", f"{guessed_folder}/{exe_path}".replace("//", "/")),
            ("", f"{guessed_folder}/{Path(exe_path).name}"),
        ):
            fixed = _try_paths(mount_root, candidate_folder, candidate_exe)
            if fixed is not None:
                return fixed

    # 5) Shallow search for the executable basename anywhere on the card.
    exe_name = Path(exe_path).name
    found = _find_file_shallow(mount_root, exe_name, max_depth=4)
    if found is not None:
        try:
            rel = found.relative_to(mount_root.resolve())
        except ValueError:
            pass
        else:
            # Prefer keeping folder structure under the card root as ExePath.
            return "", str(rel).replace("\\", "/")

    # Could not recover — keep original values; callers raise a clear error.
    return game_folder, exe_path


def _try_paths(
    mount_root: Path, game_folder: str, exe_path: str
) -> Optional[Tuple[str, str]]:
    folder = (
        _resolve_case_insensitive(mount_root, game_folder)
        if game_folder
        else mount_root.resolve()
    )
    if folder is None or not folder.is_dir():
        return None
    exe = _resolve_case_insensitive(folder, exe_path) if exe_path else None
    if exe is None or not exe.is_file():
        return None
    try:
        rel_folder = str(folder.relative_to(mount_root.resolve())).replace("\\", "/")
        if rel_folder == ".":
            rel_folder = ""
    except ValueError:
        rel_folder = game_folder
    try:
        rel_exe = str(exe.relative_to(folder)).replace("\\", "/")
    except ValueError:
        rel_exe = exe_path
    return rel_folder, rel_exe


def _guess_game_folder(
    mount_root: Path, requested: str, exe_path: str
) -> Optional[str]:
    try:
        dirs = [p for p in mount_root.iterdir() if p.is_dir() and not p.name.startswith(".")]
    except OSError:
        return None
    if not dirs:
        return None

    by_lower = {p.name.lower(): p.name for p in dirs}

    # Exact case-insensitive match of requested folder's first component.
    if requested:
        first = Path(requested).parts[0].lower()
        if first in by_lower:
            return by_lower[first]

    # First component of ExePath if it is a real directory.
    exe_parts = Path(exe_path).parts
    if len(exe_parts) >= 2 and exe_parts[0].lower() in by_lower:
        return by_lower[exe_parts[0].lower()]

    # Common folder names.
    for name in COMMON_GAME_FOLDER_NAMES:
        if name in by_lower:
            return by_lower[name]

    # Single content folder on the card (besides System Volume Information etc.).
    interesting = [
        d
        for d in dirs
        if d.name.lower() not in {"system volume information", "$recycle.bin", "lost+found"}
    ]
    if len(interesting) == 1:
        return interesting[0].name

    return None


def _find_file_shallow(
    root: Path, filename: str, *, max_depth: int
) -> Optional[Path]:
    target = filename.lower()
    queue: List[Tuple[Path, int]] = [(root, 0)]
    while queue:
        current, depth = queue.pop(0)
        try:
            entries = list(current.iterdir())
        except OSError:
            continue
        for entry in entries:
            if entry.name.startswith("."):
                continue
            if entry.is_file() and entry.name.lower() == target:
                return entry
            if entry.is_dir() and depth < max_depth:
                # Skip huge/noisy trees.
                if entry.name.lower() in {"system volume information", "$recycle.bin"}:
                    continue
                queue.append((entry, depth + 1))
    return None


def _resolve_case_insensitive(root: Path, relative: str) -> Optional[Path]:
    """Resolve a relative path under root, matching each component case-insensitively."""
    relative = _clean_rel_path(relative)
    current = root.resolve()
    if not relative:
        return current if current.exists() else None
    for part in Path(relative).parts:
        if part in {".", ""}:
            continue
        if part == "..":
            return None
        try:
            children = {p.name.lower(): p for p in current.iterdir()}
        except OSError:
            return None
        hit = children.get(part.lower())
        if hit is None:
            return None
        current = hit
    return current.resolve()


def _clean_rel_path(value: str) -> str:
    """Normalize a path that should be relative to the card/game folder."""
    text = str(value or "").replace("\\", "/").strip()
    # Strip Windows drive letters: C:/Games/Foo or C:Games/Foo
    if len(text) >= 2 and text[1] == ":":
        text = text[2:]
    # Accidental absolute POSIX path pasted from another machine.
    while text.startswith("/"):
        # Keep only the last meaningful segment chain if it looks absolute;
        # still allow users who meant a folder name starting unusually.
        # Prefer stripping a single leading slash for " /GameFiles ".
        text = text[1:]
        break
    return text.strip("/")


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
