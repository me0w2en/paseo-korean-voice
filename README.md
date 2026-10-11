# Paseo Korean Voice

**English** · [한국어](README.ko.md)

A [Paseo](https://paseo.sh) plugin that makes dictation and voice mode work properly in Korean. It runs a local OpenAI-compatible speech gateway: transcriptions go to Groq/OpenAI Whisper with a Korean prompt and glossary, and replies are spoken with macOS Korean voices.

## Why Korean breaks (Paseo 0.11.2)

- Local speech models cover English (`parakeet v2`, `kokoro-en`) and 25 European languages (`parakeet v3`). There is no local Korean STT or TTS model.
- Switching STT to an OpenAI-compatible provider (Groq Whisper, etc.) with `language: "ko"` makes dictation work. However, the daemon always sends Whisper a fixed **English prompt** ("Transcribe only what the speaker says…"), so you can't supply Korean context or a glossary.
- Whisper tends to invent Korean subtitle boilerplate such as "시청해 주셔서 감사합니다" ("Thanks for watching") on silence.
- Voice mode TTS defaults to `kokoro-en`, which can't read Korean replies. OpenAI TTS works but needs a paid key.

## How it works

The plugin's server process serves OpenAI-compatible endpoints on `127.0.0.1:6791`, and Paseo's OpenAI speech settings point at it.

```
Paseo daemon ──/v1/audio/transcriptions──▶ korean-voice ──(Korean prompt + glossary)──▶ Groq/OpenAI Whisper
             ◀────── text with hallucinated sentences removed ──────┘
Paseo daemon ──/v1/audio/speech (pcm)──▶ korean-voice ──▶ macOS `say` (Yuna and other Korean voices, free and offline)
```

- **STT requests:** replaces Paseo's English prompt with a Korean prompt and glossary, and adds `language=ko` if missing. API keys are never stored; the `Authorization` header Paseo sends is forwarded upstream as-is.
- **STT responses:** drops known Whisper hallucinations sentence by sentence.
- **TTS:** strips Markdown, code blocks, and URLs, then renders 24 kHz PCM with a macOS Korean voice.
- **Settings screen:** **Settings → Plugins → Korean Voice** changes voice, rate, glossary, and upstream URL, and plays a test phrase.

The prompt and glossary are plain settings, so the same approach works for Japanese, Chinese, or any other language Whisper supports.

## Install

Requirements: macOS, Paseo 0.11.2+, and a Groq or OpenAI API key.

```bash
# 1) Turn on Settings → Plugins → "Enable plugins"
#    (or add "pluginsEnabled": true to ~/.paseo/config.json and run `paseo reload`)

# 2) Install the plugin
paseo plugin install npm:paseo-korean-voice      # or github:me0w2en/paseo-korean-voice
paseo plugin ls            # korean-voice should be running

# 3) Point Paseo speech at the gateway (backs up config.json, then merges), then restart the Paseo app.
#    providers.openai.stt.apiKey in ~/.paseo/config.json must hold your Groq/OpenAI key.
git clone https://github.com/me0w2en/paseo-korean-voice.git
node paseo-korean-voice/scripts/apply-voice-config.mjs --dry-run   # preview
node paseo-korean-voice/scripts/apply-voice-config.mjs
```

<details>
<summary>Manual configuration</summary>

Merge this into `~/.paseo/config.json`, then restart the daemon:

```json
{
  "features": {
    "dictation": { "stt": { "provider": "openai", "language": "ko" } },
    "voiceMode": {
      "stt": { "provider": "openai", "language": "ko" },
      "tts": { "provider": "openai" }
    }
  },
  "providers": {
    "openai": {
      "stt": { "baseUrl": "http://127.0.0.1:6791/v1", "apiKey": "<your Groq or OpenAI key>" },
      "tts": { "baseUrl": "http://127.0.0.1:6791/v1", "apiKey": "local" }
    }
  }
}
```

The gateway forwards to `https://api.groq.com/openai/v1` by default; change **Upstream STT URL** in the plugin settings for OpenAI or a local Whisper server.

</details>

To develop, install from a local clone (`paseo plugin install "$PWD"`), run `npm install && npm run typecheck`, and apply changes with `paseo plugin reload korean-voice`.

## Uninstall

- Restore `~/.paseo/config.json.bak-korean-voice-*` and restart the daemon, then `paseo plugin remove korean-voice`.
- If you disable the plugin while step 3's settings are still in place, dictation fails. Revert the speech settings together with the plugin.

## Limitations

- macOS only: TTS uses `say`. If your daemon runs on a remote Linux host, TTS won't work.
- STT still uses cloud Whisper (Groq/OpenAI). For fully offline use, point the upstream URL at a local OpenAI-compatible server such as whisper.cpp.
- Voice mode's system instructions are hard-coded in English. Agents usually answer in Korean when you speak Korean.

## License

[MIT](LICENSE)
