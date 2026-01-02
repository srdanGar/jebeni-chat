import {
  type Connection,
  Server,
  type WSMessage,
  routePartykitRequest,
} from "partyserver";

import type { ChatMessage, Message } from "../shared";

export class Chat extends Server<Env> {
  static options = { hibernate: true };

  messages = [] as ChatMessage[];

  broadcastMessage(message: Message, exclude?: string[]) {
    this.broadcast(JSON.stringify(message), exclude);
  }

  onStart() {
    // this is where you can initialize things that need to be done before the server starts
    // for example, load previous messages from a database or a service

    // create the messages table if it doesn't exist
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, user TEXT, role TEXT, content TEXT, timestamp TEXT, color TEXT)`
    );

    // add timestamp column if it doesn't exist (for schema evolution)
    try {
      this.ctx.storage.sql.exec(
        `ALTER TABLE messages ADD COLUMN timestamp TEXT`
      );
    } catch (e) {
      // column might already exist
    }

    // add color column if it doesn't exist
    try {
      this.ctx.storage.sql.exec(`ALTER TABLE messages ADD COLUMN color TEXT`);
    } catch (e) {
      // column might already exist
    }

    // load the messages from the database
    this.messages = this.ctx.storage.sql
      .exec(
        `SELECT id, user, role, content, COALESCE(timestamp, '${new Date().toISOString()}') as timestamp, color FROM messages`
      )
      .toArray() as ChatMessage[];
  }

  onConnect(connection: Connection) {
    connection.send(
      JSON.stringify({
        type: "all",
        messages: this.messages,
      } satisfies Message)
    );
  }

  saveMessage(message: ChatMessage) {
    // check if the message already exists
    const existingMessage = this.messages.find((m) => m.id === message.id);
    if (existingMessage) {
      this.messages = this.messages.map((m) => {
        if (m.id === message.id) {
          return message;
        }
        return m;
      });
    } else {
      this.messages.push(message);
    }

    this.ctx.storage.sql.exec(
      `INSERT INTO messages (id, user, role, content, timestamp, color) VALUES ('${
        message.id
      }', '${message.user}', '${message.role}', ${JSON.stringify(
        message.content
      )}, '${message.timestamp}', '${
        message.color || ""
      }') ON CONFLICT (id) DO UPDATE SET content = ${JSON.stringify(
        message.content
      )}, timestamp = '${message.timestamp}', color = '${message.color || ""}'`
    );
  }

  onMessage(connection: Connection, message: WSMessage) {
    // let's broadcast the raw message to everyone else
    this.broadcast(message);

    // let's update our local messages store
    const parsed = JSON.parse(message as string) as Message;
    if (parsed.type === "add" || parsed.type === "update") {
      this.saveMessage(parsed);
    }
  }
}

export default {
  async fetch(request, env) {
    return (
      (await routePartykitRequest(request, { ...env })) ||
      env.ASSETS.fetch(request)
    );
  },
} satisfies ExportedHandler<Env>;
