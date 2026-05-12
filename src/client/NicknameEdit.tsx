import React from "react";

interface NicknameEditProps {
  editingName: boolean;
  tempName: string;
  name: string;
  selectedColor: string;
  showColorPicker: boolean;
  colors: string[];
  onSetEditingName: (editing: boolean) => void;
  onSetTempName: (name: string) => void;
  onSaveName: (name: string) => boolean | Promise<boolean>;
  onSetSelectedColor: (color: string) => void;
  onSetShowColorPicker: (show: boolean) => void;
}

export const NicknameEdit: React.FC<NicknameEditProps> = ({
  editingName,
  tempName,
  name,
  selectedColor,
  showColorPicker,
  colors,
  onSetEditingName,
  onSetTempName,
  onSaveName,
  onSetSelectedColor,
  onSetShowColorPicker,
}) => {
  return (
    <div className="nickname-edit">
      <div className="menu-section-title">Profile settings</div>
      {editingName ? (
        <form
          className="nickname-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const newName = tempName.trim();
            if (newName.length === 0) return;
            const saved = await onSaveName(newName);
            if (saved) {
              onSetEditingName(false);
            }
          }}
        >
          <input
            value={tempName}
            onChange={(e) => onSetTempName(e.currentTarget.value)}
            className="my-input-text"
            autoComplete="off"
            placeholder="Your nickname"
          />
          <div className="nickname-actions">
            <button type="submit" className="menu-action-button primary">
              Save
            </button>
            <button
              type="button"
              className="menu-action-button"
              onClick={() => {
                onSetEditingName(false);
                onSetTempName(name);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="nickname-controls">
          <button
            className="menu-action-button"
            onClick={() => {
              onSetTempName(name);
              onSetEditingName(true);
            }}
          >
            Edit Nickname
          </button>
          <button
            className="menu-action-button color-toggle-button"
            onClick={() => onSetShowColorPicker(!showColorPicker)}
            style={{
              backgroundColor: selectedColor,
              color: selectedColor === "#ffffff" ? "black" : "white",
            }}
          >
            Choose Color
          </button>
          {showColorPicker && (
            <div className="color-picker">
              {colors.map((color) => (
                <div
                  key={color}
                  className="color-swatch"
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    onSetSelectedColor(color);
                    onSetShowColorPicker(false);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
