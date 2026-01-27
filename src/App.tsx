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

function AuthenticatedApp() {
  const [activeGroupId, setActiveGroupId] = useState("");
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Explicitly type the query data as Group[]
  const { data: groups, isLoading: groupsLoading } = useQuery<Group[]>({
    queryKey: ["drive", "groups", user?.email],
    queryFn: () => googleApi.listGroups(user?.email),
    enabled: isAuthenticated && !!user?.email,
  });

  useEffect(() => {
    if (isLoading || groupsLoading) return;

    if (isAuthenticated && user) {
      if (groups && groups.length > 0) {
        // 'g' is now correctly inferred as Group
        const currentGroupIsValid = groups.some(g => g.id === activeGroupId);
        if (!activeGroupId || !currentGroupIsValid) {
          setActiveGroupId(groups[0].id);
        }
      } else if (groups && groups.length === 0) {
        if (location.pathname !== '/groups') {
          navigate('/groups', { replace: true });
        }
      }
    }
  }, [user, isAuthenticated, isLoading, groups, groupsLoading, activeGroupId, navigate, location.pathname]);

  return (
    <AppContext.Provider value={{ activeGroupId, setActiveGroupId, currentUserId: user?.id || "" }}>
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
