import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ---------- mock auth context ----------

const mockSignIn = vi.fn().mockResolvedValue({ error: null });
const mockSignUp = vi.fn().mockResolvedValue({ error: null });
const mockSignOut = vi.fn();
const mockResetPassword = vi.fn().mockResolvedValue({ error: null });
const mockUpdatePassword = vi.fn().mockResolvedValue({ error: null });

let authOverrides: Record<string, unknown> = {};

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "test@example.com" },
    profile: { id: "u1", full_name: "Test", avatar_url: null, role: "member", status: "active", created_at: "" },
    session: { access_token: "tok" },
    loading: false,
    signIn: mockSignIn,
    signUp: mockSignUp,
    signOut: mockSignOut,
    resetPassword: mockResetPassword,
    updatePassword: mockUpdatePassword,
    ...authOverrides,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ---------- imports (after mock) ----------

import { useAuth } from "@/lib/auth";
import WaitlistScreen from "@/pages/WaitlistScreen";
import Login from "@/pages/Login";

// Lightweight stand-in for ProtectedRoute (mirrors App.tsx logic)
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!session) return <div>Redirected to login</div>;
  if ((profile as { status?: string } | null)?.status === "waitlisted") return <WaitlistScreen />;
  return <>{children}</>;
}

// ---------- helpers ----------

function renderWithRouter(ui: React.ReactElement, route = "/") {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}

// ---------- tests ----------

describe("Waitlist gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authOverrides = {};
  });

  it("shows WaitlistScreen when profile status is waitlisted", () => {
    authOverrides = {
      profile: { id: "u1", full_name: "Test", avatar_url: null, role: "member", status: "waitlisted", created_at: "" },
    };

    renderWithRouter(
      <ProtectedRoute><div>App content</div></ProtectedRoute>,
    );

    expect(screen.getByText("You're on the waiting list")).toBeInTheDocument();
    expect(screen.getByText(/when a spot opens up/)).toBeInTheDocument();
    expect(screen.queryByText("App content")).not.toBeInTheDocument();
  });

  it("renders app content when profile status is active", () => {
    authOverrides = {
      profile: { id: "u1", full_name: "Test", avatar_url: null, role: "member", status: "active", created_at: "" },
    };

    renderWithRouter(
      <ProtectedRoute><div>App content</div></ProtectedRoute>,
    );

    expect(screen.getByText("App content")).toBeInTheDocument();
    expect(screen.queryByText("You're on the waiting list")).not.toBeInTheDocument();
  });

  it("redirects to login when there is no session", () => {
    authOverrides = { session: null, profile: null };

    renderWithRouter(
      <ProtectedRoute><div>App content</div></ProtectedRoute>,
    );

    expect(screen.getByText("Redirected to login")).toBeInTheDocument();
  });
});

describe("WaitlistScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authOverrides = {};
  });

  it("calls signOut when sign out button is clicked", () => {
    renderWithRouter(<WaitlistScreen />);

    fireEvent.click(screen.getByText("Sign out"));
    expect(mockSignOut).toHaveBeenCalledOnce();
  });
});

describe("Signup disclaimer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authOverrides = { session: null, profile: null };
  });

  it("shows error when submitting signup without accepting disclaimer", async () => {
    renderWithRouter(<Login />, "/signup");

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Jane" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(screen.getByText("You must accept the prototype disclaimer to sign up.")).toBeInTheDocument();
    });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("calls signUp when disclaimer is accepted", async () => {
    renderWithRouter(<Login />, "/signup");

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Jane" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith("jane@example.com", "password123", "Jane");
    });
  });

  it("displays the prototype disclaimer text on signup form", () => {
    renderWithRouter(<Login />, "/signup");

    expect(screen.getByText(/early-stage prototype with limited spots/)).toBeInTheDocument();
    expect(screen.getByText(/agree to be contacted by Taskbase/)).toBeInTheDocument();
  });

  it("does not show disclaimer on login form", () => {
    renderWithRouter(<Login />, "/login");

    expect(screen.queryByText(/early-stage prototype/)).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
