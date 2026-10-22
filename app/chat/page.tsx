import SimpleChat from "@/components/SimpleChat";

// The simple chatbot: a minimal dark-mode page over the existing OpenRouter
// gateway path (see components/SimpleChat.tsx). The PIN gate middleware
// covers this route like every other page when APP_PIN is set.
export default function ChatPage() {
  return <SimpleChat />;
}
