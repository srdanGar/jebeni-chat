import { createRoot } from "react-dom/client";
import { usePartySocket } from "partysocket/react";
import React, { useState, useEffect, useRef } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useParams,
} from "react-router";
import { nanoid } from "nanoid";

import { names, type ChatMessage, type Message } from "../shared";

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const { room } = useParams();

  const storageKey = `chat:name${room ? ":" + room : ""}`;

  const getTextShadow = (color: string) => {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5 ? "1px 1px 2px rgba(128, 128, 128, 0.7)" : "none";
  };

  const isDarkColor = (color: string) => {
    return color === "#000000" || color === "#0000ff" || color === "#000080";
  };

  const [name, setName] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) return stored;
    } catch (e) {
      // localStorage may be unavailable; fall back to random
    }
    return names[Math.floor(Math.random() * names.length)];
  });

  const colorStorageKey = `chat:color${room ? ":" + room : ""}`;

  const [selectedColor, setSelectedColor] = useState(() => {
    try {
      const stored = localStorage.getItem(colorStorageKey);
      if (stored) return stored;
    } catch (e) {
      // localStorage may be unavailable; fall back to default
    }
    return "#ffffff"; // default white
  });

  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState(name);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const colors = [
    "#ffffff",
    "#000000",
    "#ff0000",
    "#00ff00",
    "#0000ff",
    "#ffff00",
    "#ff00ff",
    "#00ffff",
    "#ffa500",
    "#800080",
    "#ffc0cb",
    "#a52a2a",
    "#808080",
    "#000080",
    "#008000",
    "#ff4500",
    "#daa520",
    "#adff2f",
    "#ff69b4",
    "#1e90ff",
  ];

  React.useEffect(() => {
    try {
      localStorage.setItem(storageKey, name);
    } catch (e) {
      // ignore
    }
  }, [name, storageKey]);

  React.useEffect(() => {
    try {
      localStorage.setItem(colorStorageKey, selectedColor);
    } catch (e) {
      // ignore
    }
  }, [selectedColor, colorStorageKey]);

  const socket = usePartySocket({
    party: "chat",
    room,
    onMessage: (evt) => {
      const message = JSON.parse(evt.data as string) as Message;
      if (message.type === "add") {
        const foundIndex = messages.findIndex((m) => m.id === message.id);
        if (foundIndex === -1) {
          // probably someone else who added a message
          setMessages((messages) => [
            ...messages,
            {
              id: message.id,
              content: message.content,
              user: message.user,
              role: message.role,
              timestamp: message.timestamp,
              color: message.color,
            },
          ]);
        } else {
          // this usually means we ourselves added a message
          // and it was broadcasted back
          // so let's replace the message with the new message
          setMessages((messages) => {
            return messages
              .slice(0, foundIndex)
              .concat({
                id: message.id,
                content: message.content,
                user: message.user,
                role: message.role,
                timestamp: message.timestamp,
                color: message.color,
              })
              .concat(messages.slice(foundIndex + 1));
          });
        }
      } else if (message.type === "update") {
        setMessages((messages) =>
          messages.map((m) =>
            m.id === message.id
              ? {
                  id: message.id,
                  content: message.content,
                  user: message.user,
                  role: message.role,
                  timestamp: message.timestamp,
                  color: message.color,
                }
              : m
          )
        );
      } else {
        setMessages(message.messages);
      }
    },
  });

  const messagesEndRef = useRef<HTMLDivElement>(null); // Add ref for scrolling to bottom

  // Add useEffect to auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <>
      <div className="chat">
        {/* Wrap messages in separate scrollable container */}
        <div className="messages">
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
              <div
                className="message-content"
                style={{
                  color: message.color || "#ffffff",
                }}
              >
                <strong>{message.user}:</strong> {message.content}
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
          {/* Add invisible element at the end for scrolling reference */}
          <div ref={messagesEndRef} />
        </div>

        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            const content = e.currentTarget.elements.namedItem(
              "content"
            ) as HTMLInputElement;
            const chatMessage: ChatMessage = {
              id: nanoid(8),
              content: content.value,
              user: name,
              role: "user",
              timestamp: new Date().toISOString(),
              color: selectedColor,
            };
            setMessages((messages) => [...messages, chatMessage]);
            // we could broadcast the message here

            socket.send(
              JSON.stringify({
                type: "add",
                ...chatMessage,
              } satisfies Message)
            );

            content.value = "";
          }}
        >
          <input
            type="text"
            name="content"
            className="ten columns my-input-text"
            placeholder={`Hello ${name}! Type a message...`}
            autoComplete="off"
          />
          <button type="submit" className="send-message two columns">
            Send
          </button>
        </form>
      </div>
      {/* Add the nickname edit UI here, positioned left via CSS */}
      <div className="nickname-edit">
        {editingName ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const newName = tempName.trim();
              if (newName.length > 0) setName(newName);
              setEditingName(false);
            }}
          >
            <input
              value={tempName}
              onChange={(e) => setTempName(e.currentTarget.value)}
              className="my-input-text"
              autoComplete="off"
            />
            <button type="submit">Save</button>
            <button
              type="button"
              onClick={() => {
                setEditingName(false);
                setTempName(name);
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <>
            <button
              onClick={() => {
                setTempName(name);
                setEditingName(true);
              }}
            >
              Edit Nickname
            </button>
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              style={{ backgroundColor: selectedColor, color: "white" }}
            >
              Choose Color
            </button>
            {showColorPicker && (
              <div className="color-picker">
                {colors.map((color) => (
                  <div
                    key={color}
                    className="color-swatch"
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      setSelectedColor(color);
                      setShowColorPicker(false);
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Navigate to={`/${nanoid()}`} />} />
      <Route path="/:room" element={<App />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  </BrowserRouter>
);
