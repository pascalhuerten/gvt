"""Simple cache-busting helper

Scan all .html files under public/ and append/update a ?v=<mtime> query param
for local links to .css and .js files. Use this before deploying or publishing
so links reference the filesystem modification time and browsers fetch updates.

Usage:
    python scripts/cache_bust.py

This script is intentionally small and depends only on the Python standard library.
"""

from pathlib import Path
import re
import time

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"

CSS_JS_RE = re.compile(
    r'(?P<prefix>(?:href|src)=(?:"|\'))(?P<path>[^"\']+\.(?:css|js))(?:\?[^"\']*)?(?P<suffix>(?:"|\'))',
    re.IGNORECASE,
)


def mtime_version(path: Path) -> str:
    try:
        return str(int(path.stat().st_mtime))
    except Exception:
        return str(int(time.time()))


def replace_match(match, html_dir: Path, version: str | None):
    rel = match.group("path")
    # ignore absolute/remote URLs
    if rel.startswith("http://") or rel.startswith("https://") or rel.startswith("//"):
        return match.group(0)

    target = (html_dir / rel).resolve()
    if not target.exists():
        # try resolving relative to project root
        candidate = (PUBLIC / rel).resolve()
        if candidate.exists():
            target = candidate

    if not target.exists():
        return match.group(0)

    v = version or mtime_version(target)
    # ensure we only include the path (without any existing query)
    clean_rel = rel.split("?", 1)[0]
    new = f"{match.group('prefix')}{clean_rel}?v={v}{match.group('suffix')}"
    return new


def process_file(path: Path):
    text = path.read_text(encoding="utf8")

    def repl(m):
        return replace_match(m, path.parent, version_arg)

    new_text = CSS_JS_RE.sub(repl, text)
    if new_text != text:
        path.write_text(new_text, encoding="utf8")
        print(f"Updated: {path.relative_to(ROOT)}")


if __name__ == "__main__":
    if not PUBLIC.exists():
        print("public/ not found")
        raise SystemExit(1)
    import argparse

    parser = argparse.ArgumentParser(
        description="Cache-bust static .css/.js references in HTML files"
    )
    parser.add_argument(
        "--version",
        "-v",
        help="Version string to append (e.g. CI_COMMIT_SHORT_SHA). If omitted, file mtime is used.",
    )
    args = parser.parse_args()
    version_arg = args.version

    html_files = list(PUBLIC.rglob("*.html"))
    for f in html_files:
        process_file(f)

    print("Done.")
