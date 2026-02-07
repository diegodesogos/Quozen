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
import { Member } from "@/lib/storage/types";
import { ArrowRight } from "lucide-react";

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
  users?: Member[]; // Add list of all users to allow changing selection
}

export default function SettlementModal({ 
  isOpen, 
  onClose, 
  fromUser, 
  toUser, 
  suggestedAmount = 0,
  users = [] 
}: SettlementModalProps) {
  const { activeGroupId } = useAppContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  
  // Editable state for users
  const [selectedFromId, setSelectedFromId] = useState("");
  const [selectedToId, setSelectedToId] = useState("");

  // Sync state with props when modal opens
  useEffect(() => {
    if (isOpen) {
      setAmount(suggestedAmount > 0 ? suggestedAmount.toFixed(2) : "");
      setMethod("cash");
      setNotes("");
      setSelectedFromId(fromUser?.userId || "");
      setSelectedToId(toUser?.userId || "");
    }
  }, [isOpen, suggestedAmount, fromUser, toUser]);

  const settlementMutation = useMutation({
    mutationFn: async (data: any) => {
      return await googleApi.addSettlement(activeGroupId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drive", "group", activeGroupId] });
      toast({
        title: "Settlement recorded",
        description: "The payment has been recorded successfully.",
      });
      onClose();
    },
    onError: (error) => {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to record settlement. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedFromId || !selectedToId || !amount || parseFloat(amount) <= 0) {
      toast({
        title: "Invalid data",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    if (selectedFromId === selectedToId) {
      toast({
        title: "Invalid selection",
        description: "Payer and receiver cannot be the same person.",
        variant: "destructive",
      });
      return;
    }

    settlementMutation.mutate({
      fromUserId: selectedFromId,
      toUserId: selectedToId,
      amount: parseFloat(amount),
      method,
      notes: notes.trim() || undefined,
      date: new Date().toISOString(),
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" data-testid="modal-settlement">
        <DialogHeader>
          <DialogTitle className="text-center">Settle Balance</DialogTitle>
          <DialogDescription>
              Record a payment between group members.
            </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-settlement">
          
          <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-end">
            <div className="space-y-2">
              <Label>Payer (From)</Label>
              <Select value={selectedFromId} onValueChange={setSelectedFromId}>
                <SelectTrigger>
                  <SelectValue placeholder="Who paid?" />
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
              <Label>Receiver (To)</Label>
              <Select value={selectedToId} onValueChange={setSelectedToId}>
                <SelectTrigger>
                  <SelectValue placeholder="Who got paid?" />
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
            <Label htmlFor="amount">Amount</Label>
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
            {suggestedAmount > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Suggested: ${suggestedAmount.toFixed(2)}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="method">Payment Method</Label>
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
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              rows={2}
              placeholder="Add any notes about this payment..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid="textarea-settlement-notes"
            />
          </div>

          <div className="flex space-x-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={onClose}
              data-testid="button-cancel-settlement"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={settlementMutation.isPending}
              data-testid="button-record-payment"
            >
              {settlementMutation.isPending ? "Recording..." : "Record Payment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
