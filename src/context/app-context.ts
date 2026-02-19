import { createContext, useContext } from "react";

export interface AppState {
  activeGroupId: string;
  setActiveGroupId: (groupId: string) => void;
  currentUserId: string;
  isAddExpenseOpen: boolean;
  setIsAddExpenseOpen: (isOpen: boolean) => void;
}

export const AppContext = createContext<AppState | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within AppProvider");
  }
  return context;
};