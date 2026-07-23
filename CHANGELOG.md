# Changelog

## 1.0.4

- **Critical fix:** backend failed to load (`SyntaxError` in `main.py`) → UI showed **unknown — please update** and no buttons worked
- Install script now compiles `main.py` before finishing so a broken backend cannot be installed silently

## 1.0.3

- **Generate game_info.json on SD** from the plugin UI (scans the card for the game folder + `.exe`)
- **Overwrite game_info.json on SD** when you want to rebuild metadata
- Accept `TargetInstallPath` as an alias for `TargetSSDPath`
- Includes 1.0.2 GameFolder resolution fixes (case, double nesting, wrong folder recovery)

## 1.0.2

- Fix **GameFolder not found on SD card** when the game is still detected
- Resolve `GameFolder` / `ExePath` case-insensitively
- Recover from common card mistakes: double-nested `GameFolder`+`ExePath`, wrong folder name, Windows drive paths
- Search the card for the executable when `GameFolder` is wrong
- Clearer errors that list what is actually on the card root

## 1.0.1

- Accept `TargetSDPath` and other common aliases for the SSD destination field
- If `TargetSSDPath` is missing, default to `/home/deck/Games/<GameName>`
- Clearer `game_info.json` validation errors (lists keys found on the card)

## 1.0.0

First stable release of **Physical Media Launcher** for Steam Deck (Decky Loader).

### Features
- Detect SD/USB volumes with `game_info.json`
- Copy game files to internal SSD with progress UI
- Add/update Non-Steam Steam shortcuts (live `AddShortcut` + VDF fallback)
- Auto-launch on card insert (plugin Auto-Launch toggle)
- Proton support for Windows `.exe` Non-Steam titles
- Manual controls: Start Transfer, Force Re-Copy, Launch last game, Add/Fix shortcut, Open in Library

### Install
See the [v1.0.4 release](https://github.com/tanayabhay-creator/physical-game-plugin-/releases/tag/v1.0.4) or README.
