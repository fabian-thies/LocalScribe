# Chrome Web Store submission guide

This guide describes the first manual Chrome Web Store submission for Voxbound.

## Release blockers to clear

Before submitting the first build:

- Compare the current Store-sized screenshot against the exact unpacked release build before upload.
- Create the required 440×280 promotional tile.
- Publish `PRIVACY.md` at a stable public HTTPS URL and add a monitored developer contact to the policy or Store listing.
- Perform the manual workflow checks at the end of this guide using the exact ZIP being uploaded.
- Choose and add an open-source `LICENSE` before presenting the repository as open source. This is a repository-release requirement rather than a Chrome Web Store packaging requirement.

## Package

Build the extension and create a ZIP containing the contents of `extension/dist`. The ZIP must contain `manifest.json` at its root rather than inside a `dist` directory.

The current package is generated locally at:

```text
release/voxbound-chrome-web-store-0.1.0.zip
```

Generated release artifacts are ignored by Git. Before every later upload, increase `version` in `extension/manifest.json`; the Chrome Web Store rejects updates that do not have a higher version.

## Upload

1. Open the Chrome Web Store Developer Dashboard.
2. Select **Add new item**.
3. Choose `release/voxbound-chrome-web-store-0.1.0.zip` and upload it.
4. Complete the **Store listing**, **Privacy practices**, and **Distribution** tabs.
5. Save the draft, resolve all dashboard warnings, and submit the item for review.

## Suggested listing content

### Category

Productivity

### Detailed description

```text
Voxbound records meeting audio from the active browser tab and, optionally, your microphone as a separate source. It sends recordings to the Open WebUI instance you configure, creates transcripts and structured meeting notes, and keeps meeting history in your Chrome profile.

Features:
• Record active-tab and optional microphone audio
• Transcribe through a local or remote Open WebUI instance
• Generate structured summaries with a model exposed by Open WebUI
• Review and search local meeting history
• Export meetings as Markdown
• Optionally synchronize meetings to an Open WebUI Knowledge Base

Voxbound does not include its own cloud service. You need access to an Open WebUI instance and are responsible for the models and providers configured there. Remote Open WebUI instances must use HTTPS.
```

Keep the listing accurate. Do not describe Open WebUI, transcription models, or hosted services as being included with the extension.

## Graphic assets

The package contains a valid 128×128 PNG icon at `extension/icons/icon128.png`.

The Store listing also needs:

- At least one screenshot at 1280×800 or 640×400 pixels, up to five total
- A small promotional tile at 440×280 pixels
- Optionally, a marquee image at 1400×560 pixels

The current `docs/screenshots/extension-popup.png` is a 1280×800 capture of the real popup UI rendered with the repository's non-sensitive preview data. Compare it with the exact unpacked release build before upload and recapture it whenever the visible interface changes.

## Single purpose

```text
Voxbound records user-selected meeting audio, transcribes it through the user's configured Open WebUI instance, generates structured meeting notes, and stores the resulting meeting history locally in Chrome.
```

## Permission justifications

### `activeTab`

```text
Required to target the active meeting tab after the user explicitly starts a recording. Chrome requires activeTab access when getMediaStreamId targets that tab.
```

### `tabCapture`

```text
Required for the extension's primary function: capturing audio from the active browser tab after a user action.
```

### `offscreen`

```text
Required by Manifest V3 to run the media recorder and audio-processing workflow in an offscreen extension document independently of the temporary popup UI.
```

### `storage`

```text
Required to store extension settings, processing state, recording drafts, transcripts, summaries, and meeting history in the user's Chrome profile.
```

### `unlimitedStorage`

```text
Meeting recordings and saved transcripts can exceed Chrome's normal extension-storage quota. This permission prevents a recording draft or meeting from being lost solely because the standard quota is too small.
```

### Loopback host permissions

```text
Required to connect to an Open WebUI instance running locally at localhost, 127.0.0.1, or the IPv6 loopback address. Audio is sent there only when the user starts transcription or live transcription.
```

### Optional `https://*/*` host permission

```text
Users may connect Voxbound to an Open WebUI instance on a host they choose. The broad HTTPS pattern is declared only so Chrome can offer runtime permission for that user-specified origin. The extension requests access to the exact configured host when the user saves or tests it; access to other hosts is not granted automatically.
```

## Remote code

Select **No, I am not using remote code**. Voxbound calls user-configured APIs but does not download or execute remote JavaScript, WebAssembly, or other executable code.

## Data-use disclosures

Review the dashboard's current labels carefully. Based on the present implementation, disclose at least the categories that cover:

- Authentication information: optional Open WebUI API key or Bearer token
- Personal communications: meeting audio and transcripts may contain conversations
- Website content: audio from the user-selected active tab
- User-generated content: microphone audio, titles, transcripts, summaries, and notes

Do not select browsing history unless the implementation changes: Voxbound does not collect or store visited URLs or navigation history.

State that data is used only for the extension's meeting workflow, is not sold or used for advertising, and is sent only to the Open WebUI instance configured by the user. Local meeting data and credentials are stored in Chrome extension storage.

## Privacy policy

Publish [`PRIVACY.md`](../PRIVACY.md) at a stable public HTTPS URL and enter that URL in the dashboard. Review the policy and replace or supplement the repository contact method with your preferred developer contact before submission.

The dashboard disclosures, Store description, extension behavior, and privacy policy must remain consistent.

## Distribution and review

Choose whether the first submission should be public, unlisted, or restricted to trusted testers. Verify the regions and pricing fields, then submit for review.

Before submission, test Record, Stop, Transcribe, Summarize, Save, History, Export, remote-host permission, and optional Knowledge Base sync using the exact build contained in the ZIP.
