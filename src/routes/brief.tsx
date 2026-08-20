/**
 * Phone view of a winner's brief.
 *
 * Reached by scanning the QR code on the stage. The whole document travels in
 * the URL fragment (see `lib/verdict/payload.ts`), so this route needs no
 * server state and works from any device that can reach the app.
 *
 * Decoding is client-only: a fragment is never sent to the server, and
 * `CompressionStream` does not exist during SSR.
 */

import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { renderBrief } from "@/lib/verdict/brief";
import { decodeBriefPayload } from "@/lib/verdict/payload";

export const Route = createFileRoute("/brief")({
  head: () => ({ meta: [{ title: "Executive Brief — AI Debate Arena" }] }),
  component: BriefPage,
});

type State = { status: "loading" | "empty" | "ready"; html: string };

function BriefPage() {
  const [state, setState] = useState<State>({ status: "loading", html: "" });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const encoded = window.location.hash.slice(1);
      if (!encoded) {
        if (!cancelled) setState({ status: "empty", html: "" });
        return;
      }
      const payload = await decodeBriefPayload(encoded);
      if (cancelled) return;
      if (!payload) {
        setState({ status: "empty", html: "" });
        return;
      }
      setState({ status: "ready", html: renderBrief(payload.facts, payload.fields) });
    };

    void load();
    window.addEventListener("hashchange", load);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", load);
    };
  }, []);

  if (state.status === "ready") {
    return (
      <main className="h-screen w-screen">
        <h1 className="sr-only">Executive brief</h1>
        <iframe
          title="Executive brief"
          srcDoc={state.html}
          sandbox=""
          className="h-full w-full border-0"
        />
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-display text-2xl font-bold">
        {state.status === "loading" ? "Opening the brief…" : "No brief in this link"}
      </h1>
      {state.status === "empty" && (
        <p className="max-w-md text-muted-foreground">
          The link is missing its data, or it was truncated in transit. Scan the code on the stage
          again.
        </p>
      )}
    </main>
  );
}
