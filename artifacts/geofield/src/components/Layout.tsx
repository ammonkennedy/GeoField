import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { signOutUser, useGetCurrentAuthUser, useGetFolders } from "@workspace/api-client-react";
import { Button } from "./ui/button";
import { FolderDialog } from "./FolderDialog";
import { Pickaxe, FolderOpen, MapPin, LogOut, ChevronRight, Menu, Plus, Map, Bookmark, WifiOff, RefreshCw, Check, Compass, CreditCard, Cloud, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadTrips, type Trip } from "@/pages/trip-planner";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { getLocalDatasets, getVisibleLocalDatasets, LOCAL_DATASETS_UPDATED_EVENT, type LocalDataset } from "@/lib/local-datasets";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: authData } = useGetCurrentAuthUser();
  const [datasetDialogOpen, setDatasetDialogOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [trips, setTrips] = useState<Trip[]>(loadTrips);
  const [localDatasets, setLocalDatasets] = useState<LocalDataset[]>(getLocalDatasets);

  const user = authData?.user;
  const { data: folders } = useGetFolders({
    query: { enabled: Boolean(user) }
  });
  const { isOnline, queueCount, isSyncing, syncedCount, lastError, sync } = useOfflineSync();
  const visibleLocalDatasets = getVisibleLocalDatasets(localDatasets, folders);
  const allFolders = [...(folders || []), ...visibleLocalDatasets];

  const handleSignOut = async () => {
    await signOutUser();
    localStorage.removeItem("geofield-demo-mode");
    queryClient.clear();
    setSidebarOpen(false);
    setLocation("/login");
  };

  // Keep trips list in sync
  useEffect(() => {
    const refresh = () => setTrips(loadTrips());
    window.addEventListener("trips-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("trips-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // Keep locally-created datasets in sync
  useEffect(() => {
    const refresh = () => setLocalDatasets(getLocalDatasets());
    window.addEventListener(LOCAL_DATASETS_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(LOCAL_DATASETS_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b bg-card/95 backdrop-blur">
        <div className="flex items-center gap-3 text-primary font-display font-bold text-xl">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Pickaxe className="w-5 h-5" />
          </div>
          <span>GeoField</span>
        </div>
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setSidebarOpen(!sidebarOpen)}>
          <Menu className="w-6 h-6" />
        </Button>
      </div>

      {/* Sidebar */}
      <aside className={cn(
        "fixed md:sticky top-0 left-0 z-40 h-screen w-[280px] bg-sidebar border-r flex flex-col transition-transform duration-300 ease-in-out shadow-[12px_0_40px_rgba(15,23,42,0.04)]",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-6 hidden md:flex items-center gap-3 border-b border-border/70">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Pickaxe className="w-6 h-6" />
          </div>
          <div>
            <div className="text-primary font-display font-bold text-2xl leading-none">GeoField</div>
            <div className="mt-1 text-xs font-medium text-muted-foreground">Collect. Analyze. Understand.</div>
          </div>
        </div>

        <div className="mx-4 mt-4 hidden rounded-2xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-xs text-blue-900 md:block">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            Field-ready workspace
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-blue-800">
            <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />GPS accurate</span>
            <span className="flex items-center gap-1.5"><Cloud className="h-3.5 w-3.5" />Offline sync</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-5 flex flex-col gap-6">
          {/* Main Nav */}
          <div className="px-4">
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.18em] mb-3 px-2">Views</h3>
            <nav className="space-y-1.5">
              <Link
                href="/"
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
                  location === "/" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                onClick={() => setSidebarOpen(false)}
              >
                <MapPin className="w-4 h-4" />
                All Samples
              </Link>
              <Link
                href="/map"
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
                  location === "/map" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                onClick={() => setSidebarOpen(false)}
              >
                <Map className="w-4 h-4" />
                Map View
              </Link>
            </nav>
          </div>

          {/* Trips */}
          <div className="px-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Trips</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => { setSidebarOpen(false); setLocation("/trip/new"); }}
                title="New trip"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <nav className="space-y-1">
              {trips.map((trip) => (
                <Link
                  key={trip.id}
                  href={`/trip/${trip.id}`}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 group",
                    location === `/trip/${trip.id}`
                      ? "bg-primary text-primary-foreground font-medium shadow-md"
                      : "text-foreground hover:bg-muted font-medium"
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Bookmark className="w-4 h-4 opacity-80 shrink-0" />
                  <span className="truncate flex-1">{trip.name || "Untitled Trip"}</span>
                  {location === `/trip/${trip.id}` && <ChevronRight className="w-4 h-4 shrink-0" />}
                </Link>
              ))}
              {trips.length === 0 && (
                <p className="text-xs text-muted-foreground italic px-3 py-2">No trips yet</p>
              )}
            </nav>
          </div>

          {/* Strike & Dip */}
          <div className="px-4">
            <Link
              href="/strike-dip"
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 font-medium",
                location === "/strike-dip"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-foreground hover:bg-muted"
              )}
              onClick={() => setSidebarOpen(false)}
            >
              <Compass className="w-4 h-4 opacity-80 shrink-0" />
              <span className="flex-1">Strike &amp; Dip</span>
              {location === "/strike-dip" && <ChevronRight className="w-4 h-4 shrink-0" />}
            </Link>
          </div>

          {/* Datasets */}
          <div className="px-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Datasets</h3>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDatasetDialogOpen(true)}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <nav className="space-y-1">
              {allFolders.map((folder: any) => (
                <Link
                  key={folder.id}
                  href={`/dataset/${folder.id}`}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 group",
                    location === `/dataset/${folder.id}`
                      ? "bg-primary text-primary-foreground font-medium shadow-md"
                      : "text-foreground hover:bg-muted font-medium"
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <FolderOpen className="w-4 h-4 opacity-80" />
                  <span className="truncate flex-1">{folder.name}</span>
                  {folder.isLocal && <span className="text-[10px] opacity-70">local</span>}
                  {location === `/dataset/${folder.id}` && <ChevronRight className="w-4 h-4" />}
                </Link>
              ))}
              {allFolders.length === 0 && (
                <p className="text-xs text-muted-foreground italic px-3 py-2">No datasets yet</p>
              )}
            </nav>
          </div>
        </div>

        {/* Offline queue indicator */}
        {queueCount > 0 && (
          <div className="mx-3 mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="flex items-center gap-1.5 font-semibold">
                <WifiOff className="w-3.5 h-3.5" />
                {queueCount} item{queueCount !== 1 ? "s" : ""} pending sync
              </span>
              {isOnline && !isSyncing && (
                <button
                  onClick={sync}
                  className="flex items-center gap-1 text-amber-700 hover:text-amber-900 font-medium underline underline-offset-2"
                >
                  <RefreshCw className="w-3 h-3" />
                  Sync now
                </button>
              )}
              {isSyncing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            </div>
            <p className="text-amber-700 leading-tight">
              {lastError || (isOnline ? "Connected — tap Sync now or wait for auto-sync." : "Will sync when back online.")}
            </p>
          </div>
        )}

        {/* Billing link */}
        <div className="px-4 pb-2">
          <Link
            href="/subscription"
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 font-medium w-full",
              location === "/subscription"
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            onClick={() => setSidebarOpen(false)}
          >
            <CreditCard className="w-4 h-4 shrink-0" />
            <span className="flex-1">Billing</span>
            {location === "/subscription" && <ChevronRight className="w-4 h-4 shrink-0" />}
          </Link>
        </div>

        {/* User footer */}
        <div className="p-4 border-t border-border/50 bg-card mt-auto">
          {user ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold font-display shadow-inner">
                {user.firstName?.[0] || user.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-semibold truncate">{user.firstName || 'User'}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              <button type="button" onClick={handleSignOut} className="p-2 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Button asChild className="w-full">
              <Link href="/login">Log In</Link>
            </Button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen relative max-w-full overflow-hidden">
        {/* Offline / sync banners */}
        {!isOnline && (
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm sticky top-0 z-20">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span className="flex-1">You're offline. New samples will be saved on this device and synced when connected.</span>
            {queueCount > 0 && (
              <span className="font-semibold bg-amber-200 text-amber-900 rounded-full px-2 py-0.5 text-xs">
                {queueCount} pending
              </span>
            )}
          </div>
        )}
        {isOnline && isSyncing && (
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-blue-50 border-b border-blue-200 text-blue-800 text-sm sticky top-0 z-20">
            <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
            <span>Syncing {queueCount} offline item{queueCount !== 1 ? "s" : ""} to your account…</span>
          </div>
        )}
        {isOnline && syncedCount > 0 && !isSyncing && (
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-green-50 border-b border-green-200 text-green-800 text-sm sticky top-0 z-20">
            <Check className="w-4 h-4 shrink-0" />
            <span>{syncedCount} offline item{syncedCount !== 1 ? "s" : ""} synced successfully.</span>
          </div>
        )}

        <div className="flex-1 p-4 md:p-8 md:max-w-6xl mx-auto w-full">
          {children}
        </div>
      </main>

      {/* Dataset Dialog */}
      <FolderDialog open={datasetDialogOpen} onOpenChange={setDatasetDialogOpen} />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
