import type {
  AttendanceEvent,
  DataStore,
  ExamSessionReport,
  Incident,
  LookupRequest,
  LookupResult,
  MarkAttendanceRequest,
  RoomSummary
} from "./types";

interface AttendanceDeps {
  now: () => string;
  nextId: () => string;
}

function normalizeComment(comment?: string) {
  const trimmed = comment?.trim();
  return trimmed ? trimmed : undefined;
}

export function lookupStudent(store: DataStore, request: LookupRequest): LookupResult {
  const existingAttendance = store.attendanceEvents.find(
    (event) =>
      event.examSessionId === request.examSessionId &&
      event.studentId === request.studentId
  );

  if (existingAttendance) {
    return {
      status: "already_marked",
      examSessionId: request.examSessionId,
      studentId: request.studentId,
      message: "Attendance already marked.",
      attendance: existingAttendance
    };
  }

  const allocation = store.studentAllocations.find(
    (entry) =>
      entry.examSessionId === request.examSessionId &&
      entry.studentId === request.studentId
  );

  if (!allocation) {
    return {
      status: "student_not_found",
      examSessionId: request.examSessionId,
      studentId: request.studentId,
      message: "Student was not found in this exam session."
    };
  }

  if (allocation.roomId !== request.roomId) {
    const expectedRoom = store.rooms.find((room) => room.id === allocation.roomId);
    if (!expectedRoom) {
      throw new Error(`Expected room ${allocation.roomId} not found.`);
    }

    return {
      status: "wrong_room",
      examSessionId: request.examSessionId,
      studentId: request.studentId,
      message: "Student belongs to a different room.",
      allocation,
      expectedRoom
    };
  }

  return {
    status: "ready_to_mark",
    examSessionId: request.examSessionId,
    studentId: request.studentId,
    message: "Student is in the correct room.",
    allocation
  };
}

export function markAttendance(
  store: DataStore,
  request: MarkAttendanceRequest,
  deps: AttendanceDeps
): { event?: AttendanceEvent; incident?: Incident; result: LookupResult } {
  const result = lookupStudent(store, {
    examSessionId: request.examSessionId,
    roomId: request.roomId,
    studentId: request.studentId
  });

  if (result.status === "student_not_found") {
    const incident: Incident = {
      id: deps.nextId(),
      examSessionId: request.examSessionId,
      roomId: request.roomId,
      studentId: request.studentId,
      userId: request.userId,
      incidentType: "student_not_found",
      details: {
        source: request.source,
        comment: normalizeComment(request.comment)
      },
      createdAt: deps.now()
    };

    store.incidents.push(incident);
    return { incident, result };
  }

  if (result.status === "already_marked") {
    const incident: Incident = {
      id: deps.nextId(),
      examSessionId: request.examSessionId,
      roomId: request.roomId,
      expectedRoomId: result.attendance.expectedRoomId,
      studentId: request.studentId,
      userId: request.userId,
      incidentType: "duplicate_attempt",
      details: {
        originalAttendanceId: result.attendance.id,
        source: request.source,
        comment: normalizeComment(request.comment)
      },
      createdAt: deps.now()
    };

    store.incidents.push(incident);
    return { incident, result };
  }

  if (result.status === "wrong_room" && request.action === "redirect_only") {
    const incident: Incident = {
      id: deps.nextId(),
      examSessionId: request.examSessionId,
      roomId: request.roomId,
      expectedRoomId: result.expectedRoom.id,
      studentId: request.studentId,
      userId: request.userId,
      incidentType: "wrong_room_redirected",
      details: {
        zone: result.allocation.zone,
        expectedRoomCode: result.expectedRoom.code,
        comment: normalizeComment(request.comment)
      },
      createdAt: deps.now()
    };

    store.incidents.push(incident);
    return { incident, result };
  }

  if (result.status === "wrong_room" && !request.overrideWrongRoom) {
    throw new Error("Wrong-room attendance requires overrideWrongRoom=true.");
  }

  const allocation =
    result.status === "ready_to_mark" || result.status === "wrong_room"
      ? result.allocation
      : undefined;

  if (!allocation) {
    throw new Error("Marking logic reached an impossible state.");
  }

  const event: AttendanceEvent = {
    id: deps.nextId(),
    examSessionId: request.examSessionId,
    studentId: request.studentId,
    markedByUserId: request.userId,
    markedInRoomId: request.roomId,
    expectedRoomId: allocation.roomId,
    source: request.source,
    overrideType:
      result.status === "wrong_room" ? "wrong_room_present" : "none",
    roomMismatch: result.status === "wrong_room",
    comment: normalizeComment(request.comment),
    deviceId: request.deviceId,
    createdAt: deps.now()
  };

  store.attendanceEvents.push(event);

  if (result.status === "wrong_room") {
    const incident: Incident = {
      id: deps.nextId(),
      examSessionId: request.examSessionId,
      roomId: request.roomId,
      expectedRoomId: result.expectedRoom.id,
      studentId: request.studentId,
      userId: request.userId,
      incidentType: "wrong_room_present_override",
      details: {
        zone: result.allocation.zone,
        expectedRoomCode: result.expectedRoom.code,
        comment: normalizeComment(request.comment)
      },
      createdAt: deps.now()
    };

    store.incidents.push(incident);
    return { event, incident, result };
  }

  return { event, result };
}

export function buildExamSessionReport(
  store: DataStore,
  examSessionId: string
): ExamSessionReport {
  const session = store.examSessions.find((item) => item.id === examSessionId);
  if (!session) {
    throw new Error(`Exam session ${examSessionId} not found.`);
  }

  const summaries: RoomSummary[] = store.rooms
    .filter((room) => room.examSessionId === examSessionId)
    .map((room) => {
      const allocatedCount = store.studentAllocations.filter(
        (allocation) => allocation.roomId === room.id
      ).length;
      const presentEvents = store.attendanceEvents.filter(
        (event) => event.markedInRoomId === room.id
      );
      const redirectedCount = store.incidents.filter(
        (incident) =>
          incident.examSessionId === examSessionId &&
          incident.roomId === room.id &&
          incident.incidentType === "wrong_room_redirected"
      ).length;

      return {
        roomId: room.id,
        roomCode: room.code,
        roomName: room.displayName,
        allocatedCount,
        presentCount: presentEvents.length,
        mismatchPresentCount: presentEvents.filter((event) => event.roomMismatch).length,
        redirectedCount
      };
    });

  return {
    session,
    summaries,
    attendance: store.attendanceEvents.filter(
      (event) => event.examSessionId === examSessionId
    ),
    incidents: store.incidents.filter(
      (incident) => incident.examSessionId === examSessionId
    )
  };
}
