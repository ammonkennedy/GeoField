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
import StratColumnPage from "@/pages/strat-column";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { data, isLoading } = useGetCurrentAuthUser();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  }

  if (!data?.user) {
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
      <Route path="/strat/:id">
        <ProtectedRoute component={StratColumnPage} />
      </Route>
      <Route path="/sample/:id">
        <ProtectedRoute component={SampleEntry} />
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
