import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const DEFAULT_STT_PROMPT =
  "개발자가 코딩 에이전트에게 한국어로 작업을 지시하는 음성입니다. 기술 용어는 영어 철자 그대로 적습니다.";

export const DEFAULT_GLOSSARY =
  "Paseo, Claude, Codex, commit, branch, worktree, PR, merge, rebase, TypeScript, React, API, README, 테스트, 리팩터링, 빌드, 배포";

export const voiceSettings = defineSettings({
  id: "korean-voice",
  scope: "host",
  version: 1,
  schema: z.object({
    port: z.number().int().min(1024).max(65535).default(6791),
    ttsVoice: z.string().default("Yuna"),
    ttsRate: z.number().int().min(90).max(400).default(210),
    upstreamBaseUrl: z.string().default("https://api.groq.com/openai/v1"),
    upstreamModel: z.string().default(""),
    sttPrompt: z.string().default(DEFAULT_STT_PROMPT),
    glossary: z.string().default(DEFAULT_GLOSSARY),
    dropHallucinations: z.boolean().default(true),
  }),
});

export type VoiceSettings = z.infer<typeof voiceSettings.schema>;
