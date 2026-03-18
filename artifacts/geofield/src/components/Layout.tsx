import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useGetCurrentAuthUser, useGetFolders } from "@workspace/api-client-react";
import { Button } from "./ui/button";
import { FolderDialog } from "./FolderDialog";
import { Pickaxe, FolderOpen, MapPin, LogOut, ChevronRight, Menu, Plus, Map, Bookmark, WifiOff, RefreshCw, Check, Layers, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadTrips, type Trip } from "@/pages/trip-planner";
import { loadColumns, type StratColumn } from "@/pages/strat-column";
import { useOfflineSync } from "@/hooks/use-offline-sync";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [, setLocation] = useLocation();
  const { data: authData } = useGetCurrentAuthUser();
  const { data: folders } = useGetFolders();
  const [datasetDialogOpen, setDatasetDialogOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [trips, setTrips] = useState<Trip[]>(loadTrips);
  const [stratCols, setStratCols] = useState<StratColumn[]>(loadColumns);

  const user = authData?.user;
  const { isOnline, queueCount, isSyncing, syncedCount, sync } = useOfflineSync();

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

  // Keep strat columns in sync
  useEffect(() => {
    const refresh = () => setStratCols(loadColumns());
    window.addEventListener("strat-columns-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("strat-columns-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b bg-card">
        <div className="flex items-center gap-2 text-primary font-display font-bold text-xl">
          <Pickaxe className="w-6 h-6" />
          <span>GeoField</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
          <Menu className="w-6 h-6" />
        </Button>
      </div>

      {/* Sidebar */}
      <aside className={cn(
        "fixed md:sticky top-0 left-0 z-40 h-screen w-64 bg-sidebar border-r flex flex-col transition-transform duration-300 ease-in-out",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-6 hidden md:flex items-center gap-2 text-primary font-display font-bold text-2xl border-b border-border/50">
          <Pickaxe className="w-7 h-7" />
          <span>GeoField</span>
        </div>

        <div className="flex-1 overflow-y-auto py-6 flex flex-col gap-6">
          {/* Main Nav */}
          <div className="px-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Views</h3>
            <nav className="space-y-1">
              <Link
                href="/"
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                  location === "/" ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                )}
                onClick={() => setSidebarOpen(false)}
              >
                <MapPin className="w-4 h-4" />
                All Samples
              </Link>
              <Link
                href="/map"
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                  location === "/map" ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
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

          {/* Strat Columns */}
          <div className="px-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Strat Columns</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => { setSidebarOpen(false); setLocation("/strat/new"); }}
                title="New strat column"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <nav className="space-y-1">
              {stratCols.map((col) => (
                <Link
                  key={col.id}
                  href={`/strat/${col.id}`}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 group",
                    location === `/strat/${col.id}`
                      ? "bg-primary text-primary-foreground font-medium shadow-md"
                      : "text-foreground hover:bg-muted font-medium"
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Layers className="w-4 h-4 opacity-80 shrink-0" />
                  <span className="truncate flex-1">{col.title || "Untitled Column"}</span>
                  {location === `/strat/${col.id}` && <ChevronRight className="w-4 h-4 shrink-0" />}
                </Link>
              ))}
              {stratCols.length === 0 && (
                <p className="text-xs text-muted-foreground italic px-3 py-2">No columns yet</p>
              )}
            </nav>
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
              {folders?.map(folder => (
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
                  {location === `/dataset/${folder.id}` && <ChevronRight className="w-4 h-4" />}
                </Link>
              ))}
              {folders?.length === 0 && (
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
                {queueCount} sample{queueCount !== 1 ? "s" : ""} pending sync
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
              {isOnline ? "Connected — tap Sync now or wait for auto-sync." : "Will sync when back online."}
            </p>
          </div>
        )}

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
              <a href="/api/logout" className="p-2 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground">
                <LogOut className="w-4 h-4" />
              </a>
            </div>
          ) : (
            <Button asChild className="w-full">
              <a href="/api/login">Log In</a>
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
            <span>Syncing {queueCount} offline sample{queueCount !== 1 ? "s" : ""} to the server…</span>
          </div>
        )}
        {isOnline && syncedCount > 0 && !isSyncing && (
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-green-50 border-b border-green-200 text-green-800 text-sm sticky top-0 z-20">
            <Check className="w-4 h-4 shrink-0" />
            <span>{syncedCount} offline sample{syncedCount !== 1 ? "s" : ""} synced successfully.</span>
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
