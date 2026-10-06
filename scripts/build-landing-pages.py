"""Copy the hand-written landing pages into the build output and extend the
generated sitemap with them (idempotent, runs after build-seo-pages.py)."""
import os, shutil, sys, re

def main():
    out = "public"
    for i, arg in enumerate(sys.argv):
        if arg == "--out" and i + 1 < len(sys.argv): out = sys.argv[i + 1]
    src = "landing"
    if not os.path.isdir(src): return
    for name in sorted(os.listdir(src)):
        s = os.path.join(src, name)
        d = os.path.join(out, name)
        if os.path.isdir(s):
            shutil.rmtree(d, ignore_errors=True)
            shutil.copytree(s, d)
            print("landing:", name)
    sm = os.path.join(out, "sitemap.xml")
    if os.path.exists(sm):
        xml = open(sm).read()
        base = "https://funsat.bid"
        add = ""
        for name in sorted(os.listdir(src)):
            loc = base + "/" + name + "/"
            if loc not in xml:
                add += f"  <url>\n    <loc>{loc}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>\n"
        if add:
            xml = xml.replace("</urlset>", add + "</urlset>")
            open(sm, "w").write(xml)
            print("sitemap extended with", add.count("<url>"), "landing urls")

if __name__ == "__main__":
    main()
