import { createRoot } from "react-dom/client";
import { usePartySocket } from "partysocket/react";
import React, { useEffect, useRef, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router";
import { nanoid } from "nanoid";

import {
  names,
  type ChatMessage,
  type Message,
  type RegisteredUser,
} from "../shared";
import { cleanupOldMedia, uploadAudio, uploadImage } from "../supabase-service";
import { ActiveUsers } from "./ActiveUsers";
import { InputForm } from "./InputForm";
import { MessageList } from "./MessageList";
import { NicknameEdit } from "./NicknameEdit";
import { useAudioRecording } from "./useAudioRecording";
import { useAutoScroll } from "./useAutoScroll";
import { getActiveUsers, isDarkColor, renderContent } from "./utils";

const IGNORE_KEY = "chat:ignoreList";

const runtimeEnv =
  typeof window !== "undefined" && window.ENV ? window.ENV : {};
const ENABLE_UNREGISTERED = !["0", "false", "no", "off"].includes(
  String(runtimeEnv.ENABLE_UNREGISTERED || "true")
    .trim()
    .toLowerCase(),
);

type AuthMode = "login" | "register";

type AuthResponse = {
  token: string;
  user: RegisteredUser;
};

type MeResponse = {
  token: string;
  user: RegisteredUser;
};

type NicknameCheckResponse = {
  available: boolean;
  error?: string;
};

function getIgnoreList(): string[] {
  try {
    const raw = localStorage.getItem(IGNORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setIgnoreList(list: string[]) {
  try {
    localStorage.setItem(IGNORE_KEY, JSON.stringify(list));
  } catch {}
}

async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: Record<string, unknown>;
  } = {},
): Promise<T> {
  const headers = new Headers();
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }
  if (options.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    credentials: "same-origin",
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function toChatMessage(
  message: Extract<Message, { type: "add" | "update" }>,
): ChatMessage {
  return {
    id: message.id,
    content: message.content,
    user: message.user,
    role: message.role,
    timestamp: message.timestamp,
    color: message.color,
    messageType: message.messageType,
    taggedUser: message.taggedUser,
    authorId: message.authorId,
    authorRole: message.authorRole,
    isRegistered: message.isRegistered,
  };
}

function App() {
  const room = "9FexDdTqo9kdtdgg0WukK";
  const storageKey = `chat:name:${room}`;
  const colorStorageKey = `chat:color:${room}`;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [quotedMessage, setQuotedMessage] = useState<ChatMessage | null>(null);
  const [ignoreList, setIgnoreListState] = useState<string[]>(getIgnoreList());
  const [showMenu, setShowMenu] = useState(false);
  const [showActiveUsers, setShowActiveUsers] = useState(false);
  const [userActivity, setUserActivity] = useState<Record<string, string>>({});
  const [taggedUser, setTaggedUser] = useState("");

  const [name, setName] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) return stored;
    } catch {}
    return names[Math.floor(Math.random() * names.length)];
  });
  const [tempName, setTempName] = useState(name);
  const [selectedColor, setSelectedColor] = useState(() => {
    try {
      const stored = localStorage.getItem(colorStorageKey);
      if (stored) return stored;
    } catch {}
    return "#ffffff";
  });
  const [editingName, setEditingName] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [registerNickname, setRegisterNickname] = useState(name);
  const [authToken, setAuthToken] = useState("");
  const [authUser, setAuthUser] = useState<RegisteredUser | null>(null);
  const [authPending, setAuthPending] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const { isRecording, setIsRecording, mediaRecorder, setMediaRecorder } =
    useAudioRecording();

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

  const isRegistered = Boolean(authUser);
  const isAdmin = authUser?.role === "admin";
  const canSendText = isRegistered || ENABLE_UNREGISTERED;
  const canUseMedia = isRegistered;
  const composerHelperText = !canSendText
    ? "Login or register to chat."
    : !isRegistered
      ? "Guest mode: text only. Audio, images, and @ai require registration."
      : "@ai, audio, and image sharing are enabled for registered users.";

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, name);
    } catch {}
  }, [name, storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(colorStorageKey, selectedColor);
    } catch {}
  }, [selectedColor, colorStorageKey]);

  useEffect(() => {
    if (!authUser) {
      setRegisterNickname(name);
    }
  }, [authUser, name]);

  useEffect(() => {
    let cancelled = false;
    setAuthLoading(true);

    void apiRequest<MeResponse>("/api/auth/me")
      .then((data) => {
        if (cancelled) return;
        setAuthToken(data.token);
        setAuthUser(data.user);
        setName(data.user.nickname);
        setTempName(data.user.nickname);
        setRegisterNickname(data.user.nickname);
      })
      .catch(() => {
        if (cancelled) return;
        setAuthToken("");
        setAuthUser(null);
      })
      .finally(() => {
        if (!cancelled) {
          setAuthLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const socket = usePartySocket({
    party: "chat",
    room,
    onMessage: (evt) => {
      const message = JSON.parse(evt.data as string) as Message;

      if (message.type === "add" || message.type === "update") {
        const incoming = toChatMessage(message);
        setMessages((prev) => {
          const index = prev.findIndex((entry) => entry.id === incoming.id);
          if (index === -1) {
            return [...prev, incoming];
          }
          const next = prev.slice();
          next[index] = incoming;
          return next;
        });
        setUserActivity((prev) => ({
          ...prev,
          [incoming.user]: incoming.timestamp,
        }));
        return;
      }

      if (message.type === "delete") {
        setMessages((prev) => prev.filter((entry) => entry.id !== message.id));
        return;
      }

      if (message.type === "all") {
        setMessages(message.messages);
        const activity: Record<string, string> = {};
        message.messages.forEach((entry) => {
          activity[entry.user] = entry.timestamp;
        });
        setUserActivity(activity);
        return;
      }

      if (message.type === "banned") {
        if (authUser?.id === message.userId) {
          setAuthToken("");
          setAuthUser(null);
          alert("Your account has been banned.");
        }
        return;
      }

      if (message.type === "unbanned") {
        if (authUser?.id === message.userId) {
          alert(
            "Your account has been unbanned. You can continue using the chat.",
          );
        }
        return;
      }

      if (message.type === "error") {
        alert(message.message);
      }
    },
  });

  const clearSession = () => {
    setAuthToken("");
    setAuthUser(null);
    setAuthError("");
  };

  const sendSocketMessage = (payload: Message) => {
    socket.send(JSON.stringify(payload));
  };

  const handleDeleteMessage = (message: ChatMessage) => {
    sendSocketMessage({
      type: "delete",
      id: message.id,
      authToken: authToken || undefined,
    });
  };

  const handleBanUser = (message: ChatMessage) => {
    if (!message.authorId) return;
    if (!confirm(`Ban ${message.user}?`)) return;
    sendSocketMessage({
      type: "ban",
      targetUserId: message.authorId,
      authToken: authToken || undefined,
    });
  };

  const handleUnbanUser = (message: ChatMessage) => {
    if (!message.authorId) return;
    if (!confirm(`Unban ${message.user}?`)) return;
    sendSocketMessage({
      type: "unban",
      targetUserId: message.authorId,
      authToken: authToken || undefined,
    });
  };

  const canDeleteMessage = (message: ChatMessage) => {
    if (!authUser) return false;
    if (isAdmin) return true;
    return Boolean(message.authorId && message.authorId === authUser.id);
  };

  const canBanUser = (message: ChatMessage) => {
    if (!isAdmin || !authUser) return false;
    if (!message.isRegistered || !message.authorId) return false;
    if (message.authorId === authUser.id) return false;
    if (message.authorRole === "admin") return false;
    return message.role === "user";
  };

  const canUnbanUser = (message: ChatMessage) => {
    if (!isAdmin || !authUser) return false;
    if (!message.isRegistered || !message.authorId) return false;
    if (message.authorId === authUser.id) return false;
    if (message.authorRole === "admin") return false;
    return message.role === "user";
  };

  const handleTagUser = (userName: string) => {
    setTaggedUser(userName);
    inputRef.current?.focus();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!authUser) {
      alert("Register or log in to send images.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      const filename = `${nanoid()}_${file.name}`;
      const imageUrl = await uploadImage(filename, file);
      await cleanupOldMedia("images");

      sendSocketMessage({
        type: "add",
        id: nanoid(8),
        content: imageUrl,
        user: name,
        role: "user",
        timestamp: new Date().toISOString(),
        color: selectedColor,
        messageType: "image",
        taggedUser: taggedUser || undefined,
        authToken,
      });
      setTaggedUser("");
    } catch (error) {
      console.error("Image upload failed:", error);
      alert("Failed to upload image.");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleMicClick = async () => {
    if (!authUser) {
      alert("Register or log in to send audio.");
      return;
    }

    if (isRecording && mediaRecorder) {
      mediaRecorder.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, {
          mimeType: "audio/mp4; codecs=mp4a.40.2",
        });
      } catch {
        recorder = new MediaRecorder(stream);
      }

      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type: mimeType });

        try {
          const format = mimeType.split("/")[1].split(";")[0];
          const filename = `${nanoid()}.${format}`;
          const audioUrl = await uploadAudio(filename, blob);
          await cleanupOldMedia("audio");

          sendSocketMessage({
            type: "add",
            id: nanoid(8),
            content: audioUrl,
            user: name,
            role: "user",
            timestamp: new Date().toISOString(),
            color: selectedColor,
            messageType: "audio",
            taggedUser: taggedUser || undefined,
            authToken,
          });
          setTaggedUser("");
        } catch (error) {
          console.error("Failed to upload audio:", error);
          alert("Failed to upload audio message.");
        }

        stream.getTracks().forEach((track) => track.stop());
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
    } catch (error) {
      console.error(error);
      alert("Microphone permission is required to send voice messages.");
    }
  };

  const handleFormSubmit = (message: ChatMessage) => {
    if (!canSendText) {
      alert("Register or log in to send messages.");
      return;
    }

    if (!authUser) {
      const taggedAI = taggedUser.trim().toLowerCase() === "ai";
      const mentionedAI = /@ai\b/i.test(message.content);
      if (taggedAI || mentionedAI) {
        alert("Register or log in to use @ai.");
        return;
      }
    }

    setTaggedUser("");
    setQuotedMessage(null);

    sendSocketMessage({
      type: "add",
      ...message,
      authToken: authToken || undefined,
    });
  };

  useEffect(() => {
    setIgnoreList(getIgnoreList());
  }, []);

  const filteredMessages = messages.filter(
    (message) => !ignoreList.includes(message.user),
  );

  const handleIgnoreUser = (user: string) => {
    if (!ignoreList.includes(user)) {
      const updated = [...ignoreList, user];
      setIgnoreListState(updated);
      setIgnoreList(updated);
    }
  };

  const handleUnignoreUser = (user: string) => {
    const updated = ignoreList.filter((entry) => entry !== user);
    setIgnoreListState(updated);
    setIgnoreList(updated);
  };

  const handleAuthSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthPending(true);
    setAuthError("");

    try {
      const endpoint =
        authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body =
        authMode === "login"
          ? { email: authEmail, password: authPassword }
          : {
              email: authEmail,
              password: authPassword,
              nickname: registerNickname || name,
            };

      const data = await apiRequest<AuthResponse>(endpoint, {
        method: "POST",
        body,
      });

      setAuthToken(data.token);
      setAuthUser(data.user);
      setName(data.user.nickname);
      setTempName(data.user.nickname);
      setRegisterNickname(data.user.nickname);
      setAuthEmail("");
      setAuthPassword("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Auth failed.");
    } finally {
      setAuthPending(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiRequest("/api/auth/logout", {
        method: "POST",
        token: authToken,
      });
    } catch {}
    clearSession();
  };

  const handleSaveName = async (nextName: string) => {
    if (!authUser) {
      try {
        await apiRequest<NicknameCheckResponse>("/api/nickname/check", {
          method: "POST",
          body: { nickname: nextName },
        });
        setName(nextName);
        setTempName(nextName);
        setRegisterNickname(nextName);
        return true;
      } catch (error) {
        alert(
          error instanceof Error ? error.message : "Username is not available.",
        );
        return false;
      }
    }

    try {
      const data = await apiRequest<MeResponse>("/api/profile", {
        method: "PATCH",
        token: authToken,
        body: { nickname: nextName },
      });
      setAuthUser(data.user);
      setName(data.user.nickname);
      setTempName(data.user.nickname);
      return true;
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "Failed to update profile.",
      );
      return false;
    }
  };

  const profileSubtitle = authUser
    ? `${authUser.role === "admin" ? "Admin" : "Registered"} · ${authUser.email}`
    : ENABLE_UNREGISTERED
      ? "Guest user"
      : "Login required";

  return (
    <>
      <div className="chat">
        <MessageList
          messages={filteredMessages}
          name={name}
          currentUserId={authUser?.id}
          onTagUser={handleTagUser}
          onDeleteMessage={handleDeleteMessage}
          onBanUser={handleBanUser}
          onUnbanUser={handleUnbanUser}
          canDeleteMessage={canDeleteMessage}
          canBanUser={canBanUser}
          canUnbanUser={canUnbanUser}
          isDarkColor={isDarkColor}
          renderContent={renderContent}
          messagesContainerRef={messagesContainerRef}
          messagesEndRef={messagesEndRef}
          onQuoteMessage={setQuotedMessage}
          onLongPressIgnore={handleIgnoreUser}
        />

        <InputForm
          inputRef={inputRef}
          fileInputRef={fileInputRef}
          name={name}
          taggedUser={taggedUser}
          isRecording={isRecording}
          selectedColor={selectedColor}
          canSend={!authLoading && canSendText}
          canUseAudio={!authLoading && canUseMedia}
          canUseImage={!authLoading && canUseMedia}
          helperText={composerHelperText}
          onSubmit={handleFormSubmit}
          onClearTag={() => setTaggedUser("")}
          onMicClick={handleMicClick}
          onImageUpload={handleImageUpload}
          quotedMessage={quotedMessage}
          onClearQuote={() => setQuotedMessage(null)}
        />

        <button
          className="app-menu-button"
          onClick={() => setShowMenu((value) => !value)}
          title="Open menu"
        >
          <span className="mdi mdi-menu"></span>
        </button>

        {showMenu && (
          <div className="app-menu-popup">
            <div className="app-menu-header">
              <h4>Menu</h4>
              <button
                className="close-button"
                onClick={() => setShowMenu(false)}
              >
                x
              </button>
            </div>
            <div className="app-menu-body">
              <div className="menu-section">
                <div className="menu-section-title">Your details</div>
                <div className="profile-card">
                  <div
                    className="profile-avatar"
                    style={{
                      backgroundColor: selectedColor,
                      color: isDarkColor(selectedColor) ? "#f5f5f5" : "#111111",
                    }}
                  >
                    {name.trim().charAt(0).toUpperCase() || "?"}
                  </div>
                  <div className="profile-meta">
                    <div className="profile-name">{name}</div>
                    <div className="profile-subtitle">{profileSubtitle}</div>
                  </div>
                  <div className="profile-color-pill">{selectedColor}</div>
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
                  onSaveName={handleSaveName}
                  onSetSelectedColor={setSelectedColor}
                  onSetShowColorPicker={setShowColorPicker}
                />
              </div>

              <div className="menu-section">
                <div className="menu-section-row">
                  <div className="menu-section-title">Account</div>
                  {authUser && (
                    <span className="menu-count-badge">
                      {authUser.role === "admin" ? "Admin" : "Member"}
                    </span>
                  )}
                </div>

                {authUser ? (
                  <div className="auth-card">
                    <div className="auth-detail-row">
                      <span>Email</span>
                      <strong>{authUser.email}</strong>
                    </div>
                    <div className="auth-detail-row">
                      <span>Status</span>
                      <strong>
                        {authUser.role === "admin"
                          ? "Administrator"
                          : "Registered"}
                      </strong>
                    </div>
                    <button
                      className="menu-action-button"
                      onClick={handleLogout}
                    >
                      Log out
                    </button>
                  </div>
                ) : (
                  <div className="auth-card">
                    <div className="auth-mode-row">
                      <button
                        className={`menu-action-button ${authMode === "login" ? "primary" : ""}`}
                        onClick={() => setAuthMode("login")}
                        type="button"
                      >
                        Login
                      </button>
                      <button
                        className={`menu-action-button ${authMode === "register" ? "primary" : ""}`}
                        onClick={() => setAuthMode("register")}
                        type="button"
                      >
                        Register
                      </button>
                    </div>
                    <form className="auth-form" onSubmit={handleAuthSubmit}>
                      {authMode === "register" && (
                        <input
                          className="my-input-text"
                          value={registerNickname}
                          onChange={(event) =>
                            setRegisterNickname(event.currentTarget.value)
                          }
                          placeholder="Nickname"
                          autoComplete="nickname"
                        />
                      )}
                      <input
                        className="my-input-text"
                        type="email"
                        value={authEmail}
                        onChange={(event) =>
                          setAuthEmail(event.currentTarget.value)
                        }
                        placeholder="Email"
                        autoComplete="email"
                      />
                      <input
                        className="my-input-text"
                        type="password"
                        value={authPassword}
                        onChange={(event) =>
                          setAuthPassword(event.currentTarget.value)
                        }
                        placeholder="Password"
                        autoComplete={
                          authMode === "login"
                            ? "current-password"
                            : "new-password"
                        }
                      />
                      {authError && (
                        <div className="auth-error">{authError}</div>
                      )}
                      <button
                        className="menu-action-button primary"
                        type="submit"
                        disabled={authPending}
                      >
                        {authPending
                          ? "Working..."
                          : authMode === "login"
                            ? "Login"
                            : "Create account"}
                      </button>
                    </form>
                  </div>
                )}
              </div>

              <div className="menu-section">
                <div className="menu-section-row">
                  <div className="menu-section-title">Ignored users</div>
                  <span className="menu-count-badge">{ignoreList.length}</span>
                </div>
                <div className="ignore-list-users">
                  {ignoreList.length === 0 && (
                    <div className="menu-empty-state">No ignored users.</div>
                  )}
                  {ignoreList.map((user) => (
                    <div key={user} className="ignore-user-row">
                      <span>{user}</span>
                      <button
                        className="unignore-btn"
                        onClick={() => handleUnignoreUser(user)}
                      >
                        Unignore
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <ActiveUsers
        showActiveUsers={showActiveUsers}
        onSetShowActiveUsers={setShowActiveUsers}
        activeUsers={getActiveUsers(userActivity)}
      />
    </>
  );
}

function CatchAll() {
  const location = useLocation();
  if (location.pathname === "/deleteOld") {
    return null;
  }
  return <Navigate to="/9FexDdTqo9kdtdgg0WukK" />;
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Navigate to="/9FexDdTqo9kdtdgg0WukK" />} />
      <Route path="/9FexDdTqo9kdtdgg0WukK" element={<App />} />
      <Route path="*" element={<CatchAll />} />
    </Routes>
  </BrowserRouter>,
);
