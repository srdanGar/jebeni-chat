import React from "react";
import { nanoid } from "nanoid";
import type { ChatMessage, Message } from "../shared";

interface InputFormProps {
  inputRef: React.RefObject<HTMLInputElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  name: string;
  taggedUser: string;
  isRecording: boolean;
  selectedColor: string;
  onSubmit: (message: ChatMessage) => void;
  onClearTag: () => void;
  onMicClick: () => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const InputForm: React.FC<InputFormProps> = ({
  inputRef,
  fileInputRef,
  name,
  taggedUser,
  isRecording,
  selectedColor,
  onSubmit,
  onClearTag,
  onMicClick,
  onImageUpload,
}) => {
  return (
    <form
      className="form-row"
      onSubmit={(e) => {
        e.preventDefault();
        const content = inputRef.current;
        if (!content || content.value.trim() === "") return;

        const message: ChatMessage = {
          id: nanoid(8),
          content: content.value,
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
      <input
        ref={inputRef}
        type="text"
        className="input-field"
        placeholder={`Hello ${name}! Type a message...`}
        autoComplete="off"
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
      <button type="submit" className="send-message">
        Send
      </button>

      <button
        type="button"
        onClick={onMicClick}
        className="mic-button"
        title={isRecording ? "Stop recording" : "Record voice message"}
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
    </form>
  );
};
