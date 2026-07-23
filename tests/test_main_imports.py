#!/usr/bin/env python3
"""Ensure main.py can be imported by Decky (syntax + import graph)."""

from __future__ import annotations

import importlib.util
import sys
import types
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class MainModuleImportTests(unittest.TestCase):
    def test_main_py_compiles_and_imports(self) -> None:
        main_path = ROOT / "main.py"
        compile(main_path.read_text(encoding="utf-8"), str(main_path), "exec")

        # Minimal decky stub so import does not require the Deck runtime.
        decky = types.ModuleType("decky")
        decky.DECKY_PLUGIN_DIR = str(ROOT)
        decky.logger = __import__("logging").getLogger("decky-test")

        async def _emit(*_args, **_kwargs):
            return None

        decky.emit = _emit
        sys.modules["decky"] = decky

        spec = importlib.util.spec_from_file_location("pml_main_under_test", main_path)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertTrue(hasattr(module, "Plugin"))


if __name__ == "__main__":
    unittest.main()
