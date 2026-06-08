import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SignupModalProvider } from "@/components/SignupModalProvider";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/LandingPage";
import SuccessPage from "@/pages/SuccessPage";
import BlogIndex from "@/pages/BlogIndex";
import BlogPost from "@/pages/BlogPost";

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/success" component={SuccessPage} />
      <Route path="/blog" component={BlogIndex} />
      <Route path="/blog/:slug" component={BlogPost} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SignupModalProvider>
          <Toaster />
          <Router />
        </SignupModalProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
