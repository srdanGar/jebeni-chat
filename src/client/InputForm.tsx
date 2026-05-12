import React from "react";
import { nanoid } from "nanoid";
import type { ChatMessage } from "../shared";

interface InputFormProps {
  inputRef: React.RefObject<HTMLInputElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  name: string;
  taggedUser: string;
  isRecording: boolean;
  selectedColor: string;
  canSend: boolean;
  canUseAudio: boolean;
  canUseImage: boolean;
  helperText?: string;
  onSubmit: (message: ChatMessage) => void;
  onClearTag: () => void;
  onMicClick: () => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  quotedMessage: ChatMessage | null;
  onClearQuote: () => void;
}

export const InputForm: React.FC<InputFormProps> = ({
  inputRef,
  fileInputRef,
  name,
  taggedUser,
  isRecording,
  selectedColor,
  canSend,
  canUseAudio,
  canUseImage,
  helperText,
  onSubmit,
  onClearTag,
  onMicClick,
  onImageUpload,
  quotedMessage,
  onClearQuote,
}) => {
  return (
    <form
      className="form-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSend) return;
        const content = inputRef.current;
        if (!content || content.value.trim() === "") return;

        let fullContent = content.value;
        if (quotedMessage) {
          // Use a delimiter unlikely to appear in normal text
          fullContent = `::quote::${quotedMessage.content}::endquote::\n${content.value}`;
        }
        const message: ChatMessage = {
          id: nanoid(8),
          content: fullContent,
          user: name,
          role: "user",
          timestamp: new Date().toISOString(),
          color: selectedColor,
          taggedUser: taggedUser || undefined,
        };

        onSubmit(message);
        content.value = "";
        content.focus();
      }}
    >
      {quotedMessage && (
        <div className="quote-balloon">
          <span className="quote-content">
            {quotedMessage.content.length > 60
              ? quotedMessage.content.slice(0, 60) + "…"
              : quotedMessage.content}
          </span>
          <button
            type="button"
            className="clear-quote-button"
            onClick={onClearQuote}
            title="Discard quote"
          >
            ×
          </button>
        </div>
      )}
      <div className="input-row">
        <input
          ref={inputRef}
          type="text"
          className="input-field"
          placeholder={`Hello ${name}! Type a message...`}
          autoComplete="off"
          disabled={!canSend}
          style={{
            paddingLeft: taggedUser ? "80px" : "10px",
          }}
        />
        {taggedUser && (
          <span className="tag-input-badge">
            @{taggedUser}
            <button
              type="button"
              className="clear-tag-button"
              onClick={onClearTag}
            >
              ×
            </button>
          </span>
        )}
        <button type="submit" className="send-message" disabled={!canSend}>
          Send
        </button>
      </div>
      {helperText && <div className="input-helper-text">{helperText}</div>}
      <div className="button-row">
        <button
          type="button"
          onClick={onMicClick}
          className="mic-button"
          title={isRecording ? "Stop recording" : "Record voice message"}
          disabled={!canUseAudio}
          style={{
            backgroundColor: isRecording ? "red" : undefined,
          }}
        >
          {isRecording ? "⏹️" : "🎤"}
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="image-button"
          title="Upload image"
          disabled={!canUseImage}
        >
          ➕
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onImageUpload}
          style={{ display: "none" }}
        />
      </div>
    </form>
  );
};
