import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "@/context/app-context";
import { Bell, ChevronDown, Users, RefreshCw } from "lucide-react";
import GroupSwitcherModal from "./group-switcher-modal";
import { useState } from "react";
import { googleApi } from "@/lib/drive";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useGroups } from "@/hooks/use-groups";
import { useTranslation } from "react-i18next";

export default function Header() {
  const { activeGroupId } = useAppContext();
  const [showGroupSwitcher, setShowGroupSwitcher] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  // 1. Fetch group list via hook
  const { groups, isLoading: isGroupsLoading } = useGroups();

  // 2. Fetch active group data (content)
  const { data: groupData, isFetching: isDataFetching } = useQuery({
    queryKey: ["drive", "group", activeGroupId],
    queryFn: () => googleApi.getGroupData(activeGroupId),
    enabled: !!activeGroupId,
  });

  const activeGroup = groups.find((g) => g.id === activeGroupId);
  const memberCount = groupData?.members?.length || 0;

  const isSyncing = isGroupsLoading || isDataFetching;

  const handleRefresh = async () => {
    if (!activeGroupId) return;

    // US-106: Only invalidate the active group data
    await queryClient.invalidateQueries({ queryKey: ["drive", "group", activeGroupId] });

    toast({ description: t("header.synced") });
  };

  return (
    <>
      <header className="bg-card border-b border-border px-4 py-3 sticky top-0 z-40" data-testid="header">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <Users className="text-primary-foreground w-4 h-4" />
            </div>
            <div>
              <button
                onClick={() => setShowGroupSwitcher(true)}
                className="text-left"
                data-testid="button-switch-group"
              >
                <h1 className="text-lg font-semibold text-foreground">
                  {activeGroup?.name || t("header.selectGroup")}
                </h1>
                <div className="flex items-center text-sm text-muted-foreground">
                  <span data-testid="text-participant-count">
                    {t("header.people", { count: memberCount })}
                  </span>
                  <ChevronDown className="ml-1 w-3 h-3" />
                </div>
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-50"
              onClick={handleRefresh}
              disabled={isSyncing}
              title="Sync current group"
              data-testid="button-refresh"
            >
              <RefreshCw className={cn(
                "w-4 h-4 text-muted-foreground",
                isSyncing && "animate-spin text-primary"
              )} />
            </button>

            <button className="w-8 h-8 rounded-full bg-muted flex items-center justify-center" data-testid="button-notifications">
              <Bell className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </header>

      <GroupSwitcherModal
        isOpen={showGroupSwitcher}
        onClose={() => setShowGroupSwitcher(false)}
      />
    </>
  );
}
