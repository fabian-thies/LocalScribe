# Contributing to Voxbound

Thank you for helping improve Voxbound. Focused bug fixes, documentation improvements, compatibility updates, and accessibility work are especially useful.

## Before opening an issue

- Check the existing issues and [troubleshooting guide](docs/troubleshooting.md).
- Remove API keys, private server addresses, recordings, transcripts, names, and other meeting data from screenshots and logs.
- Report security-sensitive findings through [SECURITY.md](SECURITY.md), not a public issue.

## Development setup

The extension requires Node.js 20.19+ or 22.12+. Docker is needed only when you want to run the optional local Open WebUI deployment.

```sh
cd extension
npm ci
npm test
npm run lint
npm run build
```

Load `extension/dist` as an unpacked extension in Chrome. After every source change, run `npm run build` again and reload the extension from `chrome://extensions`.

For a quick visual check without installing the extension, run `npm run dev`, open the local URL printed by Vite, and append `/dev/popup-preview.html`. This preview uses local non-sensitive test data and is not included in the production build.

## Pull requests

Keep pull requests small enough to review and explain the user-visible reason for the change. Include:

- A concise description of the behavior before and after the change
- The affected extension or backend areas
- Validation commands and manual flows performed
- Screenshots for visible UI changes
- Documentation updates when setup, permissions, privacy, or compatibility changes

Use the existing TypeScript and React conventions. Prefer functional components, explicit exported types, small service modules, and existing shared components. Avoid adding telemetry, remote code, public cloud dependencies, or new permissions without prior discussion.

By submitting a contribution, you confirm that you have the right to contribute it under the project's eventual license. A project license must be selected before outside contributions are accepted or merged.
