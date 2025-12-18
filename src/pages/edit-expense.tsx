import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "@/context/app-context";
import { googleApi } from "@/lib/drive";
import { useToast } from "@/hooks/use-toast";
import ExpenseForm from "@/components/expense-form";

export default function EditExpense() {
  const { id } = useParams();
  const { activeGroupId, currentUserId } = useAppContext();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch group data (including members and expenses)
  const { data: groupData, isLoading } = useQuery({
    queryKey: ["drive", "group", activeGroupId],
    queryFn: () => googleApi.getGroupData(activeGroupId!),
    enabled: !!activeGroupId,
  });

  // Find the specific expense to edit
  const expense = groupData?.expenses.find((e: any) => e.id === id);

  const editMutation = useMutation({
    mutationFn: (updatedData: any) => {
      if (!activeGroupId || !expense) throw new Error("Missing required data");
      return googleApi.updateRow(
        activeGroupId, 
        "Expenses", 
        expense._rowIndex, 
        { ...expense, ...updatedData }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drive", "group", activeGroupId] });
      toast({ title: "Expense updated", description: "The spreadsheet has been saved." });
      navigate("/expenses");
    },
    onError: (error) => {
      console.error(error);
      toast({ 
        title: "Error", 
        description: "Failed to update expense. Please check your connection.", 
        variant: "destructive" 
      });
    }
  });

  // Type-safe guard: Ensure groupData and the specific expense exist before rendering the form
  if (isLoading || !groupData || !expense) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="ml-3 text-muted-foreground">Loading expense details...</p>
      </div>
    );
  }

  return (
    <ExpenseForm 
      title="Edit Expense"
      initialData={expense}
      users={groupData.members}
      currentUserId={currentUserId}
      isPending={editMutation.isPending}
      onSubmit={(data) => editMutation.mutate(data)}
    />
  );
}
