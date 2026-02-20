import { BookOpen, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const AppHeader = ({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (t: string) => void }) => {
  const { profile, signOut } = useAuth();

  const tabs = [
    { id: "dashboard", label: "Dashboard" },
    { id: "playbook", label: "Playbook" },
    { id: "staging", label: "Review & Publish" },
    { id: "integrations", label: "Integrations" },
  ];

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-[1600px] mx-auto px-6 flex items-center justify-between h-14">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="text-sm text-foreground">Playbook Manager</span>
        </div>

        <nav className="flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-subheading transition-colors ${
                activeTab === tab.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {profile?.full_name && (
            <span className="text-xs text-muted-foreground hidden sm:inline">{profile.full_name}</span>
          )}
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[11px] font-overline text-primary">
            {initials}
          </div>
          <button
            onClick={signOut}
            className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>
    </header>
  );
};
