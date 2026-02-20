import { useState, useEffect } from "react";
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
  const [activeTab, setActiveTab] = useState("dashboard");

  // Latch: show onboarding when no playbook exists; once visible it stays
  // until the full import+analyze flow completes and calls onComplete.
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    if (!sectionsLoading && !hasPlaybook) setShowOnboarding(true);
  }, [sectionsLoading, hasPlaybook]);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [skillFilter, setSkillFilter] = useState<{ skillId: string; skillName: string } | null>(null);
  const [targetSectionId, setTargetSectionId] = useState<string | null>(null);

  const handleFillGap = (skillId: string, skillName: string) => {
    setSkillFilter({ skillId, skillName });
    setActiveTab("playbook");
  };

  const handleNavigateToSection = (sectionId: string) => {
    setTargetSectionId(sectionId);
    setActiveTab("playbook");
  };

  return (
    <div className="min-h-screen bg-background">
      <AnimatePresence>
        {showOnboarding && (
          <OnboardingFlow onComplete={() => { setShowOnboarding(false); setActiveTab("dashboard"); }} />
        )}
      </AnimatePresence>

      <AppHeader activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="max-w-[1600px] mx-auto px-6 py-8 min-h-[calc(100vh-8rem)]">
        {activeTab === "dashboard" && (
          <div className="space-y-5">
            <HealthScore activeFilter={statusFilter} onFilterChange={(f) => setStatusFilter(f === statusFilter ? null : f)} />
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_480px] gap-5 items-start">
              <SkillsFramework onFillGap={handleFillGap} statusFilter={statusFilter} />
              <div className="lg:sticky lg:top-20">
                <ChatEditor onNavigateToSection={handleNavigateToSection} sections={sections} />
              </div>
            </div>
          </div>
        )}

        {activeTab === "playbook" && <PlaybookViewer skillFilter={skillFilter} onSkillFilterChange={setSkillFilter} initialSectionId={targetSectionId} onInitialSectionConsumed={() => setTargetSectionId(null)} />}

        {activeTab === "staging" && <StagingPanel />}

        {activeTab === "integrations" && <IntegrationsPanel />}
      </main>

      <footer className="border-t border-border py-4 mt-8">
        <p className="text-center text-xs text-muted-foreground">
          Powered by <a href="https://taskbase.com" target="_blank" rel="noopener noreferrer" className="font-subheading text-primary hover:underline">Taskbase</a>
        </p>
      </footer>
    </div>
  );
};

export default Index;
