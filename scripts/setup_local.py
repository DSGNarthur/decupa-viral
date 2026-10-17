"""Apply the remaining local distribution defaults without copying secrets."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
for relative in [
    "frontend/src/pages/Messaging.jsx", "frontend/src/pages/Library.jsx",
    "frontend/src/components/librarynext/assetModel.js",
]:
    path = root / relative
    text = path.read_text(encoding="utf-8")
    lines = [line if "Copyright" in line else line.replace("ViralMint", "Decupa") for line in text.splitlines()]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")

planner = root / "backend/agents/planner.py"
text = planner.read_text(encoding="utf-8")
text = text.replace("You are ViralMint", "You are Decupa").replace("Welcome to ViralMint!", "Welcome to Decupa!")
planner.write_text(text, encoding="utf-8")

manifest = root / "frontend/public/manifest.json"
data = json.loads(manifest.read_text(encoding="utf-8"))
data.update(name="Decupa", short_name="Decupa", description="Editor e clipador de vídeos")
data["icons"] = [{"src": "/decupa-icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable"}]
manifest.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
(root / "frontend/public/LICENSE.txt").write_bytes((root / "LICENSE").read_bytes())

environment = root / ".env"
if not environment.exists():
    environment.write_text(
        "APP_NAME=Decupa\nDEBUG=false\nHOST=127.0.0.1\nPORT=16889\n"
        "FRONTEND_URL=http://localhost:16889\n"
        "CUSTOM_AI_BASE_URL=https://api.deepseek.com\nCUSTOM_AI_MODEL=deepseek-flash\nCUSTOM_AI_API_KEY=\n",
        encoding="utf-8",
    )
print("Decupa defaults prepared; no existing credentials were copied.")
