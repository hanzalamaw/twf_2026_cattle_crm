import { useCallback, useEffect, useMemo, useState } from 'react';

const API = 'http://localhost:5000';

function formatAmount(val) {
  if (val == null || val === '') return '0';
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  return Math.round(n).toLocaleString('en-PK');
}

export default function ProcurementDashboard() {
  const token = localStorage.getItem('token');
  const [yearFilter, setYearFilter] = useState('2026');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState({ summary: { totalProcurements: 0, totalAnimals: 0, totalAmount: 0, totalPaid: 0, totalDue: 0 }, byType: [] });

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
      const res = await fetch(`${API}/api/procurement/dashboard?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setError('Failed to load dashboard'); return; }
      const json = await res.json();
      setData(json || {});
    } catch {
      setError('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [token, yearFilter]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const cards = useMemo(() => {
    const s = data?.summary || {};
    return [
      { label: 'Total Procurements', value: s.totalProcurements ?? 0, accent: '#1565C0', soft: '#E3F2FD' },
      { label: 'Total Animals', value: s.totalAnimals ?? 0, accent: '#0F766E', soft: '#E6FFFB' },
      { label: 'Total Amount', value: `PKR ${formatAmount(s.totalAmount ?? 0)}`, accent: '#6A1B9A', soft: '#F3E5F5' },
      { label: 'Paid', value: `PKR ${formatAmount(s.totalPaid ?? 0)}`, accent: '#166534', soft: '#E6F9EB' },
      { label: 'Due', value: `PKR ${formatAmount(s.totalDue ?? 0)}`, accent: '#B91C1C', soft: '#FBEDF0' },
    ];
  }, [data]);

  return (
    <>
      <style>{`
        @media (max-width: 767px) {
          .pd-root { padding: 64px 12px 24px !important; }
          .pd-header { flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; }
          .pd-title { font-size: 16px !important; }
          .pd-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div className="pd-root" style={{ padding: '19px', fontFamily: "'Poppins','Inter',sans-serif", height: '100%', overflow: 'auto', boxSizing: 'border-box' }}>
        <div className="pd-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <h2 className="pd-title" style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#333' }}>Dashboard</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '10px', color: '#666' }}>Year</label>
            <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px', minWidth: '112px' }}>
              <option value="all">All</option>
              <option value="2026">Year 2026</option>
              <option value="2025">Year 2025</option>
              <option value="2024">Year 2024</option>
            </select>
            <button type="button" onClick={fetchStats} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: '#1565C0', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', marginBottom: '13px', fontSize: '10px', border: '1px solid #FFE0D6' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: '28px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading dashboard...</div>
        ) : (
          <>
            <div className="pd-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '12px', marginBottom: '16px' }}>
              {cards.map((c) => (
                <div key={c.label} style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '12px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: '#666' }}>{c.label}</div>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: c.soft, border: `1px solid ${c.soft}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent, fontWeight: 700, fontSize: 12 }}>
                      •
                    </div>
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#111827' }}>{c.value}</div>
                </div>
              ))}
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#333', marginBottom: '10px' }}>By Type</div>
              {(data?.byType || []).length === 0 ? (
                <div style={{ padding: '14px 0', color: '#666', fontSize: '11px' }}>No data.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                    <thead>
                      <tr style={{ background: '#f5f5f5' }}>
                        <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600, color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' }}>Type</th>
                        <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600, color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' }}>Count</th>
                        <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600, color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' }}>Animals</th>
                        <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600, color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byType.map((r) => (
                        <tr key={r.type} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{r.type}</td>
                          <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{r.count}</td>
                          <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{r.animals}</td>
                          <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>PKR {formatAmount(r.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

