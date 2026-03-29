import React from "react";
import type { ChatMessage } from "../shared";

interface MessageListProps {
  messages: ChatMessage[];
  name: string;
  onTagUser: (userName: string) => void;
  onDeleteMessage: (messageId: string, messageUser: string) => void;
  isDarkColor: (color: string) => boolean;
  renderContent: (content: string, messageType?: string) => React.ReactNode;
  messagesContainerRef: React.RefObject<HTMLDivElement>;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  onQuoteMessage: (message: ChatMessage) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  name,
  onTagUser,
  onDeleteMessage,
  isDarkColor,
  renderContent,
  messagesContainerRef,
  messagesEndRef,
  onQuoteMessage,
}) => {
  // Use a ref to track swipe start X per message
  const touchStartXRef = React.useRef<{ [id: string]: number }>({});
  return (
    <div className="messages" ref={messagesContainerRef}>
      {messages.map((message) => (
        <div
          key={message.id}
          className="message compact-message"
          style={{
            backgroundColor: isDarkColor(message.color || "#ffffff")
              ? "#808080"
              : undefined,
          }}
          onTouchStart={(e) => {
            touchStartXRef.current[message.id] = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            const startX = touchStartXRef.current[message.id];
            const endX = e.changedTouches[0].clientX;
            if (startX !== undefined && endX - startX > 60) {
              onQuoteMessage(message);
            }
            delete touchStartXRef.current[message.id];
          }}
          onMouseDown={(e) => {
            touchStartXRef.current[message.id] = e.clientX;
          }}
          onMouseUp={(e) => {
            const startX = touchStartXRef.current[message.id];
            const endX = e.clientX;
            if (startX !== undefined && endX - startX > 60) {
              onQuoteMessage(message);
            }
            delete touchStartXRef.current[message.id];
          }}
        >
          <div className="message-top-row">
            <span
              className="message-user"
              onClick={() => onTagUser(message.user)}
              title="Click to tag this user"
              style={{ cursor: "pointer", color: message.color }}
            >
              {message.user}
            </span>
            {message.taggedUser && (
              <span className="tag-badge">@{message.taggedUser}</span>
            )}
            <span className="message-date">
              {new Date(message.timestamp).toLocaleDateString()}{" "}
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          {/* Parse and show quote if present in content */}
          {message.content.startsWith("::quote::") &&
            (() => {
              const endIdx = message.content.indexOf("::endquote::");
              if (endIdx !== -1) {
                const quoted = message.content.substring(8, endIdx);
                return (
                  <div className="quote-balloon message-quote-balloon">
                    <span className="quote-content">
                      {quoted.length > 60 ? quoted.slice(0, 60) + "…" : quoted}
                    </span>
                  </div>
                );
              }
              return null;
            })()}
          <div className="message-bottom-row">
            <span
              className="message-content"
              style={{ color: message.color || "#ffffff" }}
            >
              {(() => {
                let contentToShow = message.content;
                if (contentToShow.startsWith("::quote::")) {
                  const endIdx = contentToShow.indexOf("::endquote::");
                  if (endIdx !== -1) {
                    contentToShow = contentToShow.slice(endIdx + 12).trim();
                  }
                }
                return message.messageType === "text"
                  ? renderContent(
                      contentToShow.length > 200
                        ? contentToShow.slice(0, 200) + "…"
                        : contentToShow,
                      message.messageType,
                    )
                  : renderContent(contentToShow, message.messageType);
              })()}
            </span>
            {message.user === name && (
              <button
                className="delete-button compact-delete"
                onClick={() => onDeleteMessage(message.id, message.user)}
                title="Delete message"
              >
                🗑️
              </button>
            )}
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};
