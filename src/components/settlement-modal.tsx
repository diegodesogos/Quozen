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
import { googleApi } from "@/lib/drive"; // Fixed import
import { ArrowRight } from "lucide-react";

interface User {
  userId: string; // Changed from id to userId to match Member interface consistency
  name: string;
}

interface SettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromUser?: User;
  toUser?: User;
  suggestedAmount?: number;
}

export default function SettlementModal({ 
  isOpen, 
  onClose, 
  fromUser, 
  toUser, 
  suggestedAmount = 0 
}: SettlementModalProps) {
  const { activeGroupId } = useAppContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [amount, setAmount] = useState(suggestedAmount > 0 ? suggestedAmount.toString() : "");
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");

  // Sync state with props when modal opens or suggestion changes
  useEffect(() => {
    if (isOpen) {
      setAmount(suggestedAmount > 0 ? suggestedAmount.toFixed(2) : "");
      setMethod("cash");
      setNotes("");
    }
  }, [isOpen, suggestedAmount]);

  const settlementMutation = useMutation({
    mutationFn: async (data: any) => {
      // Use the googleApi directly instead of apiRequest
      return await googleApi.addSettlement(activeGroupId, data);
    },
    onSuccess: () => {
      // Invalidate the group data query to refresh expenses and settlements
      queryClient.invalidateQueries({ queryKey: ["drive", "group", activeGroupId] });
      toast({
        title: "Settlement recorded",
        description: "The payment has been recorded successfully.",
      });
      onClose();
      setAmount("");
      setNotes("");
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
    
    if (!fromUser || !toUser || !amount || parseFloat(amount) <= 0) {
      toast({
        title: "Invalid data",
        description: "Please fill in all required fields with valid values.",
        variant: "destructive",
      });
      return;
    }

    settlementMutation.mutate({
      fromUserId: fromUser.userId,
      toUserId: toUser.userId,
      amount: parseFloat(amount), // Ensure number type
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
              Record a payment between two group members.
            </DialogDescription>
        </DialogHeader>

        {fromUser && toUser && (
          <div className="bg-secondary rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                  <span className="text-primary-foreground font-medium text-sm">
                    {fromUser.name.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>
                <span className="font-medium">{fromUser.name}</span>
              </div>
              <div className="flex flex-col items-center">
                <ArrowRight className="w-5 h-5 text-primary mb-1" />
                <span className="text-xs text-muted-foreground">pays</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center">
                  <span className="text-secondary-foreground font-medium text-sm">
                    {toUser.name.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>
                <span className="font-medium">{toUser.name}</span>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-settlement">
          <div>
            <Label htmlFor="amount">Settlement Amount</Label>
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
                Suggested: ${suggestedAmount.toFixed(2)} (full balance)
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
