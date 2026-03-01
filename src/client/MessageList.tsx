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
          className="message"
          style={{
            backgroundColor: isDarkColor(message.color || "#ffffff")
              ? "#808080"
              : undefined,
          }}
        >
          <div className="message-header">
            <strong
              className="message-user"
              onClick={() => onTagUser(message.user)}
              title="Click to tag this user"
              style={{ cursor: "pointer", color: message.color }}
            >
              {message.user}
            </strong>
            {message.user === name && (
              <button
                className="delete-button"
                onClick={() => onDeleteMessage(message.id, message.user)}
                title="Delete message"
              >
                🗑️
              </button>
            )}
            {message.taggedUser && (
              <span className="tag-badge">@{message.taggedUser}</span>
            )}
          </div>
          <div
            className="message-content"
            style={{
              color: message.color || "#ffffff",
            }}
          >
            {renderContent(message.content, message.messageType)}
            <br />
            <small>
              {new Date(message.timestamp).toLocaleDateString()}{" "}
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </small>
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};
