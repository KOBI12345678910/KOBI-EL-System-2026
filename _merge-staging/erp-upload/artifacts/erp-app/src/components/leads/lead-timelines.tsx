import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Calendar, Users, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

interface Meeting {
  type?: string;
  date?: string;
  time?: string;
  attendees?: string[];
  summary?: string;
}

interface LeadTimelinesProps {
  lead: any;
  editing: boolean;
  formData: any;
  onChange: (key: string, value: any) => void;
}

export default function LeadTimelines({ lead, editing, formData, onChange }: LeadTimelinesProps) {
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [newMeeting, setNewMeeting] = useState<Meeting>({});

  const meetingTypes = [
    { value: 'measurement', label: 'Measurement' },
    { value: 'quote', label: 'Quote' },
    { value: 'signing', label: 'Signing' },
    { value: 'site_visit', label: 'Site Visit' },
    { value: 'inspection', label: 'Inspection' },
    { value: 'delivery', label: 'Delivery' }
  ];

  const addMeeting = () => {
    const meetings = formData.meetings || lead.meetings || [];
    onChange('meetings', [...meetings, newMeeting]);
    setNewMeeting({});
    setShowMeetingForm(false);
  };

  const removeMeeting = (index: number) => {
    const meetings = formData.meetings || lead.meetings || [];
    onChange('meetings', meetings.filter((_: any, i: number) => i !== index));
  };

  const dateField = (label: string, value: string, fieldKey: string) => (
    <div>
      <label className="text-sm font-semibold text-slate-600">{label}</label>
      {editing ? (
        <Input
          type="date"
          value={formData[fieldKey] || ''}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          className="text-sm mt-1"
        />
      ) : (
        <p className="font-semibold">
          {value ? format(new Date(value), 'dd/MM/yyyy', { locale: he }) : '\u2014'}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Timeline */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {dateField('Inquiry Date', lead.inquiry_date, 'inquiry_date')}
            {dateField('Measurement Date', lead.measurement_date, 'measurement_date')}
            {dateField('Quote Date', lead.quote_date, 'quote_date')}
            {dateField('Work Start', lead.work_start_date, 'work_start_date')}
            {dateField('Planned End', lead.planned_end_date, 'planned_end_date')}
            {dateField('Actual End', lead.actual_end_date, 'actual_end_date')}
            {editing && (
              <>
                <div>
                  <label className="text-sm font-semibold text-slate-600">Execution Window (days)</label>
                  <Input
                    type="number"
                    value={formData.execution_window_days || ''}
                    onChange={(e) => onChange('execution_window_days', parseInt(e.target.value))}
                    className="text-sm mt-1"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.has_delay_penalty || false}
                      onChange={(e) => onChange('has_delay_penalty', e.target.checked)}
                    />
                    <span className="text-sm">Delay Penalty</span>
                  </label>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Meetings */}
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-5 h-5 text-green-600" />
              Meeting Schedule ({(formData.meetings || lead.meetings || []).length})
            </CardTitle>
            {editing && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowMeetingForm(!showMeetingForm)}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Meeting
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {editing && showMeetingForm && (
            <div className="border rounded-lg p-4 bg-white space-y-2 mb-4">
              <select
                value={newMeeting.type || ''}
                onChange={(e) => setNewMeeting({ ...newMeeting, type: e.target.value })}
                className="w-full border rounded px-2 py-1 text-sm"
              >
                <option value="">Select meeting type</option>
                {meetingTypes.map(mt => <option key={mt.value} value={mt.value}>{mt.label}</option>)}
              </select>
              <Input
                type="date"
                value={newMeeting.date || ''}
                onChange={(e) => setNewMeeting({ ...newMeeting, date: e.target.value })}
                placeholder="Date"
                className="text-sm"
              />
              <Input
                type="time"
                value={newMeeting.time || ''}
                onChange={(e) => setNewMeeting({ ...newMeeting, time: e.target.value })}
                placeholder="Time"
                className="text-sm"
              />
              <Input
                placeholder="Attendees (comma separated)"
                value={newMeeting.attendees?.join(',') || ''}
                onChange={(e) => setNewMeeting({ ...newMeeting, attendees: e.target.value.split(',') })}
                className="text-sm"
              />
              <textarea
                placeholder="Summary"
                value={newMeeting.summary || ''}
                onChange={(e) => setNewMeeting({ ...newMeeting, summary: e.target.value })}
                className="w-full p-2 border rounded text-sm"
                rows={2}
              />
              <div className="flex gap-2">
                <Button onClick={addMeeting} size="sm" className="bg-green-600 flex-1">Add</Button>
                <Button onClick={() => setShowMeetingForm(false)} size="sm" variant="outline" className="flex-1">Cancel</Button>
              </div>
            </div>
          )}

          {(formData.meetings || lead.meetings || []).length === 0 ? (
            <p className="text-slate-500 text-sm">No meetings scheduled</p>
          ) : (
            (formData.meetings || lead.meetings || []).map((meeting: Meeting, idx: number) => (
              <div key={idx} className="bg-white border rounded-lg p-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-semibold">
                      {meetingTypes.find(mt => mt.value === meeting.type)?.label}
                    </p>
                    <p className="text-xs text-slate-600">
                      {meeting.date ? format(new Date(meeting.date), 'dd/MM', { locale: he }) : ''} {meeting.time || ''}
                    </p>
                  </div>
                  {editing && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeMeeting(idx)}
                      className="text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {meeting.attendees && (
                  <p className="text-xs mb-1">
                    <strong>Attendees:</strong> {meeting.attendees.join(', ')}
                  </p>
                )}
                {meeting.summary && (
                  <p className="text-xs text-slate-700">{meeting.summary}</p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
