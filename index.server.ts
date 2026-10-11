import type { PluginServerContext } from "@getpaseo/plugin/server";
import { gatewayStatusRpc, speakTestRpc } from "./shared/rpc";
import { voiceSettings, type VoiceSettings } from "./shared/settings";
import { startGateway, type Gateway } from "./server/gateway";
import { listKoreanVoices, speakAloud } from "./server/tts";

export default function contribute(server: PluginServerContext) {
  const settingsHandle = server.registerSettings(voiceSettings);
  let current: VoiceSettings = voiceSettings.schema.parse({});
  let gateway: Gateway | null = null;
  let gatewayError: string | null = null;
  let stopped = false;

  async function ensureGateway(): Promise<void> {
    if (stopped || gateway?.port === current.port) {
      return;
    }
    await gateway?.close();
    gateway = null;
    try {
      gateway = await startGateway(current.port, () => current);
      gatewayError = null;
    } catch (error) {
      gatewayError = error instanceof Error ? error.message : String(error);
      console.error(`[korean-voice] could not listen on port ${current.port}: ${gatewayError}`);
    }
  }

  void settingsHandle.read().then(async (state) => {
    if (state.status === "ready") {
      current = state.values;
    } else {
      console.error(`[korean-voice] invalid settings, using defaults: ${state.error}`);
    }
    await ensureGateway();
  });

  const unsubscribe = settingsHandle.subscribe(async (state) => {
    if (state.status !== "ready") {
      return;
    }
    current = state.values;
    await ensureGateway();
  });

  server.handle(gatewayStatusRpc, async () => ({
    listening: gateway !== null,
    baseUrl: `http://127.0.0.1:${current.port}/v1`,
    error: gatewayError,
    voices: await listKoreanVoices().catch(() => []),
    stats: gateway?.stats ?? { tts: 0, stt: 0, droppedHallucinations: 0, lastError: null },
  }));

  server.handle(speakTestRpc, async ({ text }) => {
    try {
      await speakAloud(text, current.ttsVoice, current.ttsRate);
      return { ok: true, error: null };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  return async () => {
    stopped = true;
    unsubscribe();
    await gateway?.close();
  };
}
