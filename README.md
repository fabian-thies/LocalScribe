# Voxbound

Voxbound is a Chrome extension for recording meetings, transcribing them through **Open WebUI**, and turning transcripts into structured notes. It records the active tab and, optionally, the microphone as a separate source. Meetings remain in the local Chrome profile and can be reviewed, exported, or synchronized to an Open WebUI Knowledge Base.

> **Project status:** Voxbound is an early, pre-1.0 release. Expect compatibility adjustments as Open WebUI APIs evolve.

![Voxbound extension popup](docs/screenshots/extension-popup.png)

## Features

- Record the active browser tab and optional microphone audio
- Transcribe recordings through Open WebUI's speech-to-text API
- Create structured summaries with any chat model exposed by Open WebUI
- Configure summary length, language, strictness, and additional instructions
- Review locally stored meeting history and export meetings as Markdown
- Optionally synchronize meetings to an Open WebUI Knowledge Base
- Connect to local, LAN, VPN, organization-managed, or cloud-hosted Open WebUI deployments

## How it works

```text
Chrome extension
  └─ Open WebUI API
       ├─ Speech-to-text: local Whisper or a configured STT provider
       ├─ Summaries: any chat model exposed by Open WebUI
       └─ Optional: Open WebUI Knowledge Base
```

The extension in [`extension/`](extension/) is the actual Voxbound application. The [`openwebui/`](openwebui/) directory is only an optional deployment helper. You do not need Docker or a local Open WebUI installation when you already have access to a compatible endpoint. Remote instances must use HTTPS; unencrypted HTTP is accepted only for localhost.

## Installation

### Current distribution status

Voxbound is not currently distributed through the Chrome Web Store and this repository does not yet publish prebuilt release archives. The supported installation method is therefore an unpacked extension built from source. This requires Node.js 20.19+ or 22.12+ and npm once during installation or updates.

### Build the extension

```sh
git clone https://github.com/fabian-thies/meeting-transcoder.git
cd meeting-transcoder/extension
npm ci
npm run build
```

The installable extension is generated in `extension/dist`.

### Load it in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the generated `extension/dist` directory.
5. Pin Voxbound from Chrome's extension menu if you want it to remain visible.

After an update, run `npm ci` and `npm run build` again, then select **Reload** on the Voxbound card in `chrome://extensions`.

## Connect Open WebUI

Voxbound needs a reachable Open WebUI instance, but that instance does not have to run on the same computer. You can use an existing server on your LAN or VPN, an organization-managed instance, or a deployment hosted on cloud infrastructure.

If you do not have Open WebUI yet, the optional [`openwebui/`](openwebui/) setup can start a local instance with Docker. Ollama is not required; it is available only as an optional add-on for local chat inference.

Open **Voxbound → Settings** and configure:

- **Open WebUI base URL**, for example `http://localhost:3000` or `https://openwebui.example.com`
- **API key or Bearer token** when authentication is enabled
- **Model for summaries**, using the exact model ID exposed by Open WebUI
- The default transcription and chat endpoint paths, unless your deployment uses different routes

For a non-local HTTPS URL, Chrome asks once for access to that specific host when you save or test the connection.

The transcription model is selected in **Open WebUI → Admin Panel → Settings → Audio**, not in the extension. Open WebUI can use its built-in local Whisper model or a configured provider such as an OpenAI-compatible STT service, Mistral/Voxtral, Deepgram, or Azure. The summary model is selected separately in the Voxbound settings.

See [Configuring Open WebUI](docs/openwebui-configuration.md) for detailed STT, summary-model, endpoint, authentication, and optional Ollama instructions.

## Privacy and data flow

See the [Voxbound Privacy Policy](PRIVACY.md) for the complete disclosure.

- Meeting records and history are stored in `chrome.storage.local` in the current Chrome profile.
- The extension sends recorded audio only to the configured Open WebUI URL.
- Open WebUI may forward audio or transcripts when its administrator has configured remote STT or chat providers.
- For an internet-reachable instance, use HTTPS and review the operator's authentication, retention, and data-handling policies.
- Voxbound does not include telemetry or a separate Voxbound cloud service.

## Troubleshooting and limitations

See [Troubleshooting and known limitations](docs/troubleshooting.md) for connection errors, host permissions, recording problems, STT and summary failures, browser compatibility, storage behavior, and current project limitations.

## Development

From `extension/`:

```sh
npm run lint
npm test
npm run build
```

The extension uses React, TypeScript, Vite, and Manifest V3. Always rebuild `extension/dist` after source changes and reload the unpacked extension in Chrome.

No Open WebUI fork is used and no Open WebUI source code is modified.

## Contributing

Bug reports and focused pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change. Please do not attach real recordings, transcripts, API keys, or private Open WebUI URLs to public issues.

## Security

Do not report vulnerabilities or exposed meeting data in a public issue. Follow the private reporting guidance in [SECURITY.md](SECURITY.md).

## License

No open-source license has been selected yet. Until a `LICENSE` file is added, the source is publicly visible but is not legally open source. The maintainer should choose an OSI-approved license before announcing Voxbound as an open-source project.
