#!/usr/bin/env python3
"""Add or replace a ?v= query on local CSS, script, and module URLs.

GitHub Pages sends Cache-Control: max-age=600 and the site has no versioned
asset names. A normal reload revalidates the HTML and then reuses any script
or stylesheet that is still fresh, including ES modules imported by a stable
URL. Stamping every local asset URL with the deploy SHA makes the next page
load fetch the new files.
"""

import re
import sys
from pathlib import Path

HTML_ATTR = re.compile(
    r'(?P<attr>(?:href|src)=")(?P<url>(?!https?:|//)[^"]+\.(?:css|js))(?:\?v=[^"]*)?"'
)
JS_IMPORT = re.compile(
    r'(?P<pre>from\s+["\'])(?P<url>\./[^"\']+?\.js)(?:\?v=[^"\']*)?(?P<post>["\'])'
)


def stamp_text(text, rev, kind):
    pattern = HTML_ATTR if kind == "html" else JS_IMPORT

    def repl(match):
        if kind == "html":
            return f'{match.group("attr")}{match.group("url")}?v={rev}"'
        return f'{match.group("pre")}{match.group("url")}?v={rev}{match.group("post")}'

    return pattern.sub(repl, text)


def main():
    root = Path(sys.argv[1])
    rev = sys.argv[2]
    if not rev or "/" in rev or '"' in rev:
        raise SystemExit("version must be a single path token")
    changed = 0
    for path in sorted(root.rglob("*")):
        if path.suffix == ".html":
            kind = "html"
        elif path.suffix == ".js" and "js" in path.parts:
            kind = "js"
        else:
            continue
        text = path.read_text()
        stamped = stamp_text(text, rev, kind)
        if stamped != text:
            path.write_text(stamped)
            changed += 1
    print(f"stamped {changed} files with v={rev}")


if __name__ == "__main__":
    main()
