#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.game_info import load_game_info  # noqa: E402
from backend.game_info_generator import (  # noqa: E402
    GameInfoGenerateError,
    suggest_game_info,
    write_game_info,
)


class GameInfoGeneratorTests(unittest.TestCase):
    def test_suggest_prefers_gamefolder_steam_exe(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "Expedition 33"
            folder = root / "GameFolder"
            folder.mkdir(parents=True)
            (folder / "Uninstall.exe").write_bytes(b"MZ")
            (folder / "Expedition33_Steam.exe").write_bytes(b"MZ")
            (folder / "Engine").mkdir()
            suggestion = suggest_game_info(root)
            self.assertEqual(suggestion.game_folder, "GameFolder")
            self.assertEqual(suggestion.exe_path, "Expedition33_Steam.exe")
            self.assertEqual(suggestion.game_name, "Expedition 33")
            self.assertIn("Expedition", suggestion.target_ssd_path)
            self.assertFalse(suggestion.existing_info)

    def test_write_and_reload(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "My Card"
            files = root / "GameFiles"
            files.mkdir(parents=True)
            (files / "CoolGame.exe").write_bytes(b"MZ")
            result = write_game_info(root, overwrite=False)
            info_path = Path(result["written_path"])
            self.assertTrue(info_path.is_file())
            payload = json.loads(info_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["GameFolder"], "GameFiles")
            self.assertEqual(payload["ExePath"], "CoolGame.exe")
            self.assertEqual(payload["GameName"], "My Card")
            self.assertTrue(payload["TargetSSDPath"])

            loaded = load_game_info(root)
            self.assertEqual(loaded.game_folder, "GameFiles")
            self.assertTrue(loaded.source_exe.is_file())

            with self.assertRaises(GameInfoGenerateError):
                write_game_info(root, overwrite=False)

            again = write_game_info(root, overwrite=True)
            self.assertTrue(again["written_path"])

    def test_skips_uninstall_only_tree_raises(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "Emptyish"
            root.mkdir()
            (root / "Uninstall.exe").write_bytes(b"MZ")
            with self.assertRaises(GameInfoGenerateError):
                suggest_game_info(root)

    def test_target_install_path_alias(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            folder = root / "GameFolder"
            folder.mkdir()
            (folder / "game.exe").write_bytes(b"MZ")
            (root / "game_info.json").write_text(
                json.dumps(
                    {
                        "GameName": "Demo",
                        "GameFolder": "GameFolder",
                        "ExePath": "game.exe",
                        "TargetInstallPath": "/home/deck/Games/Demo",
                    }
                ),
                encoding="utf-8",
            )
            info = load_game_info(root)
            self.assertEqual(info.target_ssd_path, "/home/deck/Games/Demo")


if __name__ == "__main__":
    unittest.main()
