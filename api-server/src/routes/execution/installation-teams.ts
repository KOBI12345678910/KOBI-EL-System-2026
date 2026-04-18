import { InstallationTeams } from "@workspace/api-zod/execution";
import { makeCrudRouter } from "./_crud-factory";

const router = makeCrudRouter({
  schema: "execution",
  table: "installation_teams",
  createSchema: InstallationTeams.CreateInstallationTeamSchema,
  updateSchema: InstallationTeams.UpdateInstallationTeamSchema,
  listQuerySchema: InstallationTeams.ListInstallationTeamsQuerySchema,
  jsonbColumns: ["vehicle_ids", "skills", "certifications", "metadata"],
  listFilters: [
    { key: "availability_state", kind: "eq" },
    { key: "is_active", kind: "bool" },
  ],
  searchColumns: ["code", "team_name", "specialization", "home_base"],
  orderByAllowed: ["code", "team_name", "created_at"],
});

export default router;
