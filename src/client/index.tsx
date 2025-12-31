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

  const [name, setName] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) return stored;
    } catch (e) {
      // localStorage may be unavailable; fall back to random
    }
    return names[Math.floor(Math.random() * names.length)];
  });

  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState(name);

  React.useEffect(() => {
    try {
      localStorage.setItem(storageKey, name);
    } catch (e) {
      // ignore
    }
  }, [name, storageKey]);

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
        {messages.map((message) => (
          <div key={message.id} className="row message">
            <div className="two columns user">{message.user}</div>
            <div className="ten columns">{message.content}</div>
          </div>
        ))}
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

        {/* Add invisible element at the end for scrolling reference */}
        <div ref={messagesEndRef} />
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
          <button
            onClick={() => {
              setTempName(name);
              setEditingName(true);
            }}
          >
            Edit Nickname
          </button>
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
