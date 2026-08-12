# Configuring Open WebUI for Voxbound

Voxbound uses Open WebUI as its only API backend. The extension uploads recordings for speech-to-text, sends transcripts for summarization, and can optionally store completed meetings in an Open WebUI Knowledge Base.

Open WebUI may run locally or on another reachable server. Remote instances must use HTTPS; unencrypted HTTP is accepted only for localhost. The optional Compose files in this repository are a convenience and are not required by the extension.

## Required Open WebUI capabilities

Voxbound uses these default API routes:

| Purpose | Default path |
| --- | --- |
| Transcription | `/api/v1/audio/transcriptions` |
| Summaries | `/api/chat/completions` |
| Model discovery | `/api/models` |
| Optional Knowledge Base sync | `/api/v1/files` and `/api/v1/knowledge` |

The transcription and chat paths can be changed under **Voxbound → Settings → API endpoints** when a reverse proxy or Open WebUI version exposes different routes.

Changing an endpoint path does not select a model.

## Authentication

When authentication is enabled, create an API key in Open WebUI and enter it under **Voxbound → Settings → API key or Bearer token**. The exact account or administration menu can differ between Open WebUI releases.

Test the connection from Voxbound before recording sensitive content. For remote deployments, use HTTPS.

## Select the transcription engine and model

Voxbound does not send an STT model with each transcription request. Open WebUI applies its server-wide audio configuration.

As an Open WebUI administrator:

1. Open **Admin Panel → Settings → Audio**.
2. Find the **Speech-to-Text** settings.
3. Select the engine or provider.
4. Configure the provider URL and API key when required.
5. Choose or enter the STT model and save the settings.

The main options include:

| STT option | Model selection | Processing location |
| --- | --- | --- |
| Built-in local Whisper | A size such as `tiny`, `base`, `small`, `medium`, or `large` | Open WebUI host |
| OpenAI-compatible STT | Provider model ID, for example `whisper-1` | Configured API endpoint |
| Mistral/Voxtral, Deepgram, or Azure | Models and options offered by the provider | Selected provider |

Local Whisper is only one choice. A remote provider can reduce local hardware requirements, while an OpenAI-compatible self-hosted STT service can keep processing under your control without using Open WebUI's bundled Whisper runtime.

For reproducible deployments, Open WebUI also supports environment variables such as:

- `AUDIO_STT_ENGINE`
- `AUDIO_STT_MODEL`
- `AUDIO_STT_OPENAI_API_BASE_URL`
- `AUDIO_STT_OPENAI_API_KEY`
- `WHISPER_MODEL`, `WHISPER_LANGUAGE`, and `WHISPER_COMPUTE_TYPE` for built-in Whisper

Prefer the Admin Panel for ordinary setup because it makes the active configuration visible. Consult the official [Open WebUI STT configuration](https://docs.openwebui.com/features/chat-conversations/audio/speech-to-text/stt-config/) and [audio environment variables](https://docs.openwebui.com/features/chat-conversations/audio/speech-to-text/env-variables/) for the options supported by your installed release.

## Select the summarization model

Summaries can use any chat model exposed through Open WebUI's chat-completions API.

1. Configure Ollama, OpenAI, or another compatible provider under **Open WebUI → Admin Panel → Settings → Connections**.
2. Confirm that the desired model appears in Open WebUI's model selector.
3. Copy its exact model ID.
4. Enter it under **Voxbound → Settings → Open WebUI backend → Model for summaries**.
5. Save and test the connection.

You can also retrieve model IDs from `GET /api/models` with an Open WebUI API key. The summary model is independent of the STT model.

## Extension settings reference

| Setting | Meaning |
| --- | --- |
| Open WebUI base URL | Origin of the Open WebUI instance, without an API path |
| API key or Bearer token | Credential used for Open WebUI API requests |
| Model for summaries | Exact Open WebUI model ID used for structured notes |
| Transcription endpoint | Audio upload route; does not select the STT model |
| Chat-completions endpoint | Route used to request summaries |
| Knowledge sync | Optionally stores meeting Markdown in an Open WebUI Knowledge Base |

When saving or testing a remote HTTPS URL, Chrome requests access to that specific host. If access is denied, Voxbound cannot call that instance until permission is granted.

## Optional local Open WebUI and Ollama

If you do not already have an Open WebUI instance, follow [`openwebui/README.md`](../openwebui/README.md) to start the included standalone Open WebUI deployment.

Ollama remains optional. Add it only when you want Open WebUI to run a local chat model:

```sh
cd openwebui
docker compose -f docker-compose.yml -f docker-compose.ollama.yml up -d
docker compose -f docker-compose.yml -f docker-compose.ollama.yml exec ollama ollama pull qwen2.5:7b-instruct
```

After Open WebUI detects the model, enter `qwen2.5:7b-instruct` as the extension's summary model. Ollama does not select or perform Voxbound's STT unless you separately connect an appropriate transcription service; transcription remains an Open WebUI Audio setting.
