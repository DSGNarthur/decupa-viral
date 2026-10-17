"""Open the independent local Decupa distribution."""
import os
import json
import runpy
import sys
from pathlib import Path

root = Path(__file__).resolve().parent
os.chdir(root)
config_path = root / "runtime.local.json"
runtime = json.loads(config_path.read_text(encoding="utf-8")) if config_path.exists() else {}
python = runtime.get("python", str(root / ".venv/Scripts/python.exe"))
data_dir = Path(runtime.get("data_dir", str(root)))
os.environ["PORT"] = "16889"
os.environ["APP_NAME"] = "Decupa Viral"
os.environ['DECUPA_COMPANION'] = '1'
os.environ["YOUTUBE_REDIRECT_URI"] = runtime.get("youtube_redirect_uri", "http://localhost:16889/api/settings/youtube-callback")
os.environ["TIKTOK_REDIRECT_URI"] = runtime.get("tiktok_redirect_uri", "http://localhost:16889/api/settings/tiktok-upload-callback")
os.environ["PYTHONUTF8"] = "1"
os.environ["PATH"] = str(Path(python).parent) + os.pathsep + os.environ.get("PATH", "")
os.environ["HF_HOME"] = runtime.get("hf_home", str(data_dir / "whisper-cache"))
os.environ["VIRALMINT_DATA_DIR"] = str(data_dir)
if runtime.get("frontend_dist"):
    os.environ["VIRALMINT_FRONTEND_DIST"] = runtime["frontend_dist"]
(data_dir / "logs").mkdir(parents=True, exist_ok=True)
log = open(data_dir / "logs/launcher.log", "a", encoding="utf-8", buffering=1)
sys.stdout = log
sys.stderr = log
sys.executable = python
sys.path.insert(0, str(root))
runpy.run_path(str(root / "launcher.py"), run_name="__main__")
