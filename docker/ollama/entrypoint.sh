#!/bin/sh
set -e

: "${MODEL_NAME:?MODEL_NAME env var is required}"
: "${MODEL_GGUF_PATH:?MODEL_GGUF_PATH env var is required}"

ollama serve &
SERVE_PID=$!
trap 'kill -TERM "$SERVE_PID" 2>/dev/null; wait "$SERVE_PID"' TERM INT

echo "[entrypoint] waiting for ollama server..."
until ollama list >/dev/null 2>&1; do
  sleep 1
done
echo "[entrypoint] ollama server is up"

if ollama list | awk '{print $1}' | grep -qx "$MODEL_NAME"; then
  echo "[entrypoint] model '$MODEL_NAME' already imported, skipping create"
else
  echo "[entrypoint] importing $MODEL_GGUF_PATH as '$MODEL_NAME'"
  printf 'FROM %s\n' "$MODEL_GGUF_PATH" > /tmp/Modelfile
  ollama create "$MODEL_NAME" -f /tmp/Modelfile
fi

echo "[entrypoint] warming up '$MODEL_NAME'"
ollama run "$MODEL_NAME" "hi" >/dev/null 2>&1 || \
  echo "[entrypoint] warm-up request failed, continuing anyway"

echo "[entrypoint] ready — serving '$MODEL_NAME'"
wait "$SERVE_PID"
