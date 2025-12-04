import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "@/context/app-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useNavigate } from "react-router-dom";

interface User {
  id: string;
  name: string;
  email: string;
}

interface Group {
  id: string;
  name: string;
  participants: string[];
}

interface ExpenseSplit {
  userId: string;
  amount: number;
  selected: boolean;
}

export default function AddExpense() {
  const { activeGroupId, currentUserId } = useAppContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(currentUserId);
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [splits, setSplits] = useState<ExpenseSplit[]>([]);

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: group } = useQuery<Group>({
    queryKey: ["/api/groups", activeGroupId],
    enabled: !!activeGroupId,
  });

  const expenseMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/expenses", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", activeGroupId, "expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", activeGroupId, "balances"] });
      toast({
        title: "Expense added",
        description: "Your expense has been added successfully.",
      });
      navigate("/dashboard");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add expense. Please try again.",
        variant: "destructive",
      });
    },
  });

  const getUserById = (id: string) => users.find(u => u.id === id);

  // FIX: Accept currentAmount as an argument to use the latest value immediately
  const updateSplitEqually = (currentAmount: string) => {
    if (!currentAmount) return;
    
    const selectedSplits = splits.filter(s => s.selected);
    if (selectedSplits.length === 0) return;

    const splitAmount = parseFloat(currentAmount) / selectedSplits.length;
    
    setSplits(prev => 
      prev.map(split => ({
        ...split,
        amount: split.selected ? splitAmount : 0,
      }))
    );
  };

  const handleAmountChange = (value: string) => {
    setAmount(value);
    if (value && splits.length > 0) {
      updateSplitEqually(value); // FIX: Pass value directly
    }
  };

  const handleSplitSelection = (userId: string, selected: boolean) => {
    // We need to update state first, then recalculate based on the new selection state
    // But since state updates are async, we can calculate the new state here
    setSplits(prev => {
        const newSplits = prev.map(split => 
            split.userId === userId ? { ...split, selected } : split
        );
        
        // Recalculate amounts if we have a total amount
        if (amount) {
            const selectedCount = newSplits.filter(s => s.selected).length;
            if (selectedCount > 0) {
                const splitVal = parseFloat(amount) / selectedCount;
                return newSplits.map(s => ({
                    ...s,
                    amount: s.selected ? splitVal : 0
                }));
            }
        }
        return newSplits;
    });
  };

  const handleSplitAmountChange = (userId: string, newAmount: string) => {
    const value = parseFloat(newAmount) || 0;
    setSplits(prev => 
      prev.map(split => 
        split.userId === userId ? { ...split, amount: value } : split
      )
    );
  };

  const handleSelectAll = () => {
    const allSelected = splits.every(s => s.selected);
    const newSelectedState = !allSelected;

    setSplits(prev => {
        const newSplits = prev.map(split => ({ ...split, selected: newSelectedState }));
        
        if (amount && newSelectedState) {
             const splitVal = parseFloat(amount) / newSplits.length;
             return newSplits.map(s => ({ ...s, amount: splitVal }));
        } else if (!newSelectedState) {
             return newSplits.map(s => ({ ...s, amount: 0 }));
        }
        return newSplits;
    });
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

    const selectedSplits = splits.filter(s => s.selected && s.amount > 0);
    if (selectedSplits.length === 0) {
      toast({
        title: "Invalid split",
        description: "At least one person must be selected for the split.",
        variant: "destructive",
      });
      return;
    }

    const totalSplit = selectedSplits.reduce((sum, s) => sum + s.amount, 0);
    const expenseAmount = parseFloat(amount);
    
    // Allow small floating point differences
    if (Math.abs(totalSplit - expenseAmount) > 0.05) {
      toast({
        title: "Split mismatch",
        description: `Split amounts ($${totalSplit.toFixed(2)}) don't match expense amount ($${expenseAmount.toFixed(2)}).`,
        variant: "destructive",
      });
      return;
    }

    expenseMutation.mutate({
      groupId: activeGroupId,
      description,
      amount: expenseAmount.toFixed(2),
      paidBy,
      category,
      date: new Date(date).toISOString(),
      splits: selectedSplits.map(s => ({ userId: s.userId, amount: s.amount })),
    });
  };

  useEffect(() => {
    if (group && splits.length === 0) {
      const initialSplits = group.participants.map(userId => ({
        userId,
        amount: 0,
        selected: true,
      }));
      setSplits(initialSplits);
    }
  }, [group, splits.length]);

  return (
    <div className="mx-4 mt-4" data-testid="add-expense-view">
      <h2 className="text-xl font-bold mb-6">Add Expense</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6" data-testid="form-add-expense">
        <div>
          <Label htmlFor="description">Description *</Label>
          <Input
            id="description"
            type="text"
            placeholder="What was this expense for?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
              min="0"
              className="pl-8"
              placeholder="0.00"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              data-testid="input-expense-amount"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="paidBy">Paid by *</Label>
          <Select value={paidBy} onValueChange={setPaidBy}>
            <SelectTrigger data-testid="select-paid-by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {group?.participants.map((userId) => {
                const user = getUserById(userId);
                return user ? (
                  <SelectItem key={userId} value={userId}>
                    {user.id === currentUserId ? "You" : user.name}
                  </SelectItem>
                ) : null;
              })}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="category">Category *</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger data-testid="select-category">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Food & Dining">Food & Dining</SelectItem>
              <SelectItem value="Transportation">Transportation</SelectItem>
              <SelectItem value="Accommodation">Accommodation</SelectItem>
              <SelectItem value="Entertainment">Entertainment</SelectItem>
              <SelectItem value="Shopping">Shopping</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
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
          <div className="flex items-center justify-between mb-3">
            <Label>Split Between</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-primary"
              onClick={handleSelectAll}
              data-testid="button-select-all-participants"
            >
              {splits.every(s => s.selected) ? 'Deselect All' : 'Select All'}
            </Button>
          </div>
          <div className="space-y-3">
            {splits.map((split) => {
              const user = getUserById(split.userId);
              if (!user) return null;

              return (
                <div 
                  key={split.userId} 
                  className="flex items-center justify-between p-3 bg-secondary rounded-lg"
                  data-testid={`split-item-${split.userId}`}
                >
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      checked={split.selected}
                      onCheckedChange={(checked) => 
                        handleSplitSelection(split.userId, checked as boolean)
                      }
                      data-testid={`checkbox-split-${split.userId}`}
                    />
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                        <span className="text-primary-foreground font-medium text-xs">
                          {user.name.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <span className="text-sm font-medium">
                        {user.id === currentUserId ? "You" : user.name}
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
              );
            })}
          </div>
        </div>

        <div className="flex space-x-3">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => navigate("/dashboard")}
            data-testid="button-cancel-expense"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={expenseMutation.isPending}
            data-testid="button-submit-expense"
          >
            {expenseMutation.isPending ? "Adding..." : "Add Expense"}
          </Button>
        </div>
      </form>
    </div>
  );
}
