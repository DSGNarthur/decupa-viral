FROM node:22-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libgomp1 libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 decupa \
    && mkdir -p /data && chown decupa:decupa /data
WORKDIR /app
COPY --from=frontend /usr/local/bin/node /usr/local/bin/node
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend ./backend
COPY motion_assets ./motion_assets
COPY LICENSE MODIFICATIONS.md README-DECUPA.md ./
COPY --from=frontend /build/frontend/dist ./frontend/dist
ENV VIRALMINT_DATA_DIR=/data VIRALMINT_FRONTEND_DIST=/app/frontend/dist \
    APP_NAME=Decupa DEBUG=false HOST=127.0.0.1 PORT=16889 \
    HF_HOME=/data/whisper-cache PYTHONUNBUFFERED=1
USER decupa
EXPOSE 16889
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:16889/api/health', timeout=3)"
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "16889", "--workers", "1"]
