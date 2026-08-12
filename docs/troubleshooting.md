# Troubleshooting and known limitations

## Installation and loading

### Chrome rejects the extension directory

Run `npm ci` and `npm run build` inside `extension/`, then select `extension/dist` when using **Load unpacked**. Do not select the repository root or `extension/src`.

If source files changed, rebuild and select **Reload** on the Voxbound card in `chrome://extensions`.

### The extension disappeared after moving the repository

An unpacked extension remains linked to its directory. Build it again at the new location, remove the old entry from `chrome://extensions`, and load the new `extension/dist` directory.

## Open WebUI connection

### Open WebUI is unreachable

- Check the complete base URL and port in Voxbound settings.
- Use HTTPS for every non-local Open WebUI instance; unencrypted HTTP is supported only for localhost.
- Open the same URL in Chrome to confirm that it is reachable from the browser.
- Ensure the Open WebUI service and reverse proxy are running.
- For the included deployment, run `docker compose logs open-webui` in `openwebui/`.
- Do not append `/api` or a specific endpoint to the base URL.

If `docker compose up -d` reports that the `ollama` service has neither an image nor a build context, an old auto-loaded `openwebui/docker-compose.override.yml` is still present. Rename it to `docker-compose.ollama.local.yml` and include it only with `docker-compose.yml` plus `docker-compose.ollama.yml` when starting the optional Ollama stack.

### Chrome denied access to a remote host

Voxbound requests access only to the configured remote HTTPS host. Return to the extension settings, save or test the URL again, and approve Chrome's permission prompt.

If the URL changed to another hostname, Chrome asks again for the new host. Localhost permissions are included by default.

### HTTP 401 or 403

Create or verify the Open WebUI API key and enter it in **API key or Bearer token**. Confirm that the account is allowed to access the selected model and any enabled Knowledge Base features.

### HTTP 404 or endpoint errors

Open WebUI API routes can differ between releases or reverse-proxy configurations. Verify the deployment's API routes and update the transcription or chat endpoint under **Voxbound → Settings → API endpoints**.

The standard paths expected by Voxbound are `/api/v1/audio/transcriptions` and `/api/chat/completions`.

## Recording

### Tab audio is empty

- Start recording while the intended meeting tab is active.
- Confirm that the tab is producing audible output and is not muted.
- Chrome-protected pages such as `chrome://` pages cannot be captured.
- Stop any other active tab-capture session before retrying.

### Microphone recording fails

Allow microphone access for the extension in Chrome and select a valid input device. Close applications that hold the device exclusively, then retry.

The microphone is recorded as a separate source from tab audio. This is source separation, not individual speaker diarization.

## Transcription

### Transcription returns no text

- Verify that the recording contains audible speech.
- Test Open WebUI's configured STT engine directly in Open WebUI.
- Check **Admin Panel → Settings → Audio** for the engine, model, language, API key, and provider URL.
- Ensure the provider accepts the recorded audio format and configured upload size.

### Transcription is slow

For built-in Whisper, select a smaller model or configure suitable hardware acceleration. Alternatively, select another remote or self-hosted STT provider in Open WebUI.

Disable Voxbound's live transcript option when the STT backend cannot process frequent audio snippets quickly enough.

### Changing the extension endpoint did not change the model

The endpoint field changes only the API route. Select the STT provider and model under **Open WebUI → Admin Panel → Settings → Audio**.

## Summaries

### No summary model is configured

Connect a chat-model provider in Open WebUI, copy the exact model ID shown there, and enter it under **Voxbound → Settings → Model for summaries**.

### The model is reported as unavailable

Model IDs are case-sensitive and provider-specific. Confirm the ID in Open WebUI's model selector or through `GET /api/models`. Also check that the API-key account has access to the model.

### The response cannot be parsed as structured notes

Retry with a model that reliably follows JSON instructions. Remove conflicting additional summary instructions or simplify them in Voxbound settings.

## Knowledge Base sync

Knowledge sync requires compatible Open WebUI file and Knowledge Base APIs as well as an account with sufficient permissions. If synchronization fails, the meeting remains stored locally; check the Open WebUI logs and API permissions before retrying.

## Local data

Meeting history belongs to the current Chrome profile and is not synchronized automatically between browsers or devices. Clearing extension storage, removing the Chrome profile, or uninstalling the extension may remove local meetings. Export important meetings as Markdown before performing those actions.

## Known limitations

- Installation currently requires building and loading an unpacked extension; there is no Chrome Web Store package or published prebuilt archive yet.
- Chrome and compatible Chromium browsers are the supported browser family.
- The STT engine and model are configured globally in Open WebUI, not per meeting in Voxbound.
- The extension separates tab and microphone sources but does not identify individual speakers within either source.
- Meeting history is local to one Chrome profile and has no built-in cross-device synchronization.
- Open WebUI APIs evolve between releases; endpoint paths are configurable, but a future release may require compatibility changes.
- Live transcription depends on backend latency and is not equivalent to offline, on-device real-time transcription.
