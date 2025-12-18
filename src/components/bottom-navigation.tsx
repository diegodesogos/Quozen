import { useLocation, useNavigate } from "react-router-dom"; // <--- Change this import
import { Home, Receipt, Plus, Users, User } from "lucide-react";

export default function BottomNavigation() {
  const location = useLocation(); // <--- Change this hook
  const navigate = useNavigate(); // <--- Add this hook

  const tabs = [
    { id: "home", path: "/dashboard", icon: Home, label: "Home" }, // <-- Point "Home" to /dashboard
    { id: "expenses", path: "/expenses", icon: Receipt, label: "Expenses" },
    { id: "add", path: "/add-expense", icon: Plus, label: "" },
    { id: "groups", path: "/groups", icon: Users, label: "Groups" },
    { id: "profile", path: "/profile", icon: User, label: "Profile" },
  ];

  return (
    <nav className="fixed bottom-0 left-1/2 transform -translate-x-1/2 w-full max-w-md bg-card border-t border-border" data-testid="bottom-navigation">
      <div className="flex items-center justify-around py-2">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path; // <--- Use location.pathname
          const isAddButton = tab.id === "add";
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)} // <--- Change to navigate()
              className={`flex flex-col items-center py-2 px-4 ${
                isAddButton
                  ? "bg-primary text-primary-foreground rounded-full -mt-3 shadow-lg"
                  : isActive
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
              data-testid={`button-nav-${tab.id}`}
            >
              <Icon className={`${isAddButton ? "text-xl" : "w-5 h-5"} mb-1`} />
              {tab.label && <span className="text-xs">{tab.label}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
