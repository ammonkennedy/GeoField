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
          backgroundImage: `url('${import.meta.env.BASE_URL}images/topo-bg.png')`,
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      />
      <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-16 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />

      <div className="relative mx-auto w-full max-w-3xl">
        <div className="mb-8 flex items-center justify-center gap-3 sm:justify-start">
          <GeoFieldLogo className="h-12 w-12" />
          <span className="font-display text-2xl font-bold text-primary">GeoField</span>
        </div>

        <Card className="border-primary/10 bg-card/90 p-6 shadow-xl backdrop-blur-sm sm:p-10">
          <div className="space-y-8">
            <header className="space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MessageCircle className="h-6 w-6" />
              </div>
              <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                GeoField Support
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Need help using GeoField, want to report a bug, or have a feature suggestion? Contact GeoField Support using the email below.
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

            <section className="rounded-2xl border border-border bg-muted/35 p-5 sm:p-6">
              <h2 className="font-display text-xl font-semibold text-foreground">What to include</h2>
              <p className="mt-2 leading-6 text-muted-foreground">
                To help us understand and resolve the issue, please provide:
              </p>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                <li className="flex items-center gap-3 rounded-xl bg-card p-3">
                  <Smartphone className="h-5 w-5 shrink-0 text-primary" />
                  <span>Your iPhone model</span>
                </li>
                <li className="flex items-center gap-3 rounded-xl bg-card p-3">
                  <Smartphone className="h-5 w-5 shrink-0 text-primary" />
                  <span>Your iOS version</span>
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
