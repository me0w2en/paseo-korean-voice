import type { VoiceSettings } from "../shared/settings";
import { buildMultipart, type MultipartPart, parseMultipart } from "./multipart";

// Whisper fills silence and noise with subtitle boilerplate it learned from Korean video data.
const KOREAN_HALLUCINATIONS: readonly RegExp[] = [
  /^(끝까지\s*)?시청\s*해\s*주셔서\s*(정말\s*)?감사(합니다|드립니다)$/,
  /^(오늘도\s*)?(영상\s*)?(봐|시청해)\s*주셔서\s*감사(합니다|드립니다)$/,
  /^구독(과|,|\s)*(좋아요|알림).*$/,
  /^좋아요(와|,|\s)*구독.*$/,
  /^MBC\s*뉴스.*입니다$/,
  /^(한글\s*)?자막(\s*(제공|by|제작)).*$/i,
  /^다음\s*(영상|시간)에서\s*(만나요|뵙겠습니다|만나겠습니다)$/,
];

export interface TranscriptionResult {
  status: number;
  body: string;
  contentType: string;
  dropped: number;
}

function textPart(name: string, value: string): MultipartPart {
  return { name, data: Buffer.from(value, "utf8") };
}

export function buildPrompt(settings: VoiceSettings): string {
  const glossary = settings.glossary.trim();
  return [settings.sttPrompt.trim(), glossary ? `용어: ${glossary}` : ""]
    .filter((entry) => entry.length > 0)
    .join(" ");
}

export function dropHallucinations(text: string): { text: string; dropped: number } {
  const sentences = text.trim().split(/(?<=[.!?。])\s+/);
  const kept = sentences.filter((sentence) => {
    const normalized = sentence.trim().replace(/[.!?。~]+$/, "").trim();
    return !KOREAN_HALLUCINATIONS.some((pattern) => pattern.test(normalized));
  });
  return { text: kept.join(" ").trim(), dropped: sentences.length - kept.length };
}

export async function transcribe(
  body: Buffer,
  contentType: string,
  authorization: string | undefined,
  settings: VoiceSettings,
  signal: AbortSignal,
): Promise<TranscriptionResult> {
  const outgoing: MultipartPart[] = [];
  let hasLanguage = false;
  let responseFormat = "json";

  for (const part of parseMultipart(body, contentType)) {
    // Paseo sends a fixed English prompt; ours replaces it.
    if (part.name === "prompt") {
      continue;
    }
    if (part.filename === undefined) {
      const value = part.data.toString("utf8").trim();
      if (part.name === "model" && settings.upstreamModel.trim()) {
        outgoing.push(textPart("model", settings.upstreamModel.trim()));
        continue;
      }
      if (part.name === "language") {
        hasLanguage = value.length > 0;
      }
      if (part.name === "response_format") {
        responseFormat = value;
      }
    }
    outgoing.push(part);
  }
  if (!hasLanguage) {
    outgoing.push(textPart("language", "ko"));
  }
  outgoing.push(textPart("prompt", buildPrompt(settings)));

  const multipart = buildMultipart(outgoing);
  const upstream = `${settings.upstreamBaseUrl.replace(/\/+$/, "")}/audio/transcriptions`;
  const response = await fetch(upstream, {
    method: "POST",
    headers: {
      "content-type": multipart.contentType,
      ...(authorization ? { authorization } : {}),
    },
    body: new Uint8Array(multipart.body),
    signal,
  });
  const text = await response.text();
  const upstreamType = response.headers.get("content-type") ?? "application/json";

  if (!response.ok || !settings.dropHallucinations || responseFormat !== "json") {
    return { status: response.status, body: text, contentType: upstreamType, dropped: 0 };
  }

  const parsed = JSON.parse(text) as { text?: unknown };
  if (typeof parsed.text !== "string") {
    return { status: response.status, body: text, contentType: upstreamType, dropped: 0 };
  }
  const filtered = dropHallucinations(parsed.text);
  return {
    status: response.status,
    body: JSON.stringify({ ...parsed, text: filtered.text }),
    contentType: "application/json",
    dropped: filtered.dropped,
  };
}
