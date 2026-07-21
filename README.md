# Physical Media Launcher

Decky Loader plugin for Steam Deck that detects game SD cards / USB drives, copies the game folder to the internal SSD when needed, registers a Non-Steam Steam shortcut, and optionally launches it.

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
| `TargetSSDPath` | yes | Absolute destination on internal storage |
| `LaunchOptions` | no | Steam launch options (`%command%` supported) |
| `GameFolder` | no | Folder on the card containing the game (default: card root) |
| `StartDir` | no | Working directory relative to `TargetSSDPath` |
| `CompatTool` | no | Optional Proton/compat hint for Windows exes |
| `AutoLaunch` | no | Per-card override for auto-launch |

See [`example/game_info.json`](example/game_info.json).

## Frontend controls

- Status text: `Ready`, `Copying Game...`, `Game Launched`, etc.
- Toggle: **Enable Auto-Launch on Insertion**
- Last transferred game + rolling log
- Manual **Rescan inserted media**

## Install (developer)

1. Install [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader).
2. In Desktop Mode Konsole, from this repo:

```bash
chmod +x ./install-on-deck.sh
./install-on-deck.sh
```

Or manually:

```bash
mkdir -p ~/homebrew/plugins
rm -rf ~/homebrew/plugins/PhysicalMediaLauncher
cp -a . ~/homebrew/plugins/PhysicalMediaLauncher
mkdir -p ~/Games
```

3. Return to Game Mode and reload Decky plugins.

### Permission denied in Konsole?

SteamOS keeps the **system disk read-only**. Do **not** install into `/usr/local` or `/etc` unless you intentionally unlock the rootfs.

**Plugin install (most common fix):**

```bash
# Decky must exist first
ls ~/homebrew

# If "Permission denied" on ~/homebrew:
sudo chown -R deck:deck ~/homebrew
mkdir -p ~/homebrew/plugins
mkdir -p ~/Games
```

**Game copy destination** in `game_info.json` must be under your home, e.g.:

```json
"TargetSSDPath": "/home/deck/Games/MyGame"
```

Avoid paths like `/usr/...`, `/opt/...`, or `/run/media/...` as the SSD target.

**Optional udev helpers** (not required). Only if you really want them:

```bash
sudo steamos-readonly disable
sudo mkdir -p /etc/udev/rules.d
# point the rule at the helper inside the plugin folder, then:
sudo steamos-readonly enable
```

Prefer skipping udev — the plugin already polls `/run/media/deck`.

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
