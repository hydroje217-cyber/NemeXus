import { Loader2 } from 'lucide-react';

export default function LoadingScreen() {
  return (
    <main className="loading-shell">
      <Loader2 className="spin" size={28} />
    </main>
  );
}
