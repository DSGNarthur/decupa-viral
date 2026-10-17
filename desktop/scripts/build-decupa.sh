#!/usr/bin/env bash
# Run on the target OS. The Python builder packages its own runtime and source.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
PYTHON_BIN="${PYTHON_BIN:-python3}"
OUT="${DECUPA_BUILD_OUTPUT:-${RUNNER_TEMP:-$(dirname "$ROOT")}/decupa-build-${VIRALMINT_VERSION:-dev}}"
command -v uv >/dev/null || "$PYTHON_BIN" -m pip install 'uv==0.13.1'
"$PYTHON_BIN" scripts/package_source.py
(cd frontend && npm ci && npm run build)
case "$(uname -s)" in
  Linux)
    # Static binaries, no dependency on the runner's /usr/lib tree.
    mkdir -p "$OUT/tools"
    ARCHIVE="$OUT/tools/ffmpeg.tar.xz"
    curl -fL --retry 3 -o "$ARCHIVE" 'https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-16-13-04/ffmpeg-n8.1.3-18-g46d899d7a0-linux64-gpl-8.1.tar.xz'
    echo 'c19bd7fec94e0c56032fad4f20bf56b2847f18fbe372c758b32ed10d4dec2176  '"$ARCHIVE" | sha256sum -c -
    tar -xJf "$ARCHIVE" -C "$OUT/tools"
    export PATH="$OUT/tools/ffmpeg-n8.1.3-18-g46d899d7a0-linux64-gpl-8.1/bin:$PATH"
    ;;
  Darwin)
    # Homebrew supplies the architecture-specific executable and its dylibs.
    # dylibbundler copies only the dylib dependency closure into the payload.
    HOMEBREW_NO_AUTO_UPDATE=1 brew install ffmpeg-full dylibbundler
    export DECUPA_FFMPEG="$(brew --prefix ffmpeg-full)/bin/ffmpeg"
    export DECUPA_FFPROBE="$(brew --prefix ffmpeg-full)/bin/ffprobe"
    ;;
  *) ;;
esac
"$PYTHON_BIN" desktop/build_distribution.py --output "$OUT" --version "${VIRALMINT_VERSION:-2026.10.17}"
"$PYTHON_BIN" desktop/accept_installation.py --build-root "$OUT"
mkdir -p desktop/release
cp "$OUT"/Decupa-*.zip desktop/release/ 2>/dev/null || true
cp "$OUT"/Decupa-*.tar.gz desktop/release/ 2>/dev/null || true
cp "$OUT"/Decupa-*.sha256 "$OUT/smoke.json" desktop/release/
