# Paseo Korean Voice

[English](README.md) · **한국어**

[Paseo](https://paseo.sh)의 받아쓰기와 음성 모드를 한국어로 제대로 쓰게 해 주는 플러그인입니다. 로컬 OpenAI 호환 음성 게이트웨이를 띄워서, 받아쓰기는 한국어 프롬프트와 용어집을 붙여 Groq/OpenAI Whisper로 보내고, 음성 답변은 macOS 한국어 음성으로 읽어 줍니다.

## 원인 분석 (Paseo 0.11.2 기준)

- 로컬 음성 모델은 영어(`parakeet v2`, `kokoro-en`)와 유럽 25개 언어(`parakeet v3`)만 지원합니다. 한국어 로컬 STT/TTS 모델은 없습니다.
- STT를 OpenAI 호환(Groq Whisper 등) + `language: "ko"`로 바꾸면 받아쓰기는 됩니다. 다만 데몬이 Whisper에 **영어 프롬프트**("Transcribe only what the speaker says…")를 고정으로 붙이기 때문에 한국어 문맥이나 용어집을 줄 방법이 없습니다.
- Whisper는 무음 구간에서 "시청해 주셔서 감사합니다" 같은 한국어 자막 상투구를 지어내는 경우가 많습니다.
- voice mode의 음성 출력(TTS)은 기본값이 `kokoro-en`이라 한국어 답변을 읽지 못합니다. OpenAI TTS로 바꾸면 유료 키가 필요합니다.

## 해결 방식

플러그인의 server 프로세스가 `127.0.0.1:6791`에서 OpenAI 호환 엔드포인트를 띄우고, Paseo의 OpenAI 음성 설정이 이 주소를 가리키게 합니다.

```
Paseo 데몬 ──/v1/audio/transcriptions──▶ korean-voice ──(한국어 프롬프트+용어집)──▶ Groq/OpenAI Whisper
            ◀────── 환각 문장 제거된 텍스트 ──────┘
Paseo 데몬 ──/v1/audio/speech (pcm)──▶ korean-voice ──▶ macOS `say` (Yuna 등 한국어 음성, 무료·오프라인)
```

- STT 요청: Paseo가 보낸 영어 프롬프트를 한국어 프롬프트와 용어집으로 교체하고, `language`가 없으면 `ko`를 넣습니다. API 키는 저장하지 않고 Paseo가 보낸 `Authorization` 헤더를 그대로 업스트림에 전달합니다.
- STT 응답: Whisper 환각 문장을 문장 단위로 걸러냅니다.
- TTS: Markdown, 코드 블록, URL을 읽기 좋게 정리한 뒤 macOS 한국어 음성으로 24kHz PCM을 만듭니다.
- 설정 화면: **Settings → Plugins → Korean Voice**에서 목소리, 속도, 용어집, 업스트림 주소를 바꾸고 테스트 재생을 할 수 있습니다.

## 설치

요구 사항: macOS, Paseo 0.11.2 이상, Groq 또는 OpenAI API 키

```bash
# 1) Settings → Plugins → "Enable plugins" 켜기
#    (또는 ~/.paseo/config.json에 "pluginsEnabled": true 추가 후 `paseo reload`)

# 2) 플러그인 설치
paseo plugin install npm:paseo-korean-voice      # 또는 github:me0w2en/paseo-korean-voice
paseo plugin ls            # korean-voice가 running인지 확인

# 3) 음성 설정을 게이트웨이로 연결 (config.json 자동 백업 후 병합) → Paseo 앱 재시작
#    ~/.paseo/config.json의 providers.openai.stt.apiKey에 Groq/OpenAI 키가 있어야 합니다.
git clone https://github.com/me0w2en/paseo-korean-voice.git
node paseo-korean-voice/scripts/apply-voice-config.mjs --dry-run   # 미리보기
node paseo-korean-voice/scripts/apply-voice-config.mjs
```

<details>
<summary>직접 설정하기</summary>

아래 내용을 `~/.paseo/config.json`에 병합한 뒤 데몬을 재시작하세요.

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
      "stt": { "baseUrl": "http://127.0.0.1:6791/v1", "apiKey": "<Groq 또는 OpenAI 키>" },
      "tts": { "baseUrl": "http://127.0.0.1:6791/v1", "apiKey": "local" }
    }
  }
}
```

게이트웨이는 기본으로 `https://api.groq.com/openai/v1`에 전달합니다. OpenAI나 로컬 Whisper 서버를 쓰려면 플러그인 설정의 **업스트림 STT 주소**를 바꾸세요.

</details>

개발할 때는 clone한 폴더를 로컬 경로로 설치하고(`paseo plugin install "$PWD"`), `npm install && npm run typecheck`로 타입체크한 뒤 `paseo plugin reload korean-voice`로 반영합니다.

## 되돌리기

- `~/.paseo/config.json.bak-korean-voice-*` 백업으로 복원하고 데몬을 재시작한 뒤 `paseo plugin remove korean-voice`를 실행합니다.
- 3)의 설정을 그대로 둔 채 플러그인만 끄면 받아쓰기가 실패합니다. 음성 설정도 함께 되돌려 주세요.

## 제약

- macOS 전용입니다(TTS가 `say`를 씀). 데몬이 원격 Linux에서 돌면 TTS는 동작하지 않습니다.
- STT는 여전히 클라우드 Whisper(Groq/OpenAI)를 씁니다. 완전 오프라인이 필요하면 업스트림 주소를 whisper.cpp 서버 같은 로컬 OpenAI 호환 엔드포인트로 바꾸면 됩니다.
- voice mode의 시스템 지시문은 영어로 고정돼 있습니다. 한국어로 말하면 에이전트는 대체로 한국어로 답합니다.

## 라이선스

[MIT](LICENSE)
