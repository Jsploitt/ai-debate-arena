import { useCallback, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, RotateCcw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { DEFAULT_JUDGE_WEIGHTS, JUDGE_CRITERIA } from "@/lib/debate/judge";
import { listModels } from "@/lib/debate/ollamaClient";
import { KOKORO_VOICES, TONE_PRESETS } from "@/lib/debate/presets";
import type { ArenaSettings, DebaterConfig, ExecutionMode, Side } from "@/lib/debate/types";
import { cn } from "@/lib/utils";

const THINKING_LABELS = ["Off", "Brief", "Structured", "Deep"];

/** Section kicker — the reference's broadcast-graphics label motif. */
function Kicker({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "font-display text-[10px] tracking-[0.25em] text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Field({
  label,
  value,
  children,
  hint,
  htmlFor,
}: {
  label: string;
  value?: string;
  children: React.ReactNode;
  hint?: string;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="flex justify-between">
        <Kicker>{label}</Kicker>
        {value !== undefined && (
          <span className="font-display text-[11px] text-foreground/80">{value}</span>
        )}
      </Label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

type TestState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "ok"; models: string[] }
  | { status: "empty" }
  | { status: "error"; message: string };

/**
 * A connection test with every outcome surfaced in text — pending, reachable,
 * reachable-but-empty, and unreachable. Status is never conveyed by colour
 * alone, and the result is announced politely so it is not silent for screen
 * reader users.
 */
function ConnectionTest({ state, onTest }: { state: TestState; onTest: () => void }) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onTest}
        disabled={state.status === "pending"}
      >
        {state.status === "pending" ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : null}
        Test
      </Button>
      <p aria-live="polite" className="col-span-full">
        {state.status === "pending" && (
          <span className="text-[11px] text-muted-foreground">Testing connection…</span>
        )}
        {state.status === "ok" && (
          <span className="flex items-center gap-1.5 text-[11px] text-pro">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            Reachable — {state.models.length} model{state.models.length === 1 ? "" : "s"} installed
          </span>
        )}
        {state.status === "empty" && (
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            Reachable, but no models are installed — pull one, or type a name manually
          </span>
        )}
        {state.status === "error" && (
          <span className="flex items-center gap-1.5 text-[11px] text-destructive">
            <XCircle className="size-3.5" aria-hidden="true" />
            {state.message}
          </span>
        )}
      </p>
    </>
  );
}

function DebaterForm({
  side,
  config,
  onChange,
}: {
  side: Side;
  config: DebaterConfig;
  onChange: (patch: Partial<DebaterConfig>) => void;
}) {
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [discoveryFailed, setDiscoveryFailed] = useState(false);
  const accent = side === "alpha" ? "text-pro" : "text-con";

  const refresh = useCallback(async () => {
    setLoading(true);
    setDiscoveryFailed(false);
    const found = await listModels(config.endpoint);
    setModels(found);
    setDiscoveryFailed(found.length === 0);
    setLoading(false);
  }, [config.endpoint]);

  return (
    <div className="space-y-5">
      <Field label="Debater name">
        <Input value={config.name} onChange={(e) => onChange({ name: e.target.value })} />
      </Field>

      <Field
        label="Model"
        hint={
          discoveryFailed
            ? "No models discovered at that endpoint. The name above is still used as typed."
            : "Type any model name, or refresh to pick from what the runtime actually serves."
        }
      >
        <div className="flex gap-2">
          <Input
            value={config.model}
            onChange={(e) => onChange({ model: e.target.value })}
            className="font-mono text-sm"
            placeholder="llama3"
            spellCheck={false}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void refresh()}
            aria-label="Fetch installed models"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden="true" />
          </Button>
        </div>
        {models.length > 0 && (
          <Select value={config.model} onValueChange={(model) => onChange({ model })}>
            <SelectTrigger className="mt-2 font-mono text-sm">
              <SelectValue placeholder="Installed models" />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m} value={m} className="font-mono">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Temperature" value={config.temperature.toFixed(2)}>
        <Slider
          min={0}
          max={1.5}
          step={0.05}
          value={[config.temperature]}
          onValueChange={([temperature]) => onChange({ temperature })}
          aria-label="Temperature"
        />
      </Field>

      <Field label="Top P" value={config.topP.toFixed(2)}>
        <Slider
          min={0.1}
          max={1}
          step={0.05}
          value={[config.topP]}
          onValueChange={([topP]) => onChange({ topP })}
          aria-label="Top P"
        />
      </Field>

      <Field label="Thinking level" value={THINKING_LABELS[config.thinkingLevel]}>
        <Slider
          min={0}
          max={3}
          step={1}
          value={[config.thinkingLevel]}
          onValueChange={([thinkingLevel]) => onChange({ thinkingLevel })}
          aria-label="Thinking level"
        />
      </Field>

      <Field label="Tone preset">
        <Select
          value={config.tonePreset}
          onValueChange={(tonePreset) =>
            onChange({
              tonePreset,
              ...(TONE_PRESETS[tonePreset] ? { systemPrompt: TONE_PRESETS[tonePreset] } : {}),
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(TONE_PRESETS).map((tone) => (
              <SelectItem key={tone} value={tone}>
                {tone}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="System prompt / persona">
        <Textarea
          rows={6}
          value={config.systemPrompt}
          onChange={(e) => onChange({ systemPrompt: e.target.value, tonePreset: "Custom" })}
          className="font-mono text-sm"
        />
      </Field>

      <Field
        label="Voice — English TTS"
        hint="Arabic mode uses one shared voice for both debaters, regardless of this setting."
      >
        <Select value={config.voice ?? ""} onValueChange={(voice) => onChange({ voice })}>
          <SelectTrigger className={cn("font-mono text-sm", accent)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(KOKORO_VOICES).map(([group, voices]) => (
              <SelectGroup key={group}>
                <SelectLabel>{group}</SelectLabel>
                {voices.map((v) => (
                  <SelectItem key={v} value={v} className="font-mono">
                    {v}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

type EndpointKey = "alpha" | "beta" | "judge" | "ttsEn" | "ttsAr";

const ENDPOINT_LABELS: Record<EndpointKey, string> = {
  alpha: "Debater Alpha — Ollama",
  beta: "Debater Beta — Ollama",
  judge: "AI Judge — Ollama",
  ttsEn: "English TTS — Kokoro",
  ttsAr: "Arabic TTS — MMS-TTS",
};

const ENDPOINT_PORTS: Record<EndpointKey, string> = {
  alpha: "11434",
  beta: "11435",
  judge: "11436",
  ttsEn: "8100",
  ttsAr: "8101",
};

export function ConfigPanel({
  settings,
  onChange,
  onReset,
  running,
}: {
  settings: ArenaSettings;
  onChange: (patch: Partial<ArenaSettings>) => void;
  onReset: () => void;
  /** A debate is in progress; changes apply from the next turn. */
  running: boolean;
}) {
  const [tests, setTests] = useState<Record<EndpointKey, TestState>>({
    alpha: { status: "idle" },
    beta: { status: "idle" },
    judge: { status: "idle" },
    ttsEn: { status: "idle" },
    ttsAr: { status: "idle" },
  });

  const endpointOf = (key: EndpointKey): string => {
    if (key === "ttsEn") return settings.tts.endpointEn;
    if (key === "ttsAr") return settings.tts.endpointAr;
    return settings[key].endpoint;
  };

  const setEndpoint = (key: EndpointKey, endpoint: string) => {
    if (key === "ttsEn") onChange({ tts: { ...settings.tts, endpointEn: endpoint } });
    else if (key === "ttsAr") onChange({ tts: { ...settings.tts, endpointAr: endpoint } });
    else onChange({ [key]: { ...settings[key], endpoint } } as Partial<ArenaSettings>);
    setTests((prev) => ({ ...prev, [key]: { status: "idle" } }));
  };

  const test = useCallback(async (key: EndpointKey, endpoint: string) => {
    setTests((prev) => ({ ...prev, [key]: { status: "pending" } }));

    if (key === "ttsEn" || key === "ttsAr") {
      // The TTS services expose /health rather than a model list.
      try {
        const origin = new URL(endpoint).origin;
        const response = await fetch(`${origin}/health`);
        setTests((prev) => ({
          ...prev,
          [key]: response.ok
            ? { status: "ok", models: [] }
            : { status: "error", message: `Reachable but unhealthy (HTTP ${response.status})` },
        }));
      } catch {
        setTests((prev) => ({
          ...prev,
          [key]: {
            status: "error",
            message: "Unreachable — check the URL, that the service is running, and CORS",
          },
        }));
      }
      return;
    }

    const models = await listModels(endpoint);
    setTests((prev) => ({
      ...prev,
      [key]: models.length > 0 ? { status: "ok", models } : { status: "empty" },
    }));
  }, []);

  const maxTotal = settings.judge.scale * JUDGE_CRITERIA.length;

  return (
    <div className="space-y-6">
      {running && (
        <p
          role="status"
          className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-[11px] text-foreground/90"
        >
          A debate is in progress. Changes are saved now and take effect from the next turn — the
          turns already spoken are not rescored.
        </p>
      )}

      <Tabs defaultValue="runtime">
        <TabsList className="w-full">
          <TabsTrigger value="runtime" className="flex-1">
            Runtime
          </TabsTrigger>
          <TabsTrigger value="alpha" className="flex-1 data-[state=active]:text-pro">
            Alpha
          </TabsTrigger>
          <TabsTrigger value="beta" className="flex-1 data-[state=active]:text-con">
            Beta
          </TabsTrigger>
          <TabsTrigger value="judge" className="flex-1 data-[state=active]:text-primary">
            Judge
          </TabsTrigger>
        </TabsList>

        {/* ---------------- Runtime: endpoints, mode, format, voice ------------- */}
        <TabsContent value="runtime" className="space-y-6 pt-4">
          <section
            className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4"
            aria-labelledby="endpoints-heading"
          >
            <h3 id="endpoints-heading">
              <Kicker>Endpoints</Kicker>
            </h3>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Five separate services. The debaters, the judge and each language&apos;s voice all
              have their own runtime.
            </p>

            {(Object.keys(ENDPOINT_LABELS) as EndpointKey[]).map((key) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={`endpoint-${key}`} className="flex items-baseline justify-between">
                  <Kicker
                    className={
                      key === "alpha" ? "text-pro" : key === "beta" ? "text-con" : undefined
                    }
                  >
                    {ENDPOINT_LABELS[key]}
                  </Kicker>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    :{ENDPOINT_PORTS[key]}
                  </span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    id={`endpoint-${key}`}
                    value={endpointOf(key)}
                    onChange={(e) => setEndpoint(key, e.target.value)}
                    className="font-mono text-sm"
                    spellCheck={false}
                  />
                  <ConnectionTest
                    state={tests[key]}
                    onTest={() => void test(key, endpointOf(key))}
                  />
                </div>
              </div>
            ))}

            <p className="rounded-lg border border-border/70 bg-background/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
              Blocked by the browser? Restart Ollama with OLLAMA_ORIGINS=&quot;*&quot; so this page
              can reach it from a different origin.
            </p>
          </section>

          <Field
            label="Execution mode"
            hint="Auto falls back to simulation whenever a live stream fails, so a demo never stalls."
          >
            <Select
              value={settings.mode}
              onValueChange={(mode) => onChange({ mode: mode as ExecutionMode })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto — live if reachable, else simulation</SelectItem>
                <SelectItem value="live">Force live local API</SelectItem>
                <SelectItem value="simulation">Force simulation</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Debate language">
            <Select
              value={settings.language}
              onValueChange={(language) => onChange({ language: language as "en" | "ar" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ar">العربية — Arabic</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Debate rounds" value={String(settings.rounds)}>
            <Slider
              min={2}
              max={10}
              step={1}
              value={[settings.rounds]}
              onValueChange={([rounds]) => onChange({ rounds })}
              aria-label="Debate rounds"
            />
          </Field>

          <Field label="Context window" value={settings.contextWindow.toLocaleString()}>
            <Slider
              min={2048}
              max={131072}
              step={1024}
              value={[settings.contextWindow]}
              onValueChange={([contextWindow]) => onChange({ contextWindow })}
              aria-label="Context window"
            />
          </Field>

          <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/30 p-3">
            <Label htmlFor="tts-enabled">
              <Kicker>Voice (TTS)</Kicker>
            </Label>
            <Switch
              id="tts-enabled"
              checked={settings.tts.enabled}
              onCheckedChange={(enabled) => onChange({ tts: { ...settings.tts, enabled } })}
            />
          </div>
        </TabsContent>

        <TabsContent value="alpha" className="pt-4">
          <DebaterForm
            side="alpha"
            config={settings.alpha}
            onChange={(patch) => onChange({ alpha: { ...settings.alpha, ...patch } })}
          />
        </TabsContent>

        <TabsContent value="beta" className="pt-4">
          <DebaterForm
            side="beta"
            config={settings.beta}
            onChange={(patch) => onChange({ beta: { ...settings.beta, ...patch } })}
          />
        </TabsContent>

        {/* ---------------------------- Judge ---------------------------------- */}
        <TabsContent value="judge" className="space-y-5 pt-4">
          <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/30 p-3">
            <Label htmlFor="judge-enabled">
              <Kicker>Enable AI judge</Kicker>
            </Label>
            <Switch
              id="judge-enabled"
              checked={settings.judge.enabled}
              onCheckedChange={(enabled) => onChange({ judge: { ...settings.judge, enabled } })}
            />
          </div>

          <Field label="Judge model">
            <Input
              value={settings.judge.model}
              onChange={(e) => onChange({ judge: { ...settings.judge, model: e.target.value } })}
              className="font-mono text-sm"
              placeholder="llama3"
              spellCheck={false}
            />
          </Field>

          <Field label="Temperature" value={settings.judge.temperature.toFixed(2)}>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={[settings.judge.temperature]}
              onValueChange={([temperature]) =>
                onChange({ judge: { ...settings.judge, temperature } })
              }
              aria-label="Judge temperature"
            />
          </Field>

          <section
            className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3"
            aria-labelledby="weights-heading"
          >
            <div className="flex items-center justify-between">
              <h3 id="weights-heading">
                <Kicker>Criteria weights</Kicker>
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-[11px]"
                onClick={() =>
                  onChange({ judge: { ...settings.judge, weights: { ...DEFAULT_JUDGE_WEIGHTS } } })
                }
              >
                Reset weights
              </Button>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Higher weight means bigger impact on the total. Set a weight to 0 to drop a criterion
              entirely. The persona cards on the home stage are presets over these same values.
            </p>
            {JUDGE_CRITERIA.map((c) => {
              const weight = settings.judge.weights?.[c] ?? 1;
              return (
                <Field key={c} label={c} value={`×${weight.toFixed(1)}`}>
                  <Slider
                    min={0}
                    max={3}
                    step={0.1}
                    value={[weight]}
                    onValueChange={([w]) =>
                      onChange({
                        judge: {
                          ...settings.judge,
                          weights: { ...settings.judge.weights, [c]: w },
                        },
                      })
                    }
                    aria-label={`${c} weight`}
                  />
                </Field>
              );
            })}
          </section>

          <Field
            label="Max score per criterion"
            value={String(settings.judge.scale)}
            hint={`Maximum weighted total per side: ${maxTotal.toFixed(0)}`}
          >
            <Slider
              min={5}
              max={100}
              step={5}
              value={[settings.judge.scale]}
              onValueChange={([scale]) => onChange({ judge: { ...settings.judge, scale } })}
              aria-label="Max score per criterion"
            />
          </Field>

          <Field
            label="Draw threshold"
            value={`${settings.judge.tieThreshold.toFixed(1)} pts`}
            hint="Totals closer together than this are declared a draw."
          >
            <Slider
              min={0}
              max={5}
              step={0.1}
              value={[settings.judge.tieThreshold]}
              onValueChange={([tieThreshold]) =>
                onChange({ judge: { ...settings.judge, tieThreshold } })
              }
              aria-label="Draw threshold"
            />
          </Field>

          <Field label="House scoring rules">
            <Textarea
              rows={4}
              value={settings.judge.rules}
              onChange={(e) => onChange({ judge: { ...settings.judge, rules: e.target.value } })}
              className="font-mono text-xs"
              placeholder="e.g. Penalise unsourced statistics. Reward concessions that sharpen the debate."
            />
          </Field>

          <Field label="Judging rubric prompt">
            <Textarea
              rows={9}
              value={settings.judge.systemPrompt}
              onChange={(e) =>
                onChange({ judge: { ...settings.judge, systemPrompt: e.target.value } })
              }
              className="font-mono text-xs"
            />
          </Field>
        </TabsContent>
      </Tabs>

      <Button type="button" variant="outline" className="w-full" onClick={onReset}>
        <RotateCcw aria-hidden="true" /> Reset all settings to defaults
      </Button>
    </div>
  );
}
