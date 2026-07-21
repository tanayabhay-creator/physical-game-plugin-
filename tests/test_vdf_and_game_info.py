#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend import vdf_binary  # noqa: E402
from backend.game_info import load_game_info  # noqa: E402
from backend.shortcuts import (  # noqa: E402
    as_unsigned_appid,
    compute_shortcut_appid,
    ensure_non_steam_shortcut,
    to_signed_appid,
    to_steam_launch_id,
)


class VdfBinaryTests(unittest.TestCase):
    def test_roundtrip_shortcuts(self) -> None:
        original = {
            "shortcuts": {
                "0": {
                    "appid": to_signed_appid(0xABCDEF01),
                    "AppName": "Demo Game",
                    "Exe": '"/home/deck/Games/Demo/game.exe"',
                    "StartDir": '"/home/deck/Games/Demo"',
                    "LaunchOptions": "%command%",
                    "IsHidden": 0,
                    "tags": {"0": "favorite"},
                }
            }
        }
        blob = vdf_binary.dumps(original)
        loaded = vdf_binary.loads(blob)
        self.assertEqual(loaded["shortcuts"]["0"]["AppName"], "Demo Game")
        self.assertEqual(loaded["shortcuts"]["0"]["IsHidden"], 0)
        self.assertEqual(loaded["shortcuts"]["0"]["tags"]["0"], "favorite")


class GameInfoTests(unittest.TestCase):
    def test_load_game_info(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "game_info.json").write_text(
                json.dumps(
                    {
                        "GameName": "Demo",
                        "ExePath": "game.exe",
                        "LaunchOptions": "PROTON_LOG=1 %command%",
                        "TargetSSDPath": "/home/deck/Games/Demo",
                        "GameFolder": "payload",
                    }
                ),
                encoding="utf-8",
            )
            info = load_game_info(root)
            self.assertEqual(info.game_name, "Demo")
            self.assertEqual(info.exe_path, "game.exe")
            self.assertTrue(str(info.source_game_dir).endswith("payload"))


class ShortcutTests(unittest.TestCase):
    def test_appid_helpers(self) -> None:
        appid = compute_shortcut_appid('"/tmp/a.exe"', "A")
        self.assertGreaterEqual(appid, 0x80000000)
        signed = to_signed_appid(appid)
        self.assertLess(signed, 0)
        self.assertEqual(as_unsigned_appid(signed), appid)
        launch_id = to_steam_launch_id(appid)
        self.assertEqual(launch_id & 0xFFFFFFFF, 0x02000000)

    def test_ensure_shortcut_creates_and_updates(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            shortcuts = Path(tmp) / "shortcuts.vdf"
            exe = Path(tmp) / "game.exe"
            exe.write_bytes(b"MZ")
            first = ensure_non_steam_shortcut(
                app_name="Demo",
                exe_path=str(exe),
                launch_options="PROTON_USE_WINED3D=1 %command%",
                shortcuts_path=shortcuts,
            )
            self.assertTrue(first.created)
            second = ensure_non_steam_shortcut(
                app_name="Demo",
                exe_path=str(exe),
                launch_options="PROTON_USE_WINED3D=1 %command%",
                shortcuts_path=shortcuts,
            )
            self.assertFalse(second.created)
            self.assertEqual(first.appid, second.appid)
            data = vdf_binary.loads(shortcuts.read_bytes())
            self.assertEqual(data["shortcuts"]["0"]["AppName"], "Demo")


if __name__ == "__main__":
    unittest.main()
