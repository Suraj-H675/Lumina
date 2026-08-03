"""Validate repository-local Markdown links in the complete Git candidate tree."""

from __future__ import annotations

import html
import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit

_INLINE_LINK = re.compile(
    r"!?\[[^\]\n]*\]\(\s*(?P<destination><[^>\n]+>|[^)\s]+)"
    r"(?:\s+(?:\"[^\"]*\"|'[^']*'|\([^)]*\)))?\s*\)"
)
_FENCE = re.compile(r"^\s*(`{3,}|~{3,})")
_ATX_HEADING = re.compile(r"^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$")
_INLINE_CODE = re.compile(r"`[^`]*`")
_MARKDOWN_DECORATION = re.compile(r"[*_~]")
_LINK_LABEL = re.compile(r"!?\[([^]]+)\]\([^)]*\)")
_ANCHOR_PUNCTUATION = re.compile(r"[^\w\- ]", flags=re.UNICODE)
_WHITESPACE = re.compile(r"\s+")


@dataclass(frozen=True, order=True)
class Diagnostic:
    path: str
    line: int
    code: str
    message: str

    def render(self) -> str:
        return f"{self.path}:{self.line}: {self.code}: {self.message}"


def repository_root() -> Path:
    """Resolve the active Git worktree root without trusting the caller's directory text."""
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        check=True,
        capture_output=True,
    )
    return Path(os.fsdecode(result.stdout.rstrip(b"\n"))).resolve(strict=True)


def _is_within(root: Path, candidate: Path) -> bool:
    try:
        candidate.relative_to(root)
    except ValueError:
        return False
    return True


def discover_markdown_files(root: Path) -> tuple[tuple[Path, ...], tuple[Diagnostic, ...]]:
    """Return tracked and nonignored untracked Markdown candidates in lexical order."""
    result = subprocess.run(
        [
            "git",
            "ls-files",
            "-z",
            "--cached",
            "--others",
            "--exclude-standard",
            "--",
            "*.md",
        ],
        cwd=root,
        check=True,
        capture_output=True,
    )
    relative_paths = sorted(
        {PurePosixPath(os.fsdecode(item)).as_posix() for item in result.stdout.split(b"\0") if item}
    )
    candidates: list[Path] = []
    diagnostics: list[Diagnostic] = []
    for relative in relative_paths:
        pure = PurePosixPath(relative)
        if pure.is_absolute() or ".." in pure.parts:
            diagnostics.append(
                Diagnostic(relative, 0, "doc.candidate_escape", "candidate is outside repository")
            )
            continue
        candidate = root.joinpath(*pure.parts)
        if not candidate.exists() and not candidate.is_symlink():
            continue
        resolved = candidate.resolve(strict=False)
        if not _is_within(root, resolved):
            diagnostics.append(
                Diagnostic(
                    relative, 0, "doc.candidate_escape", "candidate resolves outside repository"
                )
            )
            continue
        if not resolved.is_file():
            diagnostics.append(
                Diagnostic(
                    relative, 0, "doc.candidate_unreadable", "candidate is not a readable file"
                )
            )
            continue
        candidates.append(candidate)
    return tuple(candidates), tuple(sorted(diagnostics))


def _content_lines(path: Path) -> tuple[str, ...]:
    return tuple(path.read_text(encoding="utf-8").splitlines())


def _visible_lines(lines: tuple[str, ...]) -> tuple[tuple[int, str], ...]:
    visible: list[tuple[int, str]] = []
    fence_marker: str | None = None
    for number, line in enumerate(lines, start=1):
        fence = _FENCE.match(line)
        if fence:
            marker = fence.group(1)[0]
            if fence_marker is None:
                fence_marker = marker
            elif marker == fence_marker:
                fence_marker = None
            continue
        if fence_marker is None:
            visible.append((number, line))
    return tuple(visible)


def _heading_anchor(heading: str) -> str:
    value = html.unescape(heading).strip().lower()
    value = _LINK_LABEL.sub(r"\1", value)
    value = _INLINE_CODE.sub(lambda match: match.group(0).strip("`"), value)
    value = _MARKDOWN_DECORATION.sub("", value)
    value = _ANCHOR_PUNCTUATION.sub("", value)
    return _WHITESPACE.sub("-", value.strip())


def _anchors(path: Path) -> frozenset[str]:
    seen: dict[str, int] = {}
    anchors: set[str] = set()
    for _number, line in _visible_lines(_content_lines(path)):
        match = _ATX_HEADING.match(line)
        if match is None:
            continue
        base = _heading_anchor(match.group(2))
        duplicate = seen.get(base, 0)
        seen[base] = duplicate + 1
        anchors.add(base if duplicate == 0 else f"{base}-{duplicate}")
    return frozenset(anchors)


def _relative(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def _validate_target(
    *,
    root: Path,
    source: Path,
    line: int,
    destination: str,
    anchor_cache: dict[Path, frozenset[str]],
) -> Diagnostic | None:
    raw_destination = destination[1:-1] if destination.startswith("<") else destination
    try:
        parsed = urlsplit(raw_destination)
    except ValueError:
        return Diagnostic(
            _relative(source, root), line, "doc.target_invalid", "link target is malformed"
        )
    if parsed.scheme or parsed.netloc:
        return None

    decoded_path = unquote(parsed.path)
    decoded_fragment = unquote(parsed.fragment)
    if "\x00" in decoded_path or "\x00" in decoded_fragment:
        return Diagnostic(
            _relative(source, root), line, "doc.target_invalid", "link target contains null data"
        )

    relative_target = Path(decoded_path) if decoded_path else Path(source.name)
    if relative_target.is_absolute():
        return Diagnostic(
            _relative(source, root),
            line,
            "doc.target_escape",
            "local link is not repository-relative",
        )
    target = source.parent / relative_target if decoded_path else source
    resolved = target.resolve(strict=False)
    if not _is_within(root, resolved):
        return Diagnostic(
            _relative(source, root),
            line,
            "doc.target_escape",
            "local link resolves outside repository",
        )
    if not resolved.exists():
        return Diagnostic(
            _relative(source, root), line, "doc.target_missing", "local link target does not exist"
        )
    if decoded_fragment and resolved.suffix.lower() == ".md":
        anchors = anchor_cache.setdefault(resolved, _anchors(resolved))
        if decoded_fragment not in anchors:
            return Diagnostic(
                _relative(source, root),
                line,
                "doc.fragment_missing",
                "local Markdown fragment does not exist",
            )
    return None


def validate_repository(root: Path) -> tuple[tuple[Path, ...], tuple[Diagnostic, ...]]:
    """Validate local links for the current tracked/untracked Git candidate."""
    candidates, discovery_diagnostics = discover_markdown_files(root)
    diagnostics = list(discovery_diagnostics)
    anchor_cache: dict[Path, frozenset[str]] = {}
    for candidate in candidates:
        for line_number, line in _visible_lines(_content_lines(candidate)):
            without_code = _INLINE_CODE.sub("", line)
            for match in _INLINE_LINK.finditer(without_code):
                diagnostic = _validate_target(
                    root=root,
                    source=candidate,
                    line=line_number,
                    destination=match.group("destination"),
                    anchor_cache=anchor_cache,
                )
                if diagnostic is not None:
                    diagnostics.append(diagnostic)
    return candidates, tuple(sorted(set(diagnostics)))


def main() -> int:
    try:
        root = repository_root()
        candidates, diagnostics = validate_repository(root)
    except (OSError, subprocess.CalledProcessError, UnicodeError):
        print("doc.discovery_failed: Markdown candidates could not be inspected.")
        return 1
    if diagnostics:
        for diagnostic in diagnostics:
            print(diagnostic.render())
        return 1
    print(f"Documentation links passed: {len(candidates)} Markdown files checked.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
