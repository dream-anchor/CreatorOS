import { GlobalLayout } from "@/components/GlobalLayout";
import { ModernChatInterface } from "@/components/chat/ModernChatInterface";

export default function DashboardPage() {
  return (
    <GlobalLayout hideBottomChat>
      <div className="h-[calc(100vh-3.5rem)] lg:h-screen">
        <ModernChatInterface />
      </div>
    </GlobalLayout>
  );
}
