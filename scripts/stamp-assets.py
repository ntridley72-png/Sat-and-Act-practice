"""Stamp every built page's local css/js references with that file's content hash. Runs last in the build, so pages
written after build-seo-pages.py (hubs, landing pages, skill pages) get the same long-cache-safe URLs."""
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("seo_pages", ROOT / "scripts" / "build-seo-pages.py")
mod = importlib.util.module_from_spec(spec)
sys.path.insert(0, str(ROOT / "scripts"))
spec.loader.exec_module(mod)
out = (ROOT / (sys.argv[1] if len(sys.argv) > 1 else "public")).resolve()
print(f"  stamped {mod.stamp_tree(out, mod.asset_version())} more documents")
