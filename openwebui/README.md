# Open WebUI backend

This directory is an optional deployment helper, not the main Voxbound application. The Chrome extension in `extension/` is the actual project. Open WebUI is the API backend used for transcription, summaries, and optional Knowledge Base sync.

If you already operate or have access to an Open WebUI instance, you do not need anything in this directory and do not need Docker on the computer running Chrome. Point the extension at its URL instead. Remote instances must provide HTTPS; unencrypted HTTP is accepted only for localhost. The instance may run locally, elsewhere on a LAN or VPN, on an organization server, or on cloud infrastructure. The default Compose stack below is only a convenient way to create a local instance; it runs Open WebUI by itself and does not require or start Ollama.

## Start Open WebUI

```sh
cp .env.example .env
docker compose up -d
docker compose ps
```

Open WebUI is available at [http://localhost:3000](http://localhost:3000) by default. Persistent application data is stored in the `open-webui-data` Docker volume.

Useful commands:

```sh
docker compose logs -f open-webui
docker compose down
```

## Configure transcription in Open WebUI

Voxbound uploads recordings to Open WebUI; Open WebUI decides which speech-to-text engine and model processes them.

1. Sign in as an administrator.
2. Open **Admin Panel → Settings → Audio**.
3. Under **Speech-to-Text**, choose an engine.
4. Configure its API URL/key when required, select its model, and save.

The main options are:

| STT option | Model selection | Where audio is processed |
| --- | --- | --- |
| Built-in local Whisper | Whisper size such as `tiny`, `base`, `small`, `medium`, or `large` | On the Open WebUI host |
| OpenAI-compatible STT | Provider model ID, for example `whisper-1` | At the configured API |
| Mistral/Voxtral, Deepgram, or Azure | Model/options offered by that engine | At the selected provider |

The built-in local Whisper model is only the default, not a Voxbound requirement. A remote engine can reduce local hardware requirements, while a compatible self-hosted STT API can preserve local control without using Open WebUI's bundled Whisper runtime.

The extension normally calls:

```text
/api/v1/audio/transcriptions
```

Change that path in **Voxbound → Settings → API endpoints** only if your Open WebUI version or reverse proxy exposes another route. The route field does not select the STT model.

### Optional environment configuration

For reproducible server deployments, configure the same settings with Open WebUI environment variables. Common examples are:

```yaml
services:
  open-webui:
    environment:
      AUDIO_STT_ENGINE: openai
      AUDIO_STT_MODEL: whisper-1
      AUDIO_STT_OPENAI_API_BASE_URL: https://api.openai.com/v1
      AUDIO_STT_OPENAI_API_KEY: ${AUDIO_STT_OPENAI_API_KEY}
```

For built-in local Whisper, relevant variables include `WHISPER_MODEL`, `WHISPER_LANGUAGE`, `WHISPER_MULTILINGUAL`, and `WHISPER_COMPUTE_TYPE`. Do not commit provider keys to this repository; keep them in the ignored `.env` file or your secret manager.

Open WebUI configuration changes between releases. Check the official [STT configuration](https://docs.openwebui.com/features/chat-conversations/audio/speech-to-text/stt-config/) and [environment-variable reference](https://docs.openwebui.com/reference/env-configuration/) for your deployed version.

## Configure the summarization model

Open WebUI must expose at least one chat model before Voxbound can create summaries.

1. Open **Admin Panel → Settings → Connections** in Open WebUI.
2. Add Ollama, OpenAI, or another OpenAI-compatible provider.
3. Verify that the model appears in Open WebUI's model selector.
4. Copy its exact model ID into **Voxbound → Settings → Open WebUI backend → Model for summaries**.

You can also list the model IDs exposed to API clients:

```sh
curl -H "Authorization: Bearer YOUR_OPEN_WEBUI_API_KEY" http://localhost:3000/api/models
```

This setting affects summaries only. The transcription model remains the server-wide choice under Open WebUI's Audio settings.

## API authentication

With `WEBUI_AUTH=true`, create an API key in Open WebUI and paste it into the extension's **API key or Bearer token** field. The exact account/admin menu depends on the Open WebUI release. Test the connection from the extension before recording sensitive content.

## Optional Ollama add-on

Ollama remains useful when you want a fully local chat model and do not already have another provider connected to Open WebUI. It is not required for transcription, the extension, or Open WebUI itself, so it lives in a separate Compose add-on:

```sh
docker compose -f docker-compose.yml -f docker-compose.ollama.yml up -d
docker compose -f docker-compose.yml -f docker-compose.ollama.yml exec ollama ollama pull qwen2.5:7b-instruct
```

The add-on connects Open WebUI to `http://ollama:11434`. Once the model appears in Open WebUI, use its exact ID in the extension settings.

The optional file accepts `OLLAMA_HOST_PORT` and `OLLAMA_BASE_URL` environment variables if you need values other than `11434` and `http://ollama:11434`.

For host-specific GPU configuration, create an ignored `docker-compose.ollama.local.yml` and include it explicitly with both files. Do not use the automatically loaded name `docker-compose.override.yml`: the standalone base stack has no Ollama service, so an old Ollama-only override with that name makes `docker compose up -d` invalid.

Example `docker-compose.ollama.local.yml` for NVIDIA:

```yaml
services:
  ollama:
    gpus: all
```

Then run:

```sh
docker compose -f docker-compose.yml -f docker-compose.ollama.yml -f docker-compose.ollama.local.yml up -d
```

For AMD, use Ollama's ROCm image and device mappings (`/dev/kfd` and `/dev/dri`) instead of `gpus: all`.

If you are upgrading from the earlier repository layout and already have `docker-compose.override.yml`, rename it to `docker-compose.ollama.local.yml` before starting the standalone Open WebUI stack.

## Common issues

- **Open WebUI is unreachable:** run `docker compose logs open-webui` and check the base URL in the extension.
- **No summary model:** connect a model provider in Open WebUI, then copy an exposed model ID into the extension settings.
- **STT endpoint error:** verify the Audio configuration and the extension's transcription endpoint path.
- **Transcription is slow:** choose a smaller local Whisper model or configure a remote/self-hosted STT provider in Open WebUI.
- **Unexpected cloud processing:** review both the Open WebUI Audio engine and model Connections; the extension cannot determine where those upstream providers process data.
