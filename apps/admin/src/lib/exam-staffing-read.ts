import type { SupabaseClient } from "@supabase/supabase-js";

// Advance by the returned count, not the requested size: providers may impose a
// smaller cap. Exact counts also prevent a truncated page becoming an empty save baseline.
export async function readStaffingPages<T>(query: (from: number, to: number, signal: AbortSignal) => PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
  count: number | null;
}>, options: { signal?: AbortSignal; key?: (row: T) => string; maxRows?: number } = {}): Promise<T[]> {
  const rows: T[] = [];
  const signal = options.signal || AbortSignal.timeout(15_000);
  const maxRows = options.maxRows ?? 50_000;
  const seen = new Set<string>();
  let expected: number | null = null;
  let pages = 0;
  do {
    signal.throwIfAborted();
    if (++pages > 200) throw new Error("Exam staffing exceeds the safe page limit. Contact an administrator.");
    const result = await query(rows.length, rows.length + 499, signal);
    signal.throwIfAborted();
    if (result.error) throw new Error(`Unable to load exam staffing: ${result.error.message}`);
    if (result.count === null || result.data === null) throw new Error("Exam staffing snapshot is incomplete. Reload to retry.");
    if (expected !== null && result.count !== expected) throw new Error("Exam staffing changed while loading. Reload to retry.");
    expected = result.count;
    if (!Number.isSafeInteger(expected) || expected < 0 || expected > maxRows || rows.length + result.data.length > maxRows) {
      throw new Error("Exam staffing exceeds the safe row limit. Contact an administrator.");
    }
    if (!result.data.length && rows.length < expected) throw new Error("Exam staffing snapshot is incomplete. Reload to retry.");
    if (rows.length + result.data.length > expected) throw new Error("Exam staffing changed while loading. Reload to retry.");
    for (const row of result.data) {
      if (!options.key) break;
      const key = options.key(row);
      if (seen.has(key)) throw new Error("Exam staffing changed while loading. Reload to retry.");
      seen.add(key);
    }
    rows.push(...result.data);
  } while (rows.length < expected);
  return rows;
}

export async function readExamStaffingSnapshot(client: SupabaseClient, examId?: string, invigilatorsOnly = false) {
  const signal = AbortSignal.timeout(20_000);
  const users = await readStaffingPages((from, to, signal) => {
    let query = client.from("users").select("id, email, full_name, role", { count: "exact" });
    if (invigilatorsOnly) query = query.eq("role", "invigilator");
    return query.order("id").range(from, to).abortSignal(signal);
  }, { signal, key: (user) => String(user.id) });
  const rooms = examId ? await readStaffingPages((from, to, signal) => client.from("rooms")
    .select("id, exam_session_id, code, display_name, capacity", { count: "exact" })
    .eq("exam_session_id", examId).order("id").range(from, to).abortSignal(signal),
    { signal, key: (room) => String(room.id), maxRows: 10_000 }) : [];
  const assignedRoomsByUser = new Map<string, string[]>();
  const userIds = new Set(users.filter((user) => user.role === "invigilator").map((user) => String(user.id)));
  let assignmentCount = 0;
  for (let offset = 0; offset < rooms.length; offset += 100) {
    const roomIds = rooms.slice(offset, offset + 100).map((room) => String(room.id));
    const assignments = await readStaffingPages((from, to, signal) => client.from("room_assignments")
      .select("room_id, user_id", { count: "exact" }).in("room_id", roomIds)
      .order("room_id").order("user_id").range(from, to).abortSignal(signal),
      { signal, key: (assignment) => `${assignment.room_id}:${assignment.user_id}`, maxRows: 50_000 - assignmentCount });
    assignmentCount += assignments.length;
    for (const assignment of assignments) {
      const userId = String(assignment.user_id);
      if (!userIds.has(userId)) throw new Error("Assigned staff could not be loaded. Reload to retry.");
      const ids = assignedRoomsByUser.get(userId) || [];
      ids.push(String(assignment.room_id));
      assignedRoomsByUser.set(userId, ids);
    }
  }
  return { users, rooms, assignedRoomsByUser };
}

// Publication requires students in every room. Do not infer absence from the
// detail report's capped allocation list, or the setup loader's omitted list.
export async function readPopulatedRoomIds(client: SupabaseClient, examId: string, roomIds: string[]) {
  const populated: string[] = [];
  if (roomIds.length > 10_000) throw new Error("Too many rooms to check safely. Contact an administrator.");
  const signal = AbortSignal.timeout(15_000);
  for (let offset = 0; offset < roomIds.length; offset += 4) {
    signal.throwIfAborted();
    const batch = roomIds.slice(offset, offset + 4);
    const results = await Promise.all(batch.map((roomId) => client.from("student_allocations").select("id")
      .eq("exam_session_id", examId).eq("room_id", roomId).limit(1).abortSignal(signal)));
    signal.throwIfAborted();
    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      if (result.error || result.data === null) throw new Error("Unable to check room allocations. Reload to retry.");
      if (result.data.length) populated.push(batch[index]);
    }
  }
  return populated;
}
