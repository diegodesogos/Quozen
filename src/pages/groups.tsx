import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "@/context/app-context";
import { useAuth } from "@/context/auth-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { googleApi } from "@/lib/drive";
import { Users, Plus, Pencil, Shield, User, Trash2, LogOut, Share2 } from "lucide-react";
import { MemberInput, Group } from "@/lib/storage/types";
import { Badge } from "@/components/ui/badge";
import GroupDialog from "@/components/group-dialog";
import ShareDialog from "@/components/share-dialog";
import { useGroups } from "@/hooks/use-groups";
import { useTranslation } from "react-i18next";

export default function Groups() {
  const { activeGroupId, setActiveGroupId, currentUserId } = useAppContext();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { groups } = useGroups();
  const { t } = useTranslation();

  const [dialogState, setDialogState] = useState<{
    open: boolean;
    mode: "create" | "edit";
    groupId?: string;
    initialName?: string;
    initialMembers?: string;
  }>({ open: false, mode: "create" });

  const [shareDialog, setShareDialog] = useState<{
    open: boolean;
    groupId: string;
    groupName: string;
  }>({ open: false, groupId: "", groupName: "" });

  const [alertState, setAlertState] = useState<{
    open: boolean;
    type: "delete" | "leave";
    group?: Group;
  }>({ open: false, type: "delete" });

  const handleEditClick = async (e: React.MouseEvent, group: Group) => {
    e.stopPropagation();
    try {
      const data = await googleApi.getGroupData(group.id);
      if (!data) throw new Error("Could not load group data");
      const editableMembers = data.members.filter(m => m.role !== 'owner').map(m => m.email || m.userId).join(", ");
      setDialogState({ open: true, mode: "edit", groupId: group.id, initialName: group.name, initialMembers: editableMembers });
    } catch (err) {
      toast({ title: t("common.error"), description: t("groups.loadError"), variant: "destructive" });
    }
  };

  const handleShareClick = (e: React.MouseEvent, group: Group) => {
    e.stopPropagation();
    setShareDialog({ open: true, groupId: group.id, groupName: group.name });
  };

  const handleDeleteClick = (e: React.MouseEvent, group: Group) => {
    e.stopPropagation();
    setAlertState({ open: true, type: "delete", group });
  };

  const handleLeaveClick = (e: React.MouseEvent, group: Group) => {
    e.stopPropagation();
    setAlertState({ open: true, type: "leave", group });
  };

  const openCreateDialog = () => setDialogState({ open: true, mode: "create", initialName: "", initialMembers: "" });

  const createGroupMutation = useMutation({
    mutationFn: async (data: { name: string, members: MemberInput[] }) => {
      if (!user) throw new Error("User not authenticated");
      return await googleApi.createGroupSheet(data.name, user, data.members);
    },
    onSuccess: (newGroup) => {
      queryClient.invalidateQueries({ queryKey: ["drive", "settings"] });
      toast({ title: t("common.success") });
      setDialogState(prev => ({ ...prev, open: false }));
      if (newGroup?.id) {
        setActiveGroupId(newGroup.id);
        // Automatically prompt to share the new group
        setShareDialog({
          open: true,
          groupId: newGroup.id,
          groupName: newGroup.name
        });
      }
    },
    onError: () => toast({ title: t("common.error"), description: t("groups.createError"), variant: "destructive" }),
  });

  const updateGroupMutation = useMutation({
    mutationFn: async (data: { groupId: string, name: string, members: MemberInput[] }) => {
      if (!user?.email) throw new Error("User email required");
      const currentData = await googleApi.getGroupData(data.groupId);
      if (currentData) {
        const newMemberIds = new Set(data.members.map(m => m.email || m.username));
        const membersToRemove = currentData.members.filter(m => m.role !== 'owner' && !newMemberIds.has(m.email) && !newMemberIds.has(m.userId));
        for (const m of membersToRemove) {
          if (await googleApi.checkMemberHasExpenses(data.groupId, m.userId)) throw new Error(`Cannot remove ${m.name} because they have expenses.`);
        }
      }
      return await googleApi.updateGroup(data.groupId, data.name, data.members, user.email);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["drive", "settings"] });
      if (variables.groupId) queryClient.invalidateQueries({ queryKey: ["drive", "group", variables.groupId] });
      toast({ title: t("common.success") });
      setDialogState(prev => ({ ...prev, open: false }));
    },
    onError: (error) => toast({ title: t("common.error"), description: error instanceof Error ? error.message : t("common.genericError"), variant: "destructive" })
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      if (!user?.email) throw new Error("User email required");
      return await googleApi.deleteGroup(groupId, user.email);
    },
    onSuccess: (_, groupId) => {
      queryClient.invalidateQueries({ queryKey: ["drive", "settings"] });
      toast({ title: t("common.success") });
      setAlertState({ open: false, type: "delete" });
      if (groupId === activeGroupId) setActiveGroupId("");
    },
    onError: () => toast({ title: t("common.error"), description: t("groups.deleteError"), variant: "destructive" })
  });

  const leaveGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      if (!currentUserId || !user?.email) throw new Error("User details required");
      return await googleApi.leaveGroup(groupId, currentUserId, user.email);
    },
    onSuccess: (_, groupId) => {
      queryClient.invalidateQueries({ queryKey: ["drive", "settings"] });
      toast({ title: t("common.success") });
      setAlertState({ open: false, type: "leave" });
      if (groupId === activeGroupId) setActiveGroupId("");
    },
    onError: (error) => toast({ title: t("common.error"), description: error instanceof Error ? error.message : t("common.genericError"), variant: "destructive" })
  });

  return (
    <div className="mx-4 mt-4 pb-20">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">{t("groups.title")}</h2>
        <Button onClick={openCreateDialog}>
          <Plus className="w-4 h-4 mr-2" />{t("groups.new")}
        </Button>
      </div>

      <GroupDialog
        open={dialogState.open}
        onOpenChange={(open) => setDialogState(prev => ({ ...prev, open }))}
        mode={dialogState.mode}
        initialName={dialogState.initialName}
        initialMembers={dialogState.initialMembers}
        isPending={createGroupMutation.isPending || updateGroupMutation.isPending}
        onSubmit={(data) => dialogState.mode === 'create' ? createGroupMutation.mutate(data) : updateGroupMutation.mutate({ groupId: dialogState.groupId!, ...data })}
      />

      <ShareDialog
        isOpen={shareDialog.open}
        onClose={() => setShareDialog(prev => ({ ...prev, open: false }))}
        groupId={shareDialog.groupId}
        groupName={shareDialog.groupName}
      />

      <div className="space-y-4">
        {groups.map((group) => (
          <Card key={group.id} className={group.id === activeGroupId ? "ring-2 ring-primary" : ""}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center"><Users className="w-6 h-6 text-primary-foreground" /></div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{group.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={group.isOwner ? "secondary" : "outline"} className="text-[10px] px-1 py-0 h-5">
                        {group.isOwner ? <Shield className="w-3 h-3 mr-1" /> : <User className="w-3 h-3 mr-1" />}
                        {group.isOwner ? t("roles.owner") : t("roles.member")}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex gap-2">
                    {group.isOwner ? (
                      <>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => handleShareClick(e, group)}
                          title={t("common.share")}
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={(e) => handleEditClick(e, group)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => handleDeleteClick(e, group)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    ) : (
                      <Button variant="outline" size="sm" className="h-8 text-destructive hover:text-destructive" onClick={(e) => handleLeaveClick(e, group)}><LogOut className="w-3 h-3 mr-1" />{t("groups.leaveAction")}</Button>
                    )}
                  </div>
                  {group.id !== activeGroupId && (
                    <Button variant="ghost" size="sm" className="text-primary text-sm h-auto p-0" onClick={() => { setActiveGroupId(group.id); toast({ title: "Group switched" }); }}>{t("groups.switchTo")}</Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {groups.length === 0 && <div className="text-center p-8">{t("groups.noGroups")}</div>}
      </div>

      <AlertDialog open={alertState.open} onOpenChange={(open) => !open && setAlertState(prev => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{alertState.type === 'delete' ? t("groups.delete") : t("groups.leave")}</AlertDialogTitle>
            <AlertDialogDescription>
              {alertState.type === 'delete'
                ? t("groups.confirmDelete", { name: alertState.group?.name })
                : t("groups.confirmLeave", { name: alertState.group?.name })}
              {alertState.type === 'delete' && <br />}
              {alertState.type === 'delete' && t("groups.confirmDeleteDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (!alertState.group) return;
              alertState.type === 'delete' ? deleteGroupMutation.mutate(alertState.group.id) : leaveGroupMutation.mutate(alertState.group.id);
            }}>{alertState.type === 'delete' ? t("groups.deleteAction") : t("groups.leaveAction")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
