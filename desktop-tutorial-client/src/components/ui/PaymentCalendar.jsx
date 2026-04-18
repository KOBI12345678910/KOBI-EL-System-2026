import { useState, useEffect } from 'react';
import api from '../../api/client';

export default function PaymentCalendar() {
  const [payments, setPayments] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    api.get('/reports/upcoming').then(r => setPayments(r.data)).catch(() => {});
  }, []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = currentDate.toLocaleString('he-IL', { month: 'long', year: 'numeric' });

  function prevMonth() { setCurrentDate(new Date(year, month - 1, 1)); }
  function nextMonth() { setCurrentDate(new Date(year, month + 1, 1)); }

  function getPaymentsForDay(day) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return payments.filter(p => p.due_date === dateStr);
  }

  const dayNames = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <h3 className="font-semibold text-gray-800">{monthName}</h3>
        <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {dayNames.map(d => (
          <div key={d} className="text-xs font-medium text-gray-400 py-1">{d}</div>
        ))}

        {/* Empty cells for first day offset */}
        {Array.from({ length: firstDay }, (_, i) => (
          <div key={`empty-${i}`} className="h-10" />
        ))}

        {/* Days */}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dayPayments = getPaymentsForDay(day);
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = dateStr === today;
          const totalAmount = dayPayments.reduce((s, p) => s + p.amount, 0);
          const hasOverdue = dayPayments.some(p => p.urgency === 'overdue');
          const hasSoon = dayPayments.some(p => p.urgency === 'soon');

          return (
            <div key={day} className={`h-10 flex flex-col items-center justify-center rounded-lg text-sm relative
              ${isToday ? 'bg-primary-100 font-bold text-primary-700' : ''}
              ${dayPayments.length > 0 ? 'cursor-pointer hover:bg-gray-100' : ''}
            `} title={totalAmount > 0 ? `₪${totalAmount.toLocaleString()} (${dayPayments.length} תשלומים)` : ''}>
              <span>{day}</span>
              {dayPayments.length > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  {dayPayments.slice(0, 3).map((_, idx) => (
                    <div key={idx} className={`w-1.5 h-1.5 rounded-full ${
                      hasOverdue ? 'bg-red-500' : hasSoon ? 'bg-yellow-500' : 'bg-green-500'
                    }`} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500" /> באיחור</span>
        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-yellow-500" /> השבוע</span>
        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500" /> עתידי</span>
      </div>
    </div>
  );
}
