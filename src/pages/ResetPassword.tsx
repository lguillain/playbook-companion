import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";
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
    <div className="login-bg min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative floating orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-[2]">
        <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-[#D1B0FC]/[0.06] blur-2xl" />
        <div className="absolute top-1/4 -right-16 w-56 h-56 rounded-full bg-[#95ABF4]/[0.05] blur-xl" />
        <div className="absolute bottom-1/4 left-[10%] w-40 h-40 rounded-full bg-[#6D57D1]/[0.08] blur-lg" />
        <div className="absolute -bottom-10 right-[20%] w-64 h-64 rounded-full bg-[#95ABF4]/[0.04] blur-2xl" />
      </div>

      <div className="w-full max-w-sm flex-1 flex flex-col justify-center relative z-10">
        <div className="rounded-xl bg-white p-5 shadow-2xl">
          <h2 className="text-lg text-foreground mb-1">Set new password</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Choose a new password for your account.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="new-password" className="block text-xs font-caption text-foreground mb-1.5">New password</label>
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
              <label htmlFor="confirm-password" className="block text-xs font-caption text-foreground mb-1.5">Confirm password</label>
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
            {error && <p className="text-xs text-destructive font-caption">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 rounded-lg gradient-primary py-2.5 text-sm font-subheading text-primary-foreground disabled:opacity-50 transition-opacity"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Update password
            </button>
          </form>
        </div>
      </div>
      <p className="py-4 text-xs text-white/30 relative z-10">
        Powered by <a href="https://taskbase.com" target="_blank" rel="noopener noreferrer" className="font-subheading text-white/50 hover:text-white/70 transition-colors">Taskbase</a>
      </p>
    </div>
  );
}
