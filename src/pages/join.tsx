import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { googleApi, UserSettings } from "@/lib/drive";
import { useAuth } from "@/context/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, CheckCircle2, ExternalLink, Search } from "lucide-react";
import { useAppContext } from "@/context/app-context";
import { useTranslation } from "react-i18next";
import { useGooglePicker } from "@/hooks/use-google-picker";

export default function JoinPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const { user, isAuthenticated, isLoading: authLoading } = useAuth();
    const { setActiveGroupId } = useAppContext();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { t } = useTranslation();
    const [error, setError] = useState<string | null>(null);
    const [hasOpenedDrive, setHasOpenedDrive] = useState(false);

    const groupName = searchParams.get("name") || "Group";
    const inviterName = searchParams.get("inviter") || "Someone";

    const joinMutation = useMutation({
        mutationFn: async () => {
            if (!id) throw new Error("Invalid Link");
            if (!user) throw new Error("Authentication required");
            return await googleApi.joinGroup(id, user);
        },
        onSuccess: (group) => {
            // Optimistic update: Update local cache immediately so App.tsx sees the group as valid
            // before the network request for settings completes. Prevents race-condition redirects.
            if (user?.email) {
                queryClient.setQueryData<UserSettings>(["drive", "settings", user.email], (old) => {
                    if (!old) return old;

                    const exists = old.groupCache.some(g => g.id === group.id);
                    const newCache = exists
                        ? old.groupCache
                        : [{
                            id: group.id,
                            name: group.name,
                            role: (group.isOwner ? "owner" : "member") as "owner" | "member",
                            lastAccessed: new Date().toISOString()
                        }, ...old.groupCache];

                    return {
                        ...old,
                        activeGroupId: group.id,
                        groupCache: newCache
                    };
                });
            }

            // Trigger actual refresh in background
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
            // Handle specific Google API error codes
            const errMsg = err.message || "";
            if (errMsg.includes("403") || errMsg.includes("permission") || errMsg.includes("Forbidden") || errMsg.includes("404")) {
                setError(t("join.accessDenied"));
            } else {
                setError(errMsg || t("join.genericError"));
            }
        }
    });

    useEffect(() => {
        if (authLoading) return;

        if (!isAuthenticated) {
            navigate("/login", {
                state: { from: location, message: t("join.signIn") }
            });
            return;
        }
    }, [isAuthenticated, authLoading, navigate, t, location]);

    const { openPicker } = useGooglePicker({
        // Search by name if available, fallback to ID. Name is better for user recognition in picker.
        // But ID search in picker is flaky if file is not indexed. 
        // Strategy: User clicks Link -> File added to "Recent" -> Picker searches by name -> User picks.
        query: groupName !== "Group" ? groupName : undefined,
        onPick: (doc) => {
            if (doc.id === id) {
                setError(null);
                // Retry mutation now that we presumably have permission
                joinMutation.mutate();
            } else {
                toast({ title: t("common.error"), description: t("join.idMismatch"), variant: "destructive" });
            }
        }
    });

    const driveUrl = id ? `https://docs.google.com/spreadsheets/d/${id}` : "#";

    // 1. Welcome State (Pre-join)
    if (!joinMutation.isPending && !joinMutation.isSuccess && !error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <Card className="w-full max-w-md shadow-lg border-t-4 border-t-primary">
                    <CardContent className="pt-8 pb-8 flex flex-col items-center text-center space-y-6">
                        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-2">
                            <CheckCircle2 className="w-8 h-8 text-primary" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-2xl font-bold">{t("join.welcomeTitle")}</h2>
                            <p className="text-muted-foreground text-base">
                                {t("join.welcomeDesc", { inviter: inviterName, groupName })}
                            </p>
                        </div>
                        <Button
                            size="lg"
                            className="w-full"
                            onClick={() => joinMutation.mutate()}
                        >
                            {t("join.joinButton")}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

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
                                <p className="text-muted-foreground text-sm">{t("join.successDesc", { name: joinMutation.data?.name || "" })}</p>
                            </div>
                        </>
                    )}

                    {error && (
                        <>
                            <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center">
                                <AlertCircle className="w-6 h-6 text-destructive" />
                            </div>

                            {error === t("join.accessDenied") ? (
                                <div className="space-y-4 w-full">
                                    <div>
                                        <h2 className="text-lg font-semibold">{t("join.accessRequired")}</h2>
                                        <p className="text-muted-foreground text-xs mt-1 px-2">{t("join.accessRequiredDesc")}</p>
                                    </div>

                                    <div className="grid gap-3 text-left">
                                        <Button variant="outline" className="h-auto py-3 px-4 justify-start flex-col items-start gap-1" asChild onClick={() => setHasOpenedDrive(true)}>
                                            <a href={driveUrl} target="_blank" rel="noopener noreferrer">
                                                <div className="flex items-center gap-2 font-semibold text-primary"><ExternalLink className="w-4 h-4" /> {t("join.step1")}</div>
                                                <span className="text-xs text-muted-foreground font-normal">{t("join.step1Desc")}</span>
                                            </a>
                                        </Button>

                                        <Button
                                            className="h-auto py-3 px-4 justify-start flex-col items-start gap-1"
                                            onClick={() => openPicker()}
                                            disabled={!hasOpenedDrive}
                                        >
                                            <div className="flex items-center gap-2 font-semibold"><Search className="w-4 h-4" /> {t("join.step2")}</div>
                                            <span className="text-xs text-primary-foreground/80 font-normal">{t("join.step2Desc")}</span>
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <h2 className="text-xl font-semibold">{t("join.errorTitle")}</h2>
                                    <p className="text-muted-foreground text-sm mt-2">{error}</p>
                                    <Button className="mt-4" onClick={() => window.location.reload()}>
                                        {t("join.tryAgain")}
                                    </Button>
                                    <div className="mt-2"><Button variant="link" onClick={() => navigate("/dashboard")}>{t("join.goHome")}</Button></div>
                                </div>
                            )}
                        </>
                    )}

                </CardContent>
            </Card>
        </div>
    );
}
