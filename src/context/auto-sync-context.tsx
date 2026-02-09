import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { googleApi } from "@/lib/drive";
import { useAppContext } from "./app-context";

interface AutoSyncContextType {
    isPaused: boolean;
    setPaused: (paused: boolean) => void;
    isEnabled: boolean;
    lastSyncTime: Date | null;
}

const AutoSyncContext = createContext<AutoSyncContextType | undefined>(undefined);

const UNSAFE_ROUTES = ["/add-expense", "/edit-expense", "/join"];
const POLLING_INTERVAL_SEC = Number(import.meta.env.VITE_POLLING_INTERVAL || 30);

export function AutoSyncProvider({ children }: { children: React.ReactNode }) {
    const { activeGroupId } = useAppContext();
    const queryClient = useQueryClient();
    const location = useLocation();

    const [manualPaused, setManualPaused] = useState(false);
    const [routePaused, setRoutePaused] = useState(false);
    const [pageHidden, setPageHidden] = useState(document.hidden);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

    const lastKnownRemoteTimeRef = useRef<string | null>(null);
    const isEnabled = POLLING_INTERVAL_SEC > 0;

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

    // 3. Polling Logic
    useEffect(() => {
        if (!isEnabled) return;
        if (manualPaused || routePaused || pageHidden || !activeGroupId) return;

        const checkUpdates = async () => {
            try {
                // Fetch metadata only
                const remoteTimeStr = await googleApi.getLastModified(activeGroupId);

                if (!lastKnownRemoteTimeRef.current) {
                    // First check, initialize
                    lastKnownRemoteTimeRef.current = remoteTimeStr;
                } else if (new Date(remoteTimeStr).getTime() > new Date(lastKnownRemoteTimeRef.current).getTime()) {
                    // Remote is newer -> Invalidate
                    console.log("[AutoSync] Remote change detected. Invalidating queries.");
                    await queryClient.invalidateQueries({ queryKey: ["drive", "group", activeGroupId] });
                    lastKnownRemoteTimeRef.current = remoteTimeStr;
                    setLastSyncTime(new Date());
                }
            } catch (e) {
                console.error("[AutoSync] Polling failed (silent):", e);
            }
        };

        // Immediate check on resume? Maybe not to avoid spam.
        // Just start interval.
        const intervalId = setInterval(checkUpdates, POLLING_INTERVAL_SEC * 1000);

        return () => clearInterval(intervalId);
    }, [
        isEnabled,
        manualPaused,
        routePaused,
        pageHidden,
        activeGroupId,
        queryClient
    ]);

    // Reset ref when switching groups
    useEffect(() => {
        lastKnownRemoteTimeRef.current = null;
    }, [activeGroupId]);

    return (
        <AutoSyncContext.Provider value= {{
        isPaused: manualPaused || routePaused || pageHidden,
            setPaused: setManualPaused,
                isEnabled,
                lastSyncTime
    }
}>
    { children }
    </AutoSyncContext.Provider>
  );
}

export const useAutoSync = () => {
    const context = useContext(AutoSyncContext);
    if (!context) {
        throw new Error("useAutoSync must be used within AutoSyncProvider");
    }
    return context;
};
