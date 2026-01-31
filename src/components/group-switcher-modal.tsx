import { useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "@/context/app-context";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Users, Check, Plus, Download, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { googleApi } from "@/lib/drive";
import { useGooglePicker } from "@/hooks/use-google-picker";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useGroups } from "@/hooks/use-groups";

export default function GroupSwitcherModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { activeGroupId, setActiveGroupId } = useAppContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { groups } = useGroups();

  const handleSelectGroup = (groupId: string) => {
    setActiveGroupId(groupId);
    onClose();
  };

  const { openPicker, error: pickerError } = useGooglePicker({
    onPick: async (doc) => {
      toast({ title: "Importing group..." });
      if (!user?.email) return;

      try {
        // Use the provider's atomic import method
        const group = await googleApi.importGroup(doc.id, user.email);

        await queryClient.invalidateQueries({ queryKey: ["drive", "settings"] });
        setActiveGroupId(group.id);
        toast({ title: "Group imported successfully!" });
        onClose();
      } catch (e: any) {
        toast({ title: "Import Failed", description: e.message, variant: "destructive" });
      }
    }
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">Switch Group</DialogTitle>
          <DialogDescription>Select a group or create/import new.</DialogDescription>
        </DialogHeader>
        {pickerError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{pickerError}</AlertDescription></Alert>}

        <div className="space-y-3 max-h-96 overflow-y-auto">
          {groups.map((group) => (
            <button key={group.id} onClick={() => handleSelectGroup(group.id)} className="w-full p-4 bg-secondary rounded-lg text-left hover:bg-accent transition-colors">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center"><Users className="w-6 h-6 text-primary-foreground" /></div>
                <div className="flex-1">
                  <h4 className="font-semibold text-foreground">{group.name}</h4>
                </div>
                {group.id === activeGroupId && <Check className="w-4 h-4 text-primary" />}
              </div>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 mt-6">
          <Button onClick={openPicker} variant="secondary" className="w-full"><Download className="w-4 h-4 mr-2" />Import Shared Group</Button>
          <Button onClick={() => { onClose(); navigate("/groups"); }} className="w-full"><Plus className="w-4 h-4 mr-2" />Create New Group</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
