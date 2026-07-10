import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  confirmAccountEmail,
  getGetCurrentAuthUserQueryKey,
  updateAccountEmail,
  updateAccountPassword,
  useGetCurrentAuthUser,
} from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, Settings, UserRound } from "lucide-react";

export default function AccountSettingsPage() {
  const queryClient = useQueryClient();
  const { data: authData } = useGetCurrentAuthUser();
  const user = authData?.user;
  const [email, setEmail] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailPending, setEmailPending] = useState(false);
  const [passwordPending, setPasswordPending] = useState(false);
  const [needsEmailCode, setNeedsEmailCode] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    setEmail(user?.email || "");
  }, [user?.email]);

  const refreshUser = () => {
    queryClient.invalidateQueries({ queryKey: getGetCurrentAuthUserQueryKey() });
  };

  const handleEmailSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setEmailPending(true);
    setEmailError("");
    setEmailMessage("");
    try {
      await updateAccountEmail({ email });
      setNeedsEmailCode(true);
      setEmailMessage("Check the new email address for a confirmation code.");
      refreshUser();
    } catch (error: any) {
      setEmailError(error?.message || "Could not update the account email.");
    } finally {
      setEmailPending(false);
    }
  };

  const handleConfirmEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setEmailPending(true);
    setEmailError("");
    setEmailMessage("");
    try {
      await confirmAccountEmail({ code: confirmationCode });
      setNeedsEmailCode(false);
      setConfirmationCode("");
      setEmailMessage("Email updated successfully.");
      refreshUser();
    } catch (error: any) {
      setEmailError(error?.message || "Could not confirm the new email.");
    } finally {
      setEmailPending(false);
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordPending(true);
    setPasswordError("");
    setPasswordMessage("");
    try {
      if (newPassword !== confirmPassword) throw new Error("New passwords do not match.");
      await updateAccountPassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Password updated successfully.");
    } catch (error: any) {
      setPasswordError(error?.message || "Could not update the password.");
    } finally {
      setPasswordPending(false);
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-2xl space-y-6 pb-12">
        <div>
          <h1 className="font-display flex items-center gap-3 text-3xl font-bold">
            <Settings className="h-8 w-8 text-primary" />
            Account Settings
          </h1>
          <p className="mt-1 text-muted-foreground">
            Update the email used to sign in and manage your password.
          </p>
        </div>

        {!user ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Sign in to manage account settings.
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <UserRound className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Username / Email</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This is the email address used when signing in.
                  </p>
                </div>
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="account-email">Email</Label>
                  <Input id="account-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                </div>
                <Button type="submit" disabled={emailPending || !email.trim() || email === user.email}>
                  {emailPending && !needsEmailCode ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Update Email
                </Button>
              </form>

              {needsEmailCode && (
                <form onSubmit={handleConfirmEmail} className="rounded-xl border border-dashed p-4 space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="email-code">Confirmation Code</Label>
                    <Input id="email-code" value={confirmationCode} onChange={(event) => setConfirmationCode(event.target.value)} required />
                  </div>
                  <Button type="submit" variant="outline" disabled={emailPending || !confirmationCode.trim()}>
                    {emailPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Confirm Email
                  </Button>
                </form>
              )}

              {emailMessage && (
                <p className="flex items-center gap-2 text-sm text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  {emailMessage}
                </p>
              )}
              {emailError && (
                <p className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {emailError}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <KeyRound className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Password</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Enter your current password before choosing a new one.
                  </p>
                </div>
              </div>

              <form onSubmit={handlePasswordSubmit} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input id="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input id="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={8} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <Input id="confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} />
                </div>
                <Button type="submit" disabled={passwordPending || !currentPassword || !newPassword || !confirmPassword}>
                  {passwordPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Update Password
                </Button>
              </form>

              {passwordMessage && (
                <p className="flex items-center gap-2 text-sm text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  {passwordMessage}
                </p>
              )}
              {passwordError && (
                <p className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {passwordError}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
