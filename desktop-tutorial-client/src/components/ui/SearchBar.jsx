import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const navigate = useNavigate();

  useEffect(() => {
    if (query.length < 2) { setResults(null); return; }
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/search?q=${encodeURIComponent(query)}`);
        setResults(data);
        setOpen(true);
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const statusLabels = { pending: 'ממתין', approved: 'מאושר', rejected: 'נדחה', paid: 'שולם' };

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results && setOpen(true)}
          placeholder="חיפוש חשבוניות, ספקים..."
          className="w-full pr-10 pl-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>

      {open && results && (results.invoices.length > 0 || results.suppliers.length > 0) && (
        <div className="absolute top-full mt-2 w-full bg-white rounded-xl shadow-lg border border-gray-200 z-50 max-h-96 overflow-auto">
          {results.suppliers.length > 0 && (
            <div>
              <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-500 border-b">ספקים ({results.suppliers.length})</div>
              {results.suppliers.map(s => (
                <button key={`s-${s.id}`} onClick={() => { navigate(`/suppliers/${s.id}`); setOpen(false); setQuery(''); }}
                  className="w-full text-right px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-gray-800 text-sm">{s.name}</span>
                    {s.category_name && <span className="text-xs text-gray-400 mr-2">{s.category_name}</span>}
                  </div>
                  <span className="text-xs text-gray-400">{s.invoice_count} חשבוניות</span>
                </button>
              ))}
            </div>
          )}
          {results.invoices.length > 0 && (
            <div>
              <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-500 border-b">חשבוניות ({results.invoices.length})</div>
              {results.invoices.map(i => (
                <button key={`i-${i.id}`} onClick={() => { navigate(`/invoices/${i.id}`); setOpen(false); setQuery(''); }}
                  className="w-full text-right px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-gray-800 text-sm">{i.supplier_name}</span>
                    {i.invoice_number && <span className="text-xs text-gray-400 mr-2">#{i.invoice_number}</span>}
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-semibold">₪{i.amount?.toLocaleString()}</span>
                    <span className="text-xs text-gray-400 mr-2">{statusLabels[i.status]}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
