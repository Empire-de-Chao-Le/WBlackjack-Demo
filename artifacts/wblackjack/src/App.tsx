import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import SongPage from "@/pages/song-page";
import SongEdit from "@/pages/song-edit";
import SongVocab from "@/pages/song-vocab";
import SongTranslation from "@/pages/song-translation";
import KaraokePicker from "@/pages/karaoke-picker";
import KaraokeGame from "@/pages/karaoke-game";
import ExercisesGame from "@/pages/exercises-game";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/song/:id" component={SongPage} />
      <Route path="/song/:id/edit" component={SongEdit} />
      <Route path="/song/:id/vocab" component={SongVocab} />
      <Route path="/song/:id/translation" component={SongTranslation} />
      <Route path="/song/:id/karaoke" component={KaraokePicker} />
      <Route path="/song/:id/karaoke/:difficulty" component={KaraokeGame} />
      <Route path="/song/:id/exercises" component={ExercisesGame} />
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
