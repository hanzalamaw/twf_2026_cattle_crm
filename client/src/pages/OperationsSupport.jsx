import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../config/api';
import { getOperationsSocket } from '../utils/operationsSocket';
import { useAuth } from '../context/AuthContext';

const ALL_STATUSES = ['Pending', 'Rider Assigned', 'Dispatched', 'Delivered', 'Returned to Farm'];

const STATUS_STYLES = {
  Pending:            { bg: '#F5F5F5', fg: '#666' },
  'Rider Assigned':   { bg: '#FFF8E1', fg: '#F57C00' },
  Dispatched:         { bg: '#E3F2FD', fg: '#1565C0' },
  Delivered:          { bg: '#E8F5E9', fg: '#2E7D32' },
  'Returned to Farm': { bg: '#FFEBEE', fg: '#C62828' },
};

function StatusBadge({ status }) {
  const st = status || 'Pending';
  const { bg, fg } = STATUS_STYLES[st] || STATUS_STYLES.Pending;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: '999px', fontSize: '10px', fontWeight: '600', background: bg, color: fg, whiteSpace: 'nowrap' }}>
      {st}
    </span>
  );
}

const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px', background: '#fff' };
const DAY_OPTIONS = ['Day 1', 'Day 2', 'Day 3'];
const PAGE_SIZE = 50;

export default function OperationsCustomerSupport() {
  const { authFetch } = useAuth();

  const [groups,        setGroups]        = useState([]);
  const [riders,        setRiders]        = useState([]);
  const [batches,       setBatches]       = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [err,           setErr]           = useState('');

  const [search,       setSearch]       = useState('');
  const [dayFilter,    setDayFilter]    = useState('Day 1');
  const [statusFilter, setStatusFilter] = useState('');
  const [riderFilter,  setRiderFilter]  = useState('');
  const [areaFilter,   setAreaFilter]   = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);

  const [modal,      setModal]      = useState(null);
  const [modalData,  setModalData]  = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  const loadBatches = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/operations/batches`);
      if (!res.ok) return;
      const data = await res.json();
      setBatches(data.batches || []);
      if (data.batches?.length && selectedBatch === null) setSelectedBatch(data.batches[0].batch_id);
    } catch { /* silent */ }
  }, [authFetch, selectedBatch]);

  const load = useCallback(async () => {
    if (selectedBatch === null) return;
    setErr(''); setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set('batch_id', selectedBatch);
      if (dayFilter) qs.set('day', dayFilter);

      const [gRes, ridRes] = await Promise.all([
        authFetch(`${API_BASE}/operations/deliveries/groups?${qs}`),
        authFetch(`${API_BASE}/operations/riders`),
      ]);

      const gData = await gRes.json().catch(() => ({}));
      const ridData = await ridRes.json().catch(() => ([]));

      if (!gRes.ok) throw new Error(gData.message || 'Failed to load groups');

      setGroups(gData.groups || []);
      setRiders(Array.isArray(ridData) ? ridData : (ridData.riders || []));
    } catch (e) {
      setErr(e.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [authFetch, selectedBatch, dayFilter]);

  useEffect(() => { loadBatches(); }, []);
  useEffect(() => { if (selectedBatch !== null) load(); }, [load, selectedBatch]);

  useEffect(() => {
    const socket = getOperationsSocket();
    const refresh = () => { loadBatches(); if (selectedBatch !== null) load(); };
    socket.on('operations:changed', refresh);
    socket.on('challans:changed', refresh);
    socket.on('riders:changed', refresh);
    return () => {
      socket.off('operations:changed', refresh);
      socket.off('challans:changed', refresh);
      socket.off('riders:changed', refresh);
    };
  }, [load, loadBatches, selectedBatch]);

  const riderMap = useMemo(() => {
    const m = {};
    riders.forEach((r) => { m[r.rider_id] = r.rider_name; });
    return m;
  }, [riders]);

  const areas = useMemo(
    () => [...new Set(groups.map((g) => g.area).filter(Boolean))].sort(),
    [groups]
  );

  const filteredGroups = useMemo(() => {
    let list = groups;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((g) => {
        const hay = [
          g.address, g.area,
          ...(g.booking_names || []),
          ...(g.shareholder_names || []),
          ...(g.contacts || []),
          ...(g.customer_ids || []).map(String),
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    if (statusFilter) list = list.filter((g) => (g.derived_status || 'Pending') === statusFilter);
    if (riderFilter)  list = list.filter((g) => String(g.rider_id || '') === riderFilter);
    if (areaFilter)   list = list.filter((g) => g.area === areaFilter);
    return list;
  }, [groups, search, statusFilter, riderFilter, areaFilter]);

  const totalPages  = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE));
  const pagedGroups = useMemo(() => filteredGroups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filteredGroups, page]);
  useEffect(() => { setPage(1); }, [search, dayFilter, statusFilter, riderFilter, areaFilter, selectedBatch]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const resetFilters = () => { setSearch(''); setDayFilter('Day 1'); setStatusFilter(''); setRiderFilter(''); setAreaFilter(''); };

  const openModal = async (g) => {
    if (!g.qr_token) { setModal(g); setModalData(null); return; }
    setModal(g);
    setModalLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/by-token/${encodeURIComponent(g.qr_token)}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setModalData(data);
    } catch { /* silent */ } finally { setModalLoading(false); }
  };

  return (
    <>
      <style>{`
        @media (max-width: 767px) {
          .cs-root { padding: 16px 12px 24px !important; overflow: auto !important; }
          .cs-header { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; margin-bottom: 12px !important; }
          .cs-filter-desktop { display: none !important; }
          .cs-filter-toggle { display: flex !important; }
          .cs-filter-mobile { display: block !important; }
          .cs-table-wrap { display: block !important; }
        }
      `}</style>

      <div className="cs-root" style={{ padding: '19px', fontFamily: "'Poppins','Inter',sans-serif", display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>

        {/* Header */}
        <div className="cs-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333' }}>Customer Support</h2>
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#888', fontWeight: '500', lineHeight: 1.45, maxWidth: '760px' }}>
              Look up any challan group, check delivery status, and see which rider is assigned. Click a row to view full details.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" onClick={load} style={{ padding: '7px 13px', background: '#fff', color: '#555', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>Refresh</button>
            {batches.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '11px', color: '#666', whiteSpace: 'nowrap' }}>Batch:</label>
                <select
                  value={selectedBatch ?? ''}
                  onChange={(e) => setSelectedBatch(Number(e.target.value))}
                  style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #e0e0e0', background: '#fff', fontSize: '11px', fontWeight: '600', color: '#333', cursor: 'pointer' }}
                >
                  {batches.map((b) => (
                    <option key={b.batch_id} value={b.batch_id}>{b.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Day selector */}
        <div style={{ borderTop: '1px solid #e6e6e6', marginBottom: '12px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', width: '100%', gap: '8px', marginBottom: '12px' }}>
          {DAY_OPTIONS.map((d) => (
            <button key={d} type="button" onClick={() => setDayFilter(d)}
              style={{ width: '100%', padding: '9px 10px', borderRadius: '8px', border: '1px solid #e0e0e0', background: dayFilter === d ? '#FF5722' : '#fff', color: dayFilter === d ? '#fff' : '#333', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}>
              {d}
            </button>
          ))}
        </div>

        {/* Desktop filters */}
        <div className="cs-filter-desktop" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', alignItems: 'flex-end', minWidth: 0, flexShrink: 0 }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Search (name, phone, address, customer ID)</label>
            <input type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={inputStyle} />
          </div>
          {[
            { label: 'Status', value: statusFilter, set: setStatusFilter, opts: ALL_STATUSES.map((s) => ({ v: s, l: s })) },
            { label: 'Rider',  value: riderFilter,  set: setRiderFilter,  opts: riders.map((r) => ({ v: String(r.rider_id), l: r.rider_name })) },
            { label: 'Area',   value: areaFilter,   set: setAreaFilter,   opts: areas.map((a) => ({ v: a, l: a })) },
          ].map(({ label, value, set, opts }) => (
            <div key={label} style={{ width: 130 }}>
              <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>{label}</label>
              <select value={value} onChange={(e) => set(e.target.value)} style={inputStyle}>
                <option value="">All</option>
                {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          ))}
          <button type="button" onClick={resetFilters} style={{ padding: '6px 13px', height: '29px', background: '#fff', color: '#555', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>Reset</button>
        </div>

        {/* Mobile filter toggle */}
        <div className="cs-filter-toggle" style={{ display: 'none', gap: '8px', marginBottom: '8px', flexShrink: 0, alignItems: 'center' }}>
          <input type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px' }} />
          <button type="button" onClick={() => setMobileFiltersOpen((v) => !v)}
            style={{ padding: '9px 12px', borderRadius: '8px', border: `1px solid ${mobileFiltersOpen ? '#FF5722' : '#e0e0e0'}`, background: mobileFiltersOpen ? '#fff4f0' : '#fff', color: mobileFiltersOpen ? '#FF5722' : '#555', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>⚙ Filters</button>
        </div>

        <div className="cs-filter-mobile" style={{ display: 'none' }}>
          {mobileFiltersOpen && (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px', marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { label: 'Status', value: statusFilter, set: setStatusFilter, opts: ALL_STATUSES.map((s) => ({ v: s, l: s })) },
                { label: 'Rider',  value: riderFilter,  set: setRiderFilter,  opts: riders.map((r) => ({ v: String(r.rider_id), l: r.rider_name })) },
                { label: 'Area',   value: areaFilter,   set: setAreaFilter,   opts: areas.map((a) => ({ v: a, l: a })) },
              ].map(({ label, value, set, opts }) => (
                <div key={label}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>{label}</label>
                  <select value={value} onChange={(e) => set(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px' }}>
                    <option value="">All</option>
                    {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => setMobileFiltersOpen(false)} style={{ flex: 1, padding: '10px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Done</button>
                <button type="button" onClick={() => { resetFilters(); setMobileFiltersOpen(false); }} style={{ flex: 1, padding: '10px', background: '#fff', color: '#555', border: '1px solid #e0e0e0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>Reset</button>
              </div>
            </div>
          )}
        </div>

        {err && <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', marginBottom: '13px', flexShrink: 0, fontSize: '10px', fontWeight: '600' }}>{err}</div>}

        {!loading && (
          <div style={{ fontSize: '10px', color: '#999', marginBottom: '8px', flexShrink: 0 }}>
            Showing {filteredGroups.length} of {groups.length} group{groups.length !== 1 ? 's' : ''}
          </div>
        )}

        {/* Table — same columns as Deliveries */}
        <div className="cs-table-wrap" style={{ flex: 1, minHeight: 0, overflow: 'auto', borderRadius: '10px', border: '1px solid #ececec' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading…</div>
          ) : filteredGroups.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666', fontSize: '11px' }}>
              {groups.length === 0 ? 'No groups found.' : 'No groups match the current filters.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: '#fafafa' }}>
                  {['Status', 'Rider', 'Customer ID', 'Booking Name', 'Address', 'Phone', 'Alt Phone', 'Day / Slot', 'Area', 'Standard', 'Premium', 'Goat (Hissa)', 'Total Hissa'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 10px', borderBottom: '1px solid #e0e0e0', color: '#555', fontWeight: '600', whiteSpace: 'nowrap', fontSize: '10px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedGroups.map((g, idx) => {
                  const st = g.derived_status || 'Pending';
                  return (
                    <tr key={g.group_key || g.challan_id}
                      style={{ borderBottom: '1px solid #f3f3f3', background: idx % 2 === 0 ? '#fff' : '#FAFAFA', cursor: 'pointer' }}
                      onClick={() => openModal(g)}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f5f9ff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#FAFAFA'; }}
                    >
                      <td style={{ padding: '9px 10px' }}><StatusBadge status={st} /></td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>
                        {g.rider_count > 1
                          ? <span style={{ color: '#777', fontWeight: 600 }}>Multiple Riders</span>
                          : (g.rider_id
                            ? (riderMap[g.rider_id] || `Rider #${g.rider_id}`)
                            : <span style={{ color: '#bbb', fontStyle: 'italic' }}>Unassigned</span>)}
                      </td>
                      <td style={{ padding: '9px 10px', color: '#777', fontWeight: '500' }}>{(g.customer_ids || []).join(', ') || '—'}</td>
                      <td style={{ padding: '9px 10px', fontWeight: '500', color: '#333' }}>{(g.booking_names || []).join(', ') || '—'}</td>
                      <td style={{ padding: '9px 10px', color: '#555', maxWidth: '200px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.address || '—'}</div>
                      </td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{(g.contacts || []).join(', ') || '—'}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>
                        {(g.alt_contacts || []).filter(Boolean).join(', ') || <span style={{ color: '#ccc' }}>—</span>}
                      </td>
                      <td style={{ padding: '9px 10px', color: '#555', whiteSpace: 'nowrap' }}>
                        <div>{g.day || '—'}</div>
                        {(g.slots || []).length > 0 && <div style={{ fontSize: '9px', color: '#aaa' }}>{g.slots.join(', ')}</div>}
                      </td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{g.area || '—'}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{g.standard_hissa_count || 0}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{g.premium_hissa_count || 0}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{g.goat_hissa_count || 0}</td>
                      <td style={{ padding: '9px 10px', color: '#555', fontWeight: '600' }}>{g.hissa_count || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && filteredGroups.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', paddingTop: '10px', flexShrink: 0 }}>
            <span style={{ fontSize: '10px', color: '#999' }}>Showing {pagedGroups.length} of {filteredGroups.length} groups</span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
              <span style={{ fontSize: '10px' }}>Page {page}/{totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Challan detail modal — view only */}
      {modal && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
          onClick={() => { setModal(null); setModalData(null); }}
          role="presentation"
        >
          <div
            style={{ background: '#FFFFFF', borderRadius: '18px', border: '1.5px solid #F0F0F0', padding: '20px', maxWidth: '620px', width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.12)' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={`Challan #${modalData?.challan?.challan_id || modal.challan_id}`}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#333' }}>
                Challan #{modalData?.challan?.challan_id || modal.challan_id}
              </h2>
              <button type="button" onClick={() => { setModal(null); setModalData(null); }} style={{ background: 'none', border: 'none', fontSize: '24px', color: '#888', cursor: 'pointer', padding: '0', width: '30px', height: '30px', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <StatusBadge status={modalData?.challan?.derived_status || modal.derived_status} />
            </div>

            {[
              ['Address',   modal.address || '—'],
              ['Area',      modal.area || '—'],
              ['Day',       modal.day || '—'],
              ['Slot',      (modal.slots || []).join(', ') || modal.slot || '—'],
              ['Rider',     modal.rider_count > 1 ? 'Multiple Riders' : (modal.rider_id ? (riderMap[modal.rider_id] || `Rider #${modal.rider_id}`) : 'Unassigned')],
              ['Standard',  String(modal.standard_hissa_count || 0)],
              ['Premium',   String(modal.premium_hissa_count || 0)],
              ['Goat',      String(modal.goat_hissa_count || 0)],
              ['Total Hissa', String(modal.hissa_count || 0)],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', gap: '8px', marginBottom: '8px', fontSize: '11px' }}>
                <span style={{ fontWeight: '600', minWidth: '90px', flexShrink: 0, color: '#555' }}>{label}:</span>
                <span style={{ color: value === 'Unassigned' ? '#bbb' : '#333', fontStyle: value === 'Unassigned' ? 'italic' : 'normal' }}>{value}</span>
              </div>
            ))}

            {/* Orders sub-table from detail fetch */}
            {modalLoading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '11px' }}>Loading order details…</div>
            ) : modalData?.orders?.length > 0 && (
              <>
                <div style={{ borderTop: '1px solid #f0f0f0', margin: '14px 0 10px' }} />
                <p style={{ margin: '0 0 8px', fontSize: '11px', fontWeight: '600', color: '#333' }}>Orders on this challan</p>
                <div style={{ maxHeight: '280px', overflow: 'auto', border: '1px solid #F0F0F0', borderRadius: '8px' }}>
                  <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0 }}>
                      <tr style={{ background: '#FAFAFA' }}>
                        {['Order', 'Contact', 'Alt Contact', 'Type', 'Cow #', 'Hissa #', 'Slot', 'Description', 'Status'].map((h) => (
                          <th key={h} style={{ textAlign: 'left', padding: '8px', fontWeight: '600', color: '#555', borderBottom: '1px solid #E0E0E0', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {modalData.orders.map((o, i) => (
                        <tr key={o.order_id} style={{ borderBottom: '1px solid #F0F0F0', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                          <td style={{ padding: '8px', color: '#777' }}>#{o.order_id}</td>
                          <td style={{ padding: '8px', color: '#555' }}>{o.contact || '—'}</td>
                          <td style={{ padding: '8px', color: '#555' }}>{o.alt_contact || '—'}</td>
                          <td style={{ padding: '8px', color: '#555', whiteSpace: 'nowrap' }}>{o.order_type || '—'}</td>
                          <td style={{ padding: '8px', color: '#555' }}>{o.cow_number ? `Cow ${o.cow_number}` : '—'}</td>
                          <td style={{ padding: '8px', color: '#555' }}>{o.hissa_number ? `Hissa ${o.hissa_number}` : '—'}</td>
                          <td style={{ padding: '8px', color: '#555', whiteSpace: 'nowrap' }}>{o.slot || '—'}</td>
                          <td style={{ padding: '8px', color: '#555', maxWidth: '100px' }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.description || ''}>{o.description || '—'}</div>
                          </td>
                          <td style={{ padding: '8px' }}><StatusBadge status={o.delivery_status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button type="button" onClick={() => { setModal(null); setModalData(null); }}
                style={{ padding: '9px 20px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}