import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const gatewayStatusRpc = defineRpc({
  name: "korean-voice.status",
  input: z.object({}),
  output: z.object({
    listening: z.boolean(),
    baseUrl: z.string(),
    error: z.string().nullable(),
    voices: z.array(z.string()),
    stats: z.object({
      tts: z.number(),
      stt: z.number(),
      droppedHallucinations: z.number(),
      lastError: z.string().nullable(),
    }),
  }),
});

export const speakTestRpc = defineRpc({
  name: "korean-voice.speak-test",
  input: z.object({ text: z.string().min(1).max(500) }),
  output: z.object({ ok: z.boolean(), error: z.string().nullable() }),
});
