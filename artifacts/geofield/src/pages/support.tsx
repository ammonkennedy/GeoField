import { Link } from "wouter";
import { ArrowLeft, Camera, Mail, MessageCircle, Smartphone } from "lucide-react";
import { GeoFieldLogo } from "@/components/GeoFieldLogo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function SupportPage() {
  return (
    <main className="relative min-h-screen min-h-[100dvh] overflow-hidden bg-background px-4 py-8 sm:px-6 sm:py-12">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `url('${import.meta.env.BASE_URL}images/topo-bg.svg')`,
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      />
      <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-16 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />

      <div className="relative mx-auto w-full max-w-3xl">
        <div className="mb-8 flex items-center justify-center gap-3 sm:justify-start">
          <GeoFieldLogo className="h-12 w-12" />
          <span className="font-display text-2xl font-bold text-primary">GeoField Data</span>
        </div>

        <Card className="border-primary/10 bg-card/90 p-6 shadow-xl backdrop-blur-sm sm:p-10">
          <div className="space-y-8">
            <header className="space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MessageCircle className="h-6 w-6" />
              </div>
              <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                GeoField Data Support
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Need help using GeoField Data, want to report a bug, or have a feature suggestion? Contact GeoField Data Support using the email below.
              </p>
            </header>

            <a
              href="mailto:ammonkennedy@gmail.com"
              className="flex min-h-16 w-full items-center gap-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Mail className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email support</span>
                <span className="block break-all font-semibold">ammonkennedy@gmail.com</span>
              </span>
            </a>

            <section id="delete-account" aria-labelledby="delete-account-heading" className="scroll-mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:p-6">
              <h2 id="delete-account-heading" className="font-display text-2xl font-semibold text-foreground">Delete your GeoField Data account</h2>
              <p className="mt-3 leading-7 text-muted-foreground">
                You can request permanent deletion of your account and associated data without installing the app or signing in.
              </p>
              <h3 className="mt-5 font-semibold">Request deletion by email</h3>
              <ol className="mt-2 list-decimal space-y-2 pl-5 leading-7 text-muted-foreground">
                <li>Email <a className="break-all text-primary underline" href="mailto:ammonkennedy@gmail.com">ammonkennedy@gmail.com</a> with the subject “GeoField Data account deletion”.</li>
                <li>Send the request from your account email address and state that you want your account and all associated data deleted. If you cannot access that email, tell us so we can help verify ownership.</li>
                <li>Do not include your password or verification codes. We may ask you to verify account ownership before processing the request.</li>
              </ol>
              <Button asChild className="mt-4 h-auto min-h-11 whitespace-normal">
                <a href={"mailto:ammonkennedy@gmail.com?subject=" + encodeURIComponent("GeoField Data account deletion") + "&body=" + encodeURIComponent("Please delete my GeoField Data account and all associated data.\n\nMy account email address is: ")}>Request account and data deletion</a>
              </Button>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">The button opens your email app. Send the email to submit your request, or copy the address above into your preferred email service.</p>
              <h3 className="mt-5 font-semibold">Delete from the app</h3>
              <p className="mt-2 leading-7 text-muted-foreground">
                Sign in to GeoField Data, open the menu, select <strong>Settings</strong>, scroll to <strong>Delete Account</strong>, choose <strong>Delete My Account</strong>, and confirm <strong>Yes, Delete Account</strong>. You need an internet connection. You can also use the email request above for help or to request deletion of all associated stored files.
              </p>
              <h3 className="mt-5 font-semibold">What is deleted and when</h3>
              <p className="mt-2 leading-7 text-muted-foreground">
                Deletion covers your sign-in account and profile, projects, samples, measurements, location data, trips, tracks, notes, photos, videos, and saved stereonets associated with your account. Requests are completed within 20 days. No account or associated app data is retained after deletion is complete.
              </p>
              <p className="mt-3 leading-7 text-muted-foreground">
                Deletion is permanent. Export anything you want to keep before requesting it. Copies you exported or saved outside GeoField Data, such as files in your device’s photo library, remain under your control. Uninstalling the app alone does not delete your account or cloud data.
              </p>
              <p className="mt-3 text-sm text-muted-foreground">GeoField Data is operated by Ammon Kennedy.</p>
            </section>

            <section className="rounded-2xl border border-border bg-muted/35 p-5 sm:p-6">
              <h2 className="font-display text-xl font-semibold text-foreground">What to include</h2>
              <p className="mt-2 leading-6 text-muted-foreground">
                To help us understand and resolve the issue, please provide:
              </p>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                <li className="flex items-center gap-3 rounded-xl bg-card p-3">
                  <Smartphone className="h-5 w-5 shrink-0 text-primary" />
                  <span>Your device model</span>
                </li>
                <li className="flex items-center gap-3 rounded-xl bg-card p-3">
                  <Smartphone className="h-5 w-5 shrink-0 text-primary" />
                  <span>Your Android or iOS version</span>
                </li>
                <li className="flex items-center gap-3 rounded-xl bg-card p-3">
                  <MessageCircle className="h-5 w-5 shrink-0 text-primary" />
                  <span>A description of the issue</span>
                </li>
                <li className="flex items-center gap-3 rounded-xl bg-card p-3">
                  <Camera className="h-5 w-5 shrink-0 text-primary" />
                  <span>Screenshots, when relevant</span>
                </li>
              </ul>
            </section>

            <Button asChild variant="outline" className="h-11 w-full gap-2 sm:w-auto">
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
                Return to GeoField home
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    </main>
  );
}
