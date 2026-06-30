import { useState } from "react";
import { useGetCurrentAuthUser, signInUser, signUpUser, confirmSignUpUser } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pickaxe, Compass, Map } from "lucide-react";

export default function Login() {
  const { data, isLoading, refetch } = useGetCurrentAuthUser();
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<"signin" | "signup" | "confirm">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) return null;

  if (data?.user) {
    setLocation("/");
    return null;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    try {
      if (mode === "signup") {
        await signUpUser({ email, password });
        setMode("confirm");
        setMessage("Account created. Check your email for a confirmation code.");
      } else if (mode === "confirm") {
        await confirmSignUpUser({ email, code });
        setMode("signin");
        setMessage("Email confirmed. You can sign in now.");
      } else {
        await signInUser({ email, password });
        localStorage.removeItem("geofield-demo-mode");
        await refetch();
        setLocation("/");
      }
    } catch (error: any) {
      setMessage(error?.message || "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
      <div
        className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `url('${import.meta.env.BASE_URL}images/topo-bg.png')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob" />
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-accent/20 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000" />

      <Card className="relative z-10 w-full max-w-md p-8 md:p-10 shadow-2xl border-primary/10 bg-card/80 backdrop-blur-xl m-4">
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="w-20 h-20 bg-gradient-to-br from-primary to-accent rounded-2xl shadow-inner flex items-center justify-center text-white transform -rotate-6">
            <Pickaxe className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h1 className="text-4xl font-display font-bold text-foreground">GeoField</h1>
            <p className="text-muted-foreground text-lg">Professional geological data collection</p>
          </div>

          <form onSubmit={handleSubmit} className="w-full space-y-4 pt-2 text-left">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>

            {mode !== "confirm" && (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              </div>
            )}

            {mode === "confirm" && (
              <div className="space-y-2">
                <Label htmlFor="code">Confirmation code</Label>
                <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} required />
              </div>
            )}

            {message && <p className="text-sm text-muted-foreground">{message}</p>}

            <Button type="submit" className="w-full h-12 text-lg font-medium shadow-lg" disabled={isSubmitting}>
              {isSubmitting ? "Working..." : mode === "signup" ? "Create Account" : mode === "confirm" ? "Confirm Email" : "Sign In"}
            </Button>
          </form>

          <div className="w-full space-y-3">
            {mode === "signin" ? (
              <Button variant="outline" className="w-full" onClick={() => setMode("signup")}>Create a new account</Button>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => setMode("signin")}>Back to sign in</Button>
            )}

            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                localStorage.setItem("geofield-demo-mode", "true");
                window.location.href = "/";
              }}
            >
              Continue without Login
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Sign in to sync your field data to your account across devices.
            </p>
          </div>

          <div className="flex items-center gap-6 pt-2 text-muted-foreground/60">
            <Compass className="w-6 h-6" />
            <Map className="w-6 h-6" />
          </div>
        </div>
      </Card>
    </div>
  );
}
