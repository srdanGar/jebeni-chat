import { useRef, useEffect } from "react";

interface UseAutoScrollProps {
  messages: any[];
  name: string;
  messagesContainerRef: React.RefObject<HTMLDivElement>;
}

export const useAutoScroll = ({
  messages,
  name,
  messagesContainerRef,
}: UseAutoScrollProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasReceivedInitialMessages = useRef(false);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container && messages.length > 0) {
      const isScrolledToBottom =
        container.scrollHeight - container.scrollTop <=
        container.clientHeight + 10;

      const lastMessage = messages[messages.length - 1];
      const isOwnMessage = lastMessage && lastMessage.user === name;

      if (!hasReceivedInitialMessages.current) {
        container.scrollTop = container.scrollHeight;
        hasReceivedInitialMessages.current = true;
      } else if (isScrolledToBottom || isOwnMessage) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [messages, name]);

  return messagesEndRef;
};
