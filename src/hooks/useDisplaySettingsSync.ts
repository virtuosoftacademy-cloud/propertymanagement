/**
 * PropertyPro - Real-time Display Settings Sync Hook
 * Synchronizes display settings across browser tabs/windows
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";

interface DisplaySettings {
  theme: "light" | "dark" | "system";
  language: string;
  timezone: string;
  dateFormat: "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD" | "DD-MM-YYYY";
  timeFormat: "12h" | "24h";
  currency: string;
  compactMode: boolean;
  sidebarCollapsed: boolean;
  showAvatars: boolean;
  animationsEnabled: boolean;
  highContrast: boolean;
  fontSize: "small" | "medium" | "large";
  density: "comfortable" | "compact" | "spacious";
  colorScheme: {
    primary: string;
    secondary: string;
    accent: string;
  };
  dashboardLayout: "grid" | "list" | "cards";
  itemsPerPage: number;
  branding: {
    logoLight: string;
    logoDark: string;
    favicon: string;
    primaryColor: string;
    secondaryColor: string;
    r2?: {
      logoLight?: {
        objectKey?: string;
        format?: string;
        width?: number;
        height?: number;
        bytes?: number;
        optimizedUrls?: Record<string, string>;
      };
      logoDark?: {
        objectKey?: string;
        format?: string;
        width?: number;
        height?: number;
        bytes?: number;
        optimizedUrls?: Record<string, string>;
      };
      favicon?: {
        objectKey?: string;
        format?: string;
        width?: number;
        height?: number;
        bytes?: number;
        optimizedUrls?: Record<string, string>;
      };
    };
  };
}

interface SyncState {
  isOnline: boolean;
  lastSync: Date | null;
  syncError: string | null;
  conflictResolution: "local" | "remote" | "manual" | null;
  hasConflict: boolean;
}

interface UseDisplaySettingsSyncOptions {
  pollInterval?: number; // in milliseconds
  enableConflictDetection?: boolean;
  autoResolveConflicts?: boolean;
  onSettingsChange?: (settings: DisplaySettings) => void;
  onConflict?: (
    localSettings: DisplaySettings,
    remoteSettings: DisplaySettings
  ) => void;
  onSyncError?: (error: string) => void;
}

export function useDisplaySettingsSync(
  options: UseDisplaySettingsSyncOptions = {}
) {
  const {
    pollInterval = 30000, // 30 seconds
    enableConflictDetection = true,
    autoResolveConflicts = true,
    onSettingsChange,
    onConflict,
    onSyncError,
  } = options;

  const { data: session } = useSession();
  const [settings, setSettings] = useState<DisplaySettings | null>(null);
  const [syncState, setSyncState] = useState<SyncState>({
    isOnline: navigator.onLine,
    lastSync: null,
    syncError: null,
    conflictResolution: null,
    hasConflict: false,
  });

  const lastKnownVersion = useRef<number>(0);
  const localChanges = useRef<Partial<DisplaySettings>>({});
  const pollTimeoutRef = useRef<NodeJS.Timeout>();
  const initialSyncDoneRef = useRef(false);
  const isPollingRef = useRef(false);
  const settingsRef = useRef<DisplaySettings | null>(null);

  // Keep settingsRef in sync with settings state
  settingsRef.current = settings;

  // Fetch settings from server
  const fetchSettings = useCallback(async () => {
    if (!session?.user?.id || isPollingRef.current) return null;

    try {
      isPollingRef.current = true;
      const response = await fetch(
        "/api/settings/display?includeDefaults=false",
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const raw = await response.json();
      // Normalize common API response shapes: { success, data: { settings, metadata } } or direct
      const payload: any = raw?.data ?? raw;

      setSyncState((prev) => ({
        ...prev,
        lastSync: new Date(),
        syncError: null,
      }));

      return {
        settings:
          payload?.settings ?? payload?.display ?? payload?.data ?? payload,
        version: payload?.metadata?.version || 1,
        lastUpdated: new Date(
          (payload?.metadata?.lastUpdated as string) || Date.now()
        ),
      } as any;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to fetch settings";
      setSyncState((prev) => ({
        ...prev,
        syncError: errorMessage,
      }));
      onSyncError?.(errorMessage);
      return null;
    } finally {
      isPollingRef.current = false;
    }
  }, [session?.user?.id, onSyncError]);

  // Detect conflicts between local and remote settings
  const detectConflict = useCallback(
    (
      localSettings: DisplaySettings,
      remoteSettings: DisplaySettings,
      remoteVersion: number
    ) => {
      if (!enableConflictDetection) return false;

      // Check if there are local changes and remote version is newer
      const hasLocalChanges = Object.keys(localChanges.current).length > 0;
      const remoteIsNewer = remoteVersion > lastKnownVersion.current;

      if (hasLocalChanges && remoteIsNewer) {
        // Deep compare to see if there are actual conflicts
        const conflictingFields = Object.keys(localChanges.current).filter(
          (key) => {
            const localValue = JSON.stringify(
              localSettings[key as keyof DisplaySettings]
            );
            const remoteValue = JSON.stringify(
              remoteSettings[key as keyof DisplaySettings]
            );
            return localValue !== remoteValue;
          }
        );

        return conflictingFields.length > 0;
      }

      return false;
    },
    [enableConflictDetection]
  );

  // Resolve conflicts automatically or manually
  const resolveConflict = useCallback(
    (
      localSettings: DisplaySettings,
      remoteSettings: DisplaySettings,
      strategy: "local" | "remote" | "manual" = "remote"
    ) => {
      switch (strategy) {
        case "local":
          // Keep local changes, update version
          lastKnownVersion.current = lastKnownVersion.current + 1;
          return localSettings;

        case "remote":
          // Accept remote changes, clear local changes
          localChanges.current = {};
          return remoteSettings;

        case "manual":
          // Let user decide - trigger conflict callback
          onConflict?.(localSettings, remoteSettings);
          return localSettings; // Keep local until user decides

        default:
          return remoteSettings;
      }
    },
    [onConflict]
  );

  // Sync settings with server - use ref to avoid dependency on settings state
  const syncSettings = useCallback(async () => {
    if (!session?.user?.id) return;

    const result = await fetchSettings();
    if (!result) return;

    const { settings: remoteSettings, version: remoteVersion } = result;
    const currentSettings = settingsRef.current;

    if (!currentSettings) {
      // First load
      setSettings(remoteSettings);
      lastKnownVersion.current = remoteVersion;
      onSettingsChange?.(remoteSettings);
      return;
    }

    // Check for conflicts
    const hasConflict = detectConflict(
      currentSettings,
      remoteSettings,
      remoteVersion
    );

    if (hasConflict) {
      setSyncState((prev) => ({ ...prev, hasConflict: true }));

      if (autoResolveConflicts) {
        const resolvedSettings = resolveConflict(
          currentSettings,
          remoteSettings,
          "remote"
        );
        setSettings(resolvedSettings);
        lastKnownVersion.current = remoteVersion;
        onSettingsChange?.(resolvedSettings);
        setSyncState((prev) => ({
          ...prev,
          hasConflict: false,
          conflictResolution: "remote",
        }));
      }
    } else {
      // No conflict, update settings
      setSettings(remoteSettings);
      lastKnownVersion.current = remoteVersion;
      onSettingsChange?.(remoteSettings);
      localChanges.current = {};
    }
  }, [
    session?.user?.id,
    fetchSettings,
    detectConflict,
    resolveConflict,
    autoResolveConflicts,
    onSettingsChange,
  ]);

  // Update local settings and track changes
  const updateLocalSettings = useCallback(
    (newSettings: Partial<DisplaySettings>) => {
      if (!settings) return;

      const updatedSettings = { ...settings, ...newSettings };
      setSettings(updatedSettings);

      // Track local changes
      Object.keys(newSettings).forEach((key) => {
        localChanges.current[key as keyof DisplaySettings] =
          newSettings[key as keyof DisplaySettings];
      });

      onSettingsChange?.(updatedSettings);
    },
    [settings, onSettingsChange]
  );

  // Manual conflict resolution
  const resolveConflictManually = useCallback(
    (strategy: "local" | "remote") => {
      if (!settings || !syncState.hasConflict) return;

      fetchSettings().then((result) => {
        if (!result) return;

        const resolvedSettings = resolveConflict(
          settings,
          result.settings,
          strategy
        );
        setSettings(resolvedSettings);
        lastKnownVersion.current = result.version;
        setSyncState((prev) => ({
          ...prev,
          hasConflict: false,
          conflictResolution: strategy,
        }));
        onSettingsChange?.(resolvedSettings);
      });
    },
    [
      settings,
      syncState.hasConflict,
      fetchSettings,
      resolveConflict,
      onSettingsChange,
    ]
  );

  // Handle online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setSyncState((prev) => ({ ...prev, isOnline: true }));
      syncSettings(); // Sync when coming back online
    };

    const handleOffline = () => {
      setSyncState((prev) => ({ ...prev, isOnline: false }));
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncSettings]);

  // Keep a ref to syncSettings to avoid dependency issues
  const syncSettingsRef = useRef(syncSettings);
  syncSettingsRef.current = syncSettings;

  // Set up polling - stable dependencies only
  useEffect(() => {
    if (!session?.user?.id || !syncState.isOnline) return;

    // Run the initial sync once per mount/online session
    if (!initialSyncDoneRef.current) {
      initialSyncDoneRef.current = true;
      syncSettingsRef.current();
    }

    // Avoid creating multiple polling timers if dependencies change
    if (pollTimeoutRef.current) {
      return;
    }

    // Set up polling interval using setInterval instead of recursive setTimeout
    pollTimeoutRef.current = setInterval(() => {
      syncSettingsRef.current();
    }, pollInterval);

    return () => {
      if (pollTimeoutRef.current) {
        clearInterval(pollTimeoutRef.current);
        pollTimeoutRef.current = undefined;
      }
      // Don't reset initialSyncDoneRef here - it causes re-fetching on every cleanup
    };
  }, [session?.user?.id, syncState.isOnline, pollInterval]);

  // Handle visibility change (sync when tab becomes visible)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && syncState.isOnline) {
        syncSettings();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [syncSettings, syncState.isOnline]);

  return {
    settings,
    syncState,
    updateLocalSettings,
    syncSettings,
    resolveConflictManually,
    hasUnsavedChanges: Object.keys(localChanges.current).length > 0,
  };
}
