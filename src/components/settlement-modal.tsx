import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "@/context/app-context";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { googleApi } from "@/lib/drive";
import { Member, Settlement } from "@/lib/storage/types";
import { ArrowRight, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslation } from "react-i18next";

interface UserInfo {
  userId: string;
  name: string;
}

interface SettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromUser?: UserInfo;
  toUser?: UserInfo;
  suggestedAmount?: number;
  users?: Member[];
  initialData?: Settlement;
}

export default function SettlementModal({
  isOpen,
  onClose,
  fromUser,
  toUser,
  suggestedAmount = 0,
  users = [],
  initialData
}: SettlementModalProps) {
  const { activeGroupId } = useAppContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");

  const [selectedFromId, setSelectedFromId] = useState("");
  const [selectedToId, setSelectedToId] = useState("");

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setAmount(initialData.amount.toString());
        setMethod(initialData.method || "cash");
        setNotes(initialData.notes || "");
        setSelectedFromId(initialData.fromUserId);
        setSelectedToId(initialData.toUserId);
      } else {
        setAmount(suggestedAmount > 0 ? suggestedAmount.toFixed(2) : "");
        setMethod("cash");
        setNotes("");
        setSelectedFromId(fromUser?.userId || "");
        setSelectedToId(toUser?.userId || "");
      }
    }
  }, [isOpen, initialData, suggestedAmount, fromUser, toUser]);

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (initialData) {
        if (!initialData._rowIndex) throw new Error("Missing row index");
        return await googleApi.updateSettlement(activeGroupId, initialData._rowIndex, { ...initialData, ...data });
      } else {
        return await googleApi.addSettlement(activeGroupId, data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drive", "group", activeGroupId] });
      toast({
        title: t("common.success"),
      });
      onClose();
    },
    onError: (error) => {
      console.error(error);
      toast({
        title: t("common.error"),
        description: "Failed to save settlement.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!initialData || !initialData._rowIndex) throw new Error("Missing row index");
      return await googleApi.deleteSettlement(activeGroupId, initialData._rowIndex, initialData.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drive", "group", activeGroupId] });
      toast({ title: t("common.success") });
      setShowDeleteConfirm(false);
      onClose();
    },
    onError: (error) => {
      toast({ title: t("common.error"), description: "Failed to delete.", variant: "destructive" });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFromId || !selectedToId || !amount || parseFloat(amount) <= 0) return;
    if (selectedFromId === selectedToId) {
      toast({ title: "Invalid selection", description: t("settlement.sameUser"), variant: "destructive" });
      return;
    }

    saveMutation.mutate({
      fromUserId: selectedFromId,
      toUserId: selectedToId,
      amount: parseFloat(amount),
      method,
      notes: notes.trim() || undefined,
      date: initialData ? initialData.date : new Date().toISOString(),
    });
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md" data-testid="modal-settlement">
          <DialogHeader>
            <DialogTitle className="text-center">{initialData ? t("settlement.editTitle") : t("settlement.title")}</DialogTitle>
            <DialogDescription className="text-center">
              {initialData ? t("settlement.editDesc") : t("settlement.desc")}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-settlement">

            <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-end">
              <div className="space-y-2">
                <Label>{t("settlement.payer")}</Label>
                <Select value={selectedFromId} onValueChange={setSelectedFromId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("settlement.whoPaid")} />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map(u => (
                      <SelectItem key={u.userId} value={u.userId}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="pb-3 text-muted-foreground">
                <ArrowRight className="w-5 h-5" />
              </div>

              <div className="space-y-2">
                <Label>{t("settlement.receiver")}</Label>
                <Select value={selectedToId} onValueChange={setSelectedToId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("settlement.whoReceived")} />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map(u => (
                      <SelectItem key={u.userId} value={u.userId}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="amount">{t("expenseForm.amount")}</Label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-muted-foreground">$</span>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  className="pl-8"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  data-testid="input-settlement-amount"
                />
              </div>
              {!initialData && suggestedAmount > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t("settlement.suggested")}: ${suggestedAmount.toFixed(2)}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="method">{t("settlement.method")}</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger data-testid="select-payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="venmo">Venmo</SelectItem>
                  <SelectItem value="paypal">PayPal</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="notes">{t("settlement.notes")}</Label>
              <Textarea
                id="notes"
                rows={2}
                placeholder={t("settlement.notesPlaceholder")}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                data-testid="textarea-settlement-notes"
              />
            </div>

            <div className="flex space-x-3 pt-2">
              {initialData && (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="shrink-0"
                  onClick={() => setShowDeleteConfirm(true)}
                  title={t("common.delete")}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}

              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={onClose}
                data-testid="button-cancel-settlement"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={saveMutation.isPending}
                data-testid="button-record-payment"
              >
                {saveMutation.isPending ? t("expenseForm.saving") : (initialData ? t("settlement.update") : t("settlement.record"))}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settlement.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settlement.deleteDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
