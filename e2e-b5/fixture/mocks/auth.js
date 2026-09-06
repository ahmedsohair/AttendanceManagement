export async function requireAdminPageUser() {
  return {
    id: "fixture-admin",
    email: "admin@example.test",
    fullName: "Fixture Admin",
    role: "admin",
    assignedRoomIds: []
  };
}
