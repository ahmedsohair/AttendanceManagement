export async function getOptionalSessionUser() {
  return { id: "fixture-admin", fullName: "Alexandra Morgan - Examination Operations", email: "admin@example.test", role: "admin", assignedRoomIds: [] };
}
export const requireAdminPageUser = getOptionalSessionUser;
