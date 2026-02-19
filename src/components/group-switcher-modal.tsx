import { useAppContext } from "@/context/app-context";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerFooter } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Users, Check, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useGroups } from "@/hooks/use-groups";
import { useTranslation } from "react-i18next";
import { useAutoSync } from "@/hooks/use-auto-sync";
import { useEffect } from "react";

export default function GroupSwitcherModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { activeGroupId, setActiveGroupId } = useAppContext();
  const navigate = useNavigate();
  const { groups } = useGroups();
  const { t } = useTranslation();
  const { setPaused } = useAutoSync();

  useEffect(() => {
    if (isOpen) setPaused(true);
    return () => setPaused(false);
  }, [isOpen, setPaused]);

  const handleSelectGroup = (groupId: string) => {
    setActiveGroupId(groupId);
    onClose();
  };

  const handleManageClick = () => {
    onClose();
    navigate("/groups");
  };

  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="text-center">{t("groups.switchModalTitle")}</DrawerTitle>
          <DrawerDescription className="text-center">{t("groups.switchModalDesc")}</DrawerDescription>
        </DrawerHeader>

        {/* Scrollable List */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="space-y-3">
            {groups.map((group) => (
              <button
                key={group.id}
                onClick={() => handleSelectGroup(group.id)}
                className="w-full p-4 bg-secondary/50 rounded-xl text-left hover:bg-accent transition-colors border border-transparent hover:border-border active:scale-[0.98] duration-200"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center border border-border shrink-0">
                    <Users className="w-6 h-6 text-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-foreground text-sm truncate">{group.name}</h4>
                    <p className="text-xs text-muted-foreground truncate">
                      {group.isOwner ? t("roles.owner") : t("roles.member")}
                    </p>
                  </div>
                  {group.id === activeGroupId && (
                    <div className="bg-primary/20 p-1.5 rounded-full">
                      <Check className="w-4 h-4 text-primary" />
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Sticky Footer */}
        <DrawerFooter className="border-t bg-background">
          <Button onClick={handleManageClick} variant="outline" className="w-full h-12 text-muted-foreground hover:text-foreground">
            <Settings className="w-4 h-4 mr-2" />
            {t("groups.manage")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
