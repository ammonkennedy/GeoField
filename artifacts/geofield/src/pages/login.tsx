import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetCurrentAuthUser, signInUser, signUpUser, confirmSignUpUser, resendConfirmationEmail, isAuthConfigured } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Compass, Map } from "lucide-react";
import { GeoFieldLogo } from "@/components/GeoFieldLogo";
import { consumeAuthReturnPath, enterGuestMode, leaveGuestMode } from "@/lib/guest-access";

export default function Login() {
  const cloudAuthConfigured = isAuthConfigured();
  const reconnecting = new URLSearchParams(window.location.search).get("reauth") === "1";
  const { data, isLoading, refetch } = useGetCurrentAuthUser();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"signin" | "signup" | "confirm">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendWait, setResendWait] = useState(0);
  useEffect(() => {
    if (resendWait <= 0) return;
    const timer = setTimeout(() => setResendWait((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendWait]);

  const resendEmail = async () => {
    if (isResending || isSubmitting || resendWait > 0) return;
    setIsResending(true);
    setMessage("");
    try {
      const result = await resendConfirmationEmail({ email });
      setCode("");
      setResendWait(30);
      setMessage(`Verification email sent to ${result.destination || email.trim()}. Check your inbox and spam folder, then enter the latest code.`);
    } catch (error: any) {
      if (error?.name === "LimitExceededException" || error?.name === "TooManyRequestsException") {
        setResendWait(30);
        setMessage("Too many requests. Please wait before resending your verification email.");
      } else setMessage(error?.message || "Could not resend the verification email. Please try again.");
    } finally { setIsResending(false); }
  };

  useEffect(() => {
    if (data?.user && !reconnecting) {
      leaveGuestMode();
      setLocation(consumeAuthReturnPath());
    }
  }, [data?.user, reconnecting, setLocation]);

  if (isLoading || (data?.user && !reconnecting)) return null;

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
        const result = await signInUser({ email, password });
        if (result.nextStep.signInStep === "CONFIRM_SIGN_UP") {
          setMode("confirm");
          setMessage("Confirm your email to finish signing in. You can request a new code below.");
          return;
        }
        if (!result.isSignedIn) {
          setMessage("Sign-in needs another verification step. Complete account verification before syncing.");
          return;
        }
        queryClient.clear();
        await refetch();
        leaveGuestMode();
        setLocation(consumeAuthReturnPath());
      }
    } catch (error: any) {
      if (error?.name === "UserNotConfirmedException") setMode("confirm");
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
          backgroundImage: `url('${import.meta.env.BASE_URL}images/topo-bg.svg')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob" />
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-accent/20 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000" />

      <Card className="relative z-10 w-full max-w-md p-8 md:p-10 shadow-2xl border-primary/10 bg-card/80 backdrop-blur-xl m-4">
        <div className="flex flex-col items-center text-center space-y-6">
          <GeoFieldLogo className="h-20 w-20" />

          <div className="space-y-2">
            <h1 className="text-4xl font-display font-bold text-foreground">GeoField</h1>
            <p className="text-muted-foreground text-lg">Professional geological data collection</p>
          </div>

          {!cloudAuthConfigured && (
            <div role="status" className="w-full rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-left text-sm">
              <p className="font-medium text-foreground">Cloud sign-in is not available in this build.</p>
              <p className="mt-1 text-muted-foreground">You can still collect samples and media on this device. Cloud account sync will become available after the Amplify deployment outputs are added and the app is rebuilt.</p>
            </div>
          )}

          {cloudAuthConfigured && <form onSubmit={handleSubmit} className="w-full space-y-4 pt-2 text-left">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input disabled={isSubmitting || isResending} id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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

            {message && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{message}</p>}

            <Button type="submit" className="w-full h-12 text-lg font-medium shadow-lg" disabled={isSubmitting || isResending}>
              {isSubmitting ? "Working..." : mode === "signup" ? "Create Account" : mode === "confirm" ? "Confirm Email" : "Sign In"}
            </Button>
            {mode === "confirm" && <Button type="button" variant="outline" className="w-full" onClick={resendEmail} disabled={isSubmitting || isResending || resendWait > 0 || !email.trim()}>
              {isResending ? "Sending…" : resendWait > 0 ? `Resend available in ${resendWait}s` : "Resend verification email"}
            </Button>}
          </form>}

          <div className="w-full space-y-3">
            {cloudAuthConfigured && mode === "signin" && <Button variant="ghost" className="w-full" disabled={isSubmitting || isResending} onClick={() => { setMode("confirm"); setMessage("Enter the email address you registered with, then request a new verification email."); }}>Already registered? Verify your email</Button>}
            {cloudAuthConfigured && (mode === "signin" ? (
              <Button variant="outline" className="w-full" disabled={isSubmitting || isResending} onClick={() => setMode("signup")}>Create a new account</Button>
            ) : (
              <Button variant="outline" className="w-full" disabled={isSubmitting || isResending} onClick={() => setMode("signin")}>Back to sign in</Button>
            ))}

            {mode === "signin" && (
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  enterGuestMode();
                  setLocation("/");
                }}
              >
                Continue without logging in
              </Button>
            )}

            <p className="text-xs text-muted-foreground text-center">
              Browse GeoField without an account. You’ll be asked to create an account or sign in before saving data.
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
