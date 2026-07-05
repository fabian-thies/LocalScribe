# Open WebUI Local Backend

This folder provides the default local backend stack for Local Meeting Transcriber. The extension itself talks to Open WebUI. The included Compose setup pairs Open WebUI with Ollama, but Open WebUI can also be configured to use other model providers or OpenAI-compatible APIs.

## Services

- `open-webui`: Open WebUI, exposed on `http://localhost:3000`.
- `ollama`: optional default local model runtime in the included Compose setup, exposed on `http://localhost:11434` for development and available inside Docker at `http://ollama:11434`.
- `open-webui-data`: persistent Open WebUI data volume.
- `ollama-models`: persistent Ollama model volume.

## Environment

Copy `.env.example` to `.env`.

Important variables:

- `OPEN_WEBUI_PORT=3000`
- `OLLAMA_HOST_PORT=11434`
- `OLLAMA_BASE_URL=http://ollama:11434`
- `DEFAULT_LLM_MODEL=gemma4:latest`
- `WHISPER_MODEL=small`
- `WHISPER_LANGUAGE=`
- `WHISPER_MULTILINGUAL=true`
- `WHISPER_COMPUTE_TYPE=int8`

Open WebUI STT environment variables can differ by release. This project keeps them centralized in `.env.example`; confirm exact names against the Open WebUI version you deploy.

## Start

```sh
docker compose up -d
```

Open WebUI is exposed on [http://localhost:3000](http://localhost:3000). Ollama is exposed on `http://localhost:11434`.

To stop the stack:

```sh
docker compose down
```

## Logs

```sh
docker compose logs -f open-webui
docker compose logs -f ollama
```

## Pull Models for the Included Ollama Setup

```sh
docker compose up -d ollama
docker compose exec ollama ollama pull gemma4:latest
```

If you changed `DEFAULT_LLM_MODEL` in `.env`, pull that model instead.

If your Open WebUI instance uses another provider, configure that provider in Open WebUI and use a model name that Open WebUI exposes to clients.

## Health Check

Manual checks work on every platform:

```sh
docker compose ps
docker compose logs --tail=50 open-webui
docker compose logs --tail=50 ollama
```

- Open [http://localhost:3000](http://localhost:3000) in your browser.
- Open `http://localhost:11434/api/tags` in your browser or API client.

## Local Whisper/STT

Open WebUI provides audio/STT functionality through its own backend and settings. Enable local STT/Whisper in Open WebUI if your release requires a UI toggle. The extension defaults to:

```text
/api/v1/audio/transcriptions
```

If your Open WebUI version uses a different STT route, change the path in the extension Settings page.

## API Keys

If `WEBUI_AUTH=true`, create an API key in Open WebUI account settings or admin settings, depending on your Open WebUI version. Paste that key into the extension Settings page as the Bearer token.

## Common Issues

- Open WebUI not reachable: wait for startup, then run `docker compose logs open-webui`.
- Ollama model missing: if you use the included Ollama setup, run `docker compose exec ollama ollama pull <model-name>`.
- STT endpoint mismatch: update the extension STT endpoint path.
- Whisper model slow: use a smaller model such as `base` or `small`, or use GPU acceleration if your environment supports it.
- Microphone permission denied: allow microphone permissions in Chrome.
- Tab audio not captured: open the tab you want to record before clicking Record.

## GPU Notes

The committed Compose file is CPU-only so the stack starts on machines without GPU container support. Keep host-specific GPU settings in `docker-compose.override.yml`; this file is ignored by Git and loaded automatically by Docker Compose.

For NVIDIA, install the NVIDIA Container Toolkit, then create `openwebui/docker-compose.override.yml`:

```yaml
services:
  ollama:
    gpus: all
```

For AMD, `gpus: all` is not the right path for Ollama. Use Ollama's ROCm image and expose the ROCm devices instead:

```yaml
services:
  ollama:
    image: ollama/ollama:rocm
    devices:
      - /dev/kfd
      - /dev/dri
```

After changing GPU settings, restart Ollama:

```sh
docker compose up -d ollama
```
