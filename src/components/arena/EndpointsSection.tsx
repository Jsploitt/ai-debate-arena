import { useState } from "react";
import { CheckCircle2, Loader2, PlugZap, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listModels } from "@/lib/debate/ollamaClient";
import type { ArenaSettings } from "@/lib/debate/types";
import { cn } from "@/lib/utils";

type Target = "alpha" | "beta" | "judge";
type Result = { ok: boolean; models: string[] } | null;

const LABELS: Record<Target, string> = {
  alpha: "Debater Alpha endpoint",
  beta: "Debater Beta endpoint",
  judge: "AI Judge endpoint",
};

const ACCENTS: Record<Target, string> = {
  alpha: "text-alpha",
  beta: "text-beta",
  judge: "text-primary",
};

export function EndpointsSection({
  settings,
  onChange,
}: {
  settings: ArenaSettings;
  onChange: (patch: Partial<ArenaSettings>) => void;
}) {
  const [testing, setTesting] = useState<Target | "all" | null>(null);
  const [results, setResults] = useState<Record<Target, Result>>({
    alpha: null,
    beta: null,
    judge: null,
  });

  const endpointOf = (t: Target) => settings[t].endpoint;

  const setEndpoint = (t: Target, endpoint: string) => {
    onChange({ [t]: { ...settings[t], endpoint } } as Partial<ArenaSettings>);
    setResults((prev) => ({ ...prev, [t]: null }));
  };

  const test = async (t: Target) => {
    setTesting(t);
    const models = await listModels(endpointOf(t));
    setResults((prev) => ({ ...prev, [t]: { ok: models.length > 0, models } }));
    setTesting(null);
  };

  const testAll = async () => {
    setTesting("all");
    const targets: Target[] = ["alpha", "beta", "judge"];
    const found = await Promise.all(targets.map((t) => listModels(endpointOf(t))));
    setResults({
      alpha: { ok: found[0].length > 0, models: found[0] },
      beta: { ok: found[1].length > 0, models: found[1] },
      judge: { ok: found[2].length > 0, models: found[2] },
    });
    setTesting(null);
  };

  const applyAlphaToAll = () => {
    const endpoint = settings.alpha.endpoint;
    onChange({
      beta: { ...settings.beta, endpoint },
      judge: { ...settings.judge, endpoint },
    });
    setResults({ alpha: results.alpha, beta: null, judge: null });
  };

  return (
    <section className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-2 text-xs tracking-[0.14em] uppercase">
          <PlugZap className="size-4 text-primary" />
          Ollama endpoints
        </Label>
        <Button variant="outline" size="sm" onClick={() => void testAll()} disabled={!!testing}>
          {testing === "all" ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Test all
        </Button>
      </div>

      {(["alpha", "beta", "judge"] as Target[]).map((t) => {
        const result = results[t];
        return (
          <div key={t} className="space-y-2">
            <Label className={cn("text-[11px] tracking-[0.14em] uppercase", ACCENTS[t])}>
              {LABELS[t]}
            </Label>
            <div className="flex gap-2">
              <Input
                value={endpointOf(t)}
                onChange={(e) => setEndpoint(t, e.target.value)}
                placeholder="http://localhost:11434/api/chat"
                className="font-mono text-sm"
                spellCheck={false}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => void test(t)}
                disabled={!!testing}
                title="Test connection"
              >
                {testing === t ? <Loader2 className="size-3.5 animate-spin" /> : "Test"}
              </Button>
            </div>
            {result && (
              <p
                className={cn(
                  "flex items-center gap-1.5 font-mono text-[11px]",
                  result.ok ? "text-accent" : "text-destructive",
                )}
              >
                {result.ok ? (
                  <CheckCircle2 className="size-3.5" />
                ) : (
                  <XCircle className="size-3.5" />
                )}
                {result.ok
                  ? `Reachable · ${result.models.length} model${result.models.length === 1 ? "" : "s"} installed`
                  : "Unreachable — check the URL and OLLAMA_ORIGINS"}
              </p>
            )}
          </div>
        );
      })}

      <Button variant="ghost" size="sm" className="w-full" onClick={applyAlphaToAll}>
        Use Alpha&apos;s endpoint for Beta and Judge
      </Button>
    </section>
  );
}
