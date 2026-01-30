import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "@/context/app-context";
import { useAuth } from "@/context/auth-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { googleApi } from "@/lib/drive";
import { Users, Plus, Pencil, Shield, User, Trash2, LogOut } from "lucide-react";
import { MemberInput, Group } from "@/lib/storage/types";
import { Badge } from "@/components/ui/badge";
import GroupDialog from "@/components/group-dialog";
import { useSettings } from "@/hooks/use-settings";

export default function Groups() {
  const { activeGroupId, setActiveGroupId, currentUserId } = useAppContext();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Use Settings Hook
  const { settings, updateSettings } = useSettings();

  // Create/Edit Dialog State
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    mode: "create" | "edit";
    groupId?: string;
    initialName?: string;
    initialMembers?: string;
  }>({ open: false, mode: "create" });

  // Alert Dialog State
  const [alertState, setAlertState] = useState<{
    open: boolean;
    type: "delete" | "leave";
    group?: Group;
  }>({ open: false, type: "delete" });

  const { data: groups = [] } = useQuery({
    queryKey: ["drive", "groups", user?.email],
    queryFn: () => googleApi.listGroups(user?.email),
    enabled: !!user?.email
  });

  const handleEditClick = async (e: React.MouseEvent, group: Group) => {
    e.stopPropagation();
    try {
      const data = await googleApi.getGroupData(group.id);
      if (!data) throw new Error("Could not load group data");

      const editableMembers = data.members
        .filter(m => m.role !== 'admin')
        .map(m => m.email || m.userId)
        .join(", ");

      setDialogState({
        open: true,
        mode: "edit",
        groupId: group.id,
        initialName: group.name,
        initialMembers: editableMembers
      });
    } catch (err) {
      toast({ title: "Error", description: "Failed to load group details", variant: "destructive" });
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, group: Group) => {
    e.stopPropagation();
    setAlertState({ open: true, type: "delete", group });
  };

  const handleLeaveClick = (e: React.MouseEvent, group: Group) => {
    e.stopPropagation();
    setAlertState({ open: true, type: "leave", group });
  };

  const openCreateDialog = () => {
    setDialogState({ open: true, mode: "create", initialName: "", initialMembers: "" });
  }

  const createGroupMutation = useMutation({
    mutationFn: async (data: { name: string, members: MemberInput[] }) => {
      if (!user) throw new Error("User not authenticated");
      return await googleApi.createGroupSheet(data.name, user, data.members);
    },
    onSuccess: (newGroup) => {
      // Update Settings Cache
      if (settings && newGroup) {
        const newCache = [...settings.groupCache];
        newCache.unshift({
          id: newGroup.id,
          name: newGroup.name,
          role: "owner",
          lastAccessed: new Date().toISOString()
        });
        
        updateSettings({
          ...settings,
          groupCache: newCache,
          activeGroupId: newGroup.id
        });
      }

      queryClient.invalidateQueries({ queryKey: ["drive", "groups"] });
      toast({
        title: "Group created",
        description: "Your new group spreadsheet has been created in Google Drive.",
      });
      setDialogState(prev => ({ ...prev, open: false }));
      if (newGroup?.id) setActiveGroupId(newGroup.id);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create group. Check your Drive permissions.",
        variant: "destructive",
      });
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: async (data: { groupId: string, name: string, members: MemberInput[] }) => {
      const removedMembersCheck = async () => {
        const currentData = await googleApi.getGroupData(data.groupId);
        if (!currentData) return;

        const newMemberIds = new Set(data.members.map(m => m.email || m.username));
        const membersToRemove = currentData.members
          .filter(m => m.role !== 'admin')
          .filter(m => !newMemberIds.has(m.email) && !newMemberIds.has(m.userId));

        for (const m of membersToRemove) {
          const hasExpenses = await googleApi.checkMemberHasExpenses(data.groupId, m.userId);
          if (hasExpenses) {
            throw new Error(`Cannot remove ${m.name} because they have recorded expenses.`);
          }
        }
      };

      await removedMembersCheck();
      return await googleApi.updateGroup(data.groupId, data.name, data.members);
    },
    onSuccess: (_, variables) => {
      // Update Settings Cache (Name change)
      if (settings) {
        const newCache = settings.groupCache.map(g => 
          g.id === variables.groupId ? { ...g, name: variables.name } : g
        );
        updateSettings({ ...settings, groupCache: newCache });
      }

      queryClient.invalidateQueries({ queryKey: ["drive", "groups"] });
      if (dialogState.groupId) {
        queryClient.invalidateQueries({ queryKey: ["drive", "group", dialogState.groupId] });
      }
      toast({ title: "Group updated" });
      setDialogState(prev => ({ ...prev, open: false }));
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive"
      });
    }
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
        return await googleApi.deleteGroup(groupId);
    },
    onSuccess: (_, groupId) => {
        // Update Settings Cache
        if (settings) {
          const newCache = settings.groupCache.filter(g => g.id !== groupId);
          // If active group was deleted, unset it (or handle in App.tsx effects)
          const newActive = settings.activeGroupId === groupId ? null : settings.activeGroupId;
          
          updateSettings({ 
            ...settings, 
            groupCache: newCache,
            activeGroupId: newActive 
          });
        }

        queryClient.invalidateQueries({ queryKey: ["drive", "groups"] });
        toast({ title: "Group deleted" });
        setAlertState({ open: false, type: "delete" });
        if (groupId === activeGroupId) setActiveGroupId("");
    },
    onError: () => {
        toast({ title: "Error", description: "Failed to delete group", variant: "destructive" });
    }
  });

  const leaveGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
        if (!currentUserId) throw new Error("User not found");
        return await googleApi.leaveGroup(groupId, currentUserId);
    },
    onSuccess: (_, groupId) => {
        // Update Settings Cache
        if (settings) {
          const newCache = settings.groupCache.filter(g => g.id !== groupId);
          const newActive = settings.activeGroupId === groupId ? null : settings.activeGroupId;
          
          updateSettings({ 
            ...settings, 
            groupCache: newCache,
            activeGroupId: newActive
          });
        }

        queryClient.invalidateQueries({ queryKey: ["drive", "groups"] });
        toast({ title: "Left group successfully" });
        setAlertState({ open: false, type: "leave" });
        if (groupId === activeGroupId) setActiveGroupId("");
    },
    onError: (error) => {
        toast({ 
            title: "Cannot Leave Group", 
            description: error instanceof Error ? error.message : "Error occurred", 
            variant: "destructive" 
        });
        setAlertState({ open: false, type: "leave" });
    }
  });

  const handleDialogSubmit = (data: { name: string, members: MemberInput[] }) => {
    if (dialogState.mode === 'create') {
      createGroupMutation.mutate(data);
    } else if (dialogState.mode === 'edit' && dialogState.groupId) {
      updateGroupMutation.mutate({ groupId: dialogState.groupId, ...data });
    }
  };

  const handleSwitchToGroup = (groupId: string) => {
    setActiveGroupId(groupId);
    toast({ title: "Group switched" });
  };

  return (
    <div className="mx-4 mt-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Your Groups</h2>
        <Button onClick={openCreateDialog}>
          <Plus className="w-4 h-4 mr-2" />
          New Group
        </Button>
      </div>

      <GroupDialog
        open={dialogState.open}
        onOpenChange={(open) => setDialogState(prev => ({ ...prev, open }))}
        mode={dialogState.mode}
        initialName={dialogState.initialName}
        initialMembers={dialogState.initialMembers}
        isPending={createGroupMutation.isPending || updateGroupMutation.isPending}
        onSubmit={handleDialogSubmit}
      />

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
          groups.map((group: Group) => {
            const isActive = group.id === activeGroupId;
            const isOwner = group.isOwner;

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
                            <Badge variant="default" className="text-xs">
                              Active
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {isOwner ? (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-5">
                              <Shield className="w-3 h-3 mr-1" />
                              Owner
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-5">
                              <User className="w-3 h-3 mr-1" />
                              Member
                            </Badge>
                          )}
                          <p className="text-sm text-muted-foreground">Google Sheet</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex gap-2">
                        {isOwner ? (
                            <>
                                <Button
                                variant="outline"
                                size="sm"
                                className="h-8"
                                onClick={(e) => handleEditClick(e, group)}
                                >
                                <Pencil className="w-3 h-3 mr-1" />
                                Edit
                                </Button>
                                <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-destructive hover:text-destructive"
                                onClick={(e) => handleDeleteClick(e, group)}
                                >
                                <Trash2 className="w-3 h-3" />
                                </Button>
                            </>
                        ) : (
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-destructive hover:text-destructive"
                                onClick={(e) => handleLeaveClick(e, group)}
                            >
                                <LogOut className="w-3 h-3 mr-1" />
                                Leave
                            </Button>
                        )}
                      </div>

                      {!isActive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-primary text-sm h-auto p-0"
                          onClick={() => handleSwitchToGroup(group.id)}
                        >
                          Switch To
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <AlertDialog open={alertState.open} onOpenChange={(open) => !open && setAlertState(prev => ({...prev, open}))}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>
                    {alertState.type === 'delete' ? 'Delete Group' : 'Leave Group'}
                </AlertDialogTitle>
                <AlertDialogDescription>
                    {alertState.type === 'delete' 
                        ? `Are you sure you want to delete "${alertState.group?.name}"? This action cannot be undone and will move the file to trash in your Google Drive.`
                        : `Are you sure you want to leave "${alertState.group?.name}"? You won't be able to access it unless added again.`}
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => {
                        if (!alertState.group) return;
                        if (alertState.type === 'delete') {
                            deleteGroupMutation.mutate(alertState.group.id);
                        } else {
                            leaveGroupMutation.mutate(alertState.group.id);
                        }
                    }}
                >
                    {alertState.type === 'delete' ? 'Delete' : 'Leave'}
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
