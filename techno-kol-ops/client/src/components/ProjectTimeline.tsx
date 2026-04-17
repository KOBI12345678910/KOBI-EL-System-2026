/**
 * ProjectTimeline.tsx
 * Visual Gantt-style timeline for projects — pure CSS/divs, no external lib.
 * Props: projects: Array<{ id, name, start_date, end_date, status, progress }>
 */

import React, { useMemo } from 'react';

export interface TimelineProject {
  id: string | number;
  name: string;
  start_date: string;   // ISO date string
  end_date: string;     // ISO date string
  status: string;
  progress: number;     // 0-100
}

interface ProjectTimelineProps {
  projects: TimelineProject[];
}

const STATUS_COLORS: Record<string, string> = {
  deal_closed:             '#48AFF0',
  measurement_scheduled:   '#9D4EDD',
  measurement_done:        '#9D4EDD',
  contract_sent:           '#FFB366',
  contract_signed:         '#FFB366',
  materials_ordered:       '#FFA500',
  materials_arrived:       '#FFA500',
  production_assigned:     '#48AFF0',
  production_started:      '#48AFF0',
  production_done:         '#3DCC91',
  sent_to_paint:           '#FC8585',
  returned_from_paint:     '#3DCC91',
  installation_scheduled:  '#9D4EDD',
  installation_started:    '#48AFF0',
  installation_done:       '#3DCC91',
  survey_sent:             '#FFB366',
  payment_requested:       '#FC8585',
  payment_received:        '#3DCC91',
  project_closed:          '#5C7080',
  active:                  '#48AFF0',
  completed:               '#3DCC91',
  on_hold:                 '#FFB366',
  cancelled:               '#FC8585',
};

function getStatusColor(status: string): string {
  return STATUS_COLORS[status] || '#5C7080';
}

function parseDate(d: string): Date {
  if (!d) return new Date();
  return new Date(d);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDateLabel(d: Date): string {
  return d.toLocaleDateString('he-IL', { month: 'short', day: 'numeric' });
}

export function ProjectTimeline({ projects }: ProjectTimelineProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { minDate, maxDate } = useMemo(() => {
    if (!projects || projects.length === 0) {
      return { minDate: addDays(today, -7), maxDate: addDays(today, 30) };
    }
    let min = parseDate(projects[0].start_date);
    let max = parseDate(projects[0].end_date || projects[0].start_date);
    for (const p of projects) {
      const s = parseDate(p.start_date);
      const e = parseDate(p.end_date || p.start_date);
      if (s < min) min = s;
      if (e > max) max = e;
    }
    // Add a small margin
    min = addDays(min, -3);
    max = addDays(max, 3);
    return { minDate: min, maxDate: max };
  }, [projects]);

  const totalDays = Math.max(1, Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)));

  const todayOffset = Math.max(0, Math.min(100,
    ((today.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) / totalDays * 100
  ));

  // Build month/week header ticks
  const headerTicks = useMemo(() => {
    const ticks: { label: string; left: number }[] = [];
    const cur = new Date(minDate);
    cur.setDate(1); // start of month
    while (cur <= maxDate) {
      const offset = ((cur.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) / totalDays * 100;
      if (offset >= 0 && offset <= 100) {
        ticks.push({
          label: cur.toLocaleDateString('he-IL', { month: 'short', year: '2-digit' }),
          left: offset,
        });
      }
      cur.setMonth(cur.getMonth() + 1);
    }
    return ticks;
  }, [minDate, maxDate, totalDays]);

  if (!projects || projects.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#5C7080', fontSize: 13 }}>
        אין פרויקטים להצגה בציר הזמן
      </div>
    );
  }

  return (
    <div style={{
      background: '#2F343C',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 4,
      overflow: 'hidden',
      direction: 'rtl',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {/* Project name column header */}
        <div style={{
          width: 180, flexShrink: 0,
          padding: '8px 12px',
          fontSize: 10, color: '#5C7080',
          letterSpacing: '0.1em',
          borderLeft: '1px solid rgba(255,255,255,0.06)',
          background: '#383E47',
        }}>
          שם פרויקט
        </div>
        {/* Timeline header */}
        <div style={{ flex: 1, position: 'relative', height: 32, background: '#383E47' }}>
          {headerTicks.map((t, i) => (
            <div key={i} style={{
              position: 'absolute',
              left: `${t.left}%`,
              top: 0, bottom: 0,
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 4,
            }}>
              <div style={{
                width: 1, height: '100%', position: 'absolute', left: 0,
                background: 'rgba(255,255,255,0.06)',
              }} />
              <span style={{ fontSize: 9, color: '#5C7080', whiteSpace: 'nowrap', marginLeft: 4 }}>
                {t.label}
              </span>
            </div>
          ))}
          {/* Today label in header */}
          {todayOffset >= 0 && todayOffset <= 100 && (
            <div style={{
              position: 'absolute',
              left: `${todayOffset}%`,
              top: 0, bottom: 0,
              display: 'flex',
              alignItems: 'center',
            }}>
              <span style={{
                fontSize: 9, color: '#FC8585',
                background: 'rgba(252,133,133,0.15)',
                padding: '1px 4px',
                borderRadius: 2,
                whiteSpace: 'nowrap',
                transform: 'translateX(-50%)',
                display: 'block',
              }}>
                היום
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Project rows */}
      {projects.map((project, idx) => {
        const startDate = parseDate(project.start_date);
        const endDate = parseDate(project.end_date || project.start_date);
        const color = getStatusColor(project.status);

        const barLeft = Math.max(0, ((startDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) / totalDays * 100);
        const barRight = Math.min(100, ((endDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) / totalDays * 100);
        const barWidth = Math.max(0.5, barRight - barLeft);

        return (
          <div key={project.id} style={{
            display: 'flex',
            borderBottom: idx < projects.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            minHeight: 44,
          }}>
            {/* Project name */}
            <div style={{
              width: 180, flexShrink: 0,
              padding: '8px 12px',
              borderLeft: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 2,
            }}>
              <div style={{ fontSize: 12, color: '#F6F7F9', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {project.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{
                  fontSize: 9, color,
                  border: `1px solid ${color}40`,
                  padding: '1px 5px',
                  borderRadius: 2,
                }}>
                  {project.status}
                </span>
                <span style={{ fontSize: 9, color: '#5C7080' }}>{project.progress}%</span>
              </div>
            </div>

            {/* Timeline bar area */}
            <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
              {/* Background grid lines matching header ticks */}
              {headerTicks.map((t, i) => (
                <div key={i} style={{
                  position: 'absolute',
                  left: `${t.left}%`,
                  top: 0, bottom: 0,
                  width: 1,
                  background: 'rgba(255,255,255,0.03)',
                  pointerEvents: 'none',
                }} />
              ))}

              {/* Today vertical line */}
              {todayOffset >= 0 && todayOffset <= 100 && (
                <div style={{
                  position: 'absolute',
                  left: `${todayOffset}%`,
                  top: 0, bottom: 0,
                  width: 1,
                  background: 'rgba(252,133,133,0.6)',
                  pointerEvents: 'none',
                  zIndex: 2,
                }} />
              )}

              {/* Project bar */}
              <div style={{
                position: 'absolute',
                left: `${barLeft}%`,
                width: `${barWidth}%`,
                height: 22,
                borderRadius: 3,
                background: `${color}25`,
                border: `1px solid ${color}80`,
                overflow: 'hidden',
                cursor: 'default',
                zIndex: 1,
              }}
                title={`${project.name} | ${formatDateLabel(startDate)} — ${formatDateLabel(endDate)} | ${project.progress}%`}
              >
                {/* Progress fill */}
                <div style={{
                  height: '100%',
                  width: `${project.progress}%`,
                  background: `${color}50`,
                  borderRadius: 2,
                  transition: 'width 0.4s',
                }} />
                {/* Label inside bar (only if wide enough) */}
                {barWidth > 8 && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    paddingRight: 6,
                    paddingLeft: 4,
                  }}>
                    <span style={{
                      fontSize: 9,
                      color,
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {project.name}
                    </span>
                  </div>
                )}
              </div>

              {/* Date labels outside bar */}
              {barWidth > 4 && (
                <div style={{
                  position: 'absolute',
                  left: `${barLeft}%`,
                  top: '50%',
                  transform: 'translateY(-50%) translateY(14px)',
                  fontSize: 8,
                  color: '#5C7080',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  zIndex: 1,
                }}>
                  {formatDateLabel(startDate)}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Footer: legend */}
      <div style={{
        padding: '8px 12px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        background: '#383E47',
      }}>
        {[
          { label: 'ייצור', color: '#48AFF0' },
          { label: 'הסתיים', color: '#3DCC91' },
          { label: 'חוזה/חומרים', color: '#FFB366' },
          { label: 'התקנה', color: '#9D4EDD' },
          { label: 'עיכוב', color: '#FC8585' },
          { label: 'סגור', color: '#5C7080' },
        ].map(({ label, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color, opacity: 0.7 }} />
            <span style={{ fontSize: 9, color: '#5C7080' }}>{label}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 1, height: 10, background: 'rgba(252,133,133,0.6)' }} />
          <span style={{ fontSize: 9, color: '#FC8585' }}>היום</span>
        </div>
      </div>
    </div>
  );
}

export default ProjectTimeline;
