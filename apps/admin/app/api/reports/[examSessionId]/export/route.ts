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

  const buffer = buildWorkbookSheets({
    summary: report.summaries.map((item) => ({
      room_code: item.roomCode,
      room_name: item.roomName,
      allocated_count: item.allocatedCount,
      present_count: item.presentCount,
      mismatch_present_count: item.mismatchPresentCount,
      redirected_count: item.redirectedCount
    })),
    attendance: report.attendance.map((item) => ({
      student_id: item.studentId,
      marked_at: item.createdAt,
      marked_in_room: roomMap.get(item.markedInRoomId)?.code || item.markedInRoomId,
      expected_room: roomMap.get(item.expectedRoomId)?.code || item.expectedRoomId,
      source: item.source,
      room_mismatch: item.roomMismatch,
      override_type: item.overrideType,
      comment: item.comment || "",
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
      user_id: item.userId,
      comment:
        typeof item.details.comment === "string" ? item.details.comment : "",
      details: JSON.stringify(item.details)
    }))
  });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="attendance-${examSessionId}.xlsx"`
    }
  });
}
