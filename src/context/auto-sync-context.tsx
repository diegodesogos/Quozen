import React, { createContext, useEffect, useState, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { googleApi } from "@/lib/drive";
import { useAppContext } from "./app-context";

interface AutoSyncContextType {
    isPaused: boolean;
    setPaused: (paused: boolean) => void;
    isEnabled: boolean;
    lastSyncTime: Date | null;
    triggerSync: () => Promise<void>;
}

// Export Context so the hook can use it
export const AutoSyncContext = createContext<AutoSyncContextType | undefined>(undefined);

const UNSAFE_ROUTES = ["/add-expense", "/edit-expense", "/join"];
const DEFAULT_POLLING_INTERVAL = Number(import.meta.env.VITE_POLLING_INTERVAL || 30);

export function AutoSyncProvider({
    children,
    pollingInterval = DEFAULT_POLLING_INTERVAL
}: {
    children: React.ReactNode;
    pollingInterval?: number;
}) {
    const { activeGroupId } = useAppContext();
    const queryClient = useQueryClient();
    const location = useLocation();

    const [manualPaused, setManualPaused] = useState(false);
    const [routePaused, setRoutePaused] = useState(false);
    const [pageHidden, setPageHidden] = useState(document.hidden);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

    const lastKnownRemoteTimeRef = useRef<string | null>(null);
    const isEnabled = pollingInterval > 0;

    const isPaused = manualPaused || routePaused || pageHidden || !activeGroupId;

    useEffect(() => {
        // Changed log level to debug to reduce noise during rapid testing/mounting
        if (isEnabled) {
            console.debug(`[AutoSync] Initialized. Interval: ${pollingInterval}s`);
        } else {
            console.debug("[AutoSync] Disabled (Interval is 0).");
        }
    }, [isEnabled, pollingInterval]);

    // 1. Route Guard
    useEffect(() => {
        const isUnsafe = UNSAFE_ROUTES.some(route => location.pathname.startsWith(route));
        setRoutePaused(isUnsafe);
    }, [location.pathname]);

    // 2. Visibility Guard
    useEffect(() => {
        const handleVisibilityChange = () => setPageHidden(document.hidden);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    }, []);

    // Core Sync Logic
    const checkUpdates = useCallback(async () => {
        if (!activeGroupId || !isEnabled) return;

        try {
            // Fetch metadata only
            const remoteTimeStr = await googleApi.getLastModified(activeGroupId);

            if (!lastKnownRemoteTimeRef.current) {
                // First check, initialize
                lastKnownRemoteTimeRef.current = remoteTimeStr;
            } else if (new Date(remoteTimeStr).getTime() > new Date(lastKnownRemoteTimeRef.current).getTime()) {
                // Remote is newer -> Invalidate
                await queryClient.invalidateQueries({ queryKey: ["drive", "group", activeGroupId] });
                lastKnownRemoteTimeRef.current = remoteTimeStr;
                setLastSyncTime(new Date());
            }
        } catch (e) {
            console.error("[AutoSync] Polling failed (silent):", e);
        }
    }, [activeGroupId, isEnabled, queryClient]);

    // 3. Polling Loop & Immediate Resume
    useEffect(() => {
        if (isPaused || !isEnabled) return;

        // Perform an immediate check on mount/resume to catch updates while we were away/paused
        checkUpdates();

        const intervalId = setInterval(checkUpdates, pollingInterval * 1000);

        return () => clearInterval(intervalId);
    }, [isPaused, isEnabled, checkUpdates, pollingInterval]);

    // Reset ref when switching groups
    useEffect(() => {
        lastKnownRemoteTimeRef.current = null;
    }, [activeGroupId]);

    return (
        <AutoSyncContext.Provider value={{
            isPaused,
            setPaused: setManualPaused,
            isEnabled,
            lastSyncTime,
            triggerSync: checkUpdates
        }}>
            {children}
        </AutoSyncContext.Provider>
    );
}
