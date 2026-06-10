import { NextResponse } from "next/server";
import { buildExamSessionReport } from "@algo-attendance/shared";
import { requireApiUser } from "@/lib/auth";
import { buildWorkbookSheets } from "@/lib/spreadsheet";
import { readStore } from "@/lib/store";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ examSessionId: string }> }
) {
  await requireApiUser(request, { allowedRoles: ["admin"] });
  const { examSessionId } = await params;
  const store = await readStore();
  const report = buildExamSessionReport(store, examSessionId);

  const roomMap = new Map(store.rooms.map((room) => [room.id, room]));
  const userMap = new Map(store.users.map((user) => [user.id, user]));
  const attendanceByStudent = new Map(
    report.attendance.map((event) => [event.studentId, event])
  );
  const allocations = store.studentAllocations
    .filter((allocation) => allocation.examSessionId === examSessionId)
    .sort((left, right) => {
      const leftRoom = roomMap.get(left.roomId)?.code || left.roomId;
      const rightRoom = roomMap.get(right.roomId)?.code || right.roomId;
      return (
        leftRoom.localeCompare(rightRoom) ||
        left.zone.localeCompare(right.zone) ||
        left.studentId.localeCompare(right.studentId)
      );
    });

  const buffer = await buildWorkbookSheets({
    summary: report.summaries.map((item) => ({
      room_code: item.roomCode,
      room_name: item.roomName,
      allocated_count: item.allocatedCount,
      marked_count: allocations.filter(
        (allocation) =>
          allocation.roomId === item.roomId &&
          attendanceByStudent.has(allocation.studentId)
      ).length,
      absent_count: allocations.filter(
        (allocation) =>
          allocation.roomId === item.roomId &&
          !attendanceByStudent.has(allocation.studentId)
      ).length,
      marked_in_this_room_count: item.presentCount,
      mismatch_present_count: item.mismatchPresentCount,
      redirected_count: item.redirectedCount
    })),
    register: allocations.map((allocation) => {
      const attendance = attendanceByStudent.get(allocation.studentId);
      const marker = attendance ? userMap.get(attendance.markedByUserId) : null;
      return {
        student_id: allocation.studentId,
        student_name: allocation.studentName,
        attendance_status: attendance
          ? attendance.roomMismatch
            ? "Mismatch present"
            : "Present"
          : "Absent",
        expected_room: roomMap.get(allocation.roomId)?.code || allocation.roomId,
        zone: allocation.zone,
        course_code: allocation.courseCode || "",
        program: allocation.program || "",
        marked_in_room: attendance
          ? roomMap.get(attendance.markedInRoomId)?.code || attendance.markedInRoomId
          : "",
        marked_at: attendance?.createdAt || "",
        marked_by: marker?.fullName || "",
        marked_by_email: marker?.email || "",
        source: attendance?.source || "",
        room_mismatch: attendance?.roomMismatch ?? false,
        override_type: attendance?.overrideType || "",
        comment: attendance?.comment || ""
      };
    }),
    attendance: report.attendance.map((item) => ({
      student_id: item.studentId,
      marked_at: item.createdAt,
      marked_in_room: roomMap.get(item.markedInRoomId)?.code || item.markedInRoomId,
      expected_room: roomMap.get(item.expectedRoomId)?.code || item.expectedRoomId,
      source: item.source,
      room_mismatch: item.roomMismatch,
      override_type: item.overrideType,
      comment: item.comment || "",
      marked_by: userMap.get(item.markedByUserId)?.fullName || item.markedByUserId,
      marked_by_email: userMap.get(item.markedByUserId)?.email || "",
      user_id: item.markedByUserId,
      device_id: item.deviceId
    })),
    incidents: report.incidents.map((item) => ({
      created_at: item.createdAt,
      student_id: item.studentId,
      room: item.roomId ? roomMap.get(item.roomId)?.code || item.roomId : "",
      expected_room: item.expectedRoomId
        ? roomMap.get(item.expectedRoomId)?.code || item.expectedRoomId
        : "",
      incident_type: item.incidentType,
      invigilator: item.userId ? userMap.get(item.userId)?.fullName || item.userId : "",
      invigilator_email: item.userId ? userMap.get(item.userId)?.email || "" : "",
      user_id: item.userId,
      comment:
        typeof item.details.comment === "string" ? item.details.comment : "",
      details: JSON.stringify(item.details)
    }))
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="attendance-${examSessionId}.xlsx"`
    }
  });
}
