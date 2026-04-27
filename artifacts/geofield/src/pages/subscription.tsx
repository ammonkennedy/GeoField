import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CreditCard, CheckCircle2, Clock, Zap, ShieldCheck,
  Loader2, AlertCircle, Gift, Star, ExternalLink,
} from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const MONTHLY_PRICE_ID = "price_1TQd26EK5umFVbh63KIHgQ3V";
const YEARLY_PRICE_ID  = "price_1TQd26EK5umFVbh6zANev3kr";

type AccessStatus =
  | { access: "loading" }
  | { access: "none" }
  | { access: "trial"; daysLeft: number; trialEnd: string }
  | { access: "subscribed"; subscription: { status: string; currentPeriodEnd: number; cancelAtPeriodEnd: boolean } }
  | { access: "promo"; promoCode: string }
  | { access: "expired" };

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API_BASE}${path}`, { credentials: "include", ...opts });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${r.status}`);
  }
  return r.json();
}

export default function SubscriptionPage() {
  const [status, setStatus] = useState<AccessStatus>({ access: "loading" });
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [promoInput, setPromoInput] = useState("");
  const [promoError, setPromoError] = useState("");
  const [promoSuccess, setPromoSuccess] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [trialLoading, setTrialLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState("");

  // Check URL params for Stripe redirect result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "1") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const loadStatus = async () => {
    setStatus({ access: "loading" });
    try {
      const data = await apiFetch("/api/stripe/status");
      setStatus(data);
    } catch {
      setStatus({ access: "none" });
    }
  };

  useEffect(() => { loadStatus(); }, []);

  const handleStartTrial = async () => {
    setTrialLoading(true);
    setError("");
    try {
      await apiFetch("/api/stripe/trial/start", { method: "POST" });
      await loadStatus();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setTrialLoading(false);
    }
  };

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    setError("");
    try {
      const priceId = billingCycle === "monthly" ? MONTHLY_PRICE_ID : YEARLY_PRICE_ID;
      const data = await apiFetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      if (data.url) window.location.href = data.url;
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    setError("");
    try {
      const data = await apiFetch("/api/stripe/portal", { method: "POST" });
      if (data.url) window.location.href = data.url;
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPortalLoading(false);
    }
  };

  const handlePromo = async () => {
    if (!promoInput.trim()) return;
    setPromoLoading(true);
    setPromoError("");
    setPromoSuccess("");
    try {
      const data = await apiFetch("/api/stripe/promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoInput.trim() }),
      });
      setPromoSuccess(data.message || "Promo code applied!");
      setPromoInput("");
      await loadStatus();
    } catch (e: any) {
      setPromoError(e.message || "Invalid promo code.");
    } finally {
      setPromoLoading(false);
    }
  };

  const features = [
    "Unlimited rock, water & soil samples",
    "3D geological map with custom GeoJSON layers",
    "Photo & video capture (3 slots per sample)",
    "Auto GPS + UTM coordinates",
    "Strike & Dip measurements with photos",
    "Stratigraphic Column builder",
    "Trip planning with custom map layers",
    "Excel export for all data",
    "Auto-generated downloadable chart figures",
    "Voice dictation for field notes",
    "Offline sample queuing & auto-sync",
  ];

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
      <div className="max-w-2xl mx-auto space-y-8 pb-12">
        {/* Header */}
        <div>
          <h1 className="font-display font-bold text-3xl flex items-center gap-3">
            <CreditCard className="w-8 h-8 text-primary" />
            Subscription
          </h1>
          <p className="text-muted-foreground mt-1">Manage your GeoField access and billing.</p>
        </div>

        {/* Status card */}
        {status.access === "promo" && (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Star className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-lg text-primary">Full Access — Lifetime</p>
              <p className="text-muted-foreground text-sm mt-1">
                A promo code grants you unrestricted access to GeoField. No payment required.
              </p>
            </div>
          </div>
        )}

        {status.access === "subscribed" && (
          <div className="rounded-2xl border border-green-300 bg-green-50 p-6 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-lg text-green-800">Active Subscription</p>
              <p className="text-green-700 text-sm mt-1">
                {status.subscription.status === "trialing" ? "Trial active — " : ""}
                Renews {new Date(status.subscription.currentPeriodEnd * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.
                {status.subscription.cancelAtPeriodEnd && " Cancels at period end."}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={handlePortal}
                disabled={portalLoading}
              >
                {portalLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                Manage / Cancel Subscription
              </Button>
            </div>
          </div>
        )}

        {status.access === "trial" && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-lg text-blue-800">
                Free Trial — {status.daysLeft} day{status.daysLeft !== 1 ? "s" : ""} remaining
              </p>
              <p className="text-blue-700 text-sm mt-1">
                Trial ends {new Date(status.trialEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.
                Subscribe before it expires to keep full access.
              </p>
            </div>
          </div>
        )}

        {status.access === "expired" && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="font-semibold text-lg text-destructive">Access Expired</p>
              <p className="text-muted-foreground text-sm mt-1">
                Your trial or subscription has ended. Subscribe below to restore access.
              </p>
            </div>
          </div>
        )}

        {status.access === "none" && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-lg text-amber-800">Start your 7-day free trial</p>
              <p className="text-amber-700 text-sm mt-1">
                No credit card required for the trial. Full access to every feature from day one.
              </p>
              <Button
                className="mt-3"
                onClick={handleStartTrial}
                disabled={trialLoading}
              >
                {trialLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                Start Free Trial
              </Button>
            </div>
          </div>
        )}

        {/* Plan selection — show unless promo or active subscription without trialing */}
        {status.access !== "promo" && !(status.access === "subscribed" && status.subscription.status !== "trialing") && (
          <div className="space-y-4">
            <h2 className="font-display font-bold text-xl flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              {status.access === "subscribed" ? "Upgrade to Paid Plan" : "Subscribe to GeoField Pro"}
            </h2>

            {/* Billing toggle */}
            <div className="flex gap-2 p-1 bg-muted rounded-xl w-fit">
              <button
                onClick={() => setBillingCycle("monthly")}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                  billingCycle === "monthly"
                    ? "bg-card shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle("yearly")}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  billingCycle === "yearly"
                    ? "bg-card shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Yearly
                <span className="text-xs font-semibold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-md">
                  Save 25%
                </span>
              </button>
            </div>

            {/* Plan card */}
            <div className="rounded-2xl border-2 border-primary/60 bg-card shadow-lg overflow-hidden">
              <div className="p-6 bg-primary/5 border-b border-primary/20">
                <div className="flex items-end gap-2">
                  <span className="font-display font-bold text-4xl text-foreground">
                    {billingCycle === "monthly" ? "$9.99" : "$7.50"}
                  </span>
                  <span className="text-muted-foreground text-sm mb-1">/ month</span>
                </div>
                {billingCycle === "yearly" && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Billed as <strong>$89.99/year</strong> — saves you $30 vs monthly
                  </p>
                )}
                {(status.access === "none" || status.access === "trial") && (
                  <p className="text-sm text-primary font-medium mt-2">
                    ✓ Includes a 7-day free trial — cancel anytime
                  </p>
                )}
              </div>

              <div className="p-6 space-y-4">
                <ul className="space-y-2">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {error && (
                  <p className="text-sm text-destructive flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> {error}
                  </p>
                )}

                <Button
                  className="w-full text-base py-5"
                  onClick={handleCheckout}
                  disabled={checkoutLoading}
                >
                  {checkoutLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <CreditCard className="w-4 h-4 mr-2" />
                  )}
                  {status.access === "none"
                    ? "Start 7-Day Free Trial"
                    : status.access === "trial"
                    ? "Subscribe Now"
                    : "Subscribe to GeoField Pro"}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  Accepts credit &amp; debit cards · Cancel anytime via Stripe Customer Portal ·
                  Secured by Stripe
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Manage subscription — for active subscribers */}
        {status.access === "subscribed" && status.subscription.status !== "trialing" && (
          <div className="space-y-3">
            <h2 className="font-display font-bold text-xl">Manage Billing</h2>
            <p className="text-sm text-muted-foreground">
              Update payment method, view invoices, or cancel your subscription through the secure Stripe portal.
            </p>
            <Button onClick={handlePortal} disabled={portalLoading}>
              {portalLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ExternalLink className="w-4 h-4 mr-2" />}
              Open Billing Portal
            </Button>
          </div>
        )}

        {/* Promo code section */}
        {status.access !== "promo" && (
          <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Gift className="w-5 h-5 text-primary" />
              Redeem a Promo Code
            </h2>
            <p className="text-sm text-muted-foreground">
              Have a promo code? Enter it below to unlock full access for free.
            </p>
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Label className="sr-only">Promo code</Label>
                <Input
                  value={promoInput}
                  onChange={(e) => { setPromoInput(e.target.value); setPromoError(""); setPromoSuccess(""); }}
                  placeholder="Enter code…"
                  onKeyDown={(e) => e.key === "Enter" && handlePromo()}
                  className="h-10"
                />
              </div>
              <Button
                onClick={handlePromo}
                disabled={promoLoading || !promoInput.trim()}
                className="h-10"
              >
                {promoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
              </Button>
            </div>
            {promoError && (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> {promoError}
              </p>
            )}
            {promoSuccess && (
              <p className="text-sm text-green-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> {promoSuccess}
              </p>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
