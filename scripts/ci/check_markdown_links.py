"""Validate repository-local links in Markdown files."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlsplit

_LINK = re.compile(r"!?\[[^\]]*\]\((?P<target>[^)\s]+)(?:\s+[^)]*)?\)")
_HEADING = re.compile(r"^\s{0,3}#{1,6}\s+(?P<text>.+?)\s*#*\s*$")
_PUNCTUATION = re.compile(r"[^\w\- ]", re.UNICODE)
_WHITESPACE = re.compile(r"\s+")


def _markdown_files(root: Path) -> tuple[Path, ...]:
    result = subprocess.run(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "*.md"],
        cwd=root,
        check=True,
        capture_output=True,
    )
    return tuple(
        root / item.decode()
        for item in result.stdout.split(b"\0")
        if item and (root / item.decode()).is_file()
    )


def _anchor(text: str) -> str:
    value = re.sub(r"`([^`]*)`", r"\1", text).lower()
    value = re.sub(r"[*_~]", "", value)
    value = _PUNCTUATION.sub("", value)
    return _WHITESPACE.sub("-", value.strip())


def _anchors(path: Path) -> frozenset[str]:
    anchors: set[str] = set()
    counts: dict[str, int] = {}
    in_fence = False
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.lstrip().startswith(("```", "~~~")):
            in_fence = not in_fence
            continue
        if in_fence or (match := _HEADING.match(line)) is None:
            continue
        base = _anchor(match.group("text"))
        count = counts.get(base, 0)
        counts[base] = count + 1
        anchors.add(base if count == 0 else f"{base}-{count}")
    return frozenset(anchors)


def main() -> int:
    root = Path(
        subprocess.run(
            ["git", "rev-parse", "--show-toplevel"], check=True, capture_output=True, text=True
        ).stdout.strip()
    ).resolve()
    diagnostics: list[str] = []
    anchor_cache: dict[Path, frozenset[str]] = {}

    for source in _markdown_files(root):
        in_fence = False
        for line_number, line in enumerate(source.read_text(encoding="utf-8").splitlines(), 1):
            if line.lstrip().startswith(("```", "~~~")):
                in_fence = not in_fence
                continue
            if in_fence:
                continue
            for match in _LINK.finditer(line):
                raw = match.group("target").strip("<>")
                parsed = urlsplit(raw)
                if parsed.scheme or parsed.netloc:
                    continue
                target = source if not parsed.path else source.parent / unquote(parsed.path)
                resolved = target.resolve(strict=False)
                try:
                    resolved.relative_to(root)
                except ValueError:
                    diagnostics.append(
                        f"{source.relative_to(root)}:{line_number}: link escapes repository"
                    )
                    continue
                if not resolved.exists():
                    diagnostics.append(f"{source.relative_to(root)}:{line_number}: missing {raw}")
                    continue
                fragment = unquote(parsed.fragment)
                if fragment and resolved.suffix.lower() == ".md":
                    anchors = anchor_cache.setdefault(resolved, _anchors(resolved))
                    if fragment not in anchors:
                        diagnostics.append(
                            f"{source.relative_to(root)}:{line_number}: missing fragment {fragment}"
                        )

    if diagnostics:
        print("\n".join(diagnostics))
        return 1
    print(f"Documentation links passed: {len(_markdown_files(root))} Markdown files checked.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
