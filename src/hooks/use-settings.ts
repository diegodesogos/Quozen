import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { googleApi, UserSettings } from "@/lib/drive";
import { useAuth } from "@/context/auth-provider";

export function useSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["drive", "settings", user?.email];

  const query = useQuery({
    queryKey: queryKey,
    queryFn: () => {
      if (!user?.email) throw new Error("User email not found");
      return googleApi.getSettings(user.email);
    },
    enabled: !!user?.email,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const mutation = useMutation({
    mutationFn: (newSettings: UserSettings) => googleApi.saveSettings(newSettings),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(queryKey, variables);
      // Also invalidate groups list as it is derived from settings
      queryClient.invalidateQueries({ queryKey: ["drive", "groups", user?.email] });
    },
  });

  return {
    settings: query.data,
    isLoading: query.isLoading,
    error: query.error,
    updateSettings: mutation.mutate,
    updateSettingsAsync: mutation.mutateAsync,
    isUpdating: mutation.isPending
  };
}
