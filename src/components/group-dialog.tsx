import { useState, useEffect } from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerFooter } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseMembers } from "@/lib/utils";
import { MemberInput } from "@/lib/storage/types";
import { useTranslation } from "react-i18next";
import { useAutoSync } from "@/hooks/use-auto-sync";

interface GroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initialName?: string;
  initialMembers?: string;
  isPending: boolean;
  onSubmit: (data: { name: string, members: MemberInput[] }) => void;
}

export default function GroupDialog({
  open,
  onOpenChange,
  mode,
  initialName = "",
  initialMembers = "",
  isPending,
  onSubmit
}: GroupDialogProps) {
  const [groupName, setGroupName] = useState(initialName);
  const [membersInput, setMembersInput] = useState(initialMembers);
  const { t } = useTranslation();
  const { setPaused } = useAutoSync();

  useEffect(() => {
    if (open) setPaused(true);
    return () => setPaused(false);
  }, [open, setPaused]);

  useEffect(() => {
    if (open) {
      setGroupName(initialName);
      setMembersInput(initialMembers);
    }
  }, [open, initialName, initialMembers]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    const members = parseMembers(membersInput);
    onSubmit({
      name: groupName.trim(),
      members
    });
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader>
            <DrawerTitle>{mode === 'create' ? t("groups.create") : t("groups.edit")}</DrawerTitle>
            <DrawerDescription>
              {mode === 'create'
                ? t("groups.new")
                : t("groups.update")}
            </DrawerDescription>
          </DrawerHeader>
          <form onSubmit={handleSubmit} className="space-y-4 p-4 pb-0">
            <div>
              <Label htmlFor="groupName">{t("groups.nameLabel")} *</Label>
              <Input
                id="groupName"
                placeholder="e.g., Weekend Trip"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="members">{t("groups.membersLabel")}</Label>
              <Textarea
                id="members"
                placeholder={t("groups.membersHint")}
                value={membersInput}
                onChange={(e) => setMembersInput(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t("groups.membersHint2")}
              </p>
            </div>

            <DrawerFooter className="flex-row space-x-3 px-0 pb-8">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => onOpenChange(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isPending}
              >
                {isPending ? t("expenseForm.saving") : (mode === 'create' ? t("groups.create") : t("groups.update"))}
              </Button>
            </DrawerFooter>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
