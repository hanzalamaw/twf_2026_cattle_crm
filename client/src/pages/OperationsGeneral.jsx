import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '../config/api';
import { getOperationsSocket } from '../utils/operationsSocket';
import { useAuth } from '../context/AuthContext';

const STATUS_COLORS = {
  Pending:            { bg: '#FFF8E1', fg: '#F57C00' },
  'Rider Assigned':   { bg: '#E3F2FD', fg: '#1565C0' },
  Dispatched:         { bg: '#EDE7F6', fg: '#4527A0' },
  Delivered:          { bg: '#E8F5E9', fg: '#2E7D32' },
  'Returned to Farm': { bg: '#FFEBEE', fg: '#C62828' },
};

function money(n) {
  return `Rs. ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function pct(a, b) {
  if (!b) return '0%';
  return `${Math.round((a / b) * 100)}%`;
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e8e8e8',
      borderRadius: '14px', padding: '16px 18px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
      borderLeft: `4px solid ${accent || '#FF5722'}`,
      display: 'flex', flexDirection: 'column', gap: '4px',
    }}>
      <div style={{ fontSize: '10px', color: '#888', fontWeight: '500' }}>{label}</div>
      <div style={{ fontSize: '26px', fontWeight: '700', color: '#222', lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: '10px', color: '#aaa' }}>{sub}</div>}
    </div>
  );
}

const DAY_OPTIONS = ['Day 1', 'Day 2', 'Day 3'];

export default function OperationsDashboard() {
  const { authFetch } = useAuth();

  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');

  const [dayFilter,  setDayFilter]  = useState('Day 1');
  const [areaFilter, setAreaFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const load = useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (dayFilter)  qs.set('day',        dayFilter);
      if (areaFilter) qs.set('area',       areaFilter);
      if (typeFilter) qs.set('order_type', typeFilter);

      const res = await authFetch(
        `${API_BASE}/operations/dashboard/stats${qs.toString() ? `?${qs}` : ''}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to load stats');
      setStats(data);
    } catch (e) {
      setErr(e.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [authFetch, dayFilter, areaFilter, typeFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const socket = getOperationsSocket();
    const refresh = () => load();
    socket.on('operations:changed', refresh);
    socket.on('challans:changed', refresh);
    socket.on('riders:changed', refresh);
    return () => {
      socket.off('operations:changed', refresh);
      socket.off('challans:changed', refresh);
      socket.off('riders:changed', refresh);
    };
  }, [load]);

  const s = stats || {};
  const areas      = s.areas || [];
  const riderSummary = s.rider_summary || [];
  const allAreas   = [...new Set(areas.map(a => a.area).filter(Boolean))];
  const orderTypes = s.order_types || [];

  return (
    <>
      <style>{`
        @media (max-width: 767px) {
          .od-root { padding: 16px 12px 24px !important; overflow: auto !important; }
          .od-stat-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .od-area-table { font-size: 10px !important; }
          .od-rider-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div className="od-root" style={{
        padding: '19px', fontFamily: "'Poppins','Inter',sans-serif",
        display: 'flex', flexDirection: 'column', minHeight: 0,
        height: '100%', overflow: 'hidden', boxSizing: 'border-box',
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', marginBottom: '20px',
          flexWrap: 'wrap', gap: '12px', flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333' }}>
              Operations Dashboard
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#888', fontWeight: '500', lineHeight: 1.45 }}>
              Live delivery overview for the current operation.
            </p>
          </div>
          <button type="button" onClick={load} style={{
            padding: '7px 13px', background: '#fff', color: '#555',
            border: '1px solid #e0e0e0', borderRadius: '6px',
            fontSize: '11px', fontWeight: '600', cursor: 'pointer',
          }}>Refresh</button>
        </div>

        {/* ── Day toggle ── */}
        <div style={{ borderTop: '1px solid #e6e6e6', marginBottom: '12px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', width: '100%', gap: '8px', marginBottom: '12px' }}>
          {DAY_OPTIONS.map((d) => (
            <button key={d} type="button" onClick={() => setDayFilter(d)} style={{ width: '100%', padding: '9px 10px', borderRadius: '8px', border: '1px solid #e0e0e0', background: dayFilter === d ? '#FF5722' : '#fff', color: dayFilter === d ? '#fff' : '#333', fontWeight: 600 }}>{d}</button>
          ))}
        </div>

        {/* ── Secondary filters ── */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ width: 150 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Area / Zone</label>
            <input
              list="operations-general-areas"
              value={areaFilter}
              onChange={e => setAreaFilter(e.target.value)}
              placeholder="All areas"
              style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '11px' }}
            />
            <datalist id="operations-general-areas">
              {allAreas.map(a => <option key={a} value={a}>{a}</option>)}
            </datalist>
          </div>
          <div style={{ width: 150 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Order type</label>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '11px' }}>
              <option value="">All types</option>
              {orderTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {err && (
          <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', marginBottom: '13px', flexShrink: 0, fontSize: '10px', fontWeight: '600' }}>
            {err}
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading…</div>
          ) : (
            <>
              {/* ── Stat cards ── */}
              <div className="od-stat-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
                width: '100%',
                gap: '12px', marginBottom: '24px',
              }}>
                <StatCard label="Total Hissa" value={s.total_hissas} accent="#607D8B" />
                <StatCard label="Pending" value={s.pending} accent="#F57C00" />
                <StatCard label="Rider Assigned" value={s.rider_assigned} accent="#1565C0" />
                <StatCard label="Dispatched" value={s.in_transit} accent="#4527A0" />
                <StatCard label="Delivered" value={s.delivered} accent="#2E7D32" sub={pct(s.delivered, s.total_hissas) + ' complete'} />
                <StatCard label="Returned to Farm" value={s.returned} accent="#C62828" />
              </div>

              {/* ── Area-wise breakdown ── */}
              {areas.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: '600', color: '#333' }}>
                    Area-wise Delivery Breakdown
                  </h3>
                  <div className="od-area-table" style={{ border: '1px solid #ececec', borderRadius: '10px', overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                      <thead>
                        <tr style={{ background: '#fafafa' }}>
                          {['Area', 'Total', 'Delivered', 'Pending', 'In Transit', 'Returned', 'Completion'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '9px 12px', borderBottom: '1px solid #e0e0e0', color: '#555', fontWeight: '600', fontSize: '10px', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {areas.map((a, idx) => (
                          <tr key={a.area || idx} style={{ borderBottom: '1px solid #f3f3f3', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ padding: '9px 12px', fontWeight: '500', color: '#333' }}>{a.area || 'Unknown'}</td>
                            <td style={{ padding: '9px 12px', color: '#555' }}>{a.total}</td>
                            <td style={{ padding: '9px 12px', color: '#2E7D32', fontWeight: '600' }}>{a.delivered}</td>
                            <td style={{ padding: '9px 12px', color: '#F57C00' }}>{a.pending}</td>
                            <td style={{ padding: '9px 12px', color: '#4527A0' }}>{a.in_transit}</td>
                            <td style={{ padding: '9px 12px', color: '#C62828' }}>{a.returned}</td>
                            <td style={{ padding: '9px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ flex: 1, height: '6px', background: '#eee', borderRadius: '3px', overflow: 'hidden', minWidth: '60px' }}>
                                  <div style={{ height: '100%', background: '#2E7D32', width: pct(a.delivered, a.total), borderRadius: '3px', transition: 'width .3s' }} />
                                </div>
                                <span style={{ fontSize: '10px', color: '#555', whiteSpace: 'nowrap' }}>{pct(a.delivered, a.total)}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Per-rider summary strip ── */}
              {riderSummary.length > 0 && (
                <div>
                  <h3 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: '600', color: '#333' }}>
                    Rider Summary
                  </h3>
                  <div className="od-rider-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: '10px',
                  }}>
                    {riderSummary.map(r => (
                      <div key={r.rider_id} style={{
                        background: '#fff', border: '1px solid #e8e8e8',
                        borderRadius: '10px', padding: '12px 14px',
                        display: 'flex', alignItems: 'center', gap: '12px',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                      }}>
                        <div style={{
                          width: '36px', height: '36px', borderRadius: '50%',
                          background: '#FBE9E7', color: '#FF5722',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '13px', fontWeight: '700', flexShrink: 0,
                        }}>
                          {(r.rider_name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: '600', color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.rider_name}
                          </div>
                          <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
                            {r.availability || 'Available'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '14px', flexShrink: 0 }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '14px', fontWeight: '700', color: '#2E7D32' }}>{r.delivered}</div>
                            <div style={{ fontSize: '9px', color: '#aaa' }}>Done</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '14px', fontWeight: '700', color: '#F57C00' }}>{r.pending}</div>
                            <div style={{ fontSize: '9px', color: '#aaa' }}>Left</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}