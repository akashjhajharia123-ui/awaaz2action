# Awaaz2Action

**Turn a civic concern into a clear grievance draft—in the language you use.** Awaaz2Action helps citizens describe local issues, capture speech, and prepare a professional complaint to review and send themselves.

> Awaaz2Action generates drafts only. It does not submit complaints to government agencies.

## Features

- Write or dictate a complaint in English, Hindi, or Hinglish.
- Record speech in the browser with `MediaRecorder`; recordings stop at 30 seconds and are transcribed with Saaras v4 in `codemix` mode.
- Add locality, street/road, nearest landmark, and how long the issue has existed.
- Classify a civic issue automatically or select a category.
- Generate an editable grievance in English or an available Indian language.
- Copy the current draft or download a UTF-8 text file marked **DRAFT — NOT SUBMITTED**.
- Review loading, recording, permission, and API error states before continuing.

## Sarvam models

| Workflow | Model | Endpoint |
| --- | --- | --- |
| Grievance drafting | `sarvam-105b-conversations` | `POST https://api.sarvam.ai/v1/chat/completions` |
| Speech transcription | `saaras:v4` | `POST https://api.sarvam.ai/speech-to-text` |

Speech requests use `mode=codemix` and automatic language detection. The server keeps `SARVAM_API_KEY` private and forwards both requests with Sarvam's `api-subscription-key` header. Browser audio uploads are held in memory, limited to 8 MB, and are not written to disk. Voice input requires microphone access and a secure browser context; `localhost` is supported for local development.

## Setup

**Requirements:** Node.js 18 or newer and npm.

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` if needed.
3. Add your Sarvam key to `SARVAM_API_KEY` in `.env`. Do not commit `.env`; it is ignored by Git.
4. Start the application: `npm start`
5. Open [http://localhost:3000](http://localhost:3000).

For automatic restarts while developing, run `npm run dev`.

## How it works

1. The browser collects the issue description and optional location/context fields. The API key never enters browser code.
2. When the user chooses voice input, the browser requests microphone permission, records up to 30 seconds, then uploads the audio to the local `/api/transcribe` endpoint.
3. The Express server validates the upload and forwards it to Saaras v4. The transcript is inserted into the complaint field for the user to review and edit.
4. On submission, the server sends the complaint details to `sarvam-105b-conversations` and returns an editable draft. The draft is never sent to an authority.

The generation prompt instructs the model to use supplied facts, avoid inventing dates, addresses, officials, contact details, complaint IDs, laws, or deadlines, and not to claim that a complaint was submitted. Review AI-generated text before use.

## Project structure

- `server.js` — Express app, health check, upload limits, Sarvam speech-to-text proxy, and grievance-generation proxy.
- `public/index.html` — complaint form, voice controls, and draft/result UI.
- `public/app.js` — browser recording/timer, transcript handling, grievance generation, copy, and download actions.
- `public/styles.css` — responsive interface, status states, and recording indicators.
- `.env.example` — configuration template; the real `.env` remains local and ignored.
- `package.json` / `package-lock.json` — dependencies and reproducible installation.

## Final checks

```sh
node --check server.js
node --check public/app.js
npm start
```

Sarvam references: [Chat Completions](https://docs.sarvam.ai/api/token-factory/chat-completions) · [Speech-to-Text REST API](https://docs.sarvam.ai/api-reference/speech-to-text/transcribe).
