import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { BookOpen, Loader2 } from "lucide-react";
import { useNavigate, Link, useLocation } from "react-router-dom";

export default function Login() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mode = location.pathname === "/signup" ? "signup" : "login";
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const result = await signIn(form.get("email") as string, form.get("password") as string);
    setSubmitting(false);
    if (result.error) setError(result.error.message);
    else navigate("/");
  };

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    if (!disclaimerAccepted) {
      setError("You must accept the prototype disclaimer to sign up.");
      return;
    }
    setSubmitting(true);
    const result = await signUp(
      form.get("email") as string,
      form.get("password") as string,
      form.get("name") as string,
    );
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
          <h2 className="text-lg font-semibold text-foreground mb-1">
            {mode === "login" ? "Sign in" : "Create account"}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {mode === "login" ? "Enter your credentials to continue" : "Set up your team account"}
          </p>

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label htmlFor="login-email" className="block text-xs font-medium text-foreground mb-1.5">Email</label>
                <input
                  type="email"
                  id="login-email"
                  name="email"
                  autoComplete="email"
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <label htmlFor="login-password" className="block text-xs font-medium text-foreground mb-1.5">Password</label>
                <input
                  type="password"
                  id="login-password"
                  name="password"
                  autoComplete="current-password"
                  required
                  minLength={6}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                  placeholder="••••••••"
                />
              </div>
              <div className="flex justify-end">
                <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              {error && <p className="text-xs text-destructive font-medium">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 rounded-lg gradient-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50 transition-opacity"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Sign in
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-3">
              <div>
                <label htmlFor="signup-name" className="block text-xs font-medium text-foreground mb-1.5">Full name</label>
                <input
                  type="text"
                  id="signup-name"
                  name="name"
                  autoComplete="off"
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label htmlFor="signup-email" className="block text-xs font-medium text-foreground mb-1.5">Email</label>
                <input
                  type="email"
                  id="signup-email"
                  name="email"
                  autoComplete="email"
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <label htmlFor="signup-password" className="block text-xs font-medium text-foreground mb-1.5">Password</label>
                <input
                  type="password"
                  id="signup-password"
                  name="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                  placeholder="••••••••"
                />
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={disclaimerAccepted}
                  onChange={(e) => setDisclaimerAccepted(e.target.checked)}
                  className="mt-0.5 rounded border-border"
                />
                <span className="text-xs text-muted-foreground leading-relaxed">
                  This is an early-stage prototype with limited spots. If no spots are available you'll be placed on a waiting list. Features may change and data may be reset without notice. No warranties are provided. By signing up you agree to be contacted by Taskbase.
                </span>
              </label>
              {error && <p className="text-xs text-destructive font-medium">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 rounded-lg gradient-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50 transition-opacity"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Create account
              </button>
            </form>
          )}

          <div className="mt-4 text-center">
            <Link
              to={mode === "login" ? "/signup" : "/login"}
              onClick={() => setError(null)}
              className="text-xs text-primary hover:underline"
            >
              {mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
