import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { entityList } from "@/lib/entity-api";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

interface User {
  id: number;
  full_name?: string;
  email?: string;
  role?: string;
}

interface Role {
  id: number;
  name: string;
  description?: string;
}

const PERMISSIONS = ["read", "create", "update", "delete", "approve"];

export default function PermissionsManager() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => entityList<User>("users"),
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["roles"],
    queryFn: () => entityList<Role>("roles"),
  });

  const filteredUsers = users.filter(
    (user) => user.full_name?.includes(searchTerm) || user.email?.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex gap-4 items-center mb-6">
        <Input
          placeholder="חיפוש משתמשים..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-slate-100 border-b-2 border-slate-300">
            <tr>
              <th className="p-3 text-right font-semibold text-slate-700 min-w-[200px]">
                משתמש
              </th>
              <th className="p-3 text-right font-semibold text-slate-700">תפקיד</th>
              {PERMISSIONS.map((perm) => (
                <th
                  key={perm}
                  className="p-3 text-center font-semibold text-slate-700 min-w-[80px]"
                >
                  {perm}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id} className="border-b border-slate-200 hover:bg-slate-50">
                <td className="p-3">
                  <div>
                    <p className="font-medium">{user.full_name}</p>
                    <p className="text-xs text-slate-600">{user.email}</p>
                  </div>
                </td>
                <td className="p-3">
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                    {user.role}
                  </span>
                </td>
                {PERMISSIONS.map((perm) => (
                  <td key={perm} className="p-3 text-center">
                    <Checkbox
                      checked={user.role === "admin"}
                      disabled={user.role !== "admin" && perm === "approve"}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8">
        <h3 className="text-lg font-semibold mb-4">תפקידים</h3>
        <div className="grid grid-cols-2 gap-4">
          {roles.map((role) => (
            <Card key={role.id} className="p-4">
              <h4 className="font-semibold">{role.name}</h4>
              <p className="text-sm text-slate-600 mt-2">{role.description}</p>
              <div className="flex gap-2 mt-3 flex-wrap">
                {PERMISSIONS.map((perm) => (
                  <span
                    key={perm}
                    className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs"
                  >
                    {perm}
                  </span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
