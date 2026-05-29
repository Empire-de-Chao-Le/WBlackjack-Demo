import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dashboard } from "@/components/dashboard";
import { SongLab } from "@/components/song-lab";

export default function Home() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col p-4 max-w-5xl mx-auto w-full">
      <h1 className="text-3xl font-bold mb-6 text-center text-primary-foreground tracking-tight">WBlackjack</h1>
      <Tabs defaultValue="dashboard" className="flex flex-col flex-1">
        <TabsList className="grid w-full grid-cols-2 mb-4 bg-muted">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="song-lab">Song Lab</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard" className="flex-1 flex flex-col">
          <Dashboard />
        </TabsContent>
        <TabsContent value="song-lab" className="flex-1 flex flex-col">
          <SongLab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
