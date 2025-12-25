import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate } from "react-router-dom";

interface ExpenseSplit {
  userId: string;
  amount: number;
  selected: boolean;
}

interface ExpenseFormProps {
  initialData?: any;
  users: any[];
  currentUserId: string;
  onSubmit: (data: any) => void;
  isPending: boolean;
  title: string;
}

export default function ExpenseForm({ initialData, users, currentUserId, onSubmit, isPending, title }: ExpenseFormProps) {
  const navigate = useNavigate();
  const [description, setDescription] = useState(initialData?.description || "");
  const [amount, setAmount] = useState(initialData?.amount?.toString() || "");
  const [paidBy, setPaidBy] = useState(initialData?.paidBy || currentUserId);
  const [category, setCategory] = useState(initialData?.category || "");
  const [date, setDate] = useState(initialData?.date ? new Date(initialData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
  const [splits, setSplits] = useState<ExpenseSplit[]>([]);

  useEffect(() => {
    if (users.length > 0 && splits.length === 0) {
      const initialSplits = users.map((u: any) => {
        const existingSplit = initialData?.splits?.find((s: any) => s.userId === u.userId);
        return {
          userId: u.userId,
          amount: existingSplit?.amount || 0,
          selected: !!existingSplit || !initialData, // Default to true for new expenses
        };
      });
      setSplits(initialSplits);
    }
  }, [users, initialData]);

  const handleAmountChange = (value: string) => {
    setAmount(value);
    updateSplitEqually(value, splits);
  };

  const updateSplitEqually = (currentAmount: string, currentSplits: ExpenseSplit[]) => {
    const selectedSplits = currentSplits.filter(s => s.selected);
    if (selectedSplits.length === 0 || !currentAmount) return;
    const splitAmount = parseFloat(currentAmount) / selectedSplits.length;
    setSplits(currentSplits.map(s => ({ ...s, amount: s.selected ? splitAmount : 0 })));
  };

  const handleSplitSelection = (userId: string, selected: boolean) => {
    const newSplits = splits.map(s => s.userId === userId ? { ...s, selected } : s);
    updateSplitEqually(amount, newSplits);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedSplits = splits.filter(s => s.selected && s.amount > 0);
    onSubmit({
      description,
      amount: parseFloat(amount),
      paidBy,
      category,
      date: new Date(date).toISOString(),
      splits: selectedSplits.map(s => ({ userId: s.userId, amount: s.amount })),
    });
  };

  return (
    <div className="mx-4 mt-4">
      <h2 className="text-xl font-bold mb-6">{title}</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <Label htmlFor="description">Description *</Label>
          <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="amount">Amount *</Label>
          <Input id="amount" type="number" step="0.01" value={amount} onChange={(e) => handleAmountChange(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="paidBy">Paid by *</Label>
          <Select value={paidBy} onValueChange={setPaidBy}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {users.map((u) => <SelectItem key={u.userId} value={u.userId}>{u.userId === currentUserId ? "You" : u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="category">Category *</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              {["Food & Dining", "Transportation", "Accommodation", "Entertainment", "Shopping", "Other"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-3">
          <Label>Split Between</Label>
          {splits.map((split) => (
            <div key={split.userId} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
              <div className="flex items-center space-x-3">
                <Checkbox checked={split.selected} onCheckedChange={(checked) => handleSplitSelection(split.userId, !!checked)} />
                <span className="text-sm font-medium">{users.find(u => u.userId === split.userId)?.name}</span>
              </div>
              <span className="text-sm font-bold">${split.amount.toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="flex space-x-3">
          <Button type="button" variant="secondary" className="flex-1" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={isPending}>{isPending ? "Saving..." : "Save Expense"}</Button>
        </div>
      </form>
    </div>
  );
}
