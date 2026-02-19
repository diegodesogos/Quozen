import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";
import { withTranslation, WithTranslation } from "react-i18next";

interface Props extends WithTranslation {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    // Clear storage if it's likely a auth/token issue
    if (this.state.error?.message.includes("401") || this.state.error?.message.includes("token")) {
      localStorage.removeItem("quozen_access_token");
      window.location.href = "/login";
      return;
    }
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    const { t } = this.props;
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-10 h-10 text-destructive" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">{t("errorBoundary.title")}</h2>
              <p className="text-muted-foreground">
                {this.state.error?.message || t("errorBoundary.defaultMessage")}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row justify-center">
              <Button onClick={this.handleReset} variant="default" size="lg">
                <RefreshCw className="mr-2 h-4 w-4" />
                {t("errorBoundary.reload")}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground pt-4">
              {t("errorBoundary.hint")}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export { ErrorBoundary };
export default withTranslation()(ErrorBoundary);
