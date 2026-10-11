#!/usr/bin/env node
// Points Paseo's dictation and voice mode at the korean-voice gateway.
// Usage: node scripts/apply-voice-config.mjs [--port 6791] [--dry-run]
// Backs up config.json first. Restart the daemon afterwards (speech providers load at startup).
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const portIndex = args.indexOf("--port");
const port = portIndex >= 0 ? Number(args[portIndex + 1]) : 6791;
const gateway = `http://127.0.0.1:${port}/v1`;

const home = process.env.PASEO_HOME ?? join(homedir(), ".paseo");
const file = join(home, "config.json");
const config = JSON.parse(readFileSync(file, "utf8"));

config.features ??= {};
config.providers ??= {};
config.providers.openai ??= {};
const features = config.features;
const openai = config.providers.openai;

const previousUpstream = openai.stt?.baseUrl ?? openai.baseUrl ?? "https://api.openai.com/v1";
const sttKey = openai.stt?.apiKey ?? openai.apiKey ?? process.env.OPENAI_API_KEY;
if (!sttKey) {
  console.error("STT API 키가 없습니다. providers.openai.stt.apiKey에 Groq 또는 OpenAI 키를 먼저 넣어 주세요.");
  process.exit(1);
}

features.dictation = {
  ...features.dictation,
  enabled: features.dictation?.enabled ?? true,
  stt: { ...features.dictation?.stt, provider: "openai", language: "ko" },
};
features.voiceMode = {
  ...features.voiceMode,
  enabled: features.voiceMode?.enabled ?? true,
  stt: { ...features.voiceMode?.stt, provider: "openai", language: "ko" },
  tts: { provider: "openai" },
};
openai.stt = { ...openai.stt, apiKey: sttKey, baseUrl: gateway };
// The gateway ignores this key; Paseo only enables OpenAI TTS when one is set.
openai.tts = { apiKey: "local-korean-voice", baseUrl: gateway };

if (previousUpstream !== gateway && !/api\.groq\.com/.test(previousUpstream)) {
  console.log(`기존 STT 주소(${previousUpstream})가 Groq가 아닙니다.`);
  console.log("Paseo → Settings → Plugins → Korean Voice에서 '업스트림 STT 주소'를 이 값으로 바꿔 주세요.");
}

if (dryRun) {
  console.log(JSON.stringify({ features: config.features, providers: { openai: { ...openai, stt: { ...openai.stt, apiKey: "***" } } } }, null, 2));
  process.exit(0);
}

const backup = `${file}.bak-korean-voice-${new Date().toISOString().replace(/[:.]/g, "-")}`;
copyFileSync(file, backup);
writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
console.log(`백업: ${backup}`);
console.log(`적용 완료: dictation/voice STT·TTS → ${gateway}`);
console.log("데몬을 재시작해야 반영됩니다 (Paseo 앱 재시작 또는 `paseo daemon restart`).");
