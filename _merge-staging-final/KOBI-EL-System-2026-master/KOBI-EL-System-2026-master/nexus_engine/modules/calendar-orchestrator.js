// ══════════════════════════════════════════════════════════════════
// MODULE: Calendar Orchestrator
// מודול שמתזמן פגישות + תיאום לוחות זמנים אוטומטית
// ══════════════════════════════════════════════════════════════════
//
// אסטרטגיה:
//   1. מחזיק רשימת סוגי-פגישות (שיחת התקנה, סיור דירה, הצעת מחיר)
//   2. מקבל לידים "hot" ממודול lead-scorer ומתזמן אוטומטית
//   3. מתחשב באזור זמן (Elkayam — לקוחות בארה"ב / צרפת)
//   4. יוצר invites + reminders + follow-ups
//   5. מזהה slots פנויים בלו"ז של צוות ישראלי ומציע חלונות

const CalendarOrchestratorModule = {
  name: "calendar_orchestrator",
  description: "Schedules meetings + coordinates timezones for international clients",

  // Stub availability per business — in production pulled from Google Calendar API
  _availability: {
    techno_kol_uzi: {
      business_hours_ils: { start: "08:00", end: "17:00", days: [0, 1, 2, 3, 4] }, // sun-thu
      timezone: "Asia/Jerusalem",
      agents: ["יוסי כהן", "מיכל לוי"],
      slot_duration_minutes: 45,
    },
    elkayam_real_estate: {
      business_hours_ils: { start: "09:00", end: "20:00", days: [0, 1, 2, 3, 4] }, // extended for international
      timezone: "Asia/Jerusalem",
      agents: ["קובי אלקיים", "Sarah (EN)", "Sophie (FR)"],
      slot_duration_minutes: 60,
    },
  },

  // Meeting types
  _meetingTypes: {
    "tku_site_visit": { business: "techno_kol_uzi", duration_min: 90, purpose: "Site visit for measurement" },
    "tku_quote_call": { business: "techno_kol_uzi", duration_min: 30, purpose: "Quote discussion" },
    "elk_property_tour": { business: "elkayam_real_estate", duration_min: 120, purpose: "Property tour" },
    "elk_zoom_intro": { business: "elkayam_real_estate", duration_min: 45, purpose: "Zoom intro with international buyer" },
    "elk_contract_review": { business: "elkayam_real_estate", duration_min: 60, purpose: "Contract review" },
  },

  // Known client timezones
  _timezoneOffsets: {
    "he": "Asia/Jerusalem (UTC+2/+3)",
    "en_us_east": "America/New_York (UTC-5/-4)",
    "en_us_west": "America/Los_Angeles (UTC-8/-7)",
    "fr": "Europe/Paris (UTC+1/+2)",
    "en_uk": "Europe/London (UTC+0/+1)",
  },

  _findNextSlot(business) {
    const now = new Date();
    const avail = this._availability[business];
    // Simple stub — in production would check the actual calendar
    const slot = new Date(now.getTime() + 24 * 60 * 60 * 1000); // tomorrow
    slot.setHours(10, 0, 0, 0);
    return {
      start_ils: slot.toISOString(),
      duration_minutes: avail.slot_duration_minutes,
    };
  },

  async run(state, brain, alerts) {
    // Pull hot leads from the lead_scorer's last output
    const lastScoring = state.get("modules.lead_scorer.last_scoring");
    if (!lastScoring || !lastScoring.results) return;

    const hotLeads = lastScoring.results.filter(r => r.category === "hot");
    if (hotLeads.length === 0) return;

    const scheduled = [];
    for (const lead of hotLeads) {
      const meetingType =
        lead.business === "techno_kol_uzi" ? "tku_site_visit" :
        lead.business === "elkayam_real_estate" ? "elk_zoom_intro" :
        "tku_quote_call";

      const slot = this._findNextSlot(lead.business);
      const meeting = {
        id: `mtg_${Date.now()}_${lead.lead_id}`,
        lead_id: lead.lead_id,
        business: lead.business,
        meeting_type: meetingType,
        purpose: this._meetingTypes[meetingType].purpose,
        scheduled_start_ils: slot.start_ils,
        duration_minutes: slot.duration_minutes,
        status: "scheduled",
      };

      scheduled.push(meeting);
      state.addMemory("shortTerm", {
        type: "meeting_scheduled",
        lead_id: lead.lead_id,
        business: lead.business,
        meeting_type: meetingType,
      });
    }

    if (scheduled.length > 0) {
      state.update("modules.calendar_orchestrator.last_scheduled", scheduled);
      alerts.addAlert(
        "success",
        "Meetings auto-scheduled",
        `${scheduled.length} meetings scheduled for hot leads`,
        { meetings: scheduled.map(m => ({ id: m.id, business: m.business, type: m.meeting_type })) }
      );

      // Ask AI how to best prep the team
      await brain.makeDecision(
        {
          scheduled_meetings: scheduled.length,
          businesses: [...new Set(scheduled.map(s => s.business))],
        },
        ["prep_personalized_pitch_for_each", "group_meetings_by_business", "assign_top_agent_to_largest_deal", "standard_prep"],
        { extra: "איך להתכונן לפגישות שנקבעו?" }
      );
    }
  },
};

module.exports = CalendarOrchestratorModule;
