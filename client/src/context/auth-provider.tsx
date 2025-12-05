import { createContext, useContext, useState, ReactNode } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import axios from 'axios';
import { setAuthToken, getAuthToken as getTokenFromStore } from '../lib/tokenStore';

// Define a client-side User type compatible with the app's needs
export interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  picture?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, _setToken] = useState<string | null>(() => getTokenFromStore());
  const [isLoading, setIsLoading] = useState(false);

  const setToken = (newToken: string | null) => {
    setAuthToken(newToken);
    _setToken(newToken);
  };

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      const accessToken = tokenResponse.access_token;
      setToken(accessToken);
      setIsLoading(true);
      
      try {
        // Fetch user profile from Google
        const userInfo = await axios.get(
          'https://www.googleapis.com/oauth2/v3/userinfo',
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        
        setUser({
          id: userInfo.data.sub,
          username: userInfo.data.email, // Use email as username
          email: userInfo.data.email,
          name: userInfo.data.name,
          picture: userInfo.data.picture
        });
      } catch (error) {
        console.error("Failed to fetch user info", error);
        logout();
      } finally {
        setIsLoading(false);
      }
    },
    onError: error => console.error('Login Failed:', error),
    // Request scopes for Google Sheets and Drive
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
  });

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated: !!token && !!user, 
      isLoading, 
      token, 
      login, 
      logout 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
