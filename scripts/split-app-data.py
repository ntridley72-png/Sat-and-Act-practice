#!/usr/bin/env python3
"""Ship the question banks and the app code as two files, so a code fix does not make every visitor re-download about
2.4 MB of questions (and the reverse).

app.js stays one file in the repository: generators, verifiers and tests read and edit it there. At build time everything
above the /*__APP_CODE_START__ marker becomes public/questions.js and the rest public/app.js. Both are classic scripts
loaded with defer in that order, so the top-level const/function declarations in questions.js are visible to app.js
exactly as before. Usage: python3 scripts/split-app-data.py public
"""
import re, sys
from pathlib import Path

MARK = "/*__APP_CODE_START__"


def main(out):
    out = Path(out)
    src = (out / "app.js").read_text(encoding="utf8")
    i = src.find(MARK)
    if i < 0:
        sys.exit("split-app-data: marker missing from app.js")
    (out / "questions.js").write_text(src[:i], encoding="utf8")
    (out / "app.js").write_text(src[i:], encoding="utf8")
    for html in out.rglob("*.html"):
        text = html.read_text(encoding="utf8")
        new, n = re.subn(r'<script defer src="((?:\.?/)?)app\.js"', r'<script defer src="\1questions.js"></script>\n<script defer src="\1app.js"', text)
        if n:
            html.write_text(new, encoding="utf8")
            print(f"split-app-data: {html.relative_to(out)} loads questions.js before app.js")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "public")
