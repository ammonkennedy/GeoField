import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetCurrentAuthUser } from "@workspace/api-client-react";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import SampleEntry from "@/pages/sample-entry";
import MapViewPage from "@/pages/map-view";
import TripPlannerPage from "@/pages/trip-planner";
import StrikeDipPage from "@/pages/strike-dip";
import AccountSettingsPage from "@/pages/account-settings";
import FiguresPage from "@/pages/figures";
import SupportPage from "@/pages/support";
import NotFound from "@/pages/not-found";
import { isGuestMode } from "@/lib/guest-access";

const queryClient = new QueryClient();

function AccessibleRoute({ component: Component }: { component: React.ComponentType }) {
  const { data, isLoading } = useGetCurrentAuthUser();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  }

  if (!data?.user && !isGuestMode()) {
    return <Redirect to="/login" />;
  }

  return <Component />;
}

function AccountRoute({ component: Component }: { component: React.ComponentType }) {
  const { data, isLoading } = useGetCurrentAuthUser();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  return data?.user ? <Component /> : <Redirect to="/login" />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/support" component={SupportPage} />
      <Route path="/">
        <AccessibleRoute component={Dashboard} />
      </Route>
      <Route path="/dataset/:folderId">
        <AccessibleRoute component={Dashboard} />
      </Route>
      <Route path="/map">
        <AccessibleRoute component={MapViewPage} />
      </Route>
      <Route path="/trip/:tripId">
        <AccessibleRoute component={TripPlannerPage} />
      </Route>
      <Route path="/strike-dip">
        <AccessibleRoute component={StrikeDipPage} />
      </Route>
      <Route path="/figures">
        <AccessibleRoute component={FiguresPage} />
      </Route>
      <Route path="/sample/:id">
        <AccessibleRoute component={SampleEntry} />
      </Route>
      <Route path="/account">
        <AccountRoute component={AccountSettingsPage} />
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
