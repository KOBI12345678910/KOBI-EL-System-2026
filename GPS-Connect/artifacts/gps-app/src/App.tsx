import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import MapView from "@/pages/map-view";
import Dashboard from "@/pages/dashboard";
import HistoryPage from "@/pages/history";
import PlacesPage from "@/pages/places";
import SharePage from "@/pages/share";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={MapView} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/history" component={HistoryPage} />
        <Route path="/places" component={PlacesPage} />
        <Route path="/share" component={SharePage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
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
