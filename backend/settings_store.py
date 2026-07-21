"""Persistent plugin settings and status log."""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional


@dataclass
class PluginSettings:
    auto_launch: bool = True
    poll_interval_sec: float = 2.0
    notify_on_detect: bool = True
    last_game: str = ""
    last_status: str = "Ready"
    last_mount: str = ""
    last_error: str = ""
    last_exe: str = ""
    last_steam_app_id: int = 0
    last_vdf_launch_id: int = 0
    steam_app_ids: Dict[str, int] = field(default_factory=dict)
    log_lines: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PluginSettings":
        raw_ids = data.get("steam_app_ids") or {}
        steam_app_ids: Dict[str, int] = {}
        if isinstance(raw_ids, dict):
            for key, value in raw_ids.items():
                try:
                    steam_app_ids[str(key)] = int(value)
                except (TypeError, ValueError):
                    continue
        return cls(
            auto_launch=bool(data.get("auto_launch", True)),
            poll_interval_sec=float(data.get("poll_interval_sec", 2.0)),
            notify_on_detect=bool(data.get("notify_on_detect", True)),
            last_game=str(data.get("last_game") or ""),
            last_status=str(data.get("last_status") or "Ready"),
            last_mount=str(data.get("last_mount") or ""),
            last_error=str(data.get("last_error") or ""),
            last_exe=str(data.get("last_exe") or ""),
            last_steam_app_id=int(data.get("last_steam_app_id") or 0),
            last_vdf_launch_id=int(data.get("last_vdf_launch_id") or 0),
            steam_app_ids=steam_app_ids,
            log_lines=list(data.get("log_lines") or []),
        )


class SettingsStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.settings = PluginSettings()
        self.load()

    def load(self) -> PluginSettings:
        if self.path.is_file():
            try:
                data = json.loads(self.path.read_text(encoding="utf-8"))
                self.settings = PluginSettings.from_dict(data)
            except (OSError, json.JSONDecodeError, TypeError, ValueError):
                self.settings = PluginSettings()
        return self.settings

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.settings.to_dict(), indent=2), encoding="utf-8")
        os.replace(tmp, self.path)

    def append_log(self, line: str, *, limit: int = 100) -> None:
        self.settings.log_lines.append(line)
        if len(self.settings.log_lines) > limit:
            self.settings.log_lines = self.settings.log_lines[-limit:]
        self.save()

    def update(self, **kwargs: Any) -> PluginSettings:
        for key, value in kwargs.items():
            if hasattr(self.settings, key):
                setattr(self.settings, key, value)
        self.save()
        return self.settings
