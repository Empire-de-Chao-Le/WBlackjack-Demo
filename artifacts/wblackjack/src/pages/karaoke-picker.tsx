import { Link, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function KaraokePicker() {
  const [, params] = useRoute("/song/:id/karaoke");
  const id = params?.id;

  return (
    <div className="min-h-[100dvh] flex flex-col p-4 max-w-lg mx-auto w-full gap-8">
      <div className="flex items-center gap-4">
        <Link href={`/song/${id}`} className="p-2 rounded-xl bg-[#8c3cdd] text-white hover:bg-[#7b2fcc] transition-colors" data-testid="link-back">
          <ArrowLeft className="w-7 h-7" />
        </Link>
        <h1 className="text-xl font-bold">Select Difficulty</h1>
      </div>

      <div className="flex flex-col gap-4 mt-8">
        <Link href={`/song/${id}/karaoke/10`} className="block">
          <Button size="lg" className="w-full h-24 text-2xl font-bold hover:bg-muted border border-border bg-[#8c3cdde6]" data-testid="btn-diff-10">10%</Button>
        </Link>
        <Link href={`/song/${id}/karaoke/33`} className="block">
          <Button size="lg" className="w-full h-24 text-2xl font-bold hover:bg-muted border border-border bg-[#8c3cdde6]" data-testid="btn-diff-33">33%</Button>
        </Link>
        <Link href={`/song/${id}/karaoke/100`} className="block">
          <Button size="lg" className="w-full h-24 text-2xl font-bold hover:bg-muted border border-border bg-[#8c3cdde6]" data-testid="btn-diff-100">100%</Button>
        </Link>
      </div>
    </div>
  );
}
