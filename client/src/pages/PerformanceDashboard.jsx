import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE as API } from '../config/api';
const fmt = (n) => Number(n || 0).toLocaleString('en-PK');

function pct(done, target) {
  const d = Number(done) || 0, t = Number(target) || 0;
  if (t === 0) return d === 0 ? 0 : 100;
  return Math.round((d / t) * 100);
}

function pctColor(p) {
  if (p >= 80) return '#059669';
  if (p >= 50) return '#d97706';
  return '#dc2626';
}

function pctBg(p) {
  if (p >= 80) return '#ecfdf5';
  if (p >= 50) return '#fffbeb';
  return '#fef2f2';
}

const BAR_COLOR = '#6b7280';

const ProgressBar = ({ value, max, height = 6 }) => {
  const p = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ width: '100%', height, borderRadius: height, background: '#e5e7eb', overflow: 'hidden' }}>
      <div style={{ width: `${p}%`, height: '100%', borderRadius: height, background: BAR_COLOR, transition: 'width 0.4s ease' }} />
    </div>
  );
};

export default function PerformanceDashboard() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showDateModal, setShowDateModal] = useState(false);
  const [dayWiseDays, setDayWiseDays] = useState([]);

  const hdrs = () => ({ Authorization: `Bearer ${token}` });

  const dashboardYear = useMemo(() => {
    const fromY = fromDate ? String(fromDate).slice(0, 4) : '';
    const toY = toDate ? String(toDate).slice(0, 4) : '';
    if (fromY && toY) return fromY === toY ? fromY : 'all';
    if (fromY) return fromY;
    if (toY) return toY;
    return '2026';
  }, [fromDate, toDate]);

  const fetchStats = useCallback(async () => {
    setLoading(true); setError('');
    try {
      let url = `${API}/performance/stats?`;
      if (fromDate) url += `from_date=${encodeURIComponent(fromDate)}&`;
      if (toDate) url += `to_date=${encodeURIComponent(toDate)}&`;
      const [statsRes, dayWiseRes] = await Promise.all([
        authFetch(url, { headers: hdrs() }),
        authFetch(`${API}/dashboard/day-wise?year=${encodeURIComponent(dashboardYear)}`, { headers: hdrs() }),
      ]);
      if (!statsRes.ok) throw new Error((await statsRes.json().catch(() => ({}))).message || 'Failed');

      const statsData = await statsRes.json();
      const dayWiseData = dayWiseRes.ok ? await dayWiseRes.json().catch(() => ({})) : {};
      setStats(statsData);
      setDayWiseDays(Array.isArray(dayWiseData?.days) ? dayWiseData.days : []);
    } catch (e) { setError(e.message); setStats(null); }
    finally { setLoading(false); }
  }, [authFetch, fromDate, toDate, dashboardYear]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const totals = stats?.totals || {};
  const performers = stats?.performers || [];
  const period = stats?.period;

  const overallPcts = useMemo(() => ({
    calls: pct(totals.calls_done, totals.calls_target),
    leads: pct(totals.leads_generated, totals.leads_target),
    orders: pct(totals.orders_confirmed, totals.orders_target),
  }), [totals]);

  const topPerformer = useMemo(() => {
    if (performers.length === 0) return null;
    return performers.reduce((best, p) => {
      const score = Number(p.orders_confirmed) || 0;
      const bestScore = Number(best.orders_confirmed) || 0;
      return score > bestScore ? p : best;
    }, performers[0]);
  }, [performers]);

  const s = {
    page: { padding: 19, fontFamily: "'Poppins','Inter',sans-serif", width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflow: 'auto' },
    headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 },
    title: { margin: 0, fontSize: 14, fontWeight: 600, color: '#111827' },
    filtersWrap: { display: 'flex', alignItems: 'center', gap: 8 },
    dateInput: { padding: '5px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 10, color: '#374151', background: '#fff' },
    btnSecondary: { padding: '5px 12px', fontSize: 11, fontWeight: 500, background: '#fff', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' },
    alert: { padding: '8px 12px', borderRadius: 6, marginBottom: 10, fontSize: 10, fontWeight: 500, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' },
  };

  return (
    <div style={s.page}>
      <style>{`
        .pd-tr:hover { background: #f9fafb !important; }
        .pd-card:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.08) !important; border-color: #d1d5db !important; }

        @media (max-width: 767px) {
          .pd-header-row        { margin-right: 44px !important; }
          .pd-overall-grid      { grid-template-columns: 1fr !important; gap: 12px !important; }
          .pd-kpi-grid          { grid-template-columns: 1fr 1fr !important; gap: 8px !important; }
          .pd-kpi-card          { padding: 8px 10px !important; }
          .pd-kpi-value         { font-size: 14px !important; }
          .pd-individual-grid   { grid-template-columns: 1fr !important; gap: 10px !important; }

          /* Date modal — bottom sheet on mobile */
          .pd-date-modal-wrap   { align-items: flex-end !important; padding: 0 !important; }
          .pd-date-modal-box    {
            border-radius: 20px 20px 0 0 !important;
            width: 100vw !important;
            max-width: 100vw !important;
            padding: 20px 20px 40px !important;
          }
          .pd-date-drag         { display: block !important; }
          .pd-date-modal-inputs { grid-template-columns: 1fr !important; gap: 12px !important; }
          .pd-date-modal-actions button { flex: 1 !important; padding: 13px !important; font-size: 13px !important; border-radius: 10px !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="pd-header-row" style={s.headerRow}>
        <h1 style={s.title}>Performance Dashboard</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Active filter chip */}
          {(fromDate || toDate) && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 10, color: '#1D4ED8', fontWeight: 500 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              {fromDate && toDate ? `${fromDate} → ${toDate}` : fromDate ? `From ${fromDate}` : `Until ${toDate}`}
              <button type="button" onClick={() => { setFromDate(''); setToDate(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1D4ED8', padding: 0, display: 'flex', lineHeight: 1, fontSize: 13 }}>×</button>
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowDateModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', fontSize: 11, fontWeight: 500, background: '#fff', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Filter by Date
          </button>
        </div>
      </div>

      {/* ── Date range modal ── */}
      {showDateModal && (
        <div className="pd-date-modal-wrap" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={() => setShowDateModal(false)}>
          <div className="pd-date-modal-box" style={{ background: '#fff', borderRadius: 12, padding: '20px 20px 24px', width: '100%', maxWidth: 360, boxShadow: '0 10px 40px rgba(0,0,0,0.18)', border: '1px solid #e5e7eb' }} onClick={(e) => e.stopPropagation()}>
            <div className="pd-date-drag" style={{ display: 'none', width: 40, height: 4, background: '#e0e0e0', borderRadius: 2, margin: '0 auto 16px' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Filter by Date</div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>Show stats for a specific period</div>
              </div>
              <button type="button" onClick={() => setShowDateModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: '#9ca3af', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div className="pd-date-modal-inputs" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.4px' }}>From</label>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 11, color: '#111827', background: '#fafafa', outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.4px' }}>To</label>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 11, color: '#111827', background: '#fafafa', outline: 'none' }} />
              </div>
            </div>
            <div className="pd-date-modal-actions" style={{ display: 'flex', gap: 8 }}>
              <button type="button"
                onClick={() => { setFromDate(''); setToDate(''); setShowDateModal(false); }}
                style={{ flex: 1, padding: '8px', fontSize: 11, fontWeight: 500, background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 7, cursor: 'pointer' }}>
                Clear
              </button>
              <button type="button"
                onClick={() => setShowDateModal(false)}
                style={{ flex: 1, padding: '8px', fontSize: 11, fontWeight: 600, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer' }}>
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <div style={s.alert}>{error}</div>}

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#6b7280', fontSize: 11 }}>Loading stats…</div>
      ) : stats ? (
        <>
          {/* ── Overall Achievement ── */}
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #f1f1f1', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginBottom: (period?.days > 0 && period?.from && period?.to) ? 4 : 12, letterSpacing: 0.2 }}>Overall Achievement</div>
            {period?.days > 0 && period?.from && period?.to && (
              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 10 }}>
                Cumulative targets: daily targets × {period.days} day{period.days === 1 ? '' : 's'} ({period.from} → {period.to})
              </div>
            )}
            <div className="pd-overall-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { label: 'Calls', done: totals.calls_done, target: totals.calls_target, p: overallPcts.calls },
                { label: 'Leads', done: totals.leads_generated, target: totals.leads_target, p: overallPcts.leads },
                { label: 'Orders', done: totals.orders_confirmed, target: totals.orders_target, p: overallPcts.orders },
              ].map((m) => (
                <div key={m.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 500 }}>{m.label}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: pctColor(m.p), background: pctBg(m.p), padding: '1px 6px', borderRadius: 8 }}>{m.p}%</span>
                  </div>
                  <ProgressBar value={Number(m.done) || 0} max={Number(m.target) || 0} height={8} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: '#374151' }}><strong>{fmt(m.done)}</strong> done</span>
                    <span style={{ fontSize: 10, color: '#9ca3af' }}>of {fmt(m.target)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── KPI Cards ── */}
          <div className="pd-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Total Calls', value: totals.calls_done },
              { label: 'Calls Target', value: totals.calls_target },
              { label: 'Total Leads', value: totals.leads_generated },
              { label: 'Leads Target', value: totals.leads_target },
              { label: 'Total Orders', value: totals.orders_confirmed },
              { label: 'Orders Target', value: totals.orders_target },
            ].map((c) => (
              <div key={c.label} className="pd-card pd-kpi-card" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #f1f1f1', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', transition: 'transform .15s, box-shadow .15s, border-color .15s', cursor: 'default' }}>
                <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 2, fontWeight: 400 }}>{c.label}</div>
                <div className="pd-kpi-value" style={{ fontSize: 16, fontWeight: 700, color: '#111827', lineHeight: 1.3, fontFamily: "'JetBrains Mono','Consolas',monospace" }}>{fmt(c.value)}</div>
              </div>
            ))}
          </div>

          {/* ── Top Performer ── */}
          {topPerformer && performers.length > 1 && (
            <div style={{ background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', borderRadius: 8, border: '1px solid #fde68a', padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16 }}>&#9733;</span>
              <div>
                <span style={{ fontSize: 10, color: '#92400e', fontWeight: 600 }}>Top Performer</span>
                <span style={{ fontSize: 11, color: '#78350f', fontWeight: 700, marginLeft: 8 }}>{topPerformer.display_name}</span>
                <span style={{ fontSize: 10, color: '#92400e', marginLeft: 8 }}>
                  Orders: {fmt(topPerformer.orders_confirmed)}/{fmt(topPerformer.orders_target)} ({pct(topPerformer.orders_confirmed, topPerformer.orders_target)}%)
                </span>
              </div>
            </div>
          )}

          {/* ── Day Wise Summary (Total Orders only) ── */}
          <div className="pd-table-section" style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#111827', letterSpacing: 0.2 }}>Day Wise Summary</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 11, minWidth: 820 }}>
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 700, color: '#6b7280', borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', background: '#f3f4f6', minWidth: 130, textTransform: 'uppercase', letterSpacing: 0.4 }}>Category</th>
                    {dayWiseDays.map((d, i) => (
                      <th
                        key={d.key || d.title || i}
                        colSpan={5}
                        style={{
                          padding: '9px 10px',
                          textAlign: 'center',
                          fontWeight: 700,
                          color: '#ffffff',
                          borderBottom: '1px solid #e5e7eb',
                          borderLeft: i > 0 ? '4px solid #fff' : 'none',
                          background: '#FF5722',
                          minWidth: 220,
                        }}
                      >
                        {d.title || `DAY ${i + 1}`}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {dayWiseDays.map((d, i) =>
                      ['Premium', 'Standard', 'Waqf', 'Goat', 'Total'].map((h, ci) => (
                        <th
                          key={`${d.key || i}-${h}`}
                          style={{
                            padding: '7px 8px',
                            textAlign: 'center',
                            fontWeight: 600,
                            color: '#374151',
                            borderBottom: '1px solid #e5e7eb',
                            borderRight: '1px solid #e5e7eb',
                            borderLeft: i > 0 && ci === 0 ? '4px solid #fff' : 'none',
                            background: '#f9fafb',
                            fontSize: 10,
                          }}
                        >
                          {h}
                        </th>
                      ))
                    )}
                  </tr>
                </thead>
                <tbody>
                  {dayWiseDays.length === 0 ? (
                    <tr><td colSpan={16} style={{ padding: '24px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>No day-wise data available.</td></tr>
                  ) : (
                    <tr className="pd-tr">
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: '#374151', background: '#f3f4f6', borderRight: '1px solid #e5e7eb' }}>
                        Total Orders
                      </td>
                      {dayWiseDays.map((d, i) => {
                        const row = Array.isArray(d?.data) ? d.data.find((r) => r.label === 'Total Orders') : null;
                        const vals = row ? [row.premium, row.standard, row.waqf, row.goat, row.total] : ['—', '—', '—', '—', '—'];
                        return vals.map((v, ci) => (
                          <td
                            key={`${d.key || i}-v-${ci}`}
                            style={{
                              padding: '8px 8px',
                              textAlign: 'center',
                              color: '#111827',
                              fontWeight: ci === 4 ? 700 : 500,
                              borderRight: '1px solid #e5e7eb',
                              borderLeft: i > 0 && ci === 0 ? '4px solid #fff' : 'none',
                            }}
                          >
                            {v === '—' ? v : fmt(v)}
                          </td>
                        ));
                      })}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Individual Performance Cards ── */}
          {performers.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginBottom: 10, letterSpacing: 0.2 }}>Individual Performance</div>
              <div className="pd-individual-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                {performers.map((p) => {
                  const cp = pct(p.calls_done, p.calls_target);
                  const lp = pct(p.leads_generated, p.leads_target);
                  const op = pct(p.orders_confirmed, p.orders_target);
                  return (
                    <div key={p.performer_id} className="pd-card" style={{ background: '#fff', borderRadius: 10, border: '1px solid #f1f1f1', padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', transition: 'transform .15s, box-shadow .15s, border-color .15s', cursor: 'default' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginBottom: 10 }}>{p.display_name}</div>
                      {[
                        { label: 'Calls', done: p.calls_done, target: p.calls_target, p: cp },
                        { label: 'Leads', done: p.leads_generated, target: p.leads_target, p: lp },
                        { label: 'Orders', done: p.orders_confirmed, target: p.orders_target, p: op },
                      ].map((m) => (
                        <div key={m.label} style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                            <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 500 }}>{m.label}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 10, color: '#374151', fontFamily: "'JetBrains Mono','Consolas',monospace" }}>{fmt(m.done)} / {fmt(m.target)}</span>
                              <span style={{ fontSize: 9, fontWeight: 700, color: pctColor(m.p), background: pctBg(m.p), padding: '1px 5px', borderRadius: 6 }}>{m.p}%</span>
                            </div>
                          </div>
                          <ProgressBar value={Number(m.done) || 0} max={Number(m.target) || 0} height={5} />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}