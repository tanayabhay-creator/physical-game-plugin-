"""Copy game folders from removable media onto the internal SSD."""

from __future__ import annotations

import logging
import os
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Awaitable, Callable, Optional

logger = logging.getLogger("physical-media-launcher.transfer")

# pct, message, bytes_copied, bytes_total
ProgressCallback = Callable[[float, str, int, int], Awaitable[None] | None]


@dataclass
class TransferResult:
    skipped: bool
    source: str
    destination: str
    bytes_copied: int
    duration_sec: float


def destination_ready(target_ssd_path: Path, exe_rel: str) -> bool:
    """Return True when the game already exists on the SSD."""
    if not target_ssd_path.is_dir():
        return False
    exe = target_ssd_path / exe_rel
    if exe.is_file():
        return True
    try:
        next(target_ssd_path.iterdir())
        # Folder exists and is non-empty, but exe missing — treat as incomplete.
        return False
    except StopIteration:
        return False


async def copy_game_tree(
    source_dir: Path,
    dest_dir: Path,
    *,
    progress_cb: Optional[ProgressCallback] = None,
) -> TransferResult:
    """Copy source_dir -> dest_dir with byte-level progress updates.

    Uses a staging directory next to the destination and renames into place
    when complete, so a partial copy never looks "ready".
    """
    source_dir = source_dir.resolve()
    dest_dir = dest_dir.resolve()

    if not source_dir.is_dir():
        raise FileNotFoundError(f"Game source folder missing: {source_dir}")

    total_bytes = _dir_size(source_dir)
    copied = 0
    started = time.monotonic()
    last_report = 0.0

    staging = dest_dir.parent / f".{dest_dir.name}.pml-staging"
    try:
        dest_dir.parent.mkdir(parents=True, exist_ok=True)
        if staging.exists():
            shutil.rmtree(staging)
        staging.mkdir(parents=True, exist_ok=True)
    except PermissionError as exc:
        raise PermissionError(
            f"Cannot create game folder at {dest_dir.parent}. "
            f"Use a path under /home/deck (e.g. /home/deck/Games/MyGame). "
            f"Original error: {exc}"
        ) from exc

    async def report(pct: float, message: str, *, force: bool = False) -> None:
        nonlocal last_report
        if progress_cb is None:
            return
        now = time.monotonic()
        # Throttle UI updates (~4/sec) unless forced (start/finish).
        if not force and (now - last_report) < 0.25 and pct < 99.0:
            return
        last_report = now
        result = progress_cb(pct, message, copied, total_bytes)
        if hasattr(result, "__await__"):
            await result  # type: ignore[misc]

    await report(0.0, f"Starting copy to {dest_dir}", force=True)

    for root, dirs, files in os.walk(source_dir):
        rel_root = Path(root).relative_to(source_dir)
        target_root = staging / rel_root
        target_root.mkdir(parents=True, exist_ok=True)
        dirs[:] = [
            d
            for d in dirs
            if d not in {".Trash-1000", "$RECYCLE.BIN", "System Volume Information"}
        ]

        for name in files:
            src = Path(root) / name
            dst = target_root / name
            rel_name = rel_root / name
            try:
                file_size = src.stat().st_size
            except OSError:
                file_size = 0

            # Stream large files so the bar moves during multi-GB copies.
            if file_size >= 8 * 1024 * 1024:
                with src.open("rb") as rf, dst.open("wb") as wf:
                    while True:
                        chunk = rf.read(1024 * 1024)
                        if not chunk:
                            break
                        wf.write(chunk)
                        copied += len(chunk)
                        pct = (copied / total_bytes * 100.0) if total_bytes else 100.0
                        await report(min(pct, 99.5), f"Copying {rel_name}")
                shutil.copystat(src, dst, follow_symlinks=False)
            else:
                shutil.copy2(src, dst)
                copied += file_size
                pct = (copied / total_bytes * 100.0) if total_bytes else 100.0
                await report(min(pct, 99.5), f"Copying {rel_name}")

    if dest_dir.exists():
        shutil.rmtree(dest_dir)
    dest_dir.parent.mkdir(parents=True, exist_ok=True)
    os.replace(staging, dest_dir)

    duration = time.monotonic() - started
    await report(100.0, "Copy complete", force=True)
    logger.info(
        "Copied %s -> %s (%s bytes in %.1fs)",
        source_dir,
        dest_dir,
        copied,
        duration,
    )
    return TransferResult(
        skipped=False,
        source=str(source_dir),
        destination=str(dest_dir),
        bytes_copied=copied,
        duration_sec=duration,
    )


def _dir_size(path: Path) -> int:
    total = 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            try:
                total += (Path(root) / name).stat().st_size
            except OSError:
                continue
    return total
