"use client";

import { useEffect } from "react";

const ACTIVITY_STORAGE_KEY = "fundedfence:last-activity";
const SERVER_TOUCH_INTERVAL_MS = 60_000;
const STORAGE_WRITE_INTERVAL_MS = 5_000;

export function SessionActivityGuard({ idleTimeoutSeconds }: { idleTimeoutSeconds: number }) {
  useEffect(() => {
    const idleTimeoutMs = idleTimeoutSeconds * 1000;
    let lastActivityAt = Date.now();
    let lastServerTouchAt = 0;
    let lastStorageWriteAt = 0;
    let signedOut = false;
    let touchInFlight = false;

    function signOutForIdle() {
      if (signedOut) return;
      signedOut = true;
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      void fetch("/api/auth/logout", { method: "POST", keepalive: true }).finally(() => {
        window.location.assign(`/login?reason=idle&return_to=${encodeURIComponent(returnTo)}`);
      });
    }

    async function touchServer(force = false) {
      const now = Date.now();
      if (signedOut || touchInFlight || (!force && now - lastServerTouchAt < SERVER_TOUCH_INTERVAL_MS)) return;
      touchInFlight = true;
      try {
        const response = await fetch("/api/auth/session", { method: "POST", cache: "no-store" });
        if (response.status === 401) signOutForIdle();
        else if (response.ok) lastServerTouchAt = now;
      } catch {
        // A temporary network failure must not destroy a valid local session.
        // The next activity or visibility change retries the signed heartbeat.
      } finally {
        touchInFlight = false;
      }
    }

    function recordActivity() {
      if (signedOut) return;
      const now = Date.now();
      lastActivityAt = now;
      if (now - lastStorageWriteAt >= STORAGE_WRITE_INTERVAL_MS) {
        lastStorageWriteAt = now;
        try { window.localStorage.setItem(ACTIVITY_STORAGE_KEY, String(now)); } catch { /* storage may be disabled */ }
      }
      void touchServer();
    }

    function receiveOtherTabActivity(event: StorageEvent) {
      if (event.key !== ACTIVITY_STORAGE_KEY || !event.newValue) return;
      const sharedActivityAt = Number(event.newValue);
      if (Number.isFinite(sharedActivityAt)) lastActivityAt = Math.max(lastActivityAt, sharedActivityAt);
    }

    function checkIdle() {
      if (Date.now() - lastActivityAt >= idleTimeoutMs) signOutForIdle();
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        checkIdle();
        if (!signedOut) recordActivity();
      }
    }

    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart", "scroll"];
    for (const event of events) window.addEventListener(event, recordActivity, { passive: true });
    window.addEventListener("storage", receiveOtherTabActivity);
    document.addEventListener("visibilitychange", handleVisibility);
    const idleCheck = window.setInterval(checkIdle, 15_000);
    recordActivity();
    void touchServer(true);

    return () => {
      for (const event of events) window.removeEventListener(event, recordActivity);
      window.removeEventListener("storage", receiveOtherTabActivity);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(idleCheck);
    };
  }, [idleTimeoutSeconds]);

  return null;
}
