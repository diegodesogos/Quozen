import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "@/context/app-context";
import { googleApi } from "@/lib/drive";
import { useToast } from "@/hooks/use-toast";
import ExpenseForm from "@/components/expense-form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useState, useEffect } from "react";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { useTranslation } from "react-i18next";

export default function EditExpense() {
  const { id } = useParams();
  const { activeGroupId, currentUserId } = useAppContext();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [conflictError, setConflictError] = useState<string | null>(null);
  const [notFoundError, setNotFoundError] = useState(false);

  const { data: groupData, isLoading, refetch } = useQuery({
    queryKey: ["drive", "group", activeGroupId],
    queryFn: () => googleApi.getGroupData(activeGroupId!),
    enabled: !!activeGroupId,
  });

  const expense = groupData?.expenses.find((e: any) => e.id === id);

  useEffect(() => {
    if (!isLoading && groupData && !expense) {
      setNotFoundError(true);
    }
  }, [isLoading, groupData, expense]);

  const editMutation = useMutation({
    mutationFn: (updatedData: any) => {
      if (!activeGroupId || !expense || typeof expense._rowIndex !== 'number') throw new Error("Missing required data");

      return googleApi.updateExpense(
        activeGroupId,
        expense._rowIndex,
        { ...expense, ...updatedData },
        expense.meta?.lastModified
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drive", "group", activeGroupId] });
      navigator.vibrate?.(50);
      toast({ title: t("common.success") });
      navigate("/expenses");
    },
    onError: (error) => {
      console.error(error);
      if (error instanceof ConflictError) {
        setConflictError(error.message);
      } else if (error instanceof NotFoundError) {
        setNotFoundError(true);
      } else {
        toast({
          title: t("common.error"),
          description: t("expenseForm.updateError"),
          variant: "destructive"
        });
      }
    }
  });

  const handleRefresh = async () => {
    setConflictError(null);
    setNotFoundError(false);
    await refetch();
  };

  const handleBack = () => {
    navigate("/expenses");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="ml-3 text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  if (notFoundError) {
    return (
      <AlertDialog open={true}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("expenseForm.notFoundTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("expenseForm.notFoundDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleBack}>{t("expenseForm.goBack")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  if (!groupData || !expense) return null;

  return (
    <>
      <ExpenseForm
        initialData={expense}
        users={groupData.members}
        currentUserId={currentUserId}
        isPending={editMutation.isPending}
        onSubmit={(data) => editMutation.mutate(data)}
      />

      <AlertDialog open={!!conflictError}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("expenseForm.conflictTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {conflictError}
              <br /><br />
              {t("expenseForm.conflictDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConflictError(null)}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRefresh}>{t("expenseForm.refreshData")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
