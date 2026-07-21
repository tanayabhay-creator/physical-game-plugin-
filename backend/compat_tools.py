"""Write Steam Play (Proton) mappings into config.vdf for Non-Steam AppIDs."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Optional

from .steam_paths import find_steam_root

logger = logging.getLogger("physical-media-launcher.compat_tools")


def find_config_vdf() -> Optional[Path]:
    root = find_steam_root()
    if root is None:
        return None
    path = root / "config" / "config.vdf"
    return path if path.is_file() else path


def as_unsigned_appid(app_id: int | str) -> str:
    value = int(str(app_id).strip())
    if value < 0:
        value = value + 0x100000000
    return str(value & 0xFFFFFFFF)


def set_compat_tool_mapping(
    app_id: int | str,
    tool_name: str = "proton_experimental",
    *,
    priority: str = "250",
    config_path: Optional[Path] = None,
) -> bool:
    """Ensure CompatToolMapping contains an entry for the Non-Steam AppID.

    Steam stores this in ~/.local/share/Steam/config/config.vdf.
    Using the unsigned 32-bit AppID (same ID SteamClient.Apps.AddShortcut returns).
    """
    path = Path(config_path) if config_path else find_config_vdf()
    if path is None:
        logger.warning("config.vdf not found; cannot set CompatToolMapping")
        return False

    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.is_file():
        logger.warning("config.vdf missing at %s", path)
        return False

    app_key = as_unsigned_appid(app_id)
    tool = (tool_name or "proton_experimental").strip() or "proton_experimental"

    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        logger.warning("Failed reading config.vdf: %s", exc)
        return False

    marker = '"CompatToolMapping"'
    idx = text.find(marker)
    if idx < 0:
        logger.warning("CompatToolMapping section missing in config.vdf")
        return False

    brace = text.find("{", idx)
    if brace < 0:
        return False

    # Replace existing entry for this appid if present inside CompatToolMapping.
    # Match a block like:
    #   "1234567890"
    #   {
    #     "name" "..."
    #     ...
    #   }
    entry_re = re.compile(
        rf'(\n[ \t]*"{re.escape(app_key)}"\s*\{{.*?\n[ \t]*\}})',
        re.DOTALL,
    )

    entry = (
        f'\n\t\t\t\t\t"{app_key}"\n'
        f"\t\t\t\t\t{{\n"
        f'\t\t\t\t\t\t"name"\t\t"{tool}"\n'
        f'\t\t\t\t\t\t"config"\t\t""\n'
        f'\t\t\t\t\t\t"priority"\t\t"{priority}"\n'
        f"\t\t\t\t\t}}"
    )

    # Limit search to a reasonable window after CompatToolMapping.
    section_end_guess = min(len(text), brace + 200_000)
    head = text[: brace + 1]
    mid = text[brace + 1 : section_end_guess]
    tail = text[section_end_guess:]

    if entry_re.search(mid):
        mid = entry_re.sub(entry, mid, count=1)
        logger.info("Updated CompatToolMapping for %s -> %s", app_key, tool)
    else:
        mid = entry + mid
        logger.info("Inserted CompatToolMapping for %s -> %s", app_key, tool)

    new_text = head + mid + tail
    backup = path.with_suffix(".vdf.pml.bak")
    try:
        if not backup.exists():
            backup.write_text(text, encoding="utf-8")
        path.write_text(new_text, encoding="utf-8")
    except OSError as exc:
        logger.warning("Failed writing config.vdf: %s", exc)
        return False
    return True
