import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { googleApi, UserSettings } from "@/lib/drive";
import { useAuth } from "@/context/auth-provider";

export function useSettings() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["drive", "settings", user?.email];

  const query = useQuery({
    queryKey: queryKey,
    queryFn: () => {
      if (!user?.email) throw new Error("User email not found");
      return googleApi.getSettings(user.email);
    },
    enabled: !!user?.email && isAuthenticated,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const mutation = useMutation({
    mutationFn: (newSettings: UserSettings) => googleApi.saveSettings(newSettings),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(queryKey, variables);
      queryClient.invalidateQueries({ queryKey: ["drive", "groups", user?.email] });
    },
  });

  const activeGroupMutation = useMutation({
    mutationFn: (groupId: string) => {
      if (!user?.email) throw new Error("User email required");
      return googleApi.updateActiveGroup(user.email, groupId);
    },
    onSuccess: (_, groupId) => {
      // Optimistic update of local cache for smoother UI
      queryClient.setQueryData(queryKey, (old: UserSettings | undefined) => {
        if (!old) return old;
        return { ...old, activeGroupId: groupId };
      });
      queryClient.invalidateQueries({ queryKey: queryKey });
    }
  });

  return {
    settings: query.data,
    isLoading: query.isLoading,
    error: query.error,
    updateSettings: mutation.mutate,
    updateSettingsAsync: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    // New atomic updater
    updateActiveGroup: activeGroupMutation.mutate,
  };
}
