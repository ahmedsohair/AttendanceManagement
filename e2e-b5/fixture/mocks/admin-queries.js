const rows = [
  {
    id: "fixture-invigilator-1",
    email: "alex@example.test",
    fullName: "Alex Fixture",
    role: "invigilator",
    assignedRoomIds: []
  },
  {
    id: "fixture-invigilator-2",
    email: "sam@example.test",
    fullName: "Sam Fixture",
    role: "invigilator",
    assignedRoomIds: []
  }
];

export async function getInvigilatorPage({ query, sort, page }) {
  const normalizedQuery = query.toLowerCase();
  const filtered = rows
    .filter((row) => `${row.fullName} ${row.email}`.toLowerCase().includes(normalizedQuery))
    .sort((left, right) =>
      sort === "name_desc"
        ? right.fullName.localeCompare(left.fullName)
        : left.fullName.localeCompare(right.fullName)
    );

  return {
    rows: filtered,
    totalCount: filtered.length,
    page,
    pageSize: 50,
    totalPages: 1
  };
}
