# Physical Media Launcher

**Version 1.0.4** — Decky Loader plugin for Steam Deck that detects game SD cards / USB drives, copies the game folder to the internal SSD when needed, registers a Non-Steam Steam shortcut, and optionally launches it.

Use this with games you own and are allowed to copy (for example GOG / itch / DRM-free Windows builds). The plugin supports Proton-friendly launch options for Windows executables added as Non-Steam shortcuts.

## Directory structure

```text
physical-media-launcher/
├── main.py                      # Decky Python backend entrypoint
├── plugin.json                  # Plugin metadata
├── package.json                 # Frontend build metadata
├── rollup.config.js
├── tsconfig.json
├── decky.pyi
├── backend/
│   ├── game_info.py             # Parse/validate game_info.json
│   ├── media_watcher.py         # SD/USB mount poller
│   ├── transfer.py              # SSD copy with progress
│   ├── shortcuts.py             # shortcuts.vdf Non-Steam injection
│   ├── vdf_binary.py            # Minimal binary VDF codec
│   ├── steam_paths.py           # Steam/userdata/media path discovery
│   ├── launcher.py              # steam://rungameid launcher
│   └── settings_store.py        # Persistent settings + log
├── src/
│   ├── index.tsx                # Decky React UI
│   └── types.ts
├── defaults/
│   ├── settings.json
│   ├── bin/pml-media-event.sh   # Optional udev helper
│   ├── udev/99-physical-media-launcher.rules
│   └── systemd/                 # Optional path/service units
├── example/
│   └── game_info.json           # Sample card metadata
└── tests/
    └── test_vdf_and_game_info.py
```

## How it works

1. Backend watcher polls `/run/media/<user>` (and common fallbacks) for newly mounted volumes.
2. If the mount root has `game_info.json`, the plugin loads `GameName`, `ExePath`, `LaunchOptions`, and `TargetSSDPath`.
3. If the game is **not** already present on the SSD (destination missing or exe absent), files are copied with progress events.
4. If the game **is** already on the SSD, copy is skipped.
5. A Non-Steam shortcut is created/updated in Steam `shortcuts.vdf`.
6. When Auto-Launch is enabled, Steam is asked to run `steam://rungameid/<id>`.

Ordinary SD cards without `game_info.json` are ignored.

## SD card metadata (`game_info.json`)

Place this file on the **root** of the removable volume:

```json
{
  "GameName": "Example Adventure",
  "GameFolder": "games/ExampleAdventure",
  "ExePath": "bin/ExampleAdventure.exe",
  "StartDir": "bin",
  "LaunchOptions": "WINEDLLOVERRIDES=\"dinput8=n,b\" %command%",
  "TargetSSDPath": "/home/deck/Games/ExampleAdventure",
  "CompatTool": "proton_experimental",
  "AutoLaunch": true
}
```

| Field | Required | Description |
| --- | --- | --- |
| `GameName` | yes | Shortcut name shown in Steam |
| `ExePath` | yes | Executable path relative to the game folder |
| `TargetSSDPath` | no* | Absolute destination on internal storage. Also accepts `TargetSDPath`, `TargetInstallPath`. If omitted, defaults to `/home/deck/Games/<GameName>`. |
| `LaunchOptions` | no | Steam launch options (`%command%` supported) |
| `GameFolder` | no | Folder on the card containing the game (default: card root). Case-insensitive; wrong/missing names are recovered when the exe can still be found. |
| `StartDir` | no | Working directory relative to `TargetSSDPath` |
| `CompatTool` | no | Optional Proton/compat hint for Windows exes |
| `AutoLaunch` | no | Per-card override for auto-launch |

See [`example/game_info.json`](example/game_info.json).

## Frontend controls

- Status text: `Ready`, `Copying Game...`, `Game Launched`, etc.
- Toggle: **Enable Auto-Launch on Insertion**
- **Generate game_info.json on SD** — scans the inserted card for a game folder + `.exe` and writes metadata
- **Overwrite game_info.json on SD** — rebuild metadata if the existing file is wrong
- Last transferred game + rolling log
- Manual **Rescan inserted media**

## Install / update on Steam Deck (Konsole)

### Recommended (v1.0.4 hard reinstall)

```bash
cd /tmp
sudo chown -R deck:deck /home/deck/homebrew /home/deck/Downloads /home/deck/Games
sudo rm -rf /tmp/pml-get /tmp/pml-hard-* /tmp/pml-work-deck-*
mkdir -p /tmp/pml-get && cd /tmp/pml-get
git clone --branch v1.0.4 --single-branch https://github.com/tanayabhay-creator/physical-game-plugin-.git repo
bash repo/hard-reinstall-on-deck.sh
```

Or from the latest development branch:

```bash
sudo chown -R deck:deck ~/homebrew ~/Downloads ~/Games 2>/dev/null || true
sudo chmod -R u+rwX ~/homebrew
mkdir -p ~/Downloads ~/Games
cd ~/Downloads
rm -rf physical-game-plugin-
git clone https://github.com/tanayabhay-creator/physical-game-plugin-.git
cd physical-game-plugin-
git checkout cursor/physical-media-launcher-006e
chmod +x ./hard-reinstall-on-deck.sh ./update-on-deck.sh ./install-on-deck.sh
./hard-reinstall-on-deck.sh
```

Or, if the repo is already downloaded:

```bash
cd ~/Downloads/physical-game-plugin-
chmod +x ./update-on-deck.sh
./update-on-deck.sh
```

`install-on-deck.sh` / `update-on-deck.sh` / `hard-reinstall-on-deck.sh` always run `chown` on `~/homebrew` before copying files.

### Permission denied?

SteamOS keeps the system disk read-only. Never install into `/usr/local`.
These scripts only write under `~/homebrew/plugins` and `~/Games`.

## Tests

```bash
python3 -m unittest discover -s tests -v
```

## Notes / edge cases

- **Non-game media**: ignored unless `game_info.json` exists and is valid.
- **Already on SSD**: copy skipped; shortcut ensured; launch triggered immediately (if enabled).
- **Proton / Windows Non-Steam exes**: use `LaunchOptions` with `%command%` and optional `CompatTool`. After first add, you can also set the Compatibility Tool in Steam Properties if needed.
- **Steam restart**: Steam usually picks up new shortcuts; if a brand-new shortcut does not appear, restart Steam once.
- Plugin requests `_root` so copy/launch helpers can access typical Deck mount paths.
