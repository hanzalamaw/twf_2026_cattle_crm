import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../config/api';
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
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 9px', borderRadius: '999px',
      fontSize: '10px', fontWeight: '600',
      background: bg, color: fg, whiteSpace: 'nowrap',
    }}>
      {st}
    </span>
  );
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '6px 10px', borderRadius: '6px',
  border: '1px solid #e0e0e0', fontSize: '11px', background: '#fff',
};

const DAY_OPTIONS = ['Day 1', 'Day 2', 'Day 3'];
const EXCLUDED_ORDER_TYPES = new Set(['fancy cow', 'cow', 'goat']);
const PAGE_SIZE = 50;

export default function OperationsCustomerSupport() {
  const { authFetch } = useAuth();

  const [allOrders, setAllOrders] = useState([]);
  const [riders, setRiders]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [err, setErr]             = useState('');

  // filters
  const [search,       setSearch]       = useState('');
  const [dayFilter,    setDayFilter]    = useState('Day 1');
  const [statusFilter, setStatusFilter] = useState('');
  const [riderFilter,  setRiderFilter]  = useState('');
  const [areaFilter,   setAreaFilter]   = useState('');
  const [typeFilter,   setTypeFilter]   = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);

  // modal
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    setErr(''); setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (dayFilter) qs.set('day', dayFilter);

      const [ordRes, ridRes] = await Promise.all([
        authFetch(`${API_BASE}/operations/customer-support/orders${qs.toString() ? `?${qs}` : ''}`),
        authFetch(`${API_BASE}/operations/riders`),
      ]);

      const ordData = await ordRes.json().catch(() => ({}));
      const ridData = await ridRes.json().catch(() => ([]));

      if (!ordRes.ok) throw new Error(ordData.message || 'Failed to load orders');

      setAllOrders(ordData.orders || []);
      setRiders(Array.isArray(ridData) ? ridData : (ridData.riders || []));
    } catch (e) {
      setErr(e.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [authFetch, dayFilter]);

  useEffect(() => { load(); }, [load]);

  const resetFilters = () => {
    setSearch(''); setDayFilter('Day 1'); setStatusFilter('');
    setRiderFilter(''); setAreaFilter(''); setTypeFilter('');
  };

  const areas = useMemo(
    () => [...new Set(allOrders.map((o) => o.area).filter(Boolean))].sort(),
    [allOrders]
  );

  const orderTypes = useMemo(
    () => [...new Set(allOrders.map((o) => String(o.order_type || '').trim()).filter(Boolean))]
      .filter((t) => !EXCLUDED_ORDER_TYPES.has(t.toLowerCase()))
      .sort((a, b) => a.localeCompare(b)),
    [allOrders]
  );

  const riderMap = useMemo(() => {
    const m = {};
    riders.forEach((r) => { m[r.rider_id] = r.rider_name; });
    return m;
  }, [riders]);

  const filteredOrders = useMemo(() => {
    let list = allOrders;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((o) => {
        const hay = [
          o.booking_name, o.shareholder_name, o.contact, o.alt_contact,
          o.address, o.area, o.cow_number && `cow ${o.cow_number}`,
          o.order_id && String(o.order_id),
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    if (statusFilter) list = list.filter((o) => (o.delivery_status || 'Pending') === statusFilter);
    if (riderFilter)  list = list.filter((o) => String(o.rider_id || '') === riderFilter);
    if (areaFilter)   list = list.filter((o) => o.area === areaFilter);
    if (typeFilter)   list = list.filter((o) => String(o.order_type || '').trim() === typeFilter);
    return list;
  }, [allOrders, search, statusFilter, riderFilter, areaFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const pagedOrders = useMemo(
    () => filteredOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredOrders, page]
  );
  useEffect(() => { setPage(1); }, [search, dayFilter, statusFilter, riderFilter, areaFilter, typeFilter]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

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
        <div className="cs-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333' }}>Customer Support</h2>
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#888', fontWeight: '500', lineHeight: 1.45, maxWidth: '760px' }}>
              Look up any order, check delivery status, and see which rider is assigned. Click a row to view full order details.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={load} style={{ padding: '7px 13px', background: '#fff', color: '#555', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>Refresh</button>
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
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Search (name, phone, address, cow no., order ID)</label>
            <input type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={inputStyle} />
          </div>

          {[
            { label: 'Status',     value: statusFilter, set: setStatusFilter, opts: ALL_STATUSES.map((s) => ({ v: s, l: s })) },
            { label: 'Rider',      value: riderFilter,  set: setRiderFilter,  opts: riders.map((r) => ({ v: String(r.rider_id), l: r.rider_name })) },
            { label: 'Area',       value: areaFilter,   set: setAreaFilter,   opts: areas.map((a) => ({ v: a, l: a })) },
            { label: 'Order type', value: typeFilter,   set: setTypeFilter,   opts: orderTypes.map((t) => ({ v: t, l: t })) },
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
                { label: 'Status',     value: statusFilter, set: setStatusFilter, opts: ALL_STATUSES.map((s) => ({ v: s, l: s })) },
                { label: 'Rider',      value: riderFilter,  set: setRiderFilter,  opts: riders.map((r) => ({ v: String(r.rider_id), l: r.rider_name })) },
                { label: 'Area',       value: areaFilter,   set: setAreaFilter,   opts: areas.map((a) => ({ v: a, l: a })) },
                { label: 'Order type', value: typeFilter,   set: setTypeFilter,   opts: orderTypes.map((t) => ({ v: t, l: t })) },
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

        {err && (
          <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', marginBottom: '13px', flexShrink: 0, fontSize: '10px', fontWeight: '600' }}>{err}</div>
        )}

        {/* Result count */}
        {!loading && (
          <div style={{ fontSize: '10px', color: '#999', marginBottom: '8px', flexShrink: 0 }}>
            Showing {filteredOrders.length} of {allOrders.length} order{allOrders.length !== 1 ? 's' : ''}
          </div>
        )}

        {/* Table */}
        <div className="cs-table-wrap" style={{ flex: 1, minHeight: 0, overflow: 'auto', borderRadius: '10px', border: '1px solid #ececec' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading…</div>
          ) : filteredOrders.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666', fontSize: '11px' }}>
              {allOrders.length === 0 ? 'No orders found.' : 'No orders match the current filters.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: '#fafafa' }}>
                  {[
                    'Order ID', 'Customer', 'Shareholder', 'Phone', 'Alt Phone',
                    'Address', 'Area', 'Day / Slot', 'Type', 'Cow #', 'Hissa #',
                    'Standard', 'Premium', 'Goat (Hissa)', 'Rider', 'Status',
                  ].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 10px', borderBottom: '1px solid #e0e0e0', color: '#555', fontWeight: '600', whiteSpace: 'nowrap', fontSize: '10px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedOrders.map((o, idx) => {
                  const type = String(o.order_type || '').trim().toLowerCase();
                  const isGoat     = type.includes('goat');
                  const isPremium  = type.includes('premium');
                  const isStandard = !isGoat && !isPremium;

                  return (
                    <tr
                      key={o.order_id}
                      style={{ borderBottom: '1px solid #f3f3f3', background: idx % 2 === 0 ? '#fff' : '#FAFAFA', cursor: 'pointer' }}
                      onClick={() => setModal(o)}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f5f9ff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#FAFAFA'; }}
                    >
                      <td style={{ padding: '9px 10px', color: '#777', fontWeight: '500' }}>#{o.order_id}</td>
                      <td style={{ padding: '9px 10px', fontWeight: '500', color: '#333' }}>{o.booking_name || '—'}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{o.shareholder_name || '—'}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{o.contact || '—'}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>
                        {o.alt_contact && o.alt_contact !== o.contact
                          ? o.alt_contact
                          : <span style={{ color: '#ccc' }}>—</span>}
                      </td>
                      <td style={{ padding: '9px 10px', color: '#555', maxWidth: '200px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.address || '—'}</div>
                      </td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{o.area || '—'}</td>
                      <td style={{ padding: '9px 10px', color: '#555', whiteSpace: 'nowrap' }}>
                        <div>{o.day || '—'}</div>
                        {o.slot && <div style={{ fontSize: '9px', color: '#aaa' }}>{o.slot}</div>}
                      </td>
                      <td style={{ padding: '9px 10px', color: '#555', whiteSpace: 'nowrap' }}>{o.order_type || '—'}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{o.cow_number ? `Cow ${o.cow_number}` : <span style={{ color: '#ccc' }}>—</span>}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{o.hissa_number ? `Hissa ${o.hissa_number}` : <span style={{ color: '#ccc' }}>—</span>}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{isStandard ? 1 : 0}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{isPremium ? 1 : 0}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{isGoat ? 1 : 0}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>
                        {o.rider_id
                          ? (riderMap[o.rider_id] || `Rider #${o.rider_id}`)
                          : <span style={{ color: '#bbb', fontStyle: 'italic' }}>Unassigned</span>}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        <StatusBadge status={o.delivery_status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && filteredOrders.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', paddingTop: '10px', flexShrink: 0 }}>
            <span style={{ fontSize: '10px', color: '#999' }}>Showing {pagedOrders.length} of {filteredOrders.length} orders</span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
              <span style={{ fontSize: '10px' }}>Page {page}/{totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Order detail modal — view only, no editing */}
      {modal && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
          onClick={() => setModal(null)}
          role="presentation"
        >
          <div
            style={{ background: '#FFFFFF', borderRadius: '18px', border: '1.5px solid #F0F0F0', padding: '20px', maxWidth: '480px', width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.12)' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={`Order #${modal.order_id} details`}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#333' }}>Order #{modal.order_id}</h2>
              <button type="button" onClick={() => setModal(null)} style={{ background: 'none', border: 'none', fontSize: '24px', color: '#888', cursor: 'pointer', padding: '0', width: '30px', height: '30px', lineHeight: 1 }}>×</button>
            </div>

            {/* Status badge */}
            <div style={{ marginBottom: '16px' }}>
              <StatusBadge status={modal.delivery_status} />
            </div>

            {/* Info rows */}
            {[
              ['Customer',    modal.booking_name || '—'],
              ['Shareholder', modal.shareholder_name || '—'],
              ['Phone',       modal.contact || '—'],
              ['Alt Phone',   modal.alt_contact && modal.alt_contact !== modal.contact ? modal.alt_contact : null],
              ['Address',     modal.address || '—'],
              ['Area',        modal.area || '—'],
              ['Day',         modal.day || '—'],
              ['Slot',        modal.slot || null],
              ['Order Type',  modal.order_type || '—'],
              ['Cow #',       modal.cow_number ? `Cow ${modal.cow_number}` : null],
              ['Hissa #',     modal.hissa_number ? `Hissa ${modal.hissa_number}` : null],
              ['Rider',       modal.rider_id ? (riderMap[modal.rider_id] || `Rider #${modal.rider_id}`) : 'Unassigned'],
            ]
              .filter(([, v]) => v !== null)
              .map(([label, value]) => (
                <div key={label} style={{ display: 'flex', gap: '8px', marginBottom: '8px', fontSize: '11px' }}>
                  <span style={{ fontWeight: '600', minWidth: '90px', flexShrink: 0, color: '#555' }}>{label}:</span>
                  <span style={{ color: value === 'Unassigned' ? '#bbb' : '#333', fontStyle: value === 'Unassigned' ? 'italic' : 'normal' }}>{value}</span>
                </div>
              ))
            }

            {/* Close */}
            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button type="button" onClick={() => setModal(null)}
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