import { ThreadView } from "@/components/chat/thread-view";

export const metadata = { title: "Chat" };

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  // key: switching chats remounts the thread (fresh scroll + state).
  return <ThreadView key={conversationId} conversationId={conversationId} />;
}
