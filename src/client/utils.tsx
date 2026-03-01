import React from "react";
import type { ChatMessage } from "../shared";

export const renderContent = (
  content: string,
  messageType?: string,
): React.ReactNode => {
  const vocarooMatch = content.match(/https:\/\/vocaroo\.com\/([a-zA-Z0-9]+)/);
  if (vocarooMatch) {
    return (
      <iframe
        src={`https://vocaroo.com/embed/${vocarooMatch[1]}`}
        width="300"
        height="60"
        frameBorder="0"
        title="Vocaroo Audio"
      ></iframe>
    );
  }
  if (
    messageType === "audio" ||
    (content.startsWith("https://") && content.includes("/audio/"))
  ) {
    return <audio controls src={content} style={{ maxWidth: "300px" }} />;
  }
  if (messageType === "image" || content.includes("/images/")) {
    return (
      <img
        src={content}
        alt="Shared image"
        style={{
          maxWidth: "300px",
          maxHeight: "300px",
          borderRadius: "5px",
        }}
      />
    );
  }

  return content;
};

export const isDarkColor = (color: string): boolean => {
  return color === "#000000" || color === "#0000ff" || color === "#000080";
};

export const getTextShadow = (color: string): string => {
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5 ? "1px 1px 2px rgba(128, 128, 128, 0.7)" : "none";
};

export const getActiveUsers = (
  userActivity: Record<string, string>,
): Array<{ user: string; timestamp: string }> => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  return Object.entries(userActivity)
    .filter(([_, timestamp]) => timestamp >= oneHourAgo)
    .map(([user, timestamp]) => ({ user, timestamp }))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
};
