import React from "react";
import type { ChatMessage } from "../shared";

interface MessageListProps {
  messages: ChatMessage[];
  name: string;
  currentUserId?: string;
  onTagUser: (userName: string) => void;
  onDeleteMessage: (message: ChatMessage) => void;
  onBanUser: (message: ChatMessage) => void;
  onUnbanUser: (message: ChatMessage) => void;
  canDeleteMessage: (message: ChatMessage) => boolean;
  canBanUser: (message: ChatMessage) => boolean;
  canUnbanUser: (message: ChatMessage) => boolean;
  isDarkColor: (color: string) => boolean;
  renderContent: (content: string, messageType?: string) => React.ReactNode;
  messagesContainerRef: React.RefObject<HTMLDivElement>;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  onQuoteMessage: (message: ChatMessage) => void;
  onLongPressIgnore: (user: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  name,
  currentUserId,
  onTagUser,
  onDeleteMessage,
  onBanUser,
  onUnbanUser,
  canDeleteMessage,
  canBanUser,
  canUnbanUser,
  isDarkColor,
  renderContent,
  messagesContainerRef,
  messagesEndRef,
  onQuoteMessage,
  onLongPressIgnore,
}) => {
  const touchStartXRef = React.useRef<{ [id: string]: number }>({});
  const longPressTimeout = React.useRef<{
    [id: string]: ReturnType<typeof setTimeout>;
  }>({});
  const [ignorePrompt, setIgnorePrompt] = React.useState<{
    user: string;
    x: number;
    y: number;
  } | null>(null);

  const handleLongPress = (user: string, x: number, y: number) => {
    setIgnorePrompt({ user, x, y });
  };

  const handlePrompt = (yes: boolean) => {
    if (ignorePrompt && yes) {
      onLongPressIgnore(ignorePrompt.user);
    }
    setIgnorePrompt(null);
  };

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
            longPressTimeout.current[message.id] = setTimeout(() => {
              handleLongPress(
                message.user,
                e.touches[0].clientX,
                e.touches[0].clientY,
              );
            }, 800);
          }}
          onTouchEnd={(e) => {
            clearTimeout(longPressTimeout.current[message.id]);
            const startX = touchStartXRef.current[message.id];
            const endX = e.changedTouches[0].clientX;
            if (startX !== undefined && endX - startX > 60) {
              onQuoteMessage(message);
            }
            delete touchStartXRef.current[message.id];
          }}
          onTouchMove={() => {
            clearTimeout(longPressTimeout.current[message.id]);
          }}
          onMouseDown={(e) => {
            longPressTimeout.current[message.id] = setTimeout(() => {
              handleLongPress(message.user, e.clientX, e.clientY);
            }, 800);
            touchStartXRef.current[message.id] = e.clientX;
          }}
          onMouseUp={(e) => {
            clearTimeout(longPressTimeout.current[message.id]);
            const startX = touchStartXRef.current[message.id];
            const endX = e.clientX;
            if (startX !== undefined && endX - startX > 60) {
              onQuoteMessage(message);
            }
            delete touchStartXRef.current[message.id];
          }}
          onMouseLeave={() => {
            clearTimeout(longPressTimeout.current[message.id]);
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
            {message.authorRole === "admin" && (
              <span className="role-badge">Admin</span>
            )}
            {message.isRegistered && message.authorRole === "member" && (
              <span className="role-badge member-badge">Member</span>
            )}
            {message.isRegistered && message.authorId === currentUserId && (
              <span className="role-badge">You</span>
            )}
            {!message.isRegistered && message.role === "user" && (
              <span className="role-badge guest-badge">Guest</span>
            )}
            <span className="message-date">
              {new Date(message.timestamp).toLocaleDateString()}{" "}
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          {message.content.startsWith("::quote::") &&
            (() => {
              const endIdx = message.content.indexOf("::endquote::");
              if (endIdx === -1) {
                return null;
              }
              const quoted = message.content.substring(8, endIdx);
              return (
                <div className="quote-balloon message-quote-balloon">
                  <span className="quote-content">
                    {quoted.length > 60 ? `${quoted.slice(0, 60)}...` : quoted}
                  </span>
                </div>
              );
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

                const isBot =
                  message.user === "AI" || message.role === "assistant";

                return message.messageType === "text"
                  ? renderContent(
                      isBot
                        ? contentToShow
                        : contentToShow.length > 200
                          ? `${contentToShow.slice(0, 200)}...`
                          : contentToShow,
                      message.messageType,
                    )
                  : renderContent(contentToShow, message.messageType);
              })()}
            </span>

            {(canDeleteMessage(message) ||
              canBanUser(message) ||
              canUnbanUser(message)) && (
              <div className="message-actions">
                {canBanUser(message) && (
                  <button
                    className="delete-button compact-delete ban-button"
                    onClick={() => onBanUser(message)}
                    title="Ban user"
                  >
                    Ban
                  </button>
                )}
                {canUnbanUser(message) && (
                  <button
                    className="delete-button compact-delete"
                    onClick={() => onUnbanUser(message)}
                    title="Unban user"
                  >
                    Unban
                  </button>
                )}
                {canDeleteMessage(message) && (
                  <button
                    className="delete-button compact-delete"
                    onClick={() => onDeleteMessage(message)}
                    title="Delete message"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ))}

      <div ref={messagesEndRef} />

      {ignorePrompt && (
        <div
          className="ignore-prompt"
          style={{
            position: "fixed",
            left: ignorePrompt.x,
            top: ignorePrompt.y,
            zIndex: 2000,
            background: "#222",
            color: "#fff",
            border: "1px solid #888",
            borderRadius: 8,
            padding: 16,
            boxShadow: "0 2px 8px #000a",
          }}
        >
          Ignore <b>{ignorePrompt.user}</b>?<br />
          <button onClick={() => handlePrompt(true)} style={{ margin: 8 }}>
            Yes
          </button>
          <button onClick={() => handlePrompt(false)} style={{ margin: 8 }}>
            No
          </button>
        </div>
      )}
    </div>
  );
};
