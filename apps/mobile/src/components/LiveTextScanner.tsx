import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import {
  Camera,
  runAsync,
  runAtTargetFps,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor
} from "react-native-vision-camera";
import { useTextRecognition } from "react-native-vision-camera-mlkit";
import { useRunOnJS } from "react-native-worklets-core";

function extractStudentIdCandidate(text: string) {
  const candidates = new Set<string>();
  const normalizedGroups = text.replace(/[^\d]/g, " ").split(/\s+/).filter(Boolean);

  for (const group of normalizedGroups) {
    if (group.length >= 6 && group.length <= 10) {
      candidates.add(group);
    }
  }

  const collapsedDigits = text.replace(/\D/g, "");
  if (collapsedDigits.length >= 6 && collapsedDigits.length <= 10) {
    candidates.add(collapsedDigits);
  }

  const preferred = Array.from(candidates).sort((left, right) => {
    const leftScore = left.length === 7 ? 0 : Math.abs(left.length - 7) + 1;
    const rightScore = right.length === 7 ? 0 : Math.abs(right.length - 7) + 1;
    return leftScore - rightScore;
  });

  return preferred[0] || null;
}

export function LiveTextScanner({
  onCancel,
  onDetected,
  enabled,
  resetSignal
}: {
  onCancel: () => void;
  onDetected: (studentId: string) => void;
  enabled: boolean;
  resetSignal: number;
}) {
  const device = useCameraDevice("back");
  const { hasPermission, requestPermission } = useCameraPermission();
  const { textRecognition } = useTextRecognition({
    language: "LATIN",
    scaleFactor: 1
  });
  const [previewText, setPreviewText] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const lastCandidateRef = useRef<{ value: string; count: number; seenAt: number } | null>(
    null
  );
  const lockedRef = useRef(false);

  useEffect(() => {
    if (!hasPermission) {
      requestPermission().catch(() => undefined);
    }
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    lockedRef.current = false;
    lastCandidateRef.current = null;
    setPreviewText("");
  }, [resetSignal]);

  const handleRecognizedText = useRunOnJS((text: string) => {
    if (!enabled || lockedRef.current) {
      return;
    }

    const candidate = extractStudentIdCandidate(text);
    setPreviewText(candidate || "");

    if (!candidate) {
      lastCandidateRef.current = null;
      return;
    }

    const now = Date.now();
    if (
      lastCandidateRef.current?.value === candidate &&
      now - lastCandidateRef.current.seenAt < 1800
    ) {
      lastCandidateRef.current = {
        value: candidate,
        count: lastCandidateRef.current.count + 1,
        seenAt: now
      };
    } else {
      lastCandidateRef.current = {
        value: candidate,
        count: 1,
        seenAt: now
      };
    }

    if ((lastCandidateRef.current?.count || 0) >= 2) {
      lockedRef.current = true;
      onDetected(candidate);
    }
  }, [onDetected]);

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";

      runAtTargetFps(6, () => {
        "worklet";

        runAsync(frame, () => {
          "worklet";
          if (!enabled) {
            return;
          }
          const result = textRecognition(frame, { outputOrientation: "portrait" });
          if (result.text) {
            handleRecognizedText(result.text);
          }
        });
      });
    },
    [enabled, handleRecognizedText, textRecognition]
  );

  if (!hasPermission) {
    return (
      <View style={styles.overlay}>
      <View style={styles.panel}>
          <ActivityIndicator color="#e60028" />
          <Text style={styles.panelTitle}>Requesting camera permission...</Text>
          <Pressable style={styles.secondaryButton} onPress={onCancel}>
            <Text style={styles.secondaryLabel}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>No back camera available.</Text>
          <Pressable style={styles.secondaryButton} onPress={onCancel}>
            <Text style={styles.secondaryLabel}>Close</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.overlay}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        photo={false}
        video={false}
        audio={false}
        frameProcessor={frameProcessor}
        pixelFormat="yuv"
        onInitialized={() => setCameraReady(true)}
      />

      <View style={styles.chrome}>
        <Text style={styles.title}>Live Student ID Scan</Text>
        <Text style={styles.subtitle}>
          Hold the printed student number inside the frame. Detection is automatic.
        </Text>
        <View style={styles.frame}>
          <View style={styles.frameInner} />
        </View>
        <Text style={styles.previewLabel}>
          {previewText
            ? `Detected candidate: ${previewText}`
            : cameraReady
              ? "Looking for a student number..."
              : "Starting camera..."}
        </Text>
        <Pressable style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryLabel}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#090909"
  },
  chrome: {
    flex: 1,
    justifyContent: "space-between",
    paddingTop: 64,
    paddingBottom: 36,
    paddingHorizontal: 20,
    backgroundColor: "rgba(10, 10, 10, 0.34)"
  },
  panel: {
    margin: 24,
    marginTop: 120,
    borderRadius: 24,
    padding: 24,
    backgroundColor: "#ffffff",
    alignItems: "center",
    gap: 12
  },
  title: {
    color: "white",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center"
  },
  panelTitle: {
    color: "#111111",
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center"
  },
  subtitle: {
    color: "rgba(255,255,255,0.9)",
    textAlign: "center",
    fontSize: 16,
    lineHeight: 22
  },
  frame: {
    alignSelf: "center",
    width: "88%",
    aspectRatio: 1.7,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.82)",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)"
  },
  frameInner: {
    width: "80%",
    height: "42%",
    borderRadius: 18,
    borderWidth: 3,
    borderColor: "#e60028"
  },
  previewLabel: {
    color: "#fff6ef",
    textAlign: "center",
    fontSize: 16
  },
  secondaryButton: {
    alignSelf: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "rgba(230,0,40,0.18)"
  },
  secondaryLabel: {
    color: "white",
    fontWeight: "700"
  }
});
