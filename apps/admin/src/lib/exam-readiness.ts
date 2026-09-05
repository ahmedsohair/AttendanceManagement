export function examReadiness(
  roomIds: string[],
  assignments: Record<string, string[]>,
  populatedRoomIds?: string[]
) {
  if (!roomIds.length) return { ready: false, message: "No rooms available. Import a valid roster to create a new draft." };
  if (populatedRoomIds === undefined) return { ready: false, message: "Student allocations have not been checked. Reload before publishing." };
  const empty = roomIds.filter((id) => !populatedRoomIds.includes(id));
  if (empty.length) return { ready: false, message: `${empty.length} room(s) have no student allocations. Import a corrected roster to create a new draft.` };
  const unstaffed = roomIds.filter((id) => !assignments[id]?.length);
  if (unstaffed.length) return { ready: false, message: `Assign at least one invigilator to each room. ${unstaffed.length} room(s) still need staff.` };
  return { ready: true, message: "Each room has students and assigned staff. The server will validate publication." };
}
