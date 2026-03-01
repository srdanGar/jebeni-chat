import { createClient } from "@supabase/supabase-js";

// TypeScript: declare window.ENV globally
declare global {
  interface Window {
    ENV?: {
      SUPABASE_URL?: string;
      SUPABASE_ANON_KEY?: string;
      SUPABASE_KEY?: string;
    };
  }
}

// Get these from your Supabase project settings (Project Settings > API)
// SUPABASE_URL: Copy the URL from the project settings
// SUPABASE_ANON_KEY: Copy the anon public key (starts with "eyJ...")
// Prefer build-time `import.meta.env`, then check runtime-injected `window.ENV` (Worker injects when serving index.html),
// then legacy `globalThis.__ENV` (older code), then VITE_* fallbacks.

const isBrowser =
  typeof window !== "undefined" && typeof window.ENV !== "undefined";

let supabaseUrl: string;
let supabaseKey: string;

if (isBrowser) {
  supabaseUrl = window.ENV!.SUPABASE_URL!;
  supabaseKey = window.ENV!.SUPABASE_ANON_KEY || window.ENV!.SUPABASE_KEY!;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase config missing: window.ENV.SUPABASE_URL or window.ENV.SUPABASE_ANON_KEY is not set.",
    );
  }
} else {
  const globalEnv = (globalThis as any).__ENV || {};
  supabaseUrl =
    globalEnv.SUPABASE_URL ||
    globalEnv.VITE_SUPABASE_URL ||
    "https://ogyilwjxojwfngzocvpg.supabase.co";
  supabaseKey =
    globalEnv.SUPABASE_ANON_KEY ||
    globalEnv.VITE_SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9neWlsd2p4b2p3Zm5nem9jdnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNzYwNjYsImV4cCI6MjA4Njc1MjA2Nn0.o--8Ht8ompWeQ8eHbbY2Wv4dkHOUvPVZmpD8QlwHynw";
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export const createAdminClient = (serviceRoleKey?: string) => {
  const key =
    serviceRoleKey ||
    (globalThis as any).__ENV?.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  if (!key) {
    console.warn("SUPABASE_SERVICE_ROLE_KEY not provided for admin client.");
  }
  return createClient(supabaseUrl, key);
};

export const uploadAudio = async (
  filename: string,
  blob: Blob,
): Promise<string> => {
  if (!supabaseKey) {
    throw new Error(
      "Supabase not configured. Set SUPABASE_ANON_KEY environment variable or inject it via the Worker.",
    );
  }

  const arrayBuffer = await blob.arrayBuffer();
  const filepath = `audio/${filename}`;

  try {
    const { data, error } = await supabase.storage
      .from("chat")
      .upload(filepath, arrayBuffer, {
        contentType: blob.type,
        upsert: false,
      });

    if (error) {
      console.error("Supabase upload error:", error);
      throw new Error(`Upload error: ${error.message}`);
    }

    const { data: publicData } = supabase.storage
      .from("chat")
      .getPublicUrl(filepath);

    return publicData.publicUrl;
  } catch (err) {
    console.error("Audio upload failed:", err);
    throw err;
  }
};

export const uploadImage = async (
  filename: string,
  blob: Blob,
): Promise<string> => {
  if (!supabaseKey) {
    throw new Error(
      "Supabase not configured. Set SUPABASE_ANON_KEY environment variable or inject it via the Worker.",
    );
  }

  const arrayBuffer = await blob.arrayBuffer();
  const filepath = `images/${filename}`;

  try {
    const { data, error } = await supabase.storage
      .from("chat")
      .upload(filepath, arrayBuffer, {
        contentType: blob.type,
        upsert: false,
      });

    if (error) {
      console.error("Supabase upload error:", error);
      throw new Error(`Upload error: ${error.message}`);
    }

    const { data: publicData } = supabase.storage
      .from("chat")
      .getPublicUrl(filepath);

    return publicData.publicUrl;
  } catch (err) {
    console.error("Image upload failed:", err);
    throw err;
  }
};

export const cleanupOldMedia = async (type: "audio" | "images") => {
  try {
    const { data: files, error: listError } = await supabase.storage
      .from("chat")
      .list(type);

    if (listError) {
      console.error(`Error listing ${type}:`, listError);
      return;
    }

    if (!files || files.length <= 50) {
      return; // Only keep last 50, so if <= 50 we're good
    }

    // Sort by created_at, oldest first
    const sortedFiles = (files as any[]).sort(
      (a: any, b: any) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    // Delete oldest files beyond the 50 limit
    const filesToDelete = sortedFiles.slice(0, files.length - 50);

    if (filesToDelete.length > 0) {
      const { error: deleteError } = await supabase.storage
        .from("chat")
        .remove(filesToDelete.map((f: any) => `${type}/${f.name}`));

      if (deleteError) {
        console.error(`Error deleting old ${type}:`, deleteError);
      }
    }
  } catch (err) {
    console.error(`Cleanup error for ${type}:`, err);
  }
};
