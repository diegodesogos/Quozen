import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../context/auth-provider";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Alert, AlertDescription } from "../components/ui/alert";
import { useTranslation } from "react-i18next";

export default function Register() {
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    email: "",
    name: "",
  });
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated } = useAuth();
  // Stub register for now as it is not in AuthContext
  const register = async (data: any) => { throw new Error("Registration not supported"); };
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await register({
        username: formData.username,
        password: formData.password,
        email: formData.email,
        name: formData.name
      });
      navigate('/dashboard');
    } catch (err) {
      setError(t("register.failed"));
    }
  };

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="container mx-auto p-4 flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("register.title")}</CardTitle>
          <CardDescription>{t("register.desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Input
                type="text"
                name="username"
                placeholder={t("register.username")}
                value={formData.username}
                onChange={handleChange}
                required
              />
            </div>
            <div className="space-y-2">
              <Input
                type="email"
                name="email"
                placeholder={t("register.email")}
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
            <div className="space-y-2">
              <Input
                type="text"
                name="name"
                placeholder={t("register.fullName")}
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>
            <div className="space-y-2">
              <Input
                type="password"
                name="password"
                placeholder={t("register.password")}
                value={formData.password}
                onChange={handleChange}
                required
                minLength={8}
              />
            </div>
            <Button type="submit" className="w-full">
              {t("register.signUp")}
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              {t("register.hasAccount")}{" "}
              <Button
                variant="link"
                className="p-0 font-normal"
                onClick={() => navigate("/login")}
              >
                {t("register.logIn")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
