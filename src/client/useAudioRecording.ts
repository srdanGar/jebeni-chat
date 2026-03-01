import { useState, useRef, useEffect } from "react";

export const useAudioRecording = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(
    null,
  );
  const [micPermission, setMicPermission] = useState<
    "granted" | "denied" | "prompt" | "unknown"
  >("unknown");

  useEffect(() => {
    // Check microphone permission status
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((result) => {
          setMicPermission(result.state);
          result.addEventListener("change", () => {
            setMicPermission(result.state);
          });
        })
        .catch(() => {
          navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then((stream) => {
              setMicPermission("granted");
              stream.getTracks().forEach((track) => track.stop());
            })
            .catch(() => {
              setMicPermission("denied");
            });
        });
    }
  }, []);

  return {
    isRecording,
    setIsRecording,
    mediaRecorder,
    setMediaRecorder,
    micPermission,
    setMicPermission,
  };
};
