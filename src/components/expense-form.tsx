import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Expense, Member } from "@/lib/storage/types";
import { distributeAmount } from "@/lib/finance";

interface ExpenseSplit {
  userId: string;
  amount: number;
  selected: boolean;
}

interface ExpenseFormProps {
  initialData?: Partial<Expense>;
  users: Member[];
  currentUserId: string;
  onSubmit: (data: Partial<Expense>) => void;
  isPending: boolean;
  title: string;
}

export default function ExpenseForm({ initialData, users, currentUserId, onSubmit, isPending, title }: ExpenseFormProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [description, setDescription] = useState(initialData?.description || "");
  const [amount, setAmount] = useState(initialData?.amount?.toString() || "");
  const [paidBy, setPaidBy] = useState(initialData?.paidBy || currentUserId);
  const [category, setCategory] = useState(initialData?.category || "");
  const [date, setDate] = useState(initialData?.date ? new Date(initialData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
  const [splits, setSplits] = useState<ExpenseSplit[]>([]);

  useEffect(() => {
    // Initialize splits when users are loaded
    if (users.length > 0 && splits.length === 0) {
      const initialSplits = users.map((u) => {
        const existingSplit = initialData?.splits?.find((s: any) => s.userId === u.userId);
        return {
          userId: u.userId,
          amount: existingSplit?.amount || 0,
          selected: !!existingSplit || !initialData, // Default to true for new expenses
        };
      });
      
      // If it's a new expense (no initialData), calculate equal splits immediately
      if (!initialData && amount) {
         updateSplitEqually(amount, initialSplits);
      } else {
         setSplits(initialSplits);
      }
    }
  }, [users, initialData]); // removed 'amount' from dep array to avoid overwrite on edit load

  // Helper to recalculate splits equally among selected users
  const updateSplitEqually = (currentAmount: string, currentSplits: ExpenseSplit[]) => {
    const selectedSplits = currentSplits.filter(s => s.selected);
    const count = selectedSplits.length;
    
    if (count === 0) {
        // If no one selected, just update state without amounts
        setSplits(currentSplits.map(s => ({ ...s, amount: 0 })));
        return;
    }
    
    if (!currentAmount) return;

    const totalAmount = parseFloat(currentAmount);
    if (isNaN(totalAmount)) return;

    // Use centralized distribution logic to handle pennies
    const distributedAmounts = distributeAmount(totalAmount, count);

    // Map the distributed amounts back to the selected users
    let distIndex = 0;
    const newSplits = currentSplits.map(s => {
      if (s.selected) {
        const amt = distributedAmounts[distIndex];
        distIndex++;
        return { ...s, amount: amt };
      }
      return { ...s, amount: 0 };
    });
    
    setSplits(newSplits);
  };

  const handleAmountChange = (value: string) => {
    setAmount(value);
    updateSplitEqually(value, splits);
  };

  const handleSplitSelection = (userId: string, selected: boolean) => {
    const newSplits = splits.map(s => s.userId === userId ? { ...s, selected } : s);
    updateSplitEqually(amount, newSplits);
  };

  const handleSplitAmountChange = (userId: string, newAmount: string) => {
    const value = parseFloat(newAmount) || 0;
    setSplits(prev => 
      prev.map(split => 
        split.userId === userId ? { ...split, amount: value } : split
      )
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!description || !amount || !paidBy || !category || !date) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    const selectedSplits = splits.filter(s => s.selected);
    if (selectedSplits.length === 0) {
      toast({
        title: "Invalid split",
        description: "At least one person must be selected for the split.",
        variant: "destructive",
      });
      return;
    }

    const expenseAmount = parseFloat(amount);
    const totalSplit = splits.reduce((sum, s) => sum + (s.selected ? s.amount : 0), 0);
    
    // Validation: Check if splits sum up to total amount (allow small floating point margin)
    // Now that we use distributeAmount, this should nearly always be exact, but manual edits might drift
    if (Math.abs(totalSplit - expenseAmount) > 0.05) {
      toast({
        title: "Split mismatch",
        description: `Split amounts ($${totalSplit.toFixed(2)}) don't match expense amount ($${expenseAmount.toFixed(2)}).`,
        variant: "destructive",
      });
      return;
    }

    // Only send the splits that have amounts
    const finalSplits = splits
        .filter(s => s.selected && s.amount > 0)
        .map(s => ({ userId: s.userId, amount: s.amount }));

    onSubmit({
      description,
      amount: expenseAmount,
      paidBy,
      category,
      date: new Date(date).toISOString(),
      splits: finalSplits,
    });
  };

  return (
    <div className="mx-4 mt-4">
      <h2 className="text-xl font-bold mb-6">{title}</h2>
      <form onSubmit={handleSubmit} className="space-y-6" data-testid="form-expense">
        <div>
          <Label htmlFor="description">Description *</Label>
          <Input 
            id="description" 
            value={description} 
            onChange={(e) => setDescription(e.target.value)} 
            required 
            data-testid="input-expense-description"
          />
        </div>
        <div>
          <Label htmlFor="amount">Amount *</Label>
          <div className="relative">
            <span className="absolute left-3 top-3 text-muted-foreground">$</span>
            <Input 
                id="amount" 
                type="number" 
                step="0.01" 
                className="pl-8"
                value={amount} 
                onChange={(e) => handleAmountChange(e.target.value)} 
                required 
                data-testid="input-expense-amount"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="paidBy">Paid by *</Label>
          <Select value={paidBy} onValueChange={setPaidBy}>
            <SelectTrigger data-testid="select-paid-by"><SelectValue /></SelectTrigger>
            <SelectContent>
              {users.map((u) => <SelectItem key={u.userId} value={u.userId}>{u.userId === currentUserId ? "You" : u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="category">Category *</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger data-testid="select-category"><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              {["Food & Dining", "Transportation", "Accommodation", "Entertainment", "Shopping", "Other"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
            <Label htmlFor="date">Date *</Label>
            <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                data-testid="input-expense-date"
            />
        </div>
        <div>
          <Label className="mb-3 block">Split Between</Label>
          <div className="space-y-3">
            {splits.map((split) => (
              <div key={split.userId} className="flex items-center justify-between p-3 bg-secondary rounded-lg" data-testid={`split-item-${split.userId}`}>
                <div className="flex items-center space-x-3">
                  <Checkbox 
                    checked={split.selected} 
                    onCheckedChange={(checked) => handleSplitSelection(split.userId, !!checked)} 
                    data-testid={`checkbox-split-${split.userId}`}
                  />
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                        <span className="text-primary-foreground font-medium text-xs">
                          {users.find(u => u.userId === split.userId)?.name?.substring(0,2)}
                        </span>
                    </div>
                    <span className="text-sm font-medium">
                        {users.find(u => u.userId === split.userId)?.userId === currentUserId ? "You" : users.find(u => u.userId === split.userId)?.name}
                    </span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                    <span className="text-xs text-muted-foreground">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-20 h-8 text-sm"
                      value={split.amount.toFixed(2)}
                      onChange={(e) => handleSplitAmountChange(split.userId, e.target.value)}
                      disabled={!split.selected}
                      data-testid={`input-split-amount-${split.userId}`}
                    />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex space-x-3">
          <Button 
            type="button" 
            variant="secondary" 
            className="flex-1" 
            onClick={() => navigate(-1)}
            data-testid="button-cancel-expense"
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            className="flex-1" 
            disabled={isPending}
            data-testid="button-submit-expense"
          >
            {isPending ? "Saving..." : "Save Expense"}
          </Button>
        </div>
      </form>
    </div>
  );
}
