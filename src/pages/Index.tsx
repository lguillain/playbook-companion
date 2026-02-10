import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { AppHeader } from "@/components/AppHeader";
import { HealthScore } from "@/components/HealthScore";
import { SkillsFramework } from "@/components/SkillsFramework";
import { ChatEditor } from "@/components/ChatEditor";
import { StagingPanel } from "@/components/StagingPanel";
import { PlaybookViewer } from "@/components/PlaybookViewer";
import { OnboardingFlow } from "@/components/OnboardingFlow";

const Index = () => {
  const [onboarded, setOnboarded] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [dashboardPrefill, setDashboardPrefill] = useState<{ skill: string; key: number } | undefined>();

  const handleFillGap = (skillName: string) => {
    setDashboardPrefill({ skill: skillName, key: Date.now() });
  };

  return (
    <div className="min-h-screen bg-background">
      <AnimatePresence>
        {!onboarded && <OnboardingFlow onComplete={() => setOnboarded(true)} />}
      </AnimatePresence>

      <AppHeader activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === "dashboard" && (
          <div className="space-y-5">
            <HealthScore activeFilter={statusFilter} onFilterChange={(f) => setStatusFilter(f === statusFilter ? null : f)} />
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">
              <SkillsFramework onFillGap={handleFillGap} statusFilter={statusFilter} />
              <div className="lg:sticky lg:top-20">
                <ChatEditor prefillGap={dashboardPrefill} />
              </div>
            </div>
          </div>
        )}

        {activeTab === "playbook" && <PlaybookViewer />}

        {activeTab === "staging" && <StagingPanel />}
      </main>
    </div>
  );
};

export default Index;
