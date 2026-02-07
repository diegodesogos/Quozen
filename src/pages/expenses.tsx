import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "@/context/app-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Filter, ArrowUpDown, Utensils, Car, Bed, ShoppingBag,
  Gamepad2, MoreHorizontal, Trash2, Pencil
} from "lucide-react";
import { googleApi } from "@/lib/drive";
import { useNavigate } from "react-router-dom";
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
import { ConflictError, NotFoundError } from "@/lib/errors";
import { getExpenseUserStatus } from "@/lib/finance";
import { Expense, Member } from "@/lib/storage/types";

export default function Expenses() {
  const { activeGroupId, currentUserId } = useAppContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);

  const { data: groupData, isLoading } = useQuery({
    queryKey: ["drive", "group", activeGroupId],
    queryFn: () => googleApi.getGroupData(activeGroupId),
    enabled: !!activeGroupId,
  });

  const users = (groupData?.members || []) as Member[];
  const expenses = (groupData?.expenses || []) as Expense[];

  const deleteMutation = useMutation({
    mutationFn: (expense: Expense) => {
      if (!expense._rowIndex) throw new Error("Expense missing row index");
      return googleApi.deleteExpense(activeGroupId, expense._rowIndex, expense.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drive", "group", activeGroupId] });
      toast({
        title: "Expense deleted",
        description: "The spreadsheet has been updated successfully."
      });
      setExpenseToDelete(null);
    },
    onError: (error) => {
      setExpenseToDelete(null);
      if (error instanceof NotFoundError || error instanceof ConflictError) {
        toast({
          title: "Sync Error",
          description: "Expense list is out of date. Refreshing...",
          variant: "destructive"
        });
        queryClient.invalidateQueries({ queryKey: ["drive", "group", activeGroupId] });
      } else {
        toast({
          title: "Error",
          description: "Failed to delete expense. Please try again.",
          variant: "destructive"
        });
      }
    }
  });

  const getUserById = (id: string) => users.find(u => u.userId === id);

  const getExpenseIcon = (category: string) => {
    switch (category?.toLowerCase()) {
      case "food": case "food & dining": return Utensils;
      case "transportation": return Car;
      case "accommodation": return Bed;
      case "shopping": return ShoppingBag;
      case "entertainment": return Gamepad2;
      default: return MoreHorizontal;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category?.toLowerCase()) {
      case "food": case "food & dining": return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
      case "transportation": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "accommodation": return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
      case "shopping": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "entertainment": return "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  if (isLoading) {
    return <div className="p-4 text-center">Loading expenses...</div>;
  }

  return (
    <div className="mx-4 mt-4 pb-4" data-testid="expenses-view">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">All Expenses</h2>
        <div className="flex space-x-2">
          <Button variant="outline" size="icon" data-testid="button-filter-expenses">
            <Filter className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" data-testid="button-sort-expenses">
            <ArrowUpDown className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {expenses.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Utensils className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">No expenses yet</h3>
              <p className="text-sm text-muted-foreground">
                Start by adding your first expense to track group spending
              </p>
            </CardContent>
          </Card>
        ) : (
          expenses.slice().reverse().map((expense) => {
            const paidByUser = getUserById(expense.paidBy);
            const userSplit = expense.splits?.find((s: any) => s.userId === currentUserId);
            const yourShare = userSplit?.amount || 0;
            const Icon = getExpenseIcon(expense.category);

            // Use centralized logic
            const status = getExpenseUserStatus(expense, currentUserId);

            return (
              <Card key={expense.id} data-testid={`card-expense-${expense.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className="w-12 h-12 bg-secondary rounded-lg flex items-center justify-center border border-border">
                        <Icon className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground">{expense.description}</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Paid by <span className="font-medium">{paidByUser?.name || 'Unknown'}</span> • {new Date(expense.date).toLocaleDateString()}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          <Badge variant="secondary" className={`font-normal ${getCategoryColor(expense.category)}`}>
                            {expense.category}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="font-bold text-lg text-foreground">
                        ${Number(expense.amount).toFixed(2)}
                      </div>

                      {status.status === 'payer' && (
                        <div className="text-xs expense-positive mb-2">You paid</div>
                      )}
                      {status.status === 'debtor' && (
                        <div className="text-xs expense-negative mb-2">You owe ${status.amountOwed.toFixed(2)}</div>
                      )}
                      {status.status === 'none' && (
                        <div className="text-xs text-muted-foreground mb-2">Not involved</div>
                      )}

                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => navigate(`/edit-expense/${expense.id}`)}
                          data-testid={`button-edit-expense-${expense.id}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setExpenseToDelete(expense)}
                          data-testid={`button-delete-expense-${expense.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <AlertDialog open={!!expenseToDelete} onOpenChange={(open) => !open && setExpenseToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove "{expenseToDelete?.description}" from your Google Sheet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => expenseToDelete && deleteMutation.mutate(expenseToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
