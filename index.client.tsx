import type { PluginClientContext } from "@getpaseo/plugin/client";
import { KoreanVoiceSettings } from "./client/settings-screen";

export default function contribute(client: PluginClientContext) {
  client.addSettingsScreen({
    id: "korean-voice",
    title: "한국어 음성",
    icon: "AudioLines",
    Component: KoreanVoiceSettings,
  });
  return () => {};
}
