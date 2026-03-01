import React from "react";

interface ActiveUsersProps {
  showActiveUsers: boolean;
  onSetShowActiveUsers: (show: boolean) => void;
  activeUsers: Array<{ user: string; timestamp: string }>;
}

export const ActiveUsers: React.FC<ActiveUsersProps> = ({
  showActiveUsers,
  onSetShowActiveUsers,
  activeUsers,
}) => {
  return (
    <>
      <button
        onClick={() => onSetShowActiveUsers(!showActiveUsers)}
        className="active-users-button"
        title="Show active users"
      >
        <span className="mdi mdi-account-group"></span>
      </button>

      {showActiveUsers && (
        <div className="active-users-popup">
          <div className="active-users-header">
            <h4>Active Users (last hour)</h4>
            <button
              onClick={() => onSetShowActiveUsers(false)}
              className="close-button"
            >
              ×
            </button>
          </div>
          <div className="users-list">
            {activeUsers.map(({ user, timestamp }) => (
              <div key={user} className="user-row">
                <span className="user-nick">{user}</span>
                <span className="user-last-seen">
                  {new Date(timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
