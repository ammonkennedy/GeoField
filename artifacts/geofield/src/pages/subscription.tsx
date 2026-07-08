import { useEffect, useState } from "react";
import { getCurrentAccountToken } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  ShieldCheck,
} from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type BillingStatus =
  | { access: "loading" }
  | {
      access: "free";
      customerExists: boolean;
      paymentMethodConfigured: boolean;
      paymentMethod?: {
        brand: string;
        last4: string;
        expMonth: number;
        expYear: number;
      } | null;
    };

async function getAccountToken() {
  return getCurrentAccountToken();
}

async function apiFetch(path: string, opts?: RequestInit) {
  const token = await getAccountToken();
  const headers = new Headers(opts?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (opts?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }
  return response.json();
}

function returnPath() {
  return window.location.pathname || "/subscription";
}

export default function SubscriptionPage() {
  const [status, setStatus] = useState<BillingStatus>({ access: "loading" });
  const [setupLoading, setSetupLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("billing") === "ready") {
      setNotice("Billing setup was verified successfully.");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("billing") === "cancelled") {
      setNotice("Billing setup was cancelled. No payment method was saved.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const loadStatus = async () => {
    setStatus({ access: "loading" });
    setError("");
    try {
      const data = await apiFetch("/api/stripe/status");
      setStatus(data);
    } catch (event: any) {
      setStatus({
        access: "free",
        customerExists: false,
        paymentMethodConfigured: false,
      });
      setError(event?.message || "Could not load billing status.");
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleSetup = async () => {
    setSetupLoading(true);
    setError("");
    try {
      const data = await apiFetch("/api/stripe/setup", {
        method: "POST",
        body: JSON.stringify({ returnPath: returnPath() }),
      });
      if (data.url) window.location.href = data.url;
    } catch (event: any) {
      setError(event?.message || "Could not start billing setup.");
    } finally {
      setSetupLoading(false);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    setError("");
    try {
      const data = await apiFetch("/api/stripe/portal", {
        method: "POST",
        body: JSON.stringify({ returnPath: returnPath() }),
      });
      if (data.url) window.location.href = data.url;
    } catch (event: any) {
      setError(event?.message || "Could not open billing portal.");
    } finally {
      setPortalLoading(false);
    }
  };

  if (status.access === "loading") {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6 pb-12">
        <div>
          <h1 className="font-display font-bold text-3xl flex items-center gap-3">
            <CreditCard className="w-8 h-8 text-primary" />
            Billing
          </h1>
          <p className="text-muted-foreground mt-1">
            Verify that secure billing setup is connected to your account.
          </p>
        </div>

        <div className="rounded-2xl border border-green-200 bg-green-50 p-6 flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-green-700" />
          </div>
          <div>
            <p className="font-semibold text-lg text-green-900">Access is active</p>
            <p className="text-green-800 text-sm mt-1">
              GeoField is currently open for use. This screen only validates billing readiness.
            </p>
          </div>
        </div>

        {notice && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-primary">
            {notice}
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">Payment method check</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Cards are collected by Stripe. GeoField does not receive or store raw card numbers.
              </p>
            </div>
          </div>

          {status.paymentMethodConfigured && status.paymentMethod ? (
            <div className="rounded-xl border bg-muted/30 p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold capitalize">
                  {status.paymentMethod.brand} ending in {status.paymentMethod.last4}
                </p>
                <p className="text-xs text-muted-foreground">
                  Expires {String(status.paymentMethod.expMonth).padStart(2, "0")}/{status.paymentMethod.expYear}
                </p>
              </div>
              <CheckCircle2 className="w-5 h-5 text-green-700 shrink-0" />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              No payment method is attached to this account yet.
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleSetup} disabled={setupLoading}>
              {setupLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
              {status.paymentMethodConfigured ? "Update Payment Method" : "Set Up Payment Method"}
            </Button>
            <Button variant="outline" onClick={handlePortal} disabled={portalLoading}>
              {portalLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ExternalLink className="w-4 h-4 mr-2" />}
              Open Stripe Portal
            </Button>
            <Button variant="ghost" onClick={loadStatus}>
              Refresh Status
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
