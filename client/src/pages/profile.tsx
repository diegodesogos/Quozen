import { useQuery } from "@tanstack/react-query";
import { useAppContext } from "@/context/app-context";
import { useAuth } from "@/context/auth-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User as UserIcon, Settings, HelpCircle, LogOut, Mail } from "lucide-react";

interface UserData {
  id: string;
  name: string;
  email: string;
  username: string;
}

export default function Profile() {
  const { currentUserId } = useAppContext();
  const { logout } = useAuth();

  const { data: user } = useQuery<UserData>({
    queryKey: ["/api/users", currentUserId],
    enabled: !!currentUserId,
  });

  const { data: groups = [] } = useQuery<any[]>({
    queryKey: ["/api/users", currentUserId, "groups"],
  });

  const handleLogout = () => {
    logout();
  };

  if (!user) {
    return (
      <div className="mx-4 mt-4" data-testid="profile-loading">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground mt-2">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4 mt-4 space-y-6" data-testid="profile-view">
      {/* Profile Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
              <UserIcon className="w-8 h-8 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-foreground" data-testid="text-user-name">
                {user.name}
              </h2>
              <p className="text-muted-foreground" data-testid="text-user-email">
                {user.email}
              </p>
              <p className="text-sm text-muted-foreground" data-testid="text-username">
                @{user.username}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-foreground" data-testid="text-group-count">
              {groups.length}
            </div>
            <p className="text-sm text-muted-foreground">Active Groups</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-foreground">
              0
            </div>
            <p className="text-sm text-muted-foreground">Total Expenses</p>
          </CardContent>
        </Card>
      </div>

      {/* Account Settings */}
      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold text-foreground mb-4">Account</h3>
          <div className="space-y-2">
            <Button 
              variant="ghost" 
              className="w-full justify-start" 
              data-testid="button-edit-profile"
            >
              <UserIcon className="w-4 h-4 mr-3" />
              Edit Profile
            </Button>
            <Button 
              variant="ghost" 
              className="w-full justify-start" 
              data-testid="button-settings"
            >
              <Settings className="w-4 h-4 mr-3" />
              Settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Support */}
      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold text-foreground mb-4">Support</h3>
          <div className="space-y-2">
            <Button 
              variant="ghost" 
              className="w-full justify-start" 
              data-testid="button-help"
            >
              <HelpCircle className="w-4 h-4 mr-3" />
              Help & FAQ
            </Button>
            <Button 
              variant="ghost" 
              className="w-full justify-start" 
              data-testid="button-contact"
            >
              <Mail className="w-4 h-4 mr-3" />
              Contact Support
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sign Out */}
      <Card>
        <CardContent className="p-4">
          <Button 
            variant="ghost" 
            className="w-full justify-start text-destructive hover:text-destructive" 
            data-testid="button-sign-out"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-3" />
            Sign Out
          </Button>
        </CardContent>
      </Card>

      {/* App Info */}
      <div className="text-center text-xs text-muted-foreground py-4">
        <p>SplitEase v1.0.0</p>
        <p>Built with ❤️ for splitting expenses</p>
      </div>
    </div>
  );
}
