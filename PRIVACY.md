# Privacy Policy for Voxbound

Effective date: August 12, 2026

Voxbound is a Chrome extension for recording user-selected browser-tab audio and optional microphone audio. It sends recordings to an Open WebUI instance configured by the user, creates transcripts and meeting notes, and keeps meeting history in the user's Chrome profile.

## Data processed by Voxbound

Depending on the features used, Voxbound processes:

- Browser-tab audio selected and recorded by the user
- Optional microphone audio
- Transcripts, summaries, meeting titles, and related meeting metadata
- The URL and optional credentials for the configured Open WebUI instance
- Knowledge Base settings, extension preferences, and processing state

Audio and meeting content may contain personal or sensitive information chosen by the user. Voxbound does not collect browsing history, advertising identifiers, analytics, or telemetry.

## Where data is stored and sent

Settings, credentials, recording drafts, transcripts, summaries, and meeting history are stored in Chrome extension storage in the current Chrome profile.

For transcription and summarization, Voxbound sends recordings and text directly to the Open WebUI instance configured by the user. If Knowledge Base synchronization is enabled, meeting documents are also sent to the selected Knowledge Base. Voxbound does not use an intermediate project-operated server for these transfers.

An Open WebUI instance may use additional speech-to-text, language-model, storage, or infrastructure providers. Their data practices are determined by the instance operator and those providers. Users should review that setup before processing sensitive meetings.

Remote Open WebUI instances must use HTTPS. Unencrypted HTTP is accepted only for loopback connections to `localhost`, `127.0.0.1`, or `[::1]`.

## Permissions

Chrome permissions are used for the following features:

- `activeTab` and `tabCapture` capture audio from the active tab after a user action.
- `offscreen` allows recording and processing to continue outside the popup.
- `storage` and `unlimitedStorage` store settings, recording drafts, transcripts, summaries, and meeting history.
- Optional HTTPS host access connects to the Open WebUI origin selected by the user. It is requested when the user saves or tests a remote URL.

Voxbound processes data only for the recording, transcription, note-generation, storage, synchronization, and export features described in this policy. It contains no advertising, analytics, or data-broker integrations.

## Retention and deletion

Local data remains in Chrome extension storage until the user deletes individual meetings, clears the extension's storage, or uninstalls the extension. Users should export important meetings before clearing data or uninstalling Voxbound.

Deleting local data does not automatically delete copies already processed or stored by the configured Open WebUI instance or its providers. Their retention and deletion options are controlled separately.

## Security

Voxbound limits remote connections to HTTPS and requests access only to the remote origin selected by the user. Users are responsible for securing their Open WebUI deployment, protecting credentials, controlling account access, and selecting appropriate upstream providers.

No method of storage or transmission can be guaranteed to be completely secure.

## Changes to this policy

This policy may be updated when Voxbound's functionality or data practices change. Material changes will be reflected in this document and, where required, in the Chrome Web Store listing or extension interface.

## Contact

For general privacy questions, use the [Voxbound issue tracker](https://github.com/fabian-thies/meeting-transcoder/issues). For vulnerabilities or reports containing sensitive details, follow [SECURITY.md](SECURITY.md). Do not include recordings, credentials, transcripts, or other sensitive meeting content in a public issue.
