import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { AppHeader } from "@/components/AppHeader";
import { HealthScore } from "@/components/HealthScore";
import { SkillsFramework } from "@/components/SkillsFramework";
import { ChatEditor } from "@/components/ChatEditor";
import { StagingPanel } from "@/components/StagingPanel";
import { PlaybookViewer } from "@/components/PlaybookViewer";
import { IntegrationsPanel } from "@/components/IntegrationsPanel";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { usePlaybookSections } from "@/hooks/use-playbook-sections";

const Index = () => {
  const { data: sections, isLoading: sectionsLoading } = usePlaybookSections();
  const hasPlaybook = (sections?.length ?? 0) > 0;
  const [dismissed, setDismissed] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [skillFilter, setSkillFilter] = useState<{ skillId: string; skillName: string } | null>(null);

  const handleFillGap = (skillId: string, skillName: string) => {
    setSkillFilter({ skillId, skillName });
    setActiveTab("playbook");
  };

  return (
    <div className="min-h-screen bg-background">
      <AnimatePresence>
        {!sectionsLoading && !hasPlaybook && !dismissed && (
          <OnboardingFlow onComplete={() => setDismissed(true)} />
        )}
      </AnimatePresence>

      <AppHeader activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === "dashboard" && (
          <div className="space-y-5">
            <HealthScore activeFilter={statusFilter} onFilterChange={(f) => setStatusFilter(f === statusFilter ? null : f)} />
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">
              <SkillsFramework onFillGap={handleFillGap} statusFilter={statusFilter} />
              <div className="lg:sticky lg:top-20">
                <ChatEditor />
              </div>
            </div>
          </div>
        )}

        {activeTab === "playbook" && <PlaybookViewer skillFilter={skillFilter} onSkillFilterChange={setSkillFilter} />}

        {activeTab === "staging" && <StagingPanel />}

        {activeTab === "integrations" && <IntegrationsPanel />}
      </main>
    </div>
  );
};

export default Index;
