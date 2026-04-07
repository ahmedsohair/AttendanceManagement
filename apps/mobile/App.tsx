import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import type { LookupResult, MarkAttendanceRequest, User } from "@algo-attendance/shared";
import {
  fetchRooms,
  loadApiBaseUrl,
  logout,
  login,
  lookupAttendance,
  markAttendance,
  requestPasswordReset,
  restoreCurrentUser,
  type RoomWithSession
} from "./src/api/client";
import { useOfflineQueue } from "./src/hooks/useOfflineQueue";
import { useLiveRoomState } from "./src/hooks/useLiveRoomState";
import { getDeviceId } from "./src/lib/device";

const isExpoGo = Constants.appOwnership === "expo";

function WelcomeScreen({
  onContinue
}: {
  onContinue: () => void;
}) {
  return (
    <View style={styles.welcomeShell}>
      <View style={styles.welcomePanel}>
        <Text style={styles.eyebrow}>Attendance Management System</Text>
        <Text style={styles.welcomeTitle}>Exam attendance, without the paper chase.</Text>
        <Text style={styles.welcomeCopy}>
          Scan student IDs, confirm the correct room, flag mismatches, and keep
          room totals updated live during the exam.
        </Text>

        <View style={styles.welcomeFeatureList}>
          <View style={styles.welcomeFeature}>
            <Text style={styles.welcomeFeatureTitle}>Live ID scanning</Text>
            <Text style={styles.copy}>Continuous camera flow for faster room check-in.</Text>
          </View>
          <View style={styles.welcomeFeature}>
            <Text style={styles.welcomeFeatureTitle}>Wrong-room guidance</Text>
            <Text style={styles.copy}>Redirect students or mark with a mismatch flag.</Text>
          </View>
          <View style={styles.welcomeFeature}>
            <Text style={styles.welcomeFeatureTitle}>Manual fallback</Text>
            <Text style={styles.copy}>Enter student numbers and comments when needed.</Text>
          </View>
        </View>

        <Pressable style={styles.primaryButton} onPress={onContinue}>
          <Text style={styles.primaryLabel}>Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}

function LoginScreen({
  onLoggedIn
}: {
  onLoggedIn: (user: User) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadApiBaseUrl().then(setApiBaseUrl).catch(() => undefined);
  }, []);

  async function handlePasswordReset() {
    if (!email.trim()) {
      Alert.alert(
        "Enter your email",
        "Type the email linked to your invigilator account, then request a reset."
      );
      return;
    }

    setBusy(true);
    try {
      await requestPasswordReset(email);
      Alert.alert(
        "Reset email sent",
        "Check your inbox for the password reset link. Open it in a browser to choose a new password."
      );
    } catch (error) {
      Alert.alert(
        "Reset failed",
        error instanceof Error ? error.message : "Unable to send reset email."
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    try {
      const user = await login(email, password);
      onLoggedIn(user);
    } catch (error) {
      Alert.alert(
        "Login failed",
        error instanceof Error
          ? error.message
          : "Try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.eyebrow}>Attendance Management System</Text>
      <Text style={styles.hero}>Invigilator Login</Text>
      <Text style={styles.copy}>
        Use the invigilator credentials created by your administrator to load your
        published exam rooms.
      </Text>
      <View style={styles.endpointCard}>
        <Text style={styles.endpointLabel}>Connected backend</Text>
        <Text style={styles.endpointValue}>{apiBaseUrl || "Loading..."}</Text>
      </View>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor="#8f8f8f"
      />
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
        placeholderTextColor="#8f8f8f"
      />
      <View style={styles.inlineButtons}>
        <Pressable onPress={handlePasswordReset} disabled={busy}>
          <Text style={styles.linkLabel}>Forgot password?</Text>
        </Pressable>
      </View>
      <Pressable style={styles.primaryButton} onPress={submit} disabled={busy}>
        <Text style={styles.primaryLabel}>{busy ? "Signing in..." : "Sign In"}</Text>
      </Pressable>
      <Text style={styles.copy}>
        Password resets open in a browser and return to the hosted admin system.
      </Text>
    </View>
  );
}

function RoomPickerScreen({
  user,
  onChooseRoom,
  onSignOut
}: {
  user: User;
  onChooseRoom: (room: RoomWithSession) => void;
  onSignOut: () => void;
}) {
  const [rooms, setRooms] = useState<RoomWithSession[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setBusy(true);
      try {
        const nextRooms = await fetchRooms();
        setRooms(nextRooms);
        setError("");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load rooms.");
      } finally {
        setBusy(false);
      }
    }

    load().catch(() => undefined);
  }, [user.id]);

  return (
    <View style={styles.panel}>
      <Text style={styles.eyebrow}>ASSIGNED ROOMS</Text>
      <Text style={styles.hero}>Choose Room</Text>
      <Text style={styles.copy}>{user.fullName}</Text>
      <View style={styles.inlineButtons}>
        <Pressable style={styles.secondaryButton} onPress={onSignOut}>
          <Text style={styles.secondaryLabel}>Sign Out</Text>
        </Pressable>
      </View>
      {busy ? <ActivityIndicator color="#e60028" /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.stack}>
        {rooms.map((room) => (
          <Pressable
            key={room.id}
            style={styles.roomCard}
            onPress={() => onChooseRoom(room)}
          >
            <Text style={styles.roomCode}>{room.code}</Text>
            <Text style={styles.copy}>
              {room.session.name} | {room.session.examDate} | {room.session.startTime}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function AttendanceScreen({
  user,
  room,
  onBack
}: {
  user: User;
  room: RoomWithSession;
  onBack: () => void;
}) {
  const [studentId, setStudentId] = useState("");
  const [comment, setComment] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [lastLookup, setLastLookup] = useState<LookupResult | null>(null);
  const [lastSource, setLastSource] = useState<"ocr" | "manual">("manual");
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanResetKey, setScanResetKey] = useState(0);
  const { data: live, error: liveError } = useLiveRoomState(room.id);
  const { enqueue, flush, queuedCount } = useOfflineQueue();

  useEffect(() => {
    getDeviceId().then(setDeviceId).catch(() => undefined);
  }, []);

  const roomStats = useMemo(
    () => ({
      allocated: live?.summary?.allocatedCount ?? 0,
      present: live?.summary?.presentCount ?? 0,
      mismatch: live?.summary?.mismatchPresentCount ?? 0,
      redirected: live?.summary?.redirectedCount ?? 0
    }),
    [live]
  );

  function resetOverlayForNextScan(clearComment = true) {
    setLastLookup(null);
    setStatusMessage("");
    setStudentId("");
    if (clearComment) {
      setComment("");
    }
    setScanResetKey((value) => value + 1);
  }

  function closeScanner() {
    setScannerVisible(false);
    resetOverlayForNextScan();
  }

  async function runLookup(
    nextStudentId: string,
    source: "ocr" | "manual",
    options?: { autoMarkIfReady?: boolean }
  ) {
    const normalizedId = nextStudentId.trim();
    if (!normalizedId) {
      return;
    }

    setBusy(true);
    setLastSource(source);
    setStudentId(normalizedId);

    try {
      const lookup = await lookupAttendance({
        examSessionId: room.examSessionId,
        roomId: room.id,
        studentId: normalizedId
      });

      setLastLookup(lookup);

      if (lookup.status === "ready_to_mark" && options?.autoMarkIfReady) {
        await submitMark(
          {
            examSessionId: room.examSessionId,
            roomId: room.id,
            studentId: normalizedId,
            source,
            userId: user.id,
            deviceId,
            action: "mark_present",
            comment: comment.trim() || undefined
          },
          { continueScanning: false }
        );
        return;
      }

      if (lookup.status === "ready_to_mark") {
        setStatusMessage("Student is in the correct room.");
      } else if (lookup.status === "wrong_room") {
        setStatusMessage(
          `Wrong room. Expected ${lookup.expectedRoom.code}, zone ${lookup.allocation.zone}.`
        );
      } else if (lookup.status === "already_marked") {
        setStatusMessage(`Already marked at ${lookup.attendance.createdAt}.`);
      } else {
        setStatusMessage("Student not found in this exam session.");
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Lookup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitMark(
    payload: MarkAttendanceRequest,
    options?: { continueScanning?: boolean }
  ) {
    setBusy(true);
    try {
      const result = await markAttendance(payload);
      setStatusMessage(
        result.event?.roomMismatch
          ? "Present marked with room mismatch flag."
          : result.event
            ? "Attendance marked."
            : "Incident logged."
      );
      await flush();

      if (options?.continueScanning) {
        resetOverlayForNextScan();
      } else {
        setLastLookup(null);
        setStudentId("");
        setComment("");
      }
    } catch {
      await enqueue(payload);
      setStatusMessage(
        `Offline or server unavailable. Request queued for sync. Pending: ${queuedCount + 1}`
      );
      if (options?.continueScanning) {
        resetOverlayForNextScan();
      }
    } finally {
      setBusy(false);
    }
  }

  function openLiveScanner() {
    if (isExpoGo) {
      Alert.alert(
        "Live OCR needs a development build",
        "Expo Go cannot run the native realtime scanner. Open the Android or iOS development build for live scanning."
      );
      return;
    }

    resetOverlayForNextScan();
    setScannerVisible(true);
  }

  async function handleDetectedStudentId(detectedStudentId: string) {
    await runLookup(detectedStudentId, "ocr");
  }

  function buildMarkPayload(
    overrides: Partial<MarkAttendanceRequest> = {}
  ): MarkAttendanceRequest {
    return {
      examSessionId: room.examSessionId,
      roomId: room.id,
      studentId: studentId.trim(),
      source: lastSource,
      userId: user.id,
      deviceId,
      action: "mark_present",
      comment: comment.trim() || undefined,
      ...overrides
    };
  }

  const LiveTextScannerComponent = !isExpoGo && scannerVisible
    ? (require("./src/components/LiveTextScanner").LiveTextScanner as React.ComponentType<{
        onCancel: () => void;
        onDetected: (studentId: string) => void;
        enabled: boolean;
        resetSignal: number;
      }>)
    : null;

  const scannerOverlayVisible = scannerVisible && Boolean(lastLookup || statusMessage || studentId);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.panel}>
          <View style={styles.rowTop}>
            <View style={styles.headerContent}>
              <Text style={styles.eyebrow}>LIVE ATTENDANCE</Text>
              <Text style={styles.hero}>{room.code}</Text>
              <Text style={styles.copy}>
                {room.session.name} | {room.session.startTime}
              </Text>
            </View>
            <Pressable style={styles.headerButton} onPress={onBack}>
              <Text style={styles.headerButtonLabel}>Change room</Text>
            </Pressable>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{roomStats.present}</Text>
              <Text style={styles.statLabel}>Present</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{roomStats.allocated}</Text>
              <Text style={styles.statLabel}>Allocated</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{roomStats.mismatch}</Text>
              <Text style={styles.statLabel}>Mismatch</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{roomStats.redirected}</Text>
              <Text style={styles.statLabel}>Redirected</Text>
            </View>
          </View>

          <View style={styles.inlineButtons}>
            <Pressable style={styles.primaryButton} onPress={openLiveScanner} disabled={busy}>
              <Text style={styles.primaryLabel}>Live Scan</Text>
            </Pressable>
          </View>

          <TextInput
            style={styles.input}
            value={studentId}
            onChangeText={setStudentId}
            keyboardType="number-pad"
            placeholder="Manual student number"
            placeholderTextColor="#8f8f8f"
          />

          <TextInput
            style={[styles.input, styles.commentInput]}
            value={comment}
            onChangeText={setComment}
            multiline
            placeholder="Comments (optional)"
            placeholderTextColor="#8f8f8f"
          />

          <View style={styles.inlineButtons}>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => runLookup(studentId, "manual", { autoMarkIfReady: true })}
              disabled={busy}
            >
              <Text style={styles.secondaryLabel}>{busy ? "Working..." : "Submit Manual ID"}</Text>
            </Pressable>
          </View>

          {statusMessage ? <Text style={styles.info}>{statusMessage}</Text> : null}
          {isExpoGo ? (
            <Text style={styles.warn}>
              Live scanning only runs in the development build, not Expo Go.
            </Text>
          ) : null}
          {liveError ? <Text style={styles.error}>{liveError}</Text> : null}
          {queuedCount ? <Text style={styles.warn}>Queued sync items: {queuedCount}</Text> : null}

          {lastLookup?.status === "wrong_room" && !scannerVisible ? (
            <View style={styles.callout}>
              <Text style={styles.calloutTitle}>Student is in the wrong room</Text>
              <Text style={styles.copy}>
                Expected room {lastLookup.expectedRoom.code}, zone {lastLookup.allocation.zone}.
              </Text>
              <View style={styles.inlineButtons}>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() =>
                    submitMark(
                      buildMarkPayload({
                        action: "redirect_only",
                        studentId: lastLookup.studentId
                      })
                    )
                  }
                  disabled={busy}
                >
                  <Text style={styles.secondaryLabel}>Send To Room</Text>
                </Pressable>
                <Pressable
                  style={styles.primaryButton}
                  onPress={() =>
                    submitMark(
                      buildMarkPayload({
                        action: "mark_present",
                        studentId: lastLookup.studentId,
                        overrideWrongRoom: true
                      })
                    )
                  }
                  disabled={busy}
                >
                  <Text style={styles.primaryLabel}>Mark With Flag</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <View style={styles.stack}>
            {live?.recentAttendance.map((item) => (
              <View key={item.createdAt + item.studentId} style={styles.feedRow}>
                <Text style={styles.feedTitle}>{item.studentId}</Text>
                <Text style={styles.copy}>
                  {item.roomMismatch ? "Marked with mismatch" : "Marked present"} | {item.createdAt}
                </Text>
                {item.comment ? <Text style={styles.feedComment}>{item.comment}</Text> : null}
              </View>
            ))}
            {live?.recentIncidents.map((item) => (
              <View key={item.createdAt + item.incidentType} style={styles.feedRow}>
                <Text style={styles.feedTitle}>{item.incidentType}</Text>
                <Text style={styles.copy}>
                  {item.studentId || "Unknown student"} | {item.createdAt}
                </Text>
                {item.comment ? <Text style={styles.feedComment}>{item.comment}</Text> : null}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {LiveTextScannerComponent ? (
        <View style={StyleSheet.absoluteFill}>
          <LiveTextScannerComponent
            onCancel={closeScanner}
            onDetected={handleDetectedStudentId}
            enabled={!scannerOverlayVisible && !busy}
            resetSignal={scanResetKey}
          />

          <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            <View style={styles.scannerTopBar}>
              <Pressable style={styles.cameraBackButton} onPress={closeScanner}>
                <Text style={styles.cameraBackLabel}>Back</Text>
              </Pressable>
            </View>

            {scannerOverlayVisible ? (
              <View style={styles.scannerSheetWrap}>
                <View style={styles.scannerSheet}>
                  <Text style={styles.sheetTitle}>
                    {lastLookup?.status === "wrong_room"
                      ? "Wrong room detected"
                      : lastLookup?.status === "ready_to_mark"
                        ? "Ready to mark"
                        : lastLookup?.status === "already_marked"
                          ? "Already marked"
                          : lastLookup?.status === "student_not_found"
                            ? "Student not found"
                            : "Review scan"}
                  </Text>

                  <TextInput
                    style={styles.sheetInput}
                    value={studentId}
                    onChangeText={setStudentId}
                    keyboardType="number-pad"
                    placeholder="Student number"
                    placeholderTextColor="#8f8f8f"
                  />

                  <TextInput
                    style={[styles.sheetInput, styles.sheetCommentInput]}
                    value={comment}
                    onChangeText={setComment}
                    multiline
                    placeholder="Comments (optional)"
                    placeholderTextColor="#8f8f8f"
                  />

                  {statusMessage ? <Text style={styles.sheetMessage}>{statusMessage}</Text> : null}

                  <View style={styles.sheetActions}>
                    <Pressable
                      style={styles.secondaryButton}
                      onPress={() => runLookup(studentId, "ocr")}
                      disabled={busy}
                    >
                      <Text style={styles.secondaryLabel}>Recheck</Text>
                    </Pressable>

                    {lastLookup?.status === "ready_to_mark" ? (
                      <Pressable
                        style={styles.primaryButton}
                        onPress={() =>
                          submitMark(buildMarkPayload(), { continueScanning: true })
                        }
                        disabled={busy}
                      >
                        <Text style={styles.primaryLabel}>Mark Present</Text>
                      </Pressable>
                    ) : null}

                    {lastLookup?.status === "wrong_room" ? (
                      <>
                        <Pressable
                          style={styles.secondaryButton}
                          onPress={() =>
                            submitMark(
                              buildMarkPayload({
                                action: "redirect_only",
                                studentId: lastLookup.studentId
                              }),
                              { continueScanning: true }
                            )
                          }
                          disabled={busy}
                        >
                          <Text style={styles.secondaryLabel}>Send To Room</Text>
                        </Pressable>
                        <Pressable
                          style={styles.primaryButton}
                          onPress={() =>
                            submitMark(
                              buildMarkPayload({
                                action: "mark_present",
                                studentId: lastLookup.studentId,
                                overrideWrongRoom: true
                              }),
                              { continueScanning: true }
                            )
                          }
                          disabled={busy}
                        >
                          <Text style={styles.primaryLabel}>Mark Anyway</Text>
                        </Pressable>
                      </>
                    ) : null}

                    {lastLookup?.status === "already_marked" ||
                    lastLookup?.status === "student_not_found" ? (
                      <Pressable
                        style={styles.primaryButton}
                        onPress={() => resetOverlayForNextScan()}
                        disabled={busy}
                      >
                        <Text style={styles.primaryLabel}>Continue Scan</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [room, setRoom] = useState<RoomWithSession | null>(null);
  const [started, setStarted] = useState(false);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    restoreCurrentUser()
      .then((restoredUser) => {
        if (restoredUser) {
          setUser(restoredUser);
          setStarted(true);
        }
      })
      .finally(() => setRestoring(false));
  }, []);

  async function handleSignOut() {
    try {
      await logout();
    } catch {
      // Clear local view state even if remote sign-out fails.
    }

    setRoom(null);
    setUser(null);
    setStarted(true);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      {restoring ? (
        <View style={styles.panel}>
          <ActivityIndicator color="#e60028" />
          <Text style={styles.copy}>Restoring secure session...</Text>
        </View>
      ) : null}
      {!restoring && !started ? <WelcomeScreen onContinue={() => setStarted(true)} /> : null}
      {started && !user ? <LoginScreen onLoggedIn={setUser} /> : null}
      {user && !room ? (
        <RoomPickerScreen user={user} onChooseRoom={setRoom} onSignOut={handleSignOut} />
      ) : null}
      {user && room ? (
        <AttendanceScreen user={user} room={room} onBack={() => setRoom(null)} />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f4f4f4"
  },
  welcomeShell: {
    flex: 1,
    padding: 20,
    justifyContent: "center"
  },
  welcomePanel: {
    backgroundColor: "#ffffff",
    borderRadius: 32,
    padding: 24,
    borderWidth: 1,
    borderColor: "#dfdfdf",
    shadowColor: "#111111",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5
  },
  welcomeTitle: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "800",
    color: "#111111",
    marginTop: 6
  },
  welcomeCopy: {
    color: "#5f6368",
    marginTop: 14,
    lineHeight: 24,
    fontSize: 16
  },
  welcomeFeatureList: {
    gap: 12,
    marginTop: 20,
    marginBottom: 24
  },
  welcomeFeature: {
    padding: 14,
    borderRadius: 20,
    backgroundColor: "#fff4f6",
    borderWidth: 1,
    borderColor: "#f3c9d1"
  },
  welcomeFeatureTitle: {
    color: "#111111",
    fontWeight: "800",
    fontSize: 16
  },
  scrollContent: {
    padding: 16,
    gap: 16
  },
  panel: {
    margin: 16,
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: "#dfdfdf",
    shadowColor: "#111111",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5
  },
  eyebrow: {
    color: "#b4001f",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.3
  },
  hero: {
    fontSize: 30,
    fontWeight: "800",
    color: "#111111",
    marginTop: 4
  },
  copy: {
    color: "#5f6368",
    marginTop: 4,
    lineHeight: 20
  },
  linkLabel: {
    color: "#b4001f",
    fontWeight: "700"
  },
  input: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d7d7d7",
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 12,
    color: "#111111"
  },
  endpointCard: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d7d7d7",
    backgroundColor: "#fff6f7"
  },
  endpointLabel: {
    color: "#b4001f",
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  endpointValue: {
    color: "#111111",
    marginTop: 6,
    fontWeight: "600"
  },
  commentInput: {
    minHeight: 92,
    textAlignVertical: "top"
  },
  primaryButton: {
    backgroundColor: "#e60028",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  primaryLabel: {
    color: "white",
    fontWeight: "800"
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d7d7d7",
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff"
  },
  secondaryLabel: {
    color: "#111111",
    fontWeight: "700"
  },
  rowTop: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    justifyContent: "space-between"
  },
  headerContent: {
    flex: 1,
    paddingRight: 8
  },
  headerButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d7d7d7",
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    minWidth: 156
  },
  headerButtonLabel: {
    color: "#111111",
    fontWeight: "700"
  },
  inlineButtons: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    flexWrap: "wrap"
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16
  },
  statCard: {
    backgroundColor: "#fff4f6",
    borderRadius: 18,
    padding: 12,
    minWidth: 76,
    borderWidth: 1,
    borderColor: "#f3c9d1"
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111111"
  },
  statLabel: {
    color: "#5f6368"
  },
  info: {
    marginTop: 12,
    color: "#0c7a43",
    fontWeight: "600"
  },
  error: {
    marginTop: 12,
    color: "#b4001f",
    fontWeight: "600"
  },
  warn: {
    marginTop: 8,
    color: "#b76b00",
    fontWeight: "600"
  },
  stack: {
    gap: 12,
    marginTop: 12
  },
  roomCard: {
    backgroundColor: "#fff5f6",
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#f0d0d6"
  },
  roomCode: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111111"
  },
  callout: {
    marginTop: 16,
    backgroundColor: "#fff1f3",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "#f3c9d1"
  },
  calloutTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#b4001f"
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111111"
  },
  feedRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ececec"
  },
  feedTitle: {
    fontWeight: "800",
    color: "#111111"
  },
  feedComment: {
    color: "#b4001f",
    marginTop: 4,
    fontWeight: "600"
  },
  scannerTopBar: {
    paddingTop: 54,
    paddingHorizontal: 18,
    alignItems: "flex-start"
  },
  cameraBackButton: {
    backgroundColor: "rgba(17,17,17,0.55)",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12
  },
  cameraBackLabel: {
    color: "#ffffff",
    fontWeight: "700"
  },
  scannerSheetWrap: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 16
  },
  scannerSheet: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: "#dfdfdf"
  },
  sheetTitle: {
    color: "#111111",
    fontSize: 22,
    fontWeight: "800"
  },
  sheetInput: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d7d7d7",
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 12,
    color: "#111111"
  },
  sheetCommentInput: {
    minHeight: 88,
    textAlignVertical: "top"
  },
  sheetMessage: {
    marginTop: 12,
    color: "#5f6368",
    lineHeight: 20
  },
  sheetActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14
  }
});
