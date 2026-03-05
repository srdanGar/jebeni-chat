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
}) => {
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
          <div className="message-bottom-row">
            <span
              className="message-content"
              style={{ color: message.color || "#ffffff" }}
            >
              {message.messageType === "text"
                ? renderContent(
                    message.content.length > 200
                      ? message.content.slice(0, 200) + "…"
                      : message.content,
                    message.messageType,
                  )
                : renderContent(message.content, message.messageType)}
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
