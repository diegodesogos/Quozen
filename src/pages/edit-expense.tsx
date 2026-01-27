import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "@/context/app-context";
import { googleApi } from "@/lib/drive";
import { useToast } from "@/hooks/use-toast";
import ExpenseForm from "@/components/expense-form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useState, useEffect } from "react";
import { ConflictError, NotFoundError } from "@/lib/errors";

export default function EditExpense() {
  const { id } = useParams();
  const { activeGroupId, currentUserId } = useAppContext();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [conflictError, setConflictError] = useState<string | null>(null);
  const [notFoundError, setNotFoundError] = useState(false);

  // Fetch group data
  const { data: groupData, isLoading, refetch } = useQuery({
    queryKey: ["drive", "group", activeGroupId],
    queryFn: () => googleApi.getGroupData(activeGroupId!),
    enabled: !!activeGroupId,
  });

  // Find the specific expense to edit
  const expense = groupData?.expenses.find((e: any) => e.id === id);

  // Check existence once loaded
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
        expense.meta?.lastModified // Pass current known version
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drive", "group", activeGroupId] });
      toast({ title: "Expense updated", description: "The spreadsheet has been saved." });
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
          title: "Error",
          description: "Failed to update expense. Please check your connection.",
          variant: "destructive"
        });
      }
    }
  });

  const handleRefresh = async () => {
    setConflictError(null);
    setNotFoundError(false);
    await refetch();
    // After refetch, if expense is gone, useEffect triggers notFound.
    // If expense changed, form updates naturally via key/props.
  };

  const handleBack = () => {
    navigate("/expenses");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="ml-3 text-muted-foreground">Loading expense details...</p>
      </div>
    );
  }

  // If not found (either initially or after delete conflict)
  if (notFoundError) {
    return (
      <AlertDialog open={true}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Expense Not Found</AlertDialogTitle>
            <AlertDialogDescription>
              This expense seems to have been deleted by another user.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleBack}>Go Back to List</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  if (!groupData || !expense) return null;

  return (
    <>
      <ExpenseForm
        title="Edit Expense"
        initialData={expense}
        users={groupData.members}
        currentUserId={currentUserId}
        isPending={editMutation.isPending}
        onSubmit={(data) => editMutation.mutate(data)}
      />

      {/* Conflict Dialog */}
      <AlertDialog open={!!conflictError}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Data Conflict</AlertDialogTitle>
            <AlertDialogDescription>
              {conflictError}
              <br/><br/>
              Someone else has modified this expense. Please refresh to see the latest changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConflictError(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRefresh}>Refresh Data</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
