import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE as API } from '../config/api';
const fmt = (n) => Number(n || 0).toLocaleString('en-PK');

const Modal = ({ show, onClose, title, children }) => {
  if (!show) return null;
  return (
    <div className="pa-modal-wrap" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div className="pa-modal-box" style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 440, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.2)', border: '1px solid #e5e7eb' }} onClick={(e) => e.stopPropagation()}>
        {/* Mobile drag handle */}
        <div className="pa-drag-handle" style={{ display: 'none', width: 40, height: 4, background: '#e0e0e0', borderRadius: 2, margin: '12px auto 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{title}</span>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: '#6b7280', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
};

export default function PerformanceAdmin() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const [performers, setPerformers] = useState([]);
  const [users, setUsers] = useState([]);
  const [dailyReports, setDailyReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showPerformerModal, setShowPerformerModal] = useState(false);
  const [editingPerformer, setEditingPerformer] = useState(null);
  const [performerForm, setPerformerForm] = useState({ display_name: '', user_id: '', calls_target: '', leads_target: '', orders_target: '' });

  const [showDailyModal, setShowDailyModal] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [dailyForm, setDailyForm] = useState({ performer_id: '', date: '', calls_done: '', leads_generated: '', orders_confirmed: '' });

  const [dailyFilterPerformer, setDailyFilterPerformer] = useState('');

  const hdrs = () => ({ Authorization: `Bearer ${token}` });

  const fetchPerformers = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/api/performance/performers`, { headers: hdrs() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed');
      setPerformers(await res.json());
    } catch (e) { setError(e.message); }
  }, [authFetch]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/api/control/users`, { headers: hdrs() });
      if (res.ok) setUsers(await res.json());
    } catch (e) { console.error(e); }
  }, [authFetch]);

  const fetchDailyReports = useCallback(async () => {
    try {
      let url = `${API}/api/performance/daily-reports?`;
      if (dailyFilterPerformer) url += `performer_id=${dailyFilterPerformer}&`;
      const res = await authFetch(url, { headers: hdrs() });
      if (!res.ok) throw new Error('Failed to load daily reports');
      setDailyReports(await res.json());
    } catch (e) { setError(e.message); }
  }, [authFetch, dailyFilterPerformer]);

  useEffect(() => { setLoading(true); setError(''); Promise.all([fetchPerformers(), fetchUsers()]).finally(() => setLoading(false)); }, [fetchPerformers, fetchUsers]);
  useEffect(() => { fetchDailyReports(); }, [fetchDailyReports]);

  const summaryStats = useMemo(() => {
    const totalTargetCalls = performers.reduce((s, p) => s + (Number(p.calls_target) || 0), 0);
    const totalTargetLeads = performers.reduce((s, p) => s + (Number(p.leads_target) || 0), 0);
    const totalTargetOrders = performers.reduce((s, p) => s + (Number(p.orders_target) || 0), 0);
    const latestDate = dailyReports.length > 0 ? dailyReports.reduce((latest, r) => { const d = String(r.date).slice(0, 10); return d > latest ? d : latest; }, '0000-00-00') : null;
    return { totalTargetCalls, totalTargetLeads, totalTargetOrders, latestDate, reportCount: dailyReports.length };
  }, [performers, dailyReports]);

  const linkedUserIds = useMemo(() => new Set(performers.map((p) => p.user_id)), [performers]);

  const fmtDate = (d) => {
    if (!d) return '—';
    const s = String(d).slice(0, 10);
    const [y, m, day] = s.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${parseInt(day)} ${months[parseInt(m) - 1]} ${y}`;
  };

  const todayLocalDateString = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const validateTargets = (calls, leads, orders) => {
    const c = Number(calls) || 0, l = Number(leads) || 0, o = Number(orders) || 0;
    if (c <= l) return 'Calls target must be greater than leads target.';
    if (c <= o) return 'Calls target must be greater than orders target.';
    if (l <= o) return 'Leads target must be greater than orders target.';
    return null;
  };

  const openAddPerformer = () => { setEditingPerformer(null); setPerformerForm({ display_name: '', user_id: '', calls_target: '', leads_target: '', orders_target: '' }); setShowPerformerModal(true); };
  const openEditPerformer = (p) => { setEditingPerformer(p); setPerformerForm({ display_name: p.display_name || '', user_id: p.user_id, calls_target: p.calls_target ?? '', leads_target: p.leads_target ?? '', orders_target: p.orders_target ?? '' }); setShowPerformerModal(true); };

  const submitPerformer = async (e) => {
    e.preventDefault(); setError('');
    const payload = { display_name: performerForm.display_name.trim(), user_id: Number(performerForm.user_id) || null, calls_target: Number(performerForm.calls_target) || 0, leads_target: Number(performerForm.leads_target) || 0, orders_target: Number(performerForm.orders_target) || 0 };
    if (!payload.display_name || !payload.user_id) { setError('Display name and user are required.'); return; }
    const targetError = validateTargets(payload.calls_target, payload.leads_target, payload.orders_target);
    if (targetError) { setError(targetError); return; }
    try {
      const url = editingPerformer ? `${API}/api/performance/performers/${editingPerformer.performer_id}` : `${API}/api/performance/performers`;
      const res = await authFetch(url, { method: editingPerformer ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', ...hdrs() }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Request failed');
      setSuccess(editingPerformer ? 'Performer updated.' : 'Performer added.');
      setShowPerformerModal(false); fetchPerformers();
    } catch (e) { setError(e.message); }
  };

  const deletePerformer = async (id) => {
    if (!window.confirm('Delete this performer and all their daily reports?')) return;
    try {
      const res = await authFetch(`${API}/api/performance/performers/${id}`, { method: 'DELETE', headers: hdrs() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Delete failed');
      setSuccess('Performer deleted.'); fetchPerformers(); fetchDailyReports();
    } catch (e) { setError(e.message); }
  };

  const openAddDaily = () => {
    setEditingReport(null);
    setDailyForm({ performer_id: performers[0]?.performer_id || '', date: todayLocalDateString(), calls_done: '', leads_generated: '', orders_confirmed: '' });
    setShowDailyModal(true);
  };
  const openEditReport = (r) => { setEditingReport(r); setDailyForm({ performer_id: r.performer_id, date: String(r.date).slice(0, 10), calls_done: r.calls_done ?? '', leads_generated: r.leads_generated ?? '', orders_confirmed: r.orders_confirmed ?? '' }); setShowDailyModal(true); };

  const submitDaily = async (e) => {
    e.preventDefault(); setError('');
    const payload = { performer_id: Number(dailyForm.performer_id), date: dailyForm.date, calls_done: Number(dailyForm.calls_done) || 0, leads_generated: Number(dailyForm.leads_generated) || 0, orders_confirmed: Number(dailyForm.orders_confirmed) || 0 };
    if (!payload.performer_id || !payload.date) { setError('Performer and date are required.'); return; }
    try {
      if (editingReport) {
        const res = await authFetch(`${API}/api/performance/daily-reports/${editingReport.report_id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...hdrs() }, body: JSON.stringify({ date: payload.date, calls_done: payload.calls_done, leads_generated: payload.leads_generated, orders_confirmed: payload.orders_confirmed }) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Update failed');
        setSuccess('Daily report updated.');
      } else {
        const res = await authFetch(`${API}/api/performance/daily-reports`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...hdrs() }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Add failed');
        setSuccess('Daily report added.');
      }
      setShowDailyModal(false); fetchDailyReports();
    } catch (e) { setError(e.message); }
  };

  const deleteReport = async (id) => {
    if (!window.confirm('Delete this daily report?')) return;
    try {
      const res = await authFetch(`${API}/api/performance/daily-reports/${id}`, { method: 'DELETE', headers: hdrs() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Delete failed');
      setSuccess('Daily report deleted.'); fetchDailyReports();
    } catch (e) { setError(e.message); }
  };

  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(''), 3000); return () => clearTimeout(t); } }, [success]);
  useEffect(() => { if (error) { const t = setTimeout(() => setError(''), 5000); return () => clearTimeout(t); } }, [error]);

  const s = {
    page: { padding: 19, fontFamily: "'Poppins','Inter',sans-serif", width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflow: 'auto' },
    headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 },
    title: { margin: 0, fontSize: 14, fontWeight: 600, color: '#111827' },
    btnPrimary: { padding: '5px 12px', fontSize: 11, fontWeight: 600, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' },
    btnSecondary: { padding: '5px 12px', fontSize: 11, fontWeight: 500, background: '#fff', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' },
    alert: (type) => ({ padding: '8px 12px', borderRadius: 6, marginBottom: 10, fontSize: 10, fontWeight: 500, ...(type === 'error' ? { background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' } : { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }) }),
    summaryRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 },
    summaryCard: { padding: '10px 14px', borderRadius: 8, border: '1px solid #f1f1f1', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' },
    summaryLabel: { fontSize: 10, color: '#6b7280', marginBottom: 2, fontWeight: 400 },
    summaryValue: { fontSize: 15, fontWeight: 700, color: '#111827', lineHeight: 1.3 },
    section: { background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: 16, overflow: 'hidden' },
    sectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', flexWrap: 'wrap', gap: 8 },
    sectionTitle: { margin: 0, fontSize: 12, fontWeight: 600, color: '#111827', letterSpacing: 0.2 },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 10 },
    th: (align = 'left') => ({ padding: '9px 10px', textAlign: align, fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', background: '#f9fafb', whiteSpace: 'nowrap', fontSize: 10 }),
    thNum: { padding: '9px 10px', textAlign: 'center', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', background: '#f9fafb', whiteSpace: 'nowrap', fontSize: 10, width: 36 },
    td: (align = 'left') => ({ padding: '8px 10px', textAlign: align, borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap', color: '#374151' }),
    tdNum: { padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #f3f4f6', color: '#6b7280', width: 36 },
    tdName: { padding: '8px 10px', borderBottom: '1px solid #f3f4f6', fontWeight: 500, color: '#111827', whiteSpace: 'nowrap' },
    tdTarget: { padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #f3f4f6', fontWeight: 600, fontFamily: "'JetBrains Mono','Consolas',monospace", whiteSpace: 'nowrap' },
    tdActions: { padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' },
    actionBtn: (color = '#2563eb') => ({ background: 'none', border: 'none', color, cursor: 'pointer', fontSize: 10, padding: '2px 6px', fontWeight: 500 }),
    empty: { padding: '24px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 11 },
    select: { padding: '5px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 10, minWidth: 130, color: '#374151', background: '#fff' },
    badge: (bg, fg) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: bg, color: fg, fontFamily: "'JetBrains Mono','Consolas',monospace", lineHeight: '16px' }),
  };

  const formField = (label, children) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', marginBottom: 3, fontSize: 10, fontWeight: 500, color: '#6b7280' }}>{label}</label>
      {children}
    </div>
  );

  const inputStyle = { width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 11, boxSizing: 'border-box', color: '#111827' };

  return (
    <div style={s.page}>
      <style>{`
        .pa-tr:hover { background: #f9fafb !important; }
        .pa-act:hover { text-decoration: underline; }

        @media (max-width: 767px) {

          /* Header */
          .pa-header-row       { margin-right: 44px !important; }

          /* Summary grid — 2 col */
          .pa-summary-grid     { grid-template-columns: 1fr 1fr !important; gap: 8px !important; margin-bottom: 12px !important; }
          .pa-summary-card     { padding: 8px 10px !important; }
          .pa-summary-value    { font-size: 13px !important; }

          /* Section heads */
          .pa-section-head     { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }
          .pa-section-head-right { width: 100% !important; }
          .pa-section-head-right select { flex: 1 !important; }

          /* Hide desktop table, show mobile cards */
          .pa-table-wrap       { display: none !important; }
          .pa-mobile-cards     { display: flex !important; }

          /* Modals — bottom sheet */
          .pa-modal-wrap       { align-items: flex-end !important; padding: 0 !important; }
          .pa-modal-box        {
            border-radius: 20px 20px 0 0 !important;
            width: 100vw !important;
            max-width: 100vw !important;
            max-height: 92dvh !important;
          }
          .pa-drag-handle      { display: block !important; }
          .pa-form-grid-3      { grid-template-columns: 1fr !important; }
          .pa-form-grid-2      { grid-template-columns: 1fr !important; }
          .pa-form-actions     { gap: 10px !important; }
          .pa-form-actions button { flex: 1 !important; padding: 13px !important; font-size: 13px !important; border-radius: 10px !important; }
          .pa-modal-input      { font-size: 13px !important; padding: 10px 12px !important; border-radius: 8px !important; }
        }
      `}</style>

      <div className="pa-header-row" style={s.headerRow}>
        <h1 style={s.title}>Performance Admin</h1>
      </div>

      {error && <div style={s.alert('error')}>{error}</div>}
      {success && <div style={s.alert('success')}>{success}</div>}

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#6b7280', fontSize: 11 }}>Loading…</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="pa-summary-grid" style={s.summaryRow}>
            {[
              { label: 'Total Performers', value: performers.length },
              { label: 'Combined Calls Target', value: fmt(summaryStats.totalTargetCalls) },
              { label: 'Combined Leads Target', value: fmt(summaryStats.totalTargetLeads) },
              { label: 'Combined Orders Target', value: fmt(summaryStats.totalTargetOrders) },
              { label: 'Daily Reports', value: fmt(summaryStats.reportCount) },
              { label: 'Latest Report', value: summaryStats.latestDate ? fmtDate(summaryStats.latestDate) : '—', small: true },
            ].map(({ label, value, small }) => (
              <div key={label} className="pa-summary-card" style={s.summaryCard}>
                <div style={s.summaryLabel}>{label}</div>
                <div className="pa-summary-value" style={{ ...s.summaryValue, ...(small ? { fontSize: 13 } : {}) }}>{value}</div>
              </div>
            ))}
          </div>

          {/* ── Performers section ── */}
          <div style={s.section}>
            <div className="pa-section-head" style={s.sectionHead}>
              <h2 style={s.sectionTitle}>Performers & Targets</h2>
              <button type="button" style={s.btnPrimary} onClick={openAddPerformer}>+ Add Performer</button>
            </div>

            {/* Desktop table */}
            <div className="pa-table-wrap" style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.thNum}>#</th>
                    <th style={s.th()}>Performer</th>
                    <th style={s.th()}>Linked User</th>
                    <th style={s.th('right')}>Calls Target</th>
                    <th style={s.th('right')}>Leads Target</th>
                    <th style={s.th('right')}>Orders Target</th>
                    <th style={s.th('center')}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {performers.length === 0 ? (
                    <tr><td colSpan={7} style={s.empty}>No performers yet. Click "Add Performer" to get started.</td></tr>
                  ) : performers.map((p, i) => (
                    <tr key={p.performer_id} className="pa-tr">
                      <td style={s.tdNum}>{i + 1}</td>
                      <td style={s.tdName}>{p.display_name}</td>
                      <td style={s.td()}>{p.username || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.user_id}</td>
                      <td style={s.tdTarget}><span style={s.badge('#f3f4f6', '#374151')}>{fmt(p.calls_target)}</span></td>
                      <td style={s.tdTarget}><span style={s.badge('#f3f4f6', '#374151')}>{fmt(p.leads_target)}</span></td>
                      <td style={s.tdTarget}><span style={s.badge('#f3f4f6', '#374151')}>{fmt(p.orders_target)}</span></td>
                      <td style={s.tdActions}>
                        <button type="button" className="pa-act" style={s.actionBtn('#2563eb')} onClick={() => openEditPerformer(p)}>Edit</button>
                        <button type="button" className="pa-act" style={s.actionBtn('#dc2626')} onClick={() => deletePerformer(p.performer_id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile performer cards */}
            <div className="pa-mobile-cards" style={{ display: 'none', flexDirection: 'column', gap: 10, padding: '10px 12px' }}>
              {performers.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No performers yet. Tap "+ Add Performer" to get started.</div>
              ) : performers.map((p, i) => (
                <div key={p.performer_id} style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e5e7eb', padding: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{p.display_name}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                        {p.username || [p.first_name, p.last_name].filter(Boolean).join(' ') || `User #${p.user_id}`}
                      </div>
                    </div>
                    <span style={{ fontSize: 10, color: '#6b7280', background: '#f3f4f6', borderRadius: 6, padding: '2px 7px', fontWeight: 500 }}>#{i + 1}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px 8px', marginBottom: 12 }}>
                    {[
                      { label: 'Calls', val: fmt(p.calls_target), color: '#2563eb' },
                      { label: 'Leads', val: fmt(p.leads_target), color: '#7c3aed' },
                      { label: 'Orders', val: fmt(p.orders_target), color: '#059669' },
                    ].map(({ label, val, color }) => (
                      <div key={label} style={{ background: '#f9fafb', borderRadius: 8, padding: '7px 8px', textAlign: 'center' }}>
                        <div style={{ fontSize: 9, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "'JetBrains Mono','Consolas',monospace" }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, paddingTop: 10, borderTop: '1px solid #f3f4f6' }}>
                    <button type="button" onClick={() => openEditPerformer(p)} style={{ flex: 1, padding: '9px', background: '#EFF6FF', border: '1px solid #2563eb', borderRadius: 8, color: '#2563eb', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Edit</button>
                    <button type="button" onClick={() => deletePerformer(p.performer_id)} style={{ flex: 1, padding: '9px', background: '#FEF2F2', border: '1px solid #dc2626', borderRadius: 8, color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Daily Reports section ── */}
          <div style={s.section}>
            <div className="pa-section-head" style={s.sectionHead}>
              <h2 style={s.sectionTitle}>Daily Calling & Stats</h2>
              <div className="pa-section-head-right" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select value={dailyFilterPerformer} onChange={(e) => setDailyFilterPerformer(e.target.value)} style={s.select}>
                  <option value="">All performers</option>
                  {performers.map((p) => <option key={p.performer_id} value={p.performer_id}>{p.display_name}</option>)}
                </select>
                <button type="button" style={{ ...s.btnPrimary, opacity: performers.length ? 1 : 0.5 }} onClick={openAddDaily} disabled={!performers.length}>+ Add Report</button>
              </div>
            </div>

            {/* Desktop table */}
            <div className="pa-table-wrap" style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.thNum}>#</th>
                    <th style={s.th()}>Performer</th>
                    <th style={s.th()}>Date</th>
                    <th style={s.th('right')}>Calls Done</th>
                    <th style={s.th('right')}>Leads Generated</th>
                    <th style={s.th('right')}>Orders Confirmed</th>
                    <th style={s.th('center')}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyReports.length === 0 ? (
                    <tr><td colSpan={7} style={s.empty}>No daily reports found.</td></tr>
                  ) : dailyReports.map((r, i) => (
                    <tr key={r.report_id} className="pa-tr">
                      <td style={s.tdNum}>{i + 1}</td>
                      <td style={s.tdName}>{r.display_name}</td>
                      <td style={s.td()}>{fmtDate(r.date)}</td>
                      <td style={s.tdTarget}>{fmt(r.calls_done)}</td>
                      <td style={s.tdTarget}>{fmt(r.leads_generated)}</td>
                      <td style={s.tdTarget}>{fmt(r.orders_confirmed)}</td>
                      <td style={s.tdActions}>
                        <button type="button" className="pa-act" style={s.actionBtn('#2563eb')} onClick={() => openEditReport(r)}>Edit</button>
                        <button type="button" className="pa-act" style={s.actionBtn('#dc2626')} onClick={() => deleteReport(r.report_id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile daily report cards */}
            <div className="pa-mobile-cards" style={{ display: 'none', flexDirection: 'column', gap: 10, padding: '10px 12px' }}>
              {dailyReports.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No daily reports found.</div>
              ) : dailyReports.map((r, i) => (
                <div key={r.report_id} style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e5e7eb', padding: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{r.display_name}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{fmtDate(r.date)}</div>
                    </div>
                    <span style={{ fontSize: 10, color: '#6b7280', background: '#f3f4f6', borderRadius: 6, padding: '2px 7px', fontWeight: 500 }}>#{i + 1}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px 8px', marginBottom: 12 }}>
                    {[
                      { label: 'Calls', val: fmt(r.calls_done), color: '#2563eb' },
                      { label: 'Leads', val: fmt(r.leads_generated), color: '#7c3aed' },
                      { label: 'Orders', val: fmt(r.orders_confirmed), color: '#059669' },
                    ].map(({ label, val, color }) => (
                      <div key={label} style={{ background: '#f9fafb', borderRadius: 8, padding: '7px 8px', textAlign: 'center' }}>
                        <div style={{ fontSize: 9, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "'JetBrains Mono','Consolas',monospace" }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, paddingTop: 10, borderTop: '1px solid #f3f4f6' }}>
                    <button type="button" onClick={() => openEditReport(r)} style={{ flex: 1, padding: '9px', background: '#EFF6FF', border: '1px solid #2563eb', borderRadius: 8, color: '#2563eb', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Edit</button>
                    <button type="button" onClick={() => deleteReport(r.report_id)} style={{ flex: 1, padding: '9px', background: '#FEF2F2', border: '1px solid #dc2626', borderRadius: 8, color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Add/Edit Performer Modal ── */}
      <Modal show={showPerformerModal} onClose={() => setShowPerformerModal(false)} title={editingPerformer ? 'Edit Performer' : 'Add Performer'}>
        <form onSubmit={submitPerformer} style={{ padding: 16 }}>
          {formField('Display Name *',
            <input className="pa-modal-input" type="text" style={inputStyle} value={performerForm.display_name} onChange={(e) => setPerformerForm((f) => ({ ...f, display_name: e.target.value }))} placeholder="e.g. Sales Rep 1" required disabled={!!editingPerformer} />
          )}
          {formField('Linked User *',
            <select className="pa-modal-input" style={inputStyle} value={performerForm.user_id} onChange={(e) => setPerformerForm((f) => ({ ...f, user_id: e.target.value }))} required disabled={!!editingPerformer}>
              <option value="">Select user</option>
              {users.map((u) => {
                const isLinked = linkedUserIds.has(u.user_id);
                const isCurrent = editingPerformer && editingPerformer.user_id === u.user_id;
                if (isLinked && !isCurrent) return null;
                return (
                  <option key={u.user_id} value={u.user_id}>
                    {u.username}{u.first_name || u.last_name ? ` (${[u.first_name, u.last_name].filter(Boolean).join(' ')})` : ''}
                  </option>
                );
              })}
            </select>
          )}
          <div className="pa-form-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {formField('Calls Target', <input className="pa-modal-input" type="number" min="0" style={inputStyle} value={performerForm.calls_target} onChange={(e) => setPerformerForm((f) => ({ ...f, calls_target: e.target.value }))} />)}
            {formField('Leads Target', <input className="pa-modal-input" type="number" min="0" style={inputStyle} value={performerForm.leads_target} onChange={(e) => setPerformerForm((f) => ({ ...f, leads_target: e.target.value }))} />)}
            {formField('Orders Target', <input className="pa-modal-input" type="number" min="0" style={inputStyle} value={performerForm.orders_target} onChange={(e) => setPerformerForm((f) => ({ ...f, orders_target: e.target.value }))} />)}
          </div>
          <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 12 }}>Calls target {'>'} Leads target {'>'} Orders target</div>
          <div className="pa-form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 12, borderTop: '1px solid #f3f4f6' }}>
            <button type="button" style={s.btnSecondary} onClick={() => setShowPerformerModal(false)}>Cancel</button>
            <button type="submit" style={s.btnPrimary}>{editingPerformer ? 'Update' : 'Add Performer'}</button>
          </div>
        </form>
      </Modal>

      {/* ── Add/Edit Daily Report Modal ── */}
      <Modal show={showDailyModal} onClose={() => setShowDailyModal(false)} title={editingReport ? 'Edit Daily Report' : 'Add Daily Report'}>
        <form onSubmit={submitDaily} style={{ padding: 16 }}>
          <div className="pa-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {formField('Performer *',
              <select className="pa-modal-input" style={inputStyle} value={dailyForm.performer_id} onChange={(e) => setDailyForm((f) => ({ ...f, performer_id: e.target.value }))} required disabled={!!editingReport}>
                <option value="">Select performer</option>
                {performers.map((p) => <option key={p.performer_id} value={p.performer_id}>{p.display_name}</option>)}
              </select>
            )}
            {formField('Date *', <input className="pa-modal-input" type="date" style={inputStyle} value={dailyForm.date} onChange={(e) => setDailyForm((f) => ({ ...f, date: e.target.value }))} required />)}
          </div>
          <div className="pa-form-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {formField('Calls Done', <input className="pa-modal-input" type="number" min="0" style={inputStyle} value={dailyForm.calls_done} onChange={(e) => setDailyForm((f) => ({ ...f, calls_done: e.target.value }))} />)}
            {formField('Leads Generated', <input className="pa-modal-input" type="number" min="0" style={inputStyle} value={dailyForm.leads_generated} onChange={(e) => setDailyForm((f) => ({ ...f, leads_generated: e.target.value }))} />)}
            {formField('Orders Confirmed', <input className="pa-modal-input" type="number" min="0" style={inputStyle} value={dailyForm.orders_confirmed} onChange={(e) => setDailyForm((f) => ({ ...f, orders_confirmed: e.target.value }))} />)}
          </div>
          <div className="pa-form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 12, borderTop: '1px solid #f3f4f6' }}>
            <button type="button" style={s.btnSecondary} onClick={() => setShowDailyModal(false)}>Cancel</button>
            <button type="submit" style={s.btnPrimary}>{editingReport ? 'Update' : 'Add Report'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}