"""Package corresponding source, excluding credentials and runtime data."""
import subprocess
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
destination = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / "frontend/public/source-code.zip"
destination.parent.mkdir(parents=True, exist_ok=True)
result = subprocess.run(
    ["git", "-c", f"safe.directory={root.as_posix()}", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    cwd=root, capture_output=True, check=True,
)
paths = sorted(set(result.stdout.decode("utf-8").split("\0")) - {""})
with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
    for relative in paths:
        path = root / relative
        if relative == "frontend/public/source-code.zip" or not path.is_file():
            continue
        if path.name in {".env", ".env.local"} or path.suffix in {".db", ".pem", ".key"}:
            raise RuntimeError(f"Unexpected sensitive file in source manifest: {relative}")
        archive.write(path, f"Decupa/{relative}")
print(f"Source package: {destination} ({destination.stat().st_size} bytes)")
