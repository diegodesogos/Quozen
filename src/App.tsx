import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import Dashboard from "@/pages/dashboard";
import ActivityHub from "@/pages/activity-hub";
import AddExpense from "@/pages/add-expense";
import EditExpense from "@/pages/edit-expense";
import Groups from "@/pages/groups";
import Profile from "@/pages/profile";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import JoinPage from "@/pages/join";
import BottomNavigation from "@/components/bottom-navigation";
import Header from "@/components/header";
import { AppContext } from "@/context/app-context";
import { AuthProvider, useAuth } from "@/context/auth-provider";
import { useSettings } from "@/hooks/use-settings";
import { useGroups } from "@/hooks/use-groups";
import { AutoSyncProvider } from "@/context/auto-sync-context";
import { useTranslation } from "react-i18next";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">{t("common.loading")}</div>
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

export function AuthenticatedApp() {
  const [activeGroupId, setActiveGroupIdState] = useState("");
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const { settings, updateActiveGroup, isLoading: settingsLoading, error: settingsError } = useSettings();
  const { groups } = useGroups();

  const appLoading = authLoading || (isAuthenticated && settingsLoading);

  useEffect(() => {
    if (settingsError) {
      const errMsg = String(settingsError?.message || settingsError);
      if (errMsg.includes("401") || errMsg.includes("Session expired")) {
        console.warn("Session expired detected in App. Logging out.");
        logout();
        navigate("/login");
      }
    }
  }, [settingsError, logout, navigate]);

  const handleSetActiveGroupId = (groupId: string) => {
    setActiveGroupIdState(groupId);
    if (isAuthenticated) {
      updateActiveGroup(groupId);
    }
  };

  useEffect(() => {
    if (appLoading) return;

    if (isAuthenticated && user) {
      let targetId = activeGroupId;
      if (!targetId && settings?.activeGroupId) {
        targetId = settings.activeGroupId;
      }
      const isValidGroup = groups.some(g => g.id === targetId);

      if (isValidGroup) {
        if (activeGroupId !== targetId) {
          setActiveGroupIdState(targetId);
        }
      } else {
        if (groups.length > 0) {
          setActiveGroupIdState(groups[0].id);
        } else if (groups.length === 0) {
          const allowedPaths = ['/groups', '/profile', '/join'];
          const isAllowed = allowedPaths.some(path => location.pathname.startsWith(path));

          if (!isAllowed) {
            navigate('/groups', { replace: true });
          }
        }
      }
    }
  }, [
    user,
    isAuthenticated,
    appLoading,
    groups,
    settings,
    activeGroupId,
    navigate,
    location.pathname
  ]);

  if (isAuthenticated && appLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ activeGroupId, setActiveGroupId: handleSetActiveGroupId, currentUserId: user?.id || "" }}>
      <AutoSyncProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/join/:id" element={<JoinPage />} />

          <Route
            path="/dashboard"
            element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>}
          />
          <Route
            path="/expenses"
            element={<ProtectedRoute><AppLayout><ActivityHub /></AppLayout></ProtectedRoute>}
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
              authLoading ? <div>{t("common.loading")}</div> :
                isAuthenticated ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Toaster />
      </AutoSyncProvider>
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
