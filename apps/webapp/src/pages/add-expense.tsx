import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "@/context/app-context";
import { useToast } from "@/hooks/use-toast";
import { quozen } from "@/lib/drive";
import { UserSettings } from "@quozen/core";
import { useNavigate } from "react-router-dom";
import ExpenseForm from "@/components/expense-form";
import { useTranslation } from "react-i18next";

export default function AddExpense() {
  const { activeGroupId, currentUserId } = useAppContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Fetch group data (including members) from Google Sheet
  const { data: ledger } = useQuery({
    queryKey: ["drive", "group", activeGroupId],
    queryFn: () => quozen.ledger(activeGroupId).getLedger(),
    enabled: !!activeGroupId,
  });

  const users = ledger?.members || [];

  const expenseMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!activeGroupId) throw new Error("No active group");
      return await quozen.ledger(activeGroupId).addExpense({
        description: data.description,
        amount: data.amount,
        category: data.category,
        date: new Date(data.date),
        paidByUserId: data.paidBy,
        splits: data.splits
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drive", "group", activeGroupId] });
      navigator.vibrate?.(50);
      toast({
        title: t("common.success"),
        description: t("expenseForm.save"),
      });
      navigate("/dashboard");
    },
    onError: (error) => {
      console.error(error);
      toast({
        title: t("common.error"),
        description: t("expenseForm.addError"),
        variant: "destructive",
      });
    },
  });

  if (!ledger) {
    return <div className="p-4 text-center">{t("common.loading")}</div>;
  }

  return (
    <div data-testid="add-expense-view">
      <ExpenseForm
        users={users}
        currentUserId={currentUserId}
        isPending={expenseMutation.isPending}
        onSubmit={(data) => expenseMutation.mutate(data)}
      />
    </div>
  );
}
