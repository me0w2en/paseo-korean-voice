import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Paseo's OpenAI TTS client always asks for raw PCM, which OpenAI defines as
// 24 kHz, 16-bit signed little-endian, mono.
const SAMPLE_RATE = 24000;
const MAX_SPEECH_CHARS = 2000;

export type SpeechFormat = "pcm" | "wav";

export async function listKoreanVoices(): Promise<string[]> {
  const { stdout } = await execFileAsync("say", ["-v", "?"]);
  return stdout
    .split("\n")
    .filter((line) => /\bko_KR\b/.test(line))
    .map((line) => line.split(/\s{2,}/)[0]?.trim() ?? "")
    .filter((name) => name.length > 0);
}

// Agents write Markdown; reading it aloud verbatim sounds like noise.
export function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " 코드 블록은 생략할게요. ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/https?:\/\/\S+/g, " 링크 ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SPEECH_CHARS);
}

export function extractPcm(wav: Buffer): Buffer {
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("say did not produce a WAVE file");
  }
  // macOS inserts an FLLR padding chunk, so walk the chunks instead of assuming a 44-byte header.
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === "data") {
      return wav.subarray(offset + 8, Math.min(offset + 8 + size, wav.length));
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("WAVE file has no data chunk");
}

export async function synthesize(
  text: string,
  voice: string,
  rate: number,
  format: SpeechFormat,
): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "paseo-korean-voice-"));
  try {
    const input = join(dir, "input.txt");
    const output = join(dir, "output.wav");
    await writeFile(input, cleanForSpeech(text), "utf8");
    await execFileAsync("say", [
      "-v",
      voice,
      "-r",
      String(rate),
      "-f",
      input,
      "-o",
      output,
      "--file-format=WAVE",
      `--data-format=LEI16@${SAMPLE_RATE}`,
    ]);
    const wav = await readFile(output);
    return format === "pcm" ? extractPcm(wav) : wav;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function speakAloud(text: string, voice: string, rate: number): Promise<void> {
  await execFileAsync("say", ["-v", voice, "-r", String(rate), cleanForSpeech(text)]);
}
