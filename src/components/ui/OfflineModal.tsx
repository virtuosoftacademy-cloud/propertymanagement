"use client";

/**
 * PropertyPro - Offline Modal
 * Watches the browser's connectivity and shows a blocking modal whenever the
 * internet is unavailable. Recovers automatically once the connection returns.
 *
 * Usage: mount once, high in the tree (e.g. dashboard or root layout):
 *   <OfflineModal />
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { WifiOff, RefreshCw, Loader2 } from "lucide-react";
import { Alert } from "./alert";
import { AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./alert-dialog";
import { Button } from "./button";

interface OfflineModalProps {
  /**
   * Endpoint hit to confirm real connectivity. Any HTTP response (even 404)
   * counts as "online" — only a network failure/timeout means offline. Use a
   * lightweight route; defaults to the app root.
   */
  pingUrl?: string;
  /** How often to re-check while offline (ms). */
  recheckIntervalMs?: number;
}

export function OfflineModal({
  pingUrl = "/",
  recheckIntervalMs = 8000,
}: OfflineModalProps) {
  // Assume online for the first paint so the modal never flashes during SSR /
  // hydration; the mount effect corrects this immediately on the client.
  const [online, setOnline] = useState(true);
  const [checking, setChecking] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const verifyConnection = useCallback(async () => {
    // navigator.onLine === false is a definitive "no network".
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setOnline(false);
      return false;
    }

    // navigator.onLine === true can still lie (connected to a router with no
    // internet), so confirm with a tiny no-cache request.
    setChecking(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      await fetch(pingUrl, {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal,
      });
      setOnline(true);
      return true;
    } catch {
      setOnline(false);
      return false;
    } finally {
      clearTimeout(timeout);
      setChecking(false);
    }
  }, [pingUrl]);

  useEffect(() => {
    // Sync the real state on mount (client only).
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);

    const handleOnline = () => void verifyConnection();
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [verifyConnection]);

  // While offline, keep probing so we recover even if the "online" event
  // doesn't fire reliably.
  useEffect(() => {
    if (online) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      void verifyConnection();
    }, recheckIntervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [online, recheckIntervalMs, verifyConnection]);

  return (
    <Alert open={!online}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <WifiOff className="h-7 w-7 text-destructive" />
          </div>
          <AlertDialogTitle>You&apos;re offline</AlertDialogTitle>
          <AlertDialogDescription>
            We can&apos;t reach the internet right now. Check your connection —
            this will close automatically once you&apos;re back online.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-center">
          <Button
            type="button"
            onClick={() => void verifyConnection()}
            disabled={checking}
            className="flex items-center gap-2"
          >
            {checking ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Try again
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </Alert>
  );
}

export default OfflineModal;