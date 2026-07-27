import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listModels } from "@/lib/debate/ollamaClient";
import { TONE_PRESETS } from "@/lib/debate/presets";
import type { ArenaSettings, DebaterConfig, ExecutionMode, Side } from "@/lib/debate/types";
import { cn } from "@/lib/utils";

const THINKING_LABELS = ["Off", "Brief", "Structured", "Deep"];

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
  const accent = side === "alpha" ? "text-alpha" : "text-beta";

  const refresh = async () => {
    setLoading(true);
    setModels(await listModels(config.endpoint));
    setLoading(false);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label className={cn("text-xs tracking-[0.14em] uppercase", accent)}>Endpoint URL</Label>
        <Input
          value={config.endpoint}
          onChange={(e) => onChange({ endpoint: e.target.value })}
          className="font-mono text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label className={cn("text-xs tracking-[0.14em] uppercase", accent)}>Model</Label>
        <div className="flex gap-2">
          <Input
            value={config.model}
            onChange={(e) => onChange({ model: e.target.value })}
            className="font-mono text-sm"
            placeholder="llama3"
          />
          <Button variant="outline" size="icon" onClick={refresh} title="Fetch installed models">
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </Button>
        </div>
        {models.length > 0 && (
          <Select value={config.model} onValueChange={(model) => onChange({ model })}>
            <SelectTrigger className="font-mono text-sm">
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
      </div>

      <div className="space-y-2">
        <Label className="flex justify-between text-xs tracking-[0.14em] uppercase">
          Temperature <span className="font-mono">{config.temperature.toFixed(2)}</span>
        </Label>
        <Slider
          min={0}
          max={1.5}
          step={0.05}
          value={[config.temperature]}
          onValueChange={([temperature]) => onChange({ temperature })}
        />
      </div>

      <div className="space-y-2">
        <Label className="flex justify-between text-xs tracking-[0.14em] uppercase">
          Top P <span className="font-mono">{config.topP.toFixed(2)}</span>
        </Label>
        <Slider
          min={0.1}
          max={1}
          step={0.05}
          value={[config.topP]}
          onValueChange={([topP]) => onChange({ topP })}
        />
      </div>

      <div className="space-y-2">
        <Label className="flex justify-between text-xs tracking-[0.14em] uppercase">
          Thinking level{" "}
          <span className="font-mono">{THINKING_LABELS[config.thinkingLevel]}</span>
        </Label>
        <Slider
          min={0}
          max={3}
          step={1}
          value={[config.thinkingLevel]}
          onValueChange={([thinkingLevel]) => onChange({ thinkingLevel })}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs tracking-[0.14em] uppercase">Tone preset</Label>
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
      </div>

      <div className="space-y-2">
        <Label className="text-xs tracking-[0.14em] uppercase">System prompt / persona</Label>
        <Textarea
          rows={6}
          value={config.systemPrompt}
          onChange={(e) => onChange({ systemPrompt: e.target.value, tonePreset: "Custom" })}
          className="font-mono text-sm"
        />
      </div>
    </div>
  );
}

export function SettingsPanel({
  settings,
  onChange,
}: {
  settings: ArenaSettings;
  onChange: (patch: Partial<ArenaSettings>) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label className="text-xs tracking-[0.14em] uppercase">Execution mode</Label>
        <Select
          value={settings.mode}
          onValueChange={(mode) => onChange({ mode: mode as ExecutionMode })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto — live if reachable, else simulation</SelectItem>
            <SelectItem value="live">Force Live Local API</SelectItem>
            <SelectItem value="simulation">Force Simulation Mode</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="flex justify-between text-xs tracking-[0.14em] uppercase">
          Debate rounds <span className="font-mono">{settings.rounds}</span>
        </Label>
        <Slider
          min={2}
          max={10}
          step={1}
          value={[settings.rounds]}
          onValueChange={([rounds]) => onChange({ rounds })}
        />
      </div>

      <div className="space-y-2">
        <Label className="flex justify-between text-xs tracking-[0.14em] uppercase">
          Context window <span className="font-mono">{settings.contextWindow}</span>
        </Label>
        <Slider
          min={2048}
          max={131072}
          step={1024}
          value={[settings.contextWindow]}
          onValueChange={([contextWindow]) => onChange({ contextWindow })}
        />
      </div>

      <Tabs defaultValue="alpha">
        <TabsList className="w-full">
          <TabsTrigger value="alpha" className="flex-1 data-[state=active]:text-alpha">
            Alpha
          </TabsTrigger>
          <TabsTrigger value="beta" className="flex-1 data-[state=active]:text-beta">
            Beta
          </TabsTrigger>
        </TabsList>
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
      </Tabs>

      <p className="rounded-lg border border-border/70 bg-muted/40 p-3 font-mono text-xs text-muted-foreground">
        Browser blocked? Restart Ollama with OLLAMA_ORIGINS=&quot;*&quot; so this page can reach
        localhost:11434.
      </p>
    </div>
  );
}
