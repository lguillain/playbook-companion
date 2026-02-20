import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { BookOpen, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

export default function ForgotPassword() {
  const { resetPassword } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const result = await resetPassword(form.get("email") as string);
    setSubmitting(false);
    if (result.error) setError(result.error.message);
    else setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm flex-1 flex flex-col justify-center">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-lg text-foreground">Playbook Manager</span>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-card">
          <h2 className="text-lg text-foreground mb-1">Reset password</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Enter your email and we'll send you a reset link.
          </p>

          {submitted ? (
            <p className="text-sm text-foreground">
              Check your email for a password reset link.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label htmlFor="reset-email" className="block text-xs font-caption text-foreground mb-1.5">Email</label>
                <input
                  type="email"
                  id="reset-email"
                  name="email"
                  autoComplete="email"
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                  placeholder="you@company.com"
                />
              </div>
              {error && <p className="text-xs text-destructive font-caption">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 rounded-lg gradient-primary py-2.5 text-sm font-subheading text-primary-foreground disabled:opacity-50 transition-opacity"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Send reset link
              </button>
            </form>
          )}

          <div className="mt-4 text-center">
            <Link to="/login" className="text-xs text-primary hover:underline">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
      <p className="py-4 text-xs text-muted-foreground">
        Powered by <a href="https://taskbase.com" target="_blank" rel="noopener noreferrer" className="font-subheading text-primary hover:underline">Taskbase</a>
      </p>
    </div>
  );
}
