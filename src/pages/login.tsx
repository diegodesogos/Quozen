import { useEffect } from "react";
import { Navigate, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/auth-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export default function Login() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  // Clear message on component mount
  useEffect(() => {
    if (location.state?.message) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50">
        <img src="/logo.svg" alt="Quozen" className="w-16 h-16 animate-pulse mb-4" />
        <div className="text-muted-foreground font-medium">{t("common.loading")}</div>
      </div>
    );
  }

  if (isAuthenticated) {
    const from = location.state?.from?.pathname || "/dashboard";
    return <Navigate to={from} replace />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-teal-50 via-background to-teal-100 dark:from-slate-950 dark:via-background dark:to-teal-950/20 p-4">

      <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in-95 duration-500">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-teal-400 to-emerald-400 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative w-24 h-24 bg-background rounded-full shadow-xl flex items-center justify-center p-5 ring-1 ring-border/50">
              <img
                src="/logo.svg"
                alt="Quozen Logo"
                className="w-full h-full object-contain"
              />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {t("login.welcome")}
            </h1>
            <p className="text-muted-foreground text-base max-w-xs mx-auto">
              {t("login.subtitle")}
            </p>
          </div>
        </div>

        {/* Login Card */}
        <Card className="border-border/50 shadow-xl bg-card/80 backdrop-blur-sm overflow-hidden">
          <CardContent className="pt-8 pb-8 px-8">
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <h2 className="text-lg font-semibold text-foreground">{t("login.signIn")}</h2>
                <p className="text-sm text-muted-foreground">
                  {t("login.connect")}
                </p>
              </div>

              <div className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full py-6 text-base font-medium relative overflow-hidden transition-all hover:border-teal-500/50 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 group"
                  onClick={() => login()}
                >
                  <img
                    src="https://www.google.com/favicon.ico"
                    alt="Google"
                    className="w-5 h-5 mr-3 relative z-10"
                  />
                  <span className="relative z-10">{t("login.continue")}</span>
                </Button>
              </div>

              <div className="text-[10px] text-center text-muted-foreground/60 px-4 leading-relaxed">
                {t("login.disclaimer")}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
