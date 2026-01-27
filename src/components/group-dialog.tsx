import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseMembers } from "@/lib/utils";
import { MemberInput } from "@/lib/storage/types";

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

  // Reset or initialize state when dialog opens
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? "Create New Group" : "Edit Group"}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? "This will create a new Spreadsheet in your Google Drive."
              : "Update group name or manage members."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="groupName">Group Name *</Label>
            <Input
              id="groupName"
              placeholder="e.g., Weekend Trip"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="members">Members (Optional)</Label>
            <Textarea
              id="members"
              placeholder="Enter emails or usernames, separated by commas (e.g., alice@gmail.com, bob123)"
              value={membersInput}
              onChange={(e) => setMembersInput(e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Emails will receive a Google Drive share invite. Usernames are for tracking only.
            </p>
          </div>

          <div className="flex space-x-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={isPending}
            >
              {isPending ? "Saving..." : (mode === 'create' ? "Create Group" : "Update Group")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
