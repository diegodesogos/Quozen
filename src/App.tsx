import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import Dashboard from "@/pages/dashboard";
import Expenses from "@/pages/expenses";
import AddExpense from "@/pages/add-expense";
import EditExpense from "@/pages/edit-expense";
import Groups from "@/pages/groups";
import Profile from "@/pages/profile";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import BottomNavigation from "@/components/bottom-navigation";
import Header from "@/components/header";
import { AppContext } from "@/context/app-context";
import { AuthProvider, useAuth } from "@/context/auth-provider";
import { googleApi, Group } from "@/lib/drive";
import { useSettings } from "@/hooks/use-settings";

// ProtectedRoute definition...
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

const AppLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="max-w-md mx-auto bg-background shadow-2xl min-h-screen relative border-x border-border">
    <Header />
    <main className="pb-20">
      {children}
    </main>
    <BottomNavigation />
  </div>
);

// Exported for testing purposes
export function AuthenticatedApp() {
  const [activeGroupId, setActiveGroupIdState] = useState("");
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Load Settings
  const { settings, isLoading: settingsLoading, updateSettings } = useSettings();

  // Explicitly type the query data as Group[]
  const { data: groups, isLoading: groupsLoading } = useQuery<Group[]>({
    queryKey: ["drive", "groups", user?.email],
    queryFn: () => googleApi.listGroups(user?.email),
    enabled: isAuthenticated && !!user?.email,
  });

  // Persistent Setter for Active Group
  const handleSetActiveGroupId = (groupId: string) => {
    // 1. Immediate UI update
    setActiveGroupIdState(groupId);

    // 2. Persist to Drive (Fire and Forget)
    if (settings) {
      updateSettings({
        ...settings,
        activeGroupId: groupId
      });
    }
  };

  useEffect(() => {
    // Wait for all data sources to load
    if (isLoading || groupsLoading || settingsLoading) return;

    if (isAuthenticated && user) {
      // Logic to determine active group:
      // 1. If we already have one selected in local state, keep it (unless invalid).
      // 2. If not, try the one from Settings.
      // 3. If settings one is invalid/missing, fallback to first in list.
      
      let targetId = activeGroupId;

      // If no local selection, try settings
      if (!targetId && settings?.activeGroupId) {
        targetId = settings.activeGroupId;
      }

      // Verify validity of targetId against the loaded groups list
      const isValidGroup = groups && groups.some(g => g.id === targetId);

      if (isValidGroup) {
        if (activeGroupId !== targetId) {
          setActiveGroupIdState(targetId);
        }
      } else {
        // Fallback if target is invalid or not set
        if (groups && groups.length > 0) {
          // Default to first group
          setActiveGroupIdState(groups[0].id);
        } else if (groups && groups.length === 0) {
          // No groups at all -> redirect to create group
          if (location.pathname !== '/groups') {
            navigate('/groups', { replace: true });
          }
        }
      }
    }
  }, [
    user, 
    isAuthenticated, 
    isLoading, 
    groups, 
    groupsLoading, 
    settings, 
    settingsLoading, 
    activeGroupId, 
    navigate, 
    location.pathname
  ]);

  return (
    <AppContext.Provider value={{ activeGroupId, setActiveGroupId: handleSetActiveGroupId, currentUserId: user?.id || "" }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>}
        />
        <Route
          path="/expenses"
          element={<ProtectedRoute><AppLayout><Expenses /></AppLayout></ProtectedRoute>}
        />
        <Route
          path="/add-expense"
          element={<ProtectedRoute><AppLayout><AddExpense /></AppLayout></ProtectedRoute>}
        />
        <Route
          path="/edit-expense/:id"
          element={<ProtectedRoute><AppLayout><EditExpense /></AppLayout></ProtectedRoute>}
        />
        <Route
          path="/groups"
          element={<ProtectedRoute><AppLayout><Groups /></AppLayout></ProtectedRoute>}
        />
        <Route
          path="/profile"
          element={<ProtectedRoute><AppLayout><Profile /></AppLayout></ProtectedRoute>}
        />
        <Route
          path="/"
          element={
            isLoading ? <div>Loading...</div> :
              isAuthenticated ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </AppContext.Provider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <AuthenticatedApp />
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

export default App;
