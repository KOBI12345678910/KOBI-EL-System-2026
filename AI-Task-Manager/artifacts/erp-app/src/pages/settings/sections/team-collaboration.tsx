import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Button, Input, Label, Card } from "@/components/ui-components";
import { Users, Plus, Trash2, Edit2, Save, Hash, Check, X } from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

interface Team {
  id: number;
  name: string;
  description: string;
  members: number;
  color: string;
}

interface Channel {
  id: number;
  name: string;
  team: string;
  isPrivate: boolean;
  members: number;
}

const FALLBACK_INITIAL_TEAMS: Team[] = [
  { id: 1, name: "צוות מכירות", description: "צוות מכירות ופיתוח עסקי", members: 8, color: "bg-blue-500" },
  { id: 2, name: "צוות כספים", description: "חשבונאות ופיננסים", members: 4, color: "bg-green-500" },
  { id: 3, name: "צוות IT", description: "פיתוח ותשתיות", members: 5, color: "bg-violet-500" },
  { id: 4, name: "צוות לוגיסטיקה", description: "מחסן ומשלוחים", members: 6, color: "bg-amber-500" },
];

const FALLBACK_INITIAL_CHANNELS: Channel[] = [
  { id: 1, name: "כללי", team: "כל הארגון", isPrivate: false, members: 23 },
  { id: 2, name: "הזמנות-דחופות", team: "צוות מכירות", isPrivate: false, members: 8 },
  { id: 3, name: "חשבוניות", team: "צוות כספים", isPrivate: true, members: 4 },
  { id: 4, name: "מחסן", team: "צוות לוגיסטיקה", isPrivate: false, members: 6 },
];

export default function TeamCollaborationSection() {
  const { data: teamcollaborationData } = useQuery({
    queryKey: ["team-collaboration"],
    queryFn: () => authFetch("/api/settings/team_collaboration"),
    staleTime: 5 * 60 * 1000,
  });

  const INITIAL_TEAMS = teamcollaborationData ?? FALLBACK_INITIAL_TEAMS;

  const [teams, setTeams] = useState<Team[]>(INITIAL_TEAMS);
  const [channels, setChannels] = useState<Channel[]>(INITIAL_CHANNELS);
  const [activeTab, setActiveTab] = useState("teams");
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [newTeam, setNewTeam] = useState({ name: "", description: "", color: "bg-blue-500" });
  const [newChannel, setNewChannel] = useState({ name: "", team: "", isPrivate: false });

  const tabs = [
    { id: "teams", label: "צוותים" },
    { id: "channels", label: "ערוצים" },
    { id: "permissions", label: "הרשאות צוות" },
  ];

  const COLORS = ["bg-blue-500", "bg-green-500", "bg-violet-500", "bg-amber-500", "bg-red-500", "bg-cyan-500", "bg-pink-500"];

  const addTeam = () => {
    if (!newTeam.name) return;
    setTeams(prev => [...prev, { ...newTeam, id: Date.now(), members: 0 }]);
    setNewTeam({ name: "", description: "", color: "bg-blue-500" });
    setShowAddTeam(false);
  };

  const addChannel = () => {
    if (!newChannel.name) return;
    setChannels(prev => [...prev, { ...newChannel, id: Date.now(), members: 0, team: newChannel.team || "כל הארגון" }]);
    setNewChannel({ name: "", team: "", isPrivate: false });
    setShowAddChannel(false);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-blue-500/20 flex items-center justify-center">
          <Users className="w-5 h-5 text-indigo-500" />
        </div>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold">Team Collaboration</h1>
          <p className="text-sm text-muted-foreground">הגדרות שיתוף פעולה צוותי — צוותים, ערוצים, הרשאות</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "teams" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">צוותים ({teams.length})</h3>
            <Button size="sm" className="gap-2" onClick={() => setShowAddTeam(true)}>
              <Plus className="w-4 h-4" />
              צוות חדש
            </Button>
          </div>

          {showAddTeam && (
            <Card className="p-4 border-primary/30">
              <h4 className="font-semibold mb-3">צוות חדש</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>שם הצוות</Label>
                  <Input value={newTeam.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTeam(p => ({ ...p, name: e.target.value }))} placeholder="שם הצוות" className="mt-1" />
                </div>
                <div>
                  <Label>תיאור</Label>
                  <Input value={newTeam.description} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTeam(p => ({ ...p, description: e.target.value }))} placeholder="תיאור קצר" className="mt-1" />
                </div>
                <div>
                  <Label>צבע</Label>
                  <div className="flex gap-2 mt-2">
                    {COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setNewTeam(p => ({ ...p, color: c }))}
                        className={`w-7 h-7 rounded-full ${c} ${newTeam.color === c ? "ring-2 ring-white ring-offset-2 ring-offset-background" : ""}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={addTeam} disabled={!newTeam.name} className="gap-1">
                  <Check className="w-3.5 h-3.5" /> שמור
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowAddTeam(false)} className="gap-1">
                  <X className="w-3.5 h-3.5" /> ביטול
                </Button>
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {teams.map((team) => (
              <Card key={team.id} className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl ${team.color}/20 flex items-center justify-center`}>
                    <div className={`w-5 h-5 rounded-full ${team.color}`} />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm">{team.name}</h4>
                    <p className="text-xs text-muted-foreground">{team.members} חברים</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button className="p-1 hover:bg-muted rounded">
                      <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    <button className="p-1 hover:bg-red-500/10 rounded" onClick={() => setTeams(prev => prev.filter(t => t.id !== team.id))}>
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{team.description}</p>
                <Button variant="outline" size="sm" className="mt-3 w-full gap-1 text-xs">
                  <Users className="w-3 h-3" />
                  נהל חברים
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {activeTab === "channels" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">ערוצי תקשורת ({channels.length})</h3>
            <Button size="sm" className="gap-2" onClick={() => setShowAddChannel(true)}>
              <Plus className="w-4 h-4" />
              ערוץ חדש
            </Button>
          </div>

          {showAddChannel && (
            <Card className="p-4 border-primary/30">
              <h4 className="font-semibold mb-3">ערוץ חדש</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>שם הערוץ</Label>
                  <Input value={newChannel.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewChannel(p => ({ ...p, name: e.target.value }))} placeholder="שם-ערוץ" className="mt-1 font-mono" />
                </div>
                <div>
                  <Label>צוות</Label>
                  <select
                    className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    value={newChannel.team}
                    onChange={(e) => setNewChannel(p => ({ ...p, team: e.target.value }))}
                  >
                    <option value="">כל הארגון</option>
                    {teams.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="flex items-center gap-2 cursor-pointer mt-2">
                    <input type="checkbox" checked={newChannel.isPrivate} onChange={(e) => setNewChannel(p => ({ ...p, isPrivate: e.target.checked }))} />
                    <span className="text-sm">ערוץ פרטי</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={addChannel} disabled={!newChannel.name} className="gap-1">
                  <Check className="w-3.5 h-3.5" /> שמור
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowAddChannel(false)} className="gap-1">
                  <X className="w-3.5 h-3.5" /> ביטול
                </Button>
              </div>
            </Card>
          )}

          <div className="space-y-2">
            {channels.map((channel) => (
              <Card key={channel.id} className="p-4 flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center">
                  <Hash className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">#{channel.name}</span>
                    {channel.isPrivate && (
                      <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">פרטי</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{channel.team} • {channel.members} חברים</p>
                </div>
                <div className="flex items-center gap-1">
                  <button className="p-1 hover:bg-muted rounded">
                    <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button className="p-1 hover:bg-red-500/10 rounded" onClick={() => setChannels(prev => prev.filter(c => c.id !== channel.id))}>
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {activeTab === "permissions" && (
        <Card className="p-3 sm:p-6">
          <h3 className="text-lg font-semibold mb-4">הרשאות צוות</h3>
          <div className="space-y-3">
            {[
              { label: "אפשר שיתוף בין צוותים", desc: "חברי צוותים שונים יכולים לשתף מידע", enabled: true },
              { label: "אפשר ליצור ערוצים חדשים", desc: "כל משתמש יכול ליצור ערוץ חדש", enabled: false },
              { label: "מניעת גישה לצוות אחר", desc: "חברי צוות לא יראו נתוני צוותים אחרים", enabled: false },
              { label: "לוג פעילות צוותית", desc: "תיעוד כל הפעולות בתוך צוות", enabled: true },
              { label: "אישור מנהל לחברות בצוות", desc: "הצטרפות לצוות מחייבת אישור מנהל", enabled: true },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium text-sm">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked={item.enabled} />
                  <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-card after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-[-20px]" />
                </label>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Button className="gap-2">
              <Save className="w-4 h-4" />
              שמור הרשאות
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="team-collaboration" />
        <RelatedRecords entityType="team-collaboration" />
      </div>
    </div>
  );
}
