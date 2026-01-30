import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "@/context/app-context";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Users, Check, Plus, Download, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { googleApi, Group } from "@/lib/drive";
import { useGooglePicker } from "@/hooks/use-google-picker";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSettings } from "@/hooks/use-settings";

export default function GroupSwitcherModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { activeGroupId, setActiveGroupId } = useAppContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings, updateSettings } = useSettings();

  // Fetch groups from Drive
  const { data: groups = [] } = useQuery<Group[]>({
    queryKey: ["drive", "groups", user?.email],
    queryFn: () => googleApi.listGroups(user?.email),
    enabled: !!user?.email
  });

  const handleSelectGroup = (groupId: string) => {
    setActiveGroupId(groupId);
    onClose();
  };

  const handleCreateNewGroup = () => {
    onClose();
    navigate("/groups");
  };

  // Google Picker Hook
  const { openPicker, error: pickerError } = useGooglePicker({
    onPick: async (doc) => {
      // 1. Show loading toast
      toast({ title: "Validating group..." });

      if (!user?.email) {
        toast({ title: "Error", description: "User email not found", variant: "destructive" });
        return;
      }

      // 2. Validate the picked file
      const result = await googleApi.validateQuozenSpreadsheet(doc.id, user.email);

      if (result.valid) {
        // 3. Update Settings Cache
        if (settings) {
          // Check if already in cache
          if (!settings.groupCache.some(g => g.id === doc.id)) {
            const newCache = [...settings.groupCache];
            newCache.unshift({
              id: doc.id,
              name: result.name || doc.name,
              role: "member", // Assume member for imported sheets unless validated otherwise
              lastAccessed: new Date().toISOString()
            });
            
            updateSettings({
              ...settings,
              groupCache: newCache,
              activeGroupId: doc.id
            });
          }
        }

        // 4. Invalidate queries
        await queryClient.invalidateQueries({ queryKey: ["drive", "groups"] });

        setActiveGroupId(doc.id);
        toast({ title: "Group imported successfully!" });
        onClose();
      } else {
        toast({
          title: "Invalid Group File",
          description: result.error,
          variant: "destructive"
        });
      }
    }
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" data-testid="modal-group-switcher">
        <DialogHeader>
          <DialogTitle className="text-center">Switch Group</DialogTitle>
          <DialogDescription>
            Select a group to view or create a new one.
          </DialogDescription>
        </DialogHeader>

        {pickerError && (
          <Alert variant="destructive" className="mb-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{pickerError}. Make sure VITE_GOOGLE_PICKER_API_KEY is set.</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3 max-h-96 overflow-y-auto">
          {groups.map((group) => (
            <button
              key={group.id}
              onClick={() => handleSelectGroup(group.id)}
              className="w-full p-4 bg-secondary rounded-lg text-left hover:bg-accent transition-colors"
              data-testid={`button-select-group-${group.id}`}
            >
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
                  <Users className="w-6 h-6 text-primary-foreground" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-foreground">{group.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    Google Sheet
                  </p>
                </div>
                {group.id === activeGroupId && (
                  <div className="text-right">
                    <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-primary-foreground" />
                    </div>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 mt-6">
          <Button
            onClick={openPicker}
            variant="secondary"
            className="w-full"
            data-testid="button-import-shared-group"
          >
            <Download className="w-4 h-4 mr-2" />
            Import Shared Group
          </Button>

          <Button
            onClick={handleCreateNewGroup}
            className="w-full"
            data-testid="button-create-new-group"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create New Group
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
