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
  onSetName: (name: string) => void;
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
  onSetName,
  onSetSelectedColor,
  onSetShowColorPicker,
}) => {
  return (
    <div className="nickname-edit">
      {editingName ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const newName = tempName.trim();
            if (newName.length > 0) onSetName(newName);
            onSetEditingName(false);
          }}
        >
          <input
            value={tempName}
            onChange={(e) => onSetTempName(e.currentTarget.value)}
            className="my-input-text"
            autoComplete="off"
          />
          <button type="submit">Save</button>
          <button
            type="button"
            onClick={() => {
              onSetEditingName(false);
              onSetTempName(name);
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <>
          <button
            onClick={() => {
              onSetTempName(name);
              onSetEditingName(true);
            }}
          >
            Edit Nickname
          </button>
          <button
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
        </>
      )}
    </div>
  );
};
