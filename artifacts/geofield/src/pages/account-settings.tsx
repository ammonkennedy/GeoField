import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  confirmAccountEmail,
  deleteCurrentAccount,
  getRecentlyDeletedFolders,
  getRecentlyDeletedSamples,
  restoreFolder,
  restoreSample,
  getGetCurrentAuthUserQueryKey,
  updateAccountEmail,
  updateAccountPassword,
  useGetCurrentAuthUser,
} from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, Settings, UserRound, Trash2, RotateCcw } from "lucide-react";
import { getLocalDeletedItems, removeLocalDeletedItem, type LocalDeletedItem } from "@/lib/recently-deleted";
import { restoreLocalDataset } from "@/lib/local-datasets";
import { getQueue, setQueue } from "@/lib/offline-queue";
import { restoreMeasurement } from "@/lib/strike-dip-measurements";

type CloudDeletedItem = { id: number | string; name?: string; sampleId?: string; deletedAt: string; kind: "dataset" | "sample" };

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
  const [deletedItems, setDeletedItems] = useState<Array<CloudDeletedItem | LocalDeletedItem>>([]);
  const [trashLoading, setTrashLoading] = useState(true);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountPending, setDeleteAccountPending] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState("");

  useEffect(() => {
    setEmail(user?.email || "");
  }, [user?.email]);

  const loadDeletedItems = async () => {
    setTrashLoading(true);
    const local = getLocalDeletedItems();
    try {
      const [datasets, samples] = await Promise.all([
        getRecentlyDeletedFolders(),
        getRecentlyDeletedSamples(),
      ]);
      setDeletedItems([
        ...local,
        ...datasets.map((item: any) => ({ ...item, kind: "dataset" as const })),
        ...samples.map((item: any) => ({ ...item, kind: "sample" as const })),
      ].sort((a, b) => +new Date(b.deletedAt) - +new Date(a.deletedAt)));
    } catch { setDeletedItems(local); }
    finally { setTrashLoading(false); }
  };

  useEffect(() => { loadDeletedItems(); }, []);

  const restoreItem = async (item: CloudDeletedItem | LocalDeletedItem) => {
    if ("trashId" in item) {
      if (item.kind === "dataset") await restoreLocalDataset(item);
      else if (item.kind === "measurement") restoreMeasurement(item);
      else {
        if (!getQueue().some((queued) => queued.queuedId === item.data.queuedId)) setQueue([...getQueue(), item.data]);
        removeLocalDeletedItem(item.trashId);
      }
    } else {
      if (item.kind === "dataset") await restoreFolder(item.id);
      else await restoreSample(item.id);
    }
    queryClient.invalidateQueries();
    await loadDeletedItems();
  };

  const handleDeleteAccount = async () => {
    setDeleteAccountPending(true);
    setDeleteAccountError("");
    try {
      await deleteCurrentAccount();
      Object.keys(localStorage).filter((key) => key.startsWith("geofield_")).forEach((key) => localStorage.removeItem(key));
      indexedDB.deleteDatabase("geofield_media_store");
      queryClient.clear();
      window.location.assign("/login");
    } catch (error: any) {
      setDeleteAccountError(error?.message || "Could not delete the account.");
      setDeleteAccountPending(false);
    }
  };

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
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                  <Trash2 className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Recently Deleted</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Datasets, samples, and measurements can be recovered for 20 days, then are permanently deleted.</p>
                </div>
              </div>
              {trashLoading ? <p className="text-sm text-muted-foreground">Loading deleted items…</p> : deletedItems.length === 0 ? (
                <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Nothing has been deleted recently.</p>
              ) : (
                <div className="divide-y rounded-xl border">
                  {deletedItems.map((item) => {
                    const local = "trashId" in item;
                    const label = local ? item.name : item.name || item.sampleId || `${item.kind} ${item.id}`;
                    const days = Math.max(1, Math.ceil((20 * 86400000 - (Date.now() - +new Date(item.deletedAt))) / 86400000));
                    return <div key={local ? item.trashId : `${item.kind}-${item.id}`} className="flex items-center justify-between gap-4 p-4">
                      <div><p className="font-medium">{label}</p><p className="text-xs text-muted-foreground capitalize">{item.kind} · {days} day{days === 1 ? "" : "s"} remaining</p></div>
                      <Button variant="outline" size="sm" onClick={() => restoreItem(item)}><RotateCcw className="mr-2 h-4 w-4" />Restore</Button>
                    </div>;
                  })}
                </div>
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

            <div className="rounded-2xl border border-destructive/40 bg-card p-6 space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10"><Trash2 className="h-5 w-5 text-destructive" /></div>
                <div><h2 className="text-lg font-semibold">Delete Account</h2><p className="mt-1 text-sm text-muted-foreground">Permanently delete your account and all cloud and device data.</p></div>
              </div>
              <Button variant="destructive" onClick={() => setDeleteAccountOpen(true)}>Delete My Account</Button>
            </div>
          </>
        )}
      </div>

      <Dialog open={deleteAccountOpen} onOpenChange={(open) => !deleteAccountPending && setDeleteAccountOpen(open)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Are you sure you want to delete your account?</DialogTitle></DialogHeader>
          <p className="py-2 text-sm text-muted-foreground">This permanently removes your datasets, samples, measurements, photos, videos, trips, and sign-in account. This cannot be undone.</p>
          {deleteAccountError && <p className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{deleteAccountError}</p>}
          <div className="flex justify-end gap-3 border-t pt-4">
            <Button variant="outline" disabled={deleteAccountPending} onClick={() => setDeleteAccountOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteAccountPending} onClick={handleDeleteAccount}>{deleteAccountPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{deleteAccountPending ? "Deleting…" : "Yes, Delete Account"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
