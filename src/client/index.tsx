import { createRoot } from "react-dom/client";
import { usePartySocket } from "partysocket/react";
import React, { useState, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { nanoid } from "nanoid";

import { names, type ChatMessage, type Message } from "../shared";
import { uploadAudio, uploadImage, cleanupOldMedia } from "../supabase-service";
import { MessageList } from "./MessageList";
import { InputForm } from "./InputForm";
import { NicknameEdit } from "./NicknameEdit";
import { ActiveUsers } from "./ActiveUsers";
import { renderContent, isDarkColor, getActiveUsers } from "./utils";
import { useAutoScroll } from "./useAutoScroll";
import { useAudioRecording } from "./useAudioRecording";

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [quotedMessage, setQuotedMessage] = useState<ChatMessage | null>(null);
  const room = "9FexDdTqo9kdtdgg0WukK";

  const storageKey = `chat:name${room ? ":" + room : ""}`;
  const colorStorageKey = `chat:color${room ? ":" + room : ""}`;

  const [name, setName] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) return stored;
    } catch (e) {
      // localStorage may be unavailable
    }
    return names[Math.floor(Math.random() * names.length)];
  });

  const [selectedColor, setSelectedColor] = useState(() => {
    try {
      const stored = localStorage.getItem(colorStorageKey);
      if (stored) return stored;
    } catch (e) {
      // localStorage may be unavailable
    }
    return "#ffffff";
  });

  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState(name);
  const [userActivity, setUserActivity] = useState<Record<string, string>>({});
  const [showActiveUsers, setShowActiveUsers] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [taggedUser, setTaggedUser] = useState<string>("");

  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const {
    isRecording,
    setIsRecording,
    mediaRecorder,
    setMediaRecorder,
    micPermission,
  } = useAudioRecording();

  const messagesEndRef = useAutoScroll({
    messages,
    name,
    messagesContainerRef,
  });

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
          setMessages((messages) => [
            ...messages,
            {
              id: message.id,
              content: message.content,
              user: message.user,
              role: message.role,
              timestamp: message.timestamp,
              color: message.color,
              messageType: message.messageType,
              taggedUser: message.taggedUser,
            },
          ]);
          setUserActivity((prev) => ({
            ...prev,
            [message.user]: message.timestamp,
          }));
        } else {
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
                messageType: message.messageType,
                taggedUser: message.taggedUser,
              })
              .concat(messages.slice(foundIndex + 1));
          });
          setUserActivity((prev) => ({
            ...prev,
            [message.user]: message.timestamp,
          }));
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
                  messageType: message.messageType,
                  taggedUser: message.taggedUser,
                }
              : m,
          ),
        );
        setUserActivity((prev) => ({
          ...prev,
          [message.user]: message.timestamp,
        }));
      } else if (message.type === "delete") {
        setMessages((messages) => messages.filter((m) => m.id !== message.id));
      } else {
        setMessages(message.messages);
        const activity: Record<string, string> = {};
        message.messages.forEach((msg) => {
          activity[msg.user] = msg.timestamp;
        });
        setUserActivity(activity);
      }
    },
  });

  const handleDeleteMessage = (messageId: string, messageUser: string) => {
    if (messageUser === name) {
      socket.send(
        JSON.stringify({
          type: "delete",
          id: messageId,
        } satisfies Message),
      );
    }
  };

  const handleTagUser = (userName: string) => {
    setTaggedUser(userName);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const filename = `${nanoid()}_${file.name}`;
      const imageUrl = await uploadImage(filename, file);
      await cleanupOldMedia("images");

      const chatMessage: ChatMessage = {
        id: nanoid(8),
        content: imageUrl,
        user: name,
        role: "user",
        timestamp: new Date().toISOString(),
        color: selectedColor,
        messageType: "image",
        taggedUser: taggedUser || undefined,
      };

      setMessages((messages) => [...messages, chatMessage]);
      setTaggedUser("");

      socket.send(
        JSON.stringify({
          type: "add",
          ...chatMessage,
        } satisfies Message),
      );

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      console.error("Image upload failed:", err);
      alert("Failed to upload image");
    }
  };

  const handleMicClick = async () => {
    if (isRecording && mediaRecorder) {
      mediaRecorder.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, {
          mimeType: "audio/mp4; codecs=mp4a.40.2",
        });
      } catch {
        recorder = new MediaRecorder(stream);
      }

      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type: mimeType });

        try {
          const format = mimeType.split("/")[1].split(";")[0];
          const filename = `${nanoid()}.${format}`;
          const audioUrl = await uploadAudio(filename, blob);
          await cleanupOldMedia("audio");

          const chatMessage: ChatMessage = {
            id: nanoid(8),
            content: audioUrl,
            user: name,
            role: "user",
            timestamp: new Date().toISOString(),
            color: selectedColor,
            messageType: "audio",
            taggedUser: taggedUser || undefined,
          };

          setMessages((m) => [...m, chatMessage]);
          setTaggedUser("");

          socket.send(
            JSON.stringify({
              type: "add",
              ...chatMessage,
            } satisfies Message),
          );
        } catch (err) {
          console.error("Failed to upload audio:", err);
          alert("Failed to upload audio message");
        }

        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);

      setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop();
          setIsRecording(false);
        }
      }, 10_000);
    } catch (err) {
      console.error(err);
      alert("Microphone permission is required to send voice messages.");
    }
  };

  const handleFormSubmit = (message: ChatMessage) => {
    setMessages((messages) => [...messages, message]);
    setTaggedUser("");
    setQuotedMessage(null);

    socket.send(
      JSON.stringify({
        type: "add",
        ...message,
      } satisfies Message),
    );
  };

  return (
    <>
      <div className="chat">
        <MessageList
          messages={messages}
          name={name}
          onTagUser={handleTagUser}
          onDeleteMessage={handleDeleteMessage}
          isDarkColor={isDarkColor}
          renderContent={renderContent}
          messagesContainerRef={messagesContainerRef}
          messagesEndRef={messagesEndRef}
          onQuoteMessage={setQuotedMessage}
        />

        <InputForm
          inputRef={inputRef}
          fileInputRef={fileInputRef}
          name={name}
          taggedUser={taggedUser}
          isRecording={isRecording}
          selectedColor={selectedColor}
          onSubmit={handleFormSubmit}
          onClearTag={() => setTaggedUser("")}
          onMicClick={handleMicClick}
          onImageUpload={handleImageUpload}
          quotedMessage={quotedMessage}
          onClearQuote={() => setQuotedMessage(null)}
        />
      </div>

      <NicknameEdit
        editingName={editingName}
        tempName={tempName}
        name={name}
        selectedColor={selectedColor}
        showColorPicker={showColorPicker}
        colors={colors}
        onSetEditingName={setEditingName}
        onSetTempName={setTempName}
        onSetName={setName}
        onSetSelectedColor={setSelectedColor}
        onSetShowColorPicker={setShowColorPicker}
      />

      <ActiveUsers
        showActiveUsers={showActiveUsers}
        onSetShowActiveUsers={setShowActiveUsers}
        activeUsers={getActiveUsers(userActivity)}
      />
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Navigate to="/9FexDdTqo9kdtdgg0WukK" />} />
      <Route path="/9FexDdTqo9kdtdgg0WukK" element={<App />} />
      <Route path="*" element={<Navigate to="/9FexDdTqo9kdtdgg0WukK" />} />
    </Routes>
  </BrowserRouter>,
);
