import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-provider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User as UserIcon, Settings, HelpCircle, LogOut, Mail, RefreshCw, AlertCircle, Coins } from "lucide-react";
import { googleApi } from "@/lib/drive";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/use-settings";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export default function Profile() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings, updateSettings } = useSettings();

  // Fetch groups from Drive to show count
  const { data: groups = [] } = useQuery({
    queryKey: ["drive", "groups", user?.email],
    queryFn: () => googleApi.listGroups(user?.email),
    enabled: !!user?.email
  });

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      if (!user?.email) throw new Error("User email required");
      return await googleApi.reconcileGroups(user.email);
    },
    onSuccess: (newSettings) => {
      queryClient.setQueryData(["drive", "settings", user?.email], newSettings);
      queryClient.invalidateQueries({ queryKey: ["drive", "groups"] });
      
      toast({
        title: "Scan Complete",
        description: `Found ${newSettings.groupCache.length} groups in your Drive.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Scan Failed",
        description: error instanceof Error ? error.message : "Could not scan Drive",
        variant: "destructive"
      });
    }
  });

  const handleCurrencyChange = (currency: string) => {
    if (settings) {
      updateSettings({
        ...settings,
        preferences: {
          ...settings.preferences,
          defaultCurrency: currency
        }
      });
      toast({ title: "Currency updated" });
    }
  };

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
    <div className="mx-4 mt-4 space-y-6 pb-8" data-testid="profile-view">
      {/* Profile Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center overflow-hidden">
              {user.picture ? (
                 <img src={user.picture} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                 <UserIcon className="w-8 h-8 text-primary-foreground" />
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-foreground" data-testid="text-user-name">
                {user.name}
              </h2>
              <p className="text-muted-foreground" data-testid="text-user-email">
                {user.email}
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
              {settings?.preferences?.defaultCurrency || "USD"}
            </div>
            <p className="text-sm text-muted-foreground">Currency</p>
          </CardContent>
        </Card>
      </div>

      {/* Preferences & Data */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center">
            <Settings className="w-5 h-5 mr-2" />
            Preferences & Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* Currency */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-muted-foreground" />
              Default Currency
            </Label>
            <Select 
              value={settings?.preferences?.defaultCurrency || "USD"} 
              onValueChange={handleCurrencyChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD ($)</SelectItem>
                <SelectItem value="EUR">EUR (€)</SelectItem>
                <SelectItem value="GBP">GBP (£)</SelectItem>
                <SelectItem value="JPY">JPY (¥)</SelectItem>
                <SelectItem value="CAD">CAD ($)</SelectItem>
                <SelectItem value="AUD">AUD ($)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Sync */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Reconcile Groups</h4>
            <p className="text-xs text-muted-foreground">
              Scan your Google Drive to find groups created on other devices.
            </p>
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={() => reconcileMutation.mutate()}
              disabled={reconcileMutation.isPending}
              data-testid="button-reconcile"
            >
              <RefreshCw className={`w-4 h-4 mr-3 ${reconcileMutation.isPending ? 'animate-spin' : ''}`} />
              {reconcileMutation.isPending ? "Scanning Drive..." : "Scan for missing groups"}
            </Button>
          </div>

          <Separator />

          <div className="space-y-2">
            <h4 className="text-sm font-medium">Troubleshooting</h4>
             <Button 
              variant="ghost" 
              className="w-full justify-start text-destructive hover:text-destructive" 
              onClick={() => {
                localStorage.removeItem("quozen_access_token");
                window.location.reload();
              }}
            >
              <AlertCircle className="w-4 h-4 mr-3" />
              Force Re-login
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

      <div className="text-center text-xs text-muted-foreground py-4">
        <p>Quozen v1.0.0</p>
        <p>Decentralized Expense Sharing</p>
      </div>
    </div>
  );
}
