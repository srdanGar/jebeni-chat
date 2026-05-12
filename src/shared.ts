export type ChatParticipantRole = "guest" | "member" | "admin";

export type RegisteredUser = {
  id: string;
  email: string;
  nickname: string;
  role: "member" | "admin";
  bannedAt?: string | null;
};

export type ChatMessage = {
  id: string;
  content: string;
  user: string;
  role: "user" | "assistant";
  timestamp: string;
  color?: string;
  messageType?: "text" | "audio" | "image";
  taggedUser?: string;
  authorId?: string;
  authorRole?: ChatParticipantRole;
  isRegistered?: boolean;
};

type MessageWithAuth = {
  authToken?: string;
};

export type Message =
  | ({
      type: "add";
      id: string;
      content: string;
      user: string;
      role: "user" | "assistant";
      timestamp: string;
      color?: string;
      messageType?: "text" | "audio" | "image";
      taggedUser?: string;
      authorId?: string;
      authorRole?: ChatParticipantRole;
      isRegistered?: boolean;
    } & MessageWithAuth)
  | ({
      type: "update";
      id: string;
      content: string;
      user: string;
      role: "user" | "assistant";
      timestamp: string;
      color?: string;
      messageType?: "text" | "audio" | "image";
      taggedUser?: string;
      authorId?: string;
      authorRole?: ChatParticipantRole;
      isRegistered?: boolean;
    } & MessageWithAuth)
  | ({
      type: "delete";
      id: string;
    } & MessageWithAuth)
  | ({
      type: "ban";
      targetUserId: string;
    } & MessageWithAuth)
  | {
      type: "all";
      messages: ChatMessage[];
    }
  | {
      type: "error";
      code: string;
      message: string;
    }
  | {
      type: "banned";
      userId: string;
    };

export const names = [
  "Alice",
  "Bob",
  "Charlie",
  "David",
  "Eve",
  "Frank",
  "Grace",
  "Heidi",
  "Ivan",
  "Judy",
  "Kevin",
  "Linda",
  "Mallory",
  "Nancy",
  "Oscar",
  "Peggy",
  "Quentin",
  "Randy",
  "Steve",
  "Trent",
  "Ursula",
  "Victor",
  "Walter",
  "Xavier",
  "Yvonne",
  "Zoe",
];
