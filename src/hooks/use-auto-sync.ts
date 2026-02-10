import { useContext } from "react";
import { AutoSyncContext } from "@/context/auto-sync-context";

export const useAutoSync = () => {
    const context = useContext(AutoSyncContext);
    if (!context) {
        throw new Error("useAutoSync must be used within AutoSyncProvider");
    }
    return context;
};
