import {
  type Connection,
  Server,
  type WSMessage,
  routePartykitRequest,
} from "partyserver";
import type { ChatMessage, Message } from "../shared";

// Helper: Call Cloudflare Workers AI
async function fetchAIResponse(
  accountId: string,
  prompt: string,
  env: any,
): Promise<string> {
  // You may want to use a secret for the API token
  const apiToken = "cfut_IErGCy6EfoBqQPx8auOnXoZKlBcAlOGhJ1JlUShC2618808f";
  if (!apiToken) throw new Error("Missing Cloudflare API token in env");
  const model = "@cf/meta/llama-2-7b-chat-int8";
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  const body = JSON.stringify({
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant in a group chat.",
      },
      { role: "user", content: prompt },
    ],
  });
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body,
  });
  if (!resp.ok) throw new Error("AI API error: " + resp.status);
  const data = await resp.json();
  // Cloudflare AI returns { result: { response: string } }
  return data.result?.response || "(no response)";
}

const esc = (s: string) => s.replace(/'/g, "''");

export class Chat extends Server<Env> {
  static options = { hibernate: true };
  messages: ChatMessage[] = [];

  async onStart() {
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        user TEXT,
        role TEXT,
        content TEXT,
        timestamp TEXT,
        color TEXT,
        messageType TEXT DEFAULT 'text',
        taggedUser TEXT
      )`,
    );

    try {
      this.ctx.storage.sql.exec(
        `ALTER TABLE messages ADD COLUMN timestamp TEXT`,
      );
    } catch {}
    try {
      this.ctx.storage.sql.exec(`ALTER TABLE messages ADD COLUMN color TEXT`);
    } catch {}
    try {
      this.ctx.storage.sql.exec(
        `ALTER TABLE messages ADD COLUMN messageType TEXT DEFAULT 'text'`,
      );
    } catch {}
    try {
      this.ctx.storage.sql.exec(
        `ALTER TABLE messages ADD COLUMN taggedUser TEXT`,
      );
    } catch {}

    this.messages = this.ctx.storage.sql
      .exec(
        `SELECT id, user, role, content, timestamp, color, messageType, taggedUser
         FROM messages ORDER BY timestamp ASC`,
      )
      .toArray() as ChatMessage[];
  }

  onConnect(connection: Connection) {
    connection.send(JSON.stringify({ type: "all", messages: this.messages }));
  }

  saveMessage(message: ChatMessage & { messageType?: string }) {
    const i = this.messages.findIndex((m) => m.id === message.id);
    if (i >= 0) this.messages[i] = message;
    else this.messages.push(message);

    const messageType = message.messageType || "text";
    const taggedUser = message.taggedUser || "";

    this.ctx.storage.sql.exec(
      `INSERT INTO messages (id,user,role,content,timestamp,color,messageType,taggedUser)
       VALUES (
        '${esc(message.id)}',
        '${esc(message.user)}',
        '${esc(message.role)}',
        '${esc(message.content)}',
        '${esc(message.timestamp)}',
        '${esc(message.color || "")}',
        '${messageType}',
        '${esc(taggedUser)}'
       )
       ON CONFLICT(id) DO UPDATE SET
        content='${esc(message.content)}',
        timestamp='${esc(message.timestamp)}',
        color='${esc(message.color || "")}',
        messageType='${messageType}',
        taggedUser='${esc(taggedUser)}'`,
    );
  }

  deleteMessage(messageId: string) {
    this.messages = this.messages.filter((m) => m.id !== messageId);
    this.ctx.storage.sql.exec(
      `DELETE FROM messages WHERE id = '${esc(messageId)}'`,
    );
  }

  async onMessage(_: Connection, message: WSMessage) {
    const parsed = JSON.parse(message as string) as Message;

    if (parsed.type === "delete") {
      const msg = this.messages.find((m) => m.id === parsed.id);
      if (msg) {
        this.deleteMessage(parsed.id);
        this.broadcast(message);
      }
      return;
    }

    let aiTriggered = false;
    let aiPrompt = "";
    if (
      (parsed.type === "add" || parsed.type === "update") &&
      typeof parsed.content === "string"
    ) {
      // Detect @ai or @AI (case-insensitive, word-boundary)
      const aiMatch = parsed.content.match(/@ai\b/gi);
      if (aiMatch) {
        aiTriggered = true;
        // Remove all @ai (case-insensitive, word-boundary) from prompt for clarity
        aiPrompt = parsed.content.replace(/@ai\b/gi, "").trim();
      }
    }

    if (parsed.type === "add" || parsed.type === "update") {
      let messageType: "text" | "audio" | "image" = "text";

      if (
        parsed.content.startsWith("http://") ||
        parsed.content.startsWith("https://")
      ) {
        if (
          parsed.content.includes("/audio/") ||
          parsed.content.includes("audio")
        ) {
          messageType = "audio";
        } else if (
          parsed.content.includes("/images/") ||
          parsed.content.includes("image")
        ) {
          messageType = "image";
        }
      }

      const chatMessage: ChatMessage & { messageType: string } = {
        id: parsed.id,
        user: parsed.user,
        role: parsed.role,
        content: parsed.content,
        timestamp: parsed.timestamp,
        color: parsed.color,
        messageType,
        taggedUser: parsed.taggedUser || "",
      };

      this.saveMessage(chatMessage);
    }

    this.broadcast(message);

    // If @ai was tagged, call Cloudflare Workers AI and broadcast bot response
    if (aiTriggered && aiPrompt) {
      try {
        const aiText = await fetchAIResponse(
          "272fc77dbd61d67eb55d76b3e2bdbfde",
          aiPrompt,
          this.ctx.env,
        );
        const botMessage: ChatMessage = {
          id: "ai-" + Date.now() + Math.floor(Math.random() * 10000),
          content: aiText,
          user: "AI",
          role: "assistant",
          timestamp: new Date().toISOString(),
          color: "#4caf50",
          messageType: "text",
        };
        this.saveMessage(botMessage);
        this.broadcast(
          JSON.stringify({
            type: "add",
            ...botMessage,
          }),
        );
      } catch (err) {
        console.error("AI error:", err);
      }
    }
  }

  async onFetch(request: Request) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/audio/")) {
      const audioId = url.pathname.slice(7).split(".")[0];
      const audioData = await this.ctx.storage.get(`audio:${audioId}`);

      if (!audioData || typeof audioData !== "string") {
        return new Response("Not found", { status: 404 });
      }

      try {
        const commaIndex = audioData.indexOf(",");
        if (commaIndex === -1) throw new Error("Invalid data URL");

        const contentType = audioData.slice(5, commaIndex).split(";")[0];
        const base64 = audioData.slice(commaIndex + 1);

        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

        return new Response(bytes.buffer, {
          headers: {
            "Content-Type": contentType,
            "Content-Length": bytes.length.toString(),
            "Accept-Ranges": "bytes",
          },
        });
      } catch (err) {
        console.error("Audio decode error:", err);
        return new Response("Invalid audio data", { status: 500 });
      }
    }

    return new Response("Not found", { status: 404 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/audio/")) {
      return (await routePartykitRequest(request, { ...env })) as any;
    }

    let response =
      (await routePartykitRequest(request, { ...env })) ||
      (await env.ASSETS.fetch(request));

    if (url.pathname === "/" || url.pathname === "/index.html") {
      // Inject runtime env into HTML so client code can read SUPABASE_* values
      try {
        const text = await response.text();
        const envScript = `<script>window.ENV = { SUPABASE_URL: ${JSON.stringify(
          env.SUPABASE_URL || "",
        )}, SUPABASE_ANON_KEY: ${JSON.stringify(env.SUPABASE_ANON_KEY || "")} };</script>`;

        let newText = text;
        if (newText.includes("</head>")) {
          newText = newText.replace("</head>", envScript + "</head>");
        } else if (newText.includes("</body>")) {
          newText = newText.replace("</body>", envScript + "</body>");
        } else {
          newText = envScript + newText;
        }

        const headers = new Headers(response.headers);
        headers.set("Permissions-Policy", "microphone=(self)");
        headers.set("Content-Type", "text/html; charset=utf-8");

        response = new Response(newText, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      } catch (err) {
        // If we couldn't read/modify the body for some reason, fall back to original response
        const headers = new Headers(response.headers);
        headers.set("Permissions-Policy", "microphone=(self)");
        response = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
    }

    return response;
  },
} satisfies ExportedHandler<Env>;
