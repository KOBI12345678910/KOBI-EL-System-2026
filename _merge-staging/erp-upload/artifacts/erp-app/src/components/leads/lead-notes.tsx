import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entityFilter, entityCreate, entityUpdate, entityDelete } from '@/lib/entity-api';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pin, Trash2, Edit2, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

interface LeadNotesProps {
  leadId: string;
}

interface NoteCardProps {
  note: any;
  categoryColors: Record<string, string>;
  editingId: string | null;
  editText: string;
  setEditText: (text: string) => void;
  onTogglePin: (note: any) => void;
  onStartEdit: (note: any) => void;
  onSaveEdit: (noteId: string) => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
}

export default function LeadNotes({ leadId }: LeadNotesProps) {
  const [noteText, setNoteText] = useState('');
  const [category, setCategory] = useState('general');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const queryClient = useQueryClient();

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['lead-notes', leadId],
    queryFn: () => entityFilter<any>("lead-notes", { lead_id: leadId })
  });

  const addNoteMutation = useMutation({
    mutationFn: async (data: { note_text: string; category: string }) => {
      return entityCreate("lead-notes", {
        lead_id: leadId,
        note_text: data.note_text,
        category: data.category,
        pinned: false
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-notes', leadId] });
      setNoteText('');
      setCategory('general');
    }
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => entityUpdate("lead-notes", id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-notes', leadId] });
      setEditingId(null);
    }
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (id: string) => entityDelete("lead-notes", id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-notes', leadId] });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (noteText.trim()) {
      addNoteMutation.mutate({ note_text: noteText, category });
    }
  };

  const togglePin = (note: any) => {
    updateNoteMutation.mutate({ id: note.id, data: { pinned: !note.pinned } });
  };

  const startEdit = (note: any) => {
    setEditingId(note.id);
    setEditText(note.note_text);
  };

  const saveEdit = (noteId: string) => {
    if (editText.trim()) {
      updateNoteMutation.mutate({ id: noteId, data: { note_text: editText } });
    }
  };

  const categoryColors: Record<string, string> = {
    'call': 'bg-green-100 text-green-800',
    'measurement': 'bg-blue-100 text-blue-800',
    'general': 'bg-slate-100 text-slate-800',
    'financial': 'bg-yellow-100 text-yellow-800',
    'other': 'bg-purple-100 text-purple-800'
  };

  const pinnedNotes = notes.filter((n: any) => n.pinned);
  const regularNotes = notes.filter((n: any) => !n.pinned);

  return (
    <div className="space-y-6">
      {/* Add Note Form */}
      <Card>
        <CardHeader>
          <CardTitle>Add New Note</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Note Type</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="measurement">Measurement</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="financial">Financial</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Note Content</Label>
              <Textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={4}
                placeholder="Write a note..."
                required
              />
            </div>
            <Button type="submit" disabled={addNoteMutation.isPending}>
              Add Note
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Pinned Notes */}
      {pinnedNotes.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Pin className="w-5 h-5 text-yellow-600" />
            Pinned Notes
          </h3>
          <div className="space-y-3">
            {pinnedNotes.map((note: any) => (
              <NoteCard
                key={note.id}
                note={note}
                categoryColors={categoryColors}
                editingId={editingId}
                editText={editText}
                setEditText={setEditText}
                onTogglePin={togglePin}
                onStartEdit={startEdit}
                onSaveEdit={saveEdit}
                onCancelEdit={() => setEditingId(null)}
                onDelete={deleteNoteMutation.mutate}
              />
            ))}
          </div>
        </div>
      )}

      {/* Regular Notes */}
      <div>
        <h3 className="text-lg font-semibold mb-3">All Notes</h3>
        <div className="space-y-3">
          {regularNotes.map((note: any) => (
            <NoteCard
              key={note.id}
              note={note}
              categoryColors={categoryColors}
              editingId={editingId}
              editText={editText}
              setEditText={setEditText}
              onTogglePin={togglePin}
              onStartEdit={startEdit}
              onSaveEdit={saveEdit}
              onCancelEdit={() => setEditingId(null)}
              onDelete={deleteNoteMutation.mutate}
            />
          ))}
        </div>
      </div>

      {notes.length === 0 && !isLoading && (
        <Card>
          <CardContent className="p-8 text-center text-slate-500">
            No notes yet
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function NoteCard({
  note,
  categoryColors,
  editingId,
  editText,
  setEditText,
  onTogglePin,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete
}: NoteCardProps) {
  const isEditing = editingId === note.id;

  return (
    <Card className={note.pinned ? 'border-yellow-400 shadow-md' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Badge className={categoryColors[note.category] || categoryColors['other']}>
              {note.category}
            </Badge>
            <span className="text-xs text-slate-500">
              {format(new Date(note.created_date), 'dd/MM/yyyy HH:mm', { locale: he })}
            </span>
            <span className="text-xs text-slate-600">
              {note.created_by}
            </span>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onTogglePin(note)}
              className={note.pinned ? 'text-yellow-600' : 'text-slate-400'}
            >
              <Pin className="w-4 h-4" />
            </Button>
            {!isEditing && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onStartEdit(note)}
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(note.id)}
                  className="text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={3}
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onSaveEdit(note.id)}>
                <Check className="w-4 h-4 mr-1" />
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={onCancelEdit}>
                <X className="w-4 h-4 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-700 whitespace-pre-wrap">
            {note.note_text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
