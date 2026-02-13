import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "@/context/app-context";
import { useToast } from "@/hooks/use-toast";
import { googleApi } from "@/lib/drive";
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
  const { data: groupData } = useQuery({
    queryKey: ["drive", "group", activeGroupId],
    queryFn: () => googleApi.getGroupData(activeGroupId),
    enabled: !!activeGroupId,
  });

  const users = groupData?.members || [];

  const expenseMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!activeGroupId) throw new Error("No active group");
      return await googleApi.addExpense(activeGroupId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drive", "group", activeGroupId] });
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

  if (!groupData) {
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
