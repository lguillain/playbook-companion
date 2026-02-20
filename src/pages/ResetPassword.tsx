import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { BookOpen, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function ResetPassword() {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const password = form.get("password") as string;
    const confirm = form.get("confirm") as string;
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    const result = await updatePassword(password);
    setSubmitting(false);
    if (result.error) setError(result.error.message);
    else navigate("/");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-foreground tracking-tight">Playbook Manager</span>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-card">
          <h2 className="text-lg font-semibold text-foreground mb-1">Set new password</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Choose a new password for your account.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="new-password" className="block text-xs font-medium text-foreground mb-1.5">New password</label>
              <input
                type="password"
                id="new-password"
                name="password"
                autoComplete="new-password"
                required
                minLength={6}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-xs font-medium text-foreground mb-1.5">Confirm password</label>
              <input
                type="password"
                id="confirm-password"
                name="confirm"
                autoComplete="new-password"
                required
                minLength={6}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-xs text-destructive font-medium">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 rounded-lg gradient-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50 transition-opacity"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Update password
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
