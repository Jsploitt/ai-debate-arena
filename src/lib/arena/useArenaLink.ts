import { useCallback, useEffect, useRef, useState } from "react";
import {
  openArenaLink,
  SNAPSHOT_STALE_MS,
  SNAPSHOT_THROTTLE_MS,
  type ArenaCommand,
  type ArenaLink,
  type ArenaSnapshot,
} from "./channel";

/**
 * Public-display side of the link: broadcasts snapshots and executes commands
 * arriving from the control window.
 */
export function useArenaHost(
  snapshot: ArenaSnapshot,
  onCommand: (command: ArenaCommand) => void,
) {
  const linkRef = useRef<ArenaLink | null>(null);
  const snapshotRef = useRef(snapshot);
  const pendingRef = useRef(false);
  const commandRef = useRef(onCommand);

  snapshotRef.current = snapshot;
  commandRef.current = onCommand;

  useEffect(() => {
    const link = openArenaLink((message) => {
      if (message.type === "command") {
        commandRef.current(message.command);
      } else if (message.type === "requestSnapshot") {
        link.post({ type: "snapshot", snapshot: snapshotRef.current });
      }
    });
    linkRef.current = link;
    link.post({ type: "snapshot", snapshot: snapshotRef.current });

    const onUnload = () => link.post({ type: "displayGone" });
    window.addEventListener("pagehide", onUnload);
    return () => {
      onUnload();
      window.removeEventListener("pagehide", onUnload);
      link.close();
      linkRef.current = null;
    };
  }, []);

  // Throttle: token streaming updates state many times a second, and the
  // control view does not need every frame of it.
  useEffect(() => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    const timer = window.setTimeout(() => {
      pendingRef.current = false;
      linkRef.current?.post({ type: "snapshot", snapshot: snapshotRef.current });
    }, SNAPSHOT_THROTTLE_MS);
    return () => {
      window.clearTimeout(timer);
      pendingRef.current = false;
    };
  }, [snapshot]);

  // A steady heartbeat so the control view can tell "idle" from "gone".
  useEffect(() => {
    const timer = window.setInterval(() => {
      linkRef.current?.post({ type: "snapshot", snapshot: snapshotRef.current });
    }, 1500);
    return () => window.clearInterval(timer);
  }, []);
}

/**
 * Staff control side of the link: mirrors the display's snapshot and sends
 * commands. Holds no debate engine of its own.
 */
export function useArenaRemote() {
  const linkRef = useRef<ArenaLink | null>(null);
  const [snapshot, setSnapshot] = useState<ArenaSnapshot | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const link = openArenaLink((message) => {
      if (message.type === "snapshot") {
        setSnapshot(message.snapshot);
        setConnected(true);
      } else if (message.type === "displayGone") {
        setConnected(false);
      }
    });
    linkRef.current = link;
    link.post({ type: "requestSnapshot" });

    // Re-ask periodically so opening the control view first still resolves once
    // the display comes up.
    const poll = window.setInterval(() => {
      link.post({ type: "requestSnapshot" });
    }, 2000);

    return () => {
      window.clearInterval(poll);
      link.close();
      linkRef.current = null;
    };
  }, []);

  // Connection is snapshot freshness, not a handshake — a display that froze
  // stops being "connected" without having to announce it.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setConnected(Boolean(snapshot) && Date.now() - (snapshot?.ts ?? 0) < SNAPSHOT_STALE_MS);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [snapshot]);

  const send = useCallback((command: ArenaCommand) => {
    linkRef.current?.post({ type: "command", command });
  }, []);

  return { snapshot, connected, send };
}
