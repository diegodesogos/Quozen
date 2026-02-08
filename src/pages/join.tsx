import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { googleApi } from "@/lib/drive";
import { useAuth } from "@/context/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAppContext } from "@/context/app-context";
import { useTranslation } from "react-i18next";

export default function JoinPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user, isAuthenticated, isLoading: authLoading } = useAuth();
    const { setActiveGroupId } = useAppContext();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { t } = useTranslation();
    const [error, setError] = useState<string | null>(null);

    const joinMutation = useMutation({
        mutationFn: async () => {
            if (!id) throw new Error("Invalid Link");
            if (!user) throw new Error("Authentication required");
            return await googleApi.joinGroup(id, user);
        },
        onSuccess: (group) => {
            queryClient.invalidateQueries({ queryKey: ["drive", "settings"] });
            queryClient.invalidateQueries({ queryKey: ["drive", "group", group.id] });

            setActiveGroupId(group.id);

            toast({
                title: t("join.successTitle"),
                description: t("join.successDesc", { name: group.name }),
            });

            setTimeout(() => navigate("/dashboard"), 1000);
        },
        onError: (err: any) => {
            console.error("Join failed", err);
            if (err.message.includes("403") || err.message.includes("permission")) {
                setError(t("join.accessDenied"));
            } else {
                setError(err.message || t("join.genericError"));
            }
        }
    });

    useEffect(() => {
        if (authLoading) return;

        if (!isAuthenticated) {
            navigate("/login", {
                state: { from: { pathname: window.location.pathname }, message: t("join.signIn") }
            });
            return;
        }

        if (id && user && !joinMutation.isPending && !joinMutation.isSuccess && !error) {
            joinMutation.mutate();
        }
    }, [id, user, isAuthenticated, authLoading, navigate, t]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md shadow-lg border-t-4 border-t-primary">
                <CardContent className="pt-8 pb-8 flex flex-col items-center text-center space-y-4">

                    {(authLoading || joinMutation.isPending) && (
                        <>
                            <Loader2 className="w-12 h-12 text-primary animate-spin" />
                            <div>
                                <h2 className="text-xl font-semibold">{t("join.loadingTitle")}</h2>
                                <p className="text-muted-foreground text-sm">{t("join.loadingDesc")}</p>
                            </div>
                        </>
                    )}

                    {joinMutation.isSuccess && (
                        <>
                            <CheckCircle2 className="w-12 h-12 text-green-500" />
                            <div>
                                <h2 className="text-xl font-semibold">{t("join.successTitle")}</h2>
                                <p className="text-muted-foreground text-sm">{t("join.successDesc", { name: "" })}</p>
                            </div>
                        </>
                    )}

                    {error && (
                        <>
                            <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center">
                                <AlertCircle className="w-6 h-6 text-destructive" />
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold">{t("join.errorTitle")}</h2>
                                <p className="text-muted-foreground text-sm mt-2">{error}</p>
                            </div>
                            <div className="flex gap-2 w-full pt-4">
                                <Button variant="outline" className="flex-1" onClick={() => navigate("/dashboard")}>
                                    {t("join.goHome")}
                                </Button>
                                <Button className="flex-1" onClick={() => window.location.reload()}>
                                    {t("join.tryAgain")}
                                </Button>
                            </div>
                        </>
                    )}

                </CardContent>
            </Card>
        </div>
    );
}
