import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";
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
    <div className="login-bg min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative floating orbs using gradient palette colors */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-[2]">
        <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-[#D1B0FC]/[0.06] blur-2xl" />
        <div className="absolute top-1/4 -right-16 w-56 h-56 rounded-full bg-[#95ABF4]/[0.05] blur-xl" />
        <div className="absolute bottom-1/4 left-[10%] w-40 h-40 rounded-full bg-[#6D57D1]/[0.08] blur-lg" />
        <div className="absolute -bottom-10 right-[20%] w-64 h-64 rounded-full bg-[#95ABF4]/[0.04] blur-2xl" />
        {/* Small accent dots */}
        <div className="absolute top-[15%] left-[25%] w-2 h-2 rounded-full bg-[#D1B0FC]/30" />
        <div className="absolute top-[30%] right-[30%] w-1.5 h-1.5 rounded-full bg-[#95ABF4]/25" />
        <div className="absolute bottom-[20%] left-[40%] w-2.5 h-2.5 rounded-full bg-[#D1B0FC]/20" />
        <div className="absolute top-[60%] right-[15%] w-2 h-2 rounded-full bg-[#6D57D1]/30" />
        <div className="absolute top-[45%] left-[12%] w-1.5 h-1.5 rounded-full bg-[#95ABF4]/25" />
      </div>

      <div className="w-full max-w-sm flex-1 flex flex-col justify-center relative z-10">
        <div className="rounded-xl bg-white p-5 shadow-2xl">
          <h2 className="text-lg text-foreground mb-1">
            {mode === "login" ? "Sign in" : "Create account"}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {mode === "login" ? "Enter your credentials to continue" : "Fill in your details below"}
          </p>

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label htmlFor="login-email" className="block text-xs font-caption text-foreground mb-1.5">Email</label>
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
                <label htmlFor="login-password" className="block text-xs font-caption text-foreground mb-1.5">Password</label>
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
              {error && <p className="text-xs text-destructive font-caption">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 rounded-lg gradient-primary py-2.5 text-sm font-subheading text-primary-foreground disabled:opacity-50 transition-opacity"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Sign in
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-3">
              <div>
                <label htmlFor="signup-name" className="block text-xs font-caption text-foreground mb-1.5">Full name</label>
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
                <label htmlFor="signup-email" className="block text-xs font-caption text-foreground mb-1.5">Email</label>
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
                <label htmlFor="signup-password" className="block text-xs font-caption text-foreground mb-1.5">Password</label>
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
              {error && <p className="text-xs text-destructive font-caption">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 rounded-lg gradient-primary py-2.5 text-sm font-subheading text-primary-foreground disabled:opacity-50 transition-opacity"
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
      <p className="py-4 text-xs text-white/60 relative z-10">
        Powered by <a href="https://taskbase.com" target="_blank" rel="noopener noreferrer" className="font-subheading text-white/80 hover:text-white transition-colors">Taskbase</a>
      </p>
    </div>
  );
}
