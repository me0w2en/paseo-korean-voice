import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { VoiceSettings } from "../shared/settings";
import { transcribe } from "./stt";
import { synthesize, type SpeechFormat } from "./tts";

const HOST = "127.0.0.1";
const MAX_BODY_BYTES = 25 * 1024 * 1024;

export interface GatewayStats {
  tts: number;
  stt: number;
  droppedHallucinations: number;
  lastError: string | null;
}

export interface Gateway {
  readonly port: number;
  readonly stats: GatewayStats;
  close(): Promise<void>;
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
}

function openAiError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: { message, type: "korean_voice_gateway_error" } });
}

export function startGateway(port: number, getSettings: () => VoiceSettings): Promise<Gateway> {
  const stats: GatewayStats = { tts: 0, stt: 0, droppedHallucinations: 0, lastError: null };

  async function handleSpeech(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const payload = JSON.parse((await readBody(req)).toString("utf8")) as {
      input?: unknown;
      response_format?: unknown;
    };
    if (typeof payload.input !== "string" || payload.input.trim().length === 0) {
      openAiError(res, 400, "input is required");
      return;
    }
    const requested = typeof payload.response_format === "string" ? payload.response_format : "pcm";
    if (requested !== "pcm" && requested !== "wav") {
      openAiError(res, 400, `response_format ${requested} is not supported; use pcm or wav`);
      return;
    }
    const settings = getSettings();
    const audio = await synthesize(payload.input, settings.ttsVoice, settings.ttsRate, requested as SpeechFormat);
    stats.tts += 1;
    res.writeHead(200, {
      "content-type": requested === "pcm" ? "audio/pcm" : "audio/wav",
      "content-length": audio.length,
    });
    res.end(audio);
  }

  async function handleTranscription(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const contentType = req.headers["content-type"] ?? "";
    if (!contentType.startsWith("multipart/form-data")) {
      openAiError(res, 400, "expected multipart/form-data");
      return;
    }
    const abort = new AbortController();
    res.on("close", () => abort.abort());
    const result = await transcribe(
      await readBody(req),
      contentType,
      req.headers.authorization,
      getSettings(),
      abort.signal,
    );
    stats.stt += 1;
    stats.droppedHallucinations += result.dropped;
    res.writeHead(result.status, { "content-type": result.contentType });
    res.end(result.body);
  }

  const server: Server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0]?.replace(/\/+$/, "") ?? "";
    const route =
      req.method === "POST" && path.endsWith("/audio/speech")
        ? handleSpeech
        : req.method === "POST" && path.endsWith("/audio/transcriptions")
          ? handleTranscription
          : null;

    if (req.method === "GET" && path.endsWith("/health")) {
      sendJson(res, 200, { ok: true, stats });
      return;
    }
    if (!route) {
      openAiError(res, 404, `no route for ${req.method} ${path}`);
      return;
    }
    route(req, res).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      stats.lastError = message;
      console.error(`[korean-voice] ${req.method} ${path} failed: ${message}`);
      if (!res.headersSent) {
        openAiError(res, 502, message);
      } else {
        res.destroy();
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, HOST, () => {
      server.off("error", reject);
      console.log(`[korean-voice] gateway listening on http://${HOST}:${port}/v1`);
      resolve({
        port,
        stats,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
            server.closeAllConnections();
          }),
      });
    });
  });
}
