import { useQuery } from "@tanstack/react-query";
import { useAppContext } from "@/context/app-context";
import { Bell, ChevronDown, Users } from "lucide-react";
import GroupSwitcherModal from "./group-switcher-modal";
import { useState } from "react";
import { googleApi } from "@/lib/drive";

export default function Header() {
  const { activeGroupId } = useAppContext();
  const [showGroupSwitcher, setShowGroupSwitcher] = useState(false);

  // 1. Fetch list to get the Group Name (metadata)
  const { data: groups = [] } = useQuery({
    queryKey: ["drive", "groups"],
    queryFn: () => googleApi.listGroups(),
  });

  // 2. Fetch group data to get Participant Count (sheet content)
  const { data: groupData } = useQuery({
    queryKey: ["drive", "group", activeGroupId],
    queryFn: () => googleApi.getGroupData(activeGroupId),
    enabled: !!activeGroupId,
  });

  const activeGroup = groups.find((g: any) => g.id === activeGroupId);
  const memberCount = groupData?.members?.length || 0;

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
                  {activeGroup?.name || "Select Group"}
                </h1>
                <div className="flex items-center text-sm text-muted-foreground">
                  <span data-testid="text-participant-count">
                    {memberCount} people
                  </span>
                  <ChevronDown className="ml-1 w-3 h-3" />
                </div>
              </button>
            </div>
          </div>
          <button className="w-8 h-8 rounded-full bg-muted flex items-center justify-center" data-testid="button-notifications">
            <Bell className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </header>

      <GroupSwitcherModal 
        isOpen={showGroupSwitcher} 
        onClose={() => setShowGroupSwitcher(false)} 
      />
    </>
  );
}
