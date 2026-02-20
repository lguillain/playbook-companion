import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { BookOpen, LogOut, UserX } from "lucide-react";

export default function WaitlistScreen() {
  const { signOut } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLeaveWaitlist() {
    setDeleting(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("delete_own_account");
    if (rpcError) {
      setError("Something went wrong. Please try again.");
      setDeleting(false);
      return;
    }
    await signOut();
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm text-center flex-1 flex flex-col justify-center">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-lg text-foreground">Playbook Manager</span>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-card">
          <h2 className="text-lg text-foreground mb-2">You're on the waiting list</h2>
          <p className="text-sm text-muted-foreground mb-6">
            We'll let you know when a spot opens up.
          </p>

          {error && (
            <p className="text-sm text-destructive mb-4">{error}</p>
          )}

          <div className="flex flex-col gap-3">
            {!confirming ? (
              <>
                <button
                  onClick={() => setConfirming(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-destructive/30 px-4 py-2 text-sm font-subheading text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <UserX className="w-4 h-4" />
                  Leave waitlist
                </button>
                <button
                  onClick={signOut}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-subheading text-foreground hover:bg-muted/50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  This will delete your account. You can always sign up again later.
                </p>
                <button
                  onClick={handleLeaveWaitlist}
                  disabled={deleting}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-subheading text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
                >
                  {deleting ? "Deleting..." : "Yes, delete my account"}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={deleting}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-subheading text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      <p className="py-4 text-xs text-muted-foreground">
        Powered by <a href="https://taskbase.com" target="_blank" rel="noopener noreferrer" className="font-subheading text-primary hover:underline">Taskbase</a>
      </p>
    </div>
  );
}
