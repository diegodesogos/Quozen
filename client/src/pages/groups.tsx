import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "@/context/app-context";
import { useAuth } from "@/context/auth-provider"; // Use auth provider for user info
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { googleApi } from "@/lib/drive"; // Import googleApi
import { Users, Plus } from "lucide-react";

export default function Groups() {
  const { activeGroupId, setActiveGroupId } = useAppContext();
  const { user } = useAuth(); // Get user from auth context
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");

  const { data: groups = [] } = useQuery({
    queryKey: ["drive", "groups"],
    queryFn: () => googleApi.listGroups(),
  });

  const createGroupMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error("User not authenticated");
      // Description is not stored in drive properties in this simple version, but could be added later
      return await googleApi.createGroupSheet(name, user);
    },
    onSuccess: (newGroup) => {
      queryClient.invalidateQueries({ queryKey: ["drive", "groups"] });
      toast({
        title: "Group created",
        description: "Your new group spreadsheet has been created in Google Drive.",
      });
      setShowCreateDialog(false);
      setGroupName("");
      setGroupDescription("");
      
      if (newGroup?.id) {
        setActiveGroupId(newGroup.id);
      }
    },
    onError: (error) => {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to create group. Check your Drive permissions.",
        variant: "destructive",
      });
    },
  });

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    createGroupMutation.mutate(groupName.trim());
  };

  const handleSwitchToGroup = (groupId: string) => {
    setActiveGroupId(groupId);
    toast({ title: "Group switched" });
  };

  return (
    <div className="mx-4 mt-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Your Groups</h2>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Group
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Group</DialogTitle>
              <DialogDescription>
                This will create a new Spreadsheet in your Google Drive.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <Label htmlFor="groupName">Group Name *</Label>
                <Input
                  id="groupName"
                  placeholder="e.g., Weekend Trip"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                />
              </div>
              
              <div className="flex space-x-3">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setShowCreateDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={createGroupMutation.isPending}
                >
                  {createGroupMutation.isPending ? "Creating..." : "Create Group"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        {groups.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">No groups yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create a group to start managing expenses.
              </p>
            </CardContent>
          </Card>
        ) : (
          groups.map((group: any) => {
            const isActive = group.id === activeGroupId;
            return (
              <Card key={group.id} className={isActive ? "ring-2 ring-primary" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
                        <Users className="w-6 h-6 text-primary-foreground" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-semibold text-foreground">{group.name}</h3>
                          {isActive && (
                            <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded-full">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Google Sheet
                        </p>
                      </div>
                    </div>
                    {!isActive && (
                      <div className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 text-primary text-sm h-auto p-0"
                          onClick={() => handleSwitchToGroup(group.id)}
                        >
                          Switch To
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
