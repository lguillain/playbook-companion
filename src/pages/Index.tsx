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
  const [chatPrefill, setChatPrefill] = useState<string | undefined>();

  const handleFillGap = (skillName: string) => {
    setChatPrefill(skillName);
    setActiveTab("chat");
  };

  return (
    <div className="min-h-screen bg-background">
      <AnimatePresence>
        {!onboarded && <OnboardingFlow onComplete={() => setOnboarded(true)} />}
      </AnimatePresence>

      <AppHeader activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === "dashboard" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <HealthScore />
            <SkillsFramework onFillGap={handleFillGap} />
          </div>
        )}

        {activeTab === "playbook" && <PlaybookViewer />}

        {activeTab === "chat" && (
          <div className="max-w-2xl mx-auto">
            <ChatEditor prefillGap={chatPrefill} />
          </div>
        )}

        {activeTab === "staging" && <StagingPanel />}
      </main>
    </div>
  );
};

export default Index;
