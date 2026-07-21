import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isAuthConfigured, useGetCurrentAuthUser } from "@workspace/api-client-react";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import SampleEntry from "@/pages/sample-entry";
import MapViewPage from "@/pages/map-view";
import TripPlannerPage from "@/pages/trip-planner";
import StrikeDipPage from "@/pages/strike-dip";
import AccountSettingsPage from "@/pages/account-settings";
import FiguresPage from "@/pages/figures";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

// A configured native build is account-first. Clear the fallback left by older
// unconfigured simulator builds so every user reaches Cognito login again.
if (Capacitor.isNativePlatform() && isAuthConfigured()) {
  localStorage.removeItem("geofield-demo-mode");
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { data, isLoading } = useGetCurrentAuthUser();

  if (isLoading && localStorage.getItem("geofield-demo-mode") !== "true") {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  }

  if (!data?.user && localStorage.getItem("geofield-demo-mode") !== "true") {
    return <Redirect to="/login" />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        <ProtectedRoute component={Dashboard} />
      </Route>
      <Route path="/dataset/:folderId">
        <ProtectedRoute component={Dashboard} />
      </Route>
      <Route path="/map">
        <ProtectedRoute component={MapViewPage} />
      </Route>
      <Route path="/trip/:tripId">
        <ProtectedRoute component={TripPlannerPage} />
      </Route>
      <Route path="/strike-dip">
        <ProtectedRoute component={StrikeDipPage} />
      </Route>
      <Route path="/figures">
        <ProtectedRoute component={FiguresPage} />
      </Route>
      <Route path="/sample/:id">
        <ProtectedRoute component={SampleEntry} />
      </Route>
      <Route path="/account">
        <ProtectedRoute component={AccountSettingsPage} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
