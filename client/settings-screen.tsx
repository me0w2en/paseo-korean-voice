import type { RpcOutput } from "@getpaseo/plugin";
import { type PluginSurfaceProps, useRpc, useSettings } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  type SettingsInputHandle,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { gatewayStatusRpc, speakTestRpc } from "../shared/rpc";
import { voiceSettings, type VoiceSettings } from "../shared/settings";

type GatewayStatus = RpcOutput<typeof gatewayStatusRpc>;

const RATE_OPTIONS = [
  { label: "느리게 (160)", value: "160" },
  { label: "조금 느리게 (185)", value: "185" },
  { label: "보통 (210)", value: "210" },
  { label: "빠르게 (250)", value: "250" },
  { label: "아주 빠르게 (300)", value: "300" },
];

const TEXT_FIELDS = ["upstreamBaseUrl", "upstreamModel", "sttPrompt", "glossary"] as const;
type TextField = (typeof TEXT_FIELDS)[number];

export function KoreanVoiceSettings({ theme }: PluginSurfaceProps) {
  const settings = useSettings(voiceSettings);
  const getStatus = useRpc(gatewayStatusRpc);
  const speakTest = useRpc(speakTestRpc);
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const refs = {
    upstreamBaseUrl: useRef<SettingsInputHandle>(null),
    upstreamModel: useRef<SettingsInputHandle>(null),
    sttPrompt: useRef<SettingsInputHandle>(null),
    glossary: useRef<SettingsInputHandle>(null),
  } satisfies Record<TextField, unknown>;
  const portRef = useRef<SettingsInputHandle>(null);

  const refresh = useCallback(() => {
    getStatus({})
      .then(setStatus)
      .catch((error: unknown) => setMessage(String(error)));
  }, [getStatus]);

  useEffect(refresh, [refresh]);

  if (settings.status === "loading") {
    return <Text style={{ color: theme.colors.foregroundMuted }}>설정을 불러오는 중…</Text>;
  }
  if (settings.status !== "ready") {
    return (
      <SettingsSection title="설정 오류">
        <SettingsCard>
          <SettingsRow label="저장된 설정을 읽지 못했습니다" error={settings.error} />
          <SettingsAction label="기본값으로 초기화" actionLabel="초기화" onPress={() => void settings.reset()} />
        </SettingsCard>
      </SettingsSection>
    );
  }

  const values = settings.values;
  const revision = settings.revision;
  const save = (next: Partial<VoiceSettings>) => {
    void settings.save({ ...values, ...next }, revision).then(() => refresh());
  };
  const saveTextFields = () => {
    const next: Partial<VoiceSettings> = {};
    for (const field of TEXT_FIELDS) {
      next[field] = refs[field].current?.getText() ?? values[field];
    }
    const port = Number(portRef.current?.getText() ?? values.port);
    save({ ...next, port: Number.isInteger(port) ? port : values.port });
    setMessage("저장했습니다.");
  };

  const voices = status?.voices.length ? status.voices : [values.ttsVoice];
  const configSnippet = JSON.stringify(
    {
      features: {
        dictation: { stt: { provider: "openai", language: "ko" } },
        voiceMode: {
          stt: { provider: "openai", language: "ko" },
          tts: { provider: "openai" },
        },
      },
      providers: {
        openai: {
          stt: { baseUrl: status?.baseUrl ?? "http://127.0.0.1:6791/v1", apiKey: "<Groq/OpenAI 키>" },
          tts: { baseUrl: status?.baseUrl ?? "http://127.0.0.1:6791/v1", apiKey: "local" },
        },
      },
    },
    null,
    2,
  );

  return (
    <>
      <SettingsSection title="게이트웨이 상태">
        <SettingsCard>
          <SettingsRow
            label={status?.listening ? "실행 중" : "중지됨"}
            hint={status ? status.baseUrl : "확인 중…"}
            error={status?.error ?? null}
          />
          <SettingsRow
            label="처리 통계"
            hint={
              status
                ? `TTS ${status.stats.tts}회 · STT ${status.stats.stt}회 · 환각 문장 제거 ${status.stats.droppedHallucinations}개`
                : undefined
            }
            error={status?.stats.lastError ?? null}
          />
          <SettingsAction label="상태 새로고침" actionLabel="새로고침" onPress={refresh} />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="음성 출력 (voice mode TTS)">
        <SettingsCard>
          <SettingsSelect
            label="목소리"
            hint="macOS 한국어 음성. 시스템 설정 → 손쉬운 사용 → 읽기 및 말하기에서 고품질 음성을 추가로 받을 수 있습니다."
            value={values.ttsVoice}
            options={voices.map((voice) => ({ label: voice, value: voice }))}
            onValueChange={(ttsVoice) => save({ ttsVoice })}
          />
          <SettingsSelect
            label="말하기 속도"
            value={String(values.ttsRate)}
            options={RATE_OPTIONS}
            onValueChange={(rate) => save({ ttsRate: Number(rate) })}
          />
          <SettingsAction
            label="테스트 재생"
            hint="데몬이 실행 중인 Mac의 스피커로 재생합니다."
            actionLabel="재생"
            onPress={() => {
              speakTest({ text: "안녕하세요. 파세오 한국어 음성 출력 테스트입니다." })
                .then((result) => setMessage(result.ok ? null : result.error))
                .catch((error: unknown) => setMessage(String(error)));
            }}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="받아쓰기 (Whisper 프록시)">
        <SettingsCard>
          <SettingsSwitch
            label="Whisper 환각 문장 제거"
            hint="무음 구간에서 생기는 '시청해 주셔서 감사합니다' 같은 문장을 지웁니다."
            value={values.dropHallucinations}
            onValueChange={(dropHallucinations) => save({ dropHallucinations })}
          />
          <SettingsInput
            ref={refs.upstreamBaseUrl}
            label="업스트림 STT 주소"
            hint="OpenAI 호환 /audio/transcriptions 엔드포인트의 base URL"
            initialValue={values.upstreamBaseUrl}
            onChangeText={() => {}}
          />
          <SettingsInput
            ref={refs.upstreamModel}
            label="모델 덮어쓰기"
            hint="비우면 Paseo 설정의 모델을 그대로 사용"
            placeholder="whisper-large-v3"
            initialValue={values.upstreamModel}
            onChangeText={() => {}}
          />
          <SettingsInput
            ref={refs.sttPrompt}
            label="인식 프롬프트"
            initialValue={values.sttPrompt}
            onChangeText={() => {}}
          />
          <SettingsInput
            ref={refs.glossary}
            label="용어집"
            hint="쉼표로 구분. 자주 말하는 프로젝트명·기술 용어를 넣으면 철자가 정확해집니다."
            initialValue={values.glossary}
            onChangeText={() => {}}
          />
          <SettingsInput
            ref={portRef}
            label="게이트웨이 포트"
            initialValue={String(values.port)}
            onChangeText={() => {}}
          />
          <SettingsAction
            label="입력값 저장"
            actionLabel={settings.saving ? "저장 중…" : "저장"}
            disabled={settings.saving}
            error={settings.saveError ?? message}
            onPress={saveTextFields}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Paseo 음성 설정 연결">
        <SettingsCard>
          <SettingsRow
            label="~/.paseo/config.json에 아래 값을 병합한 뒤 데몬을 재시작하세요"
            hint="저장소의 scripts/apply-voice-config.mjs가 백업 후 자동으로 병합합니다."
          >
            <Text selectable style={{ color: theme.colors.foreground, fontFamily: "Menlo", fontSize: 12 }}>
              {configSnippet}
            </Text>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
