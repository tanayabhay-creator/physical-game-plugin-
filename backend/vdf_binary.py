"""Minimal binary VDF reader/writer for Steam shortcuts.vdf.

Steam Non-Steam shortcuts live in a binary KeyValues file. This module
implements only the subset needed to safely load, mutate, and dump that file
without an external dependency.
"""

from __future__ import annotations

from typing import Any, BinaryIO, Dict, List, Tuple, Union

KV = Union[Dict[str, Any], List[Any], str, int, float, bytes]

TYPE_NONE = 0x00
TYPE_STRING = 0x01
TYPE_INT32 = 0x02
TYPE_FLOAT32 = 0x03
TYPE_POINTER = 0x04
TYPE_WIDESTRING = 0x05
TYPE_COLOR = 0x06
TYPE_UINT64 = 0x07
TYPE_END = 0x08
TYPE_INT64 = 0x0A


class VDFBinaryError(Exception):
    """Raised when binary VDF parsing or writing fails."""


def _read_cstring(fp: BinaryIO) -> str:
    buf = bytearray()
    while True:
        ch = fp.read(1)
        if not ch:
            raise VDFBinaryError("Unexpected EOF while reading cstring")
        if ch == b"\x00":
            break
        buf.extend(ch)
    return buf.decode("utf-8", errors="replace")


def _write_cstring(fp: BinaryIO, value: str) -> None:
    fp.write(value.encode("utf-8", errors="replace") + b"\x00")


def loads(data: bytes) -> Dict[str, Any]:
    """Parse a binary VDF document from bytes."""
    from io import BytesIO

    return load(BytesIO(data))


def load(fp: BinaryIO) -> Dict[str, Any]:
    """Parse a binary VDF document from a file-like object."""
    stack: List[Dict[str, Any]] = [{}]
    current = stack[0]

    while True:
        type_byte = fp.read(1)
        if not type_byte:
            break
        type_id = type_byte[0]

        if type_id == TYPE_END:
            if len(stack) == 1:
                break
            stack.pop()
            current = stack[-1]
            continue

        key = _read_cstring(fp)

        if type_id == TYPE_NONE:
            child: Dict[str, Any] = {}
            current[key] = child
            stack.append(child)
            current = child
        elif type_id == TYPE_STRING:
            current[key] = _read_cstring(fp)
        elif type_id == TYPE_INT32:
            raw = fp.read(4)
            if len(raw) != 4:
                raise VDFBinaryError("Truncated int32")
            current[key] = int.from_bytes(raw, "little", signed=True)
        elif type_id == TYPE_FLOAT32:
            raw = fp.read(4)
            if len(raw) != 4:
                raise VDFBinaryError("Truncated float32")
            import struct

            current[key] = struct.unpack("<f", raw)[0]
        elif type_id in (TYPE_POINTER, TYPE_COLOR):
            raw = fp.read(4)
            if len(raw) != 4:
                raise VDFBinaryError("Truncated pointer/color")
            current[key] = int.from_bytes(raw, "little", signed=False)
        elif type_id == TYPE_WIDESTRING:
            # UTF-16LE terminated by two NUL bytes
            buf = bytearray()
            while True:
                pair = fp.read(2)
                if len(pair) != 2:
                    raise VDFBinaryError("Truncated widestring")
                if pair == b"\x00\x00":
                    break
                buf.extend(pair)
            current[key] = buf.decode("utf-16-le", errors="replace")
        elif type_id in (TYPE_UINT64, TYPE_INT64):
            raw = fp.read(8)
            if len(raw) != 8:
                raise VDFBinaryError("Truncated int64")
            signed = type_id == TYPE_INT64
            current[key] = int.from_bytes(raw, "little", signed=signed)
        else:
            raise VDFBinaryError(f"Unsupported VDF type: 0x{type_id:02x}")

    return stack[0]


def dumps(obj: Dict[str, Any]) -> bytes:
    """Serialize a dict to binary VDF bytes."""
    from io import BytesIO

    bio = BytesIO()
    dump(obj, bio)
    return bio.getvalue()


def dump(obj: Dict[str, Any], fp: BinaryIO) -> None:
    """Serialize a dict to a binary VDF file-like object."""
    _dump_map(obj, fp)
    # Top-level document is terminated by TYPE_END after the root map contents.
    # Valve binary VDF for shortcuts starts with TYPE_NONE + "shortcuts" key.
    # Callers pass {"shortcuts": {...}} and we write that map body with an end.


def _dump_value(key: str, value: Any, fp: BinaryIO) -> None:
    import struct

    if isinstance(value, dict):
        fp.write(bytes([TYPE_NONE]))
        _write_cstring(fp, key)
        _dump_map(value, fp)
    elif isinstance(value, str):
        fp.write(bytes([TYPE_STRING]))
        _write_cstring(fp, key)
        _write_cstring(fp, value)
    elif isinstance(value, bool):
        fp.write(bytes([TYPE_INT32]))
        _write_cstring(fp, key)
        fp.write(int(value).to_bytes(4, "little", signed=True))
    elif isinstance(value, int):
        # Prefer int32 for Steam shortcut fields; fall back to int64 if needed.
        if -2147483648 <= value <= 2147483647:
            fp.write(bytes([TYPE_INT32]))
            _write_cstring(fp, key)
            fp.write(value.to_bytes(4, "little", signed=True))
        else:
            fp.write(bytes([TYPE_INT64]))
            _write_cstring(fp, key)
            fp.write(value.to_bytes(8, "little", signed=True))
    elif isinstance(value, float):
        fp.write(bytes([TYPE_FLOAT32]))
        _write_cstring(fp, key)
        fp.write(struct.pack("<f", value))
    else:
        raise VDFBinaryError(f"Unsupported value type for key {key!r}: {type(value)}")


def _dump_map(obj: Dict[str, Any], fp: BinaryIO) -> None:
    for key, value in obj.items():
        _dump_value(str(key), value, fp)
    fp.write(bytes([TYPE_END]))


def normalize_shortcuts_root(data: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure a shortcuts.vdf-shaped root dict exists."""
    if "shortcuts" not in data or not isinstance(data["shortcuts"], dict):
        data["shortcuts"] = {}
    return data


def next_shortcut_index(shortcuts: Dict[str, Any]) -> str:
    """Return the next numeric string index for a new shortcut entry."""
    indices = []
    for key in shortcuts.keys():
        try:
            indices.append(int(key))
        except (TypeError, ValueError):
            continue
    return str(max(indices) + 1) if indices else "0"


def find_shortcut(
    shortcuts: Dict[str, Any],
    *,
    app_name: str | None = None,
    exe: str | None = None,
) -> Tuple[str, Dict[str, Any]] | None:
    """Find an existing shortcut by AppName and/or Exe path."""
    needle_name = (app_name or "").strip().lower()
    needle_exe = _normalize_exe(exe) if exe else ""

    for key, entry in shortcuts.items():
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("AppName") or entry.get("appname") or "").strip().lower()
        entry_exe = _normalize_exe(str(entry.get("Exe") or entry.get("exe") or ""))
        name_ok = not needle_name or name == needle_name
        exe_ok = not needle_exe or entry_exe == needle_exe
        if name_ok and exe_ok:
            return str(key), entry
    return None


def _normalize_exe(exe: str) -> str:
    value = exe.strip().strip('"').replace("\\", "/").lower()
    return value
