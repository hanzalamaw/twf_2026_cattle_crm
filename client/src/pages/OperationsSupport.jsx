import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../config/api';
import { useAuth } from '../context/AuthContext';

const ALL_STATUSES = ['Pending', 'Rider Assigned', 'Dispatched', 'Delivered', 'Returned to Farm'];

const STATUS_STYLES = {
  Pending:            { bg: '#FFF8E1', fg: '#F57C00' },
  'Rider Assigned':   { bg: '#E3F2FD', fg: '#1565C0' },
  Dispatched:         { bg: '#EDE7F6', fg: '#4527A0' },
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
  padding: '6px 10px', borderRadius: '8px',
  border: '1px solid #e0e0e0', fontSize: '11px', background: '#fff',
};

const DAY_OPTIONS = ['Day 1', 'Day 2', 'Day 3'];

export default function OperationsCustomerSupport() {
  const { authFetch } = useAuth();

  const [orders, setOrders]   = useState([]);
  const [riders, setRiders]   = useState([]);
  const [areas, setAreas]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');

  // filters
  const [search,      setSearch]      = useState('');
  const [dayFilter,   setDayFilter]   = useState('');
  const [statusFilter,setStatusFilter]= useState('');
  const [riderFilter, setRiderFilter] = useState('');
  const [areaFilter,  setAreaFilter]  = useState('');
  const [typeFilter,  setTypeFilter]  = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const load = useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (dayFilter)    qs.set('day',         dayFilter);
      if (statusFilter) qs.set('status',      statusFilter);
      if (riderFilter)  qs.set('rider_id',    riderFilter);
      if (areaFilter)   qs.set('area',        areaFilter);
      if (typeFilter)   qs.set('order_type',  typeFilter);
      if (search.trim())qs.set('search',      search.trim());

      const [ordRes, ridRes] = await Promise.all([
        authFetch(`${API_BASE}/operations/customer-support/orders${qs.toString() ? `?${qs}` : ''}`),
        authFetch(`${API_BASE}/operations/riders`),
      ]);

      const ordData = await ordRes.json().catch(() => ({}));
      const ridData = await ridRes.json().catch(() => ([]));

      if (!ordRes.ok) throw new Error(ordData.message || 'Failed to load orders');

      const ordList = ordData.orders || [];
      setOrders(ordList);
      setRiders(Array.isArray(ridData) ? ridData : (ridData.riders || []));

      // derive unique areas from loaded orders
      const uniqueAreas = [...new Set(ordList.map(o => o.area).filter(Boolean))].sort();
      setAreas(uniqueAreas);
    } catch (e) {
      setErr(e.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [authFetch, dayFilter, statusFilter, riderFilter, areaFilter, typeFilter, search]);

  // reload when server-side filters change (not search — that's client-side)
  useEffect(() => { load(); }, [load]); // eslint-disable-line

  const resetFilters = () => {
    setSearch(''); setDayFilter(''); setStatusFilter('');
    setRiderFilter(''); setAreaFilter(''); setTypeFilter('');
  };

  // unique order types from loaded data
  const orderTypes = useMemo(
    () => [...new Set(orders.map(o => o.order_type).filter(Boolean))].sort(),
    [orders]
  );

  const riderMap = useMemo(() => {
    const m = {};
    riders.forEach(r => { m[r.rider_id] = r.rider_name; });
    return m;
  }, [riders]);

  return (
    <>
      <style>{`
        @media (max-width: 767px) {
          .cs-root { padding: 16px 12px 24px !important; overflow: auto !important; }
          .cs-header { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; margin-bottom: 12px !important; }
          .cs-filter-desktop { display: none !important; }
          .cs-filter-toggle { display: flex !important; }
          .cs-filter-mobile { display: block !important; }
          .cs-table-wrap { font-size: 10px !important; }
          th, td { padding: 7px 6px !important; }
        }
      `}</style>

      <div className="cs-root" style={{
        padding: '19px', fontFamily: "'Poppins','Inter',sans-serif",
        display: 'flex', flexDirection: 'column', minHeight: 0,
        height: '100%', overflow: 'hidden', boxSizing: 'border-box',
      }}>

        {/* ── Header ── */}
        <div className="cs-header" style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: '20px',
          flexWrap: 'wrap', gap: '12px', flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333' }}>
              Customer Support
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#888', fontWeight: '500', lineHeight: 1.45, maxWidth: '760px' }}>
              Look up any order, check delivery status, and see which rider is assigned.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={load} style={{
              padding: '7px 13px', background: '#fff', color: '#555',
              border: '1px solid #e0e0e0', borderRadius: '6px',
              fontSize: '11px', fontWeight: '600', cursor: 'pointer',
            }}>Refresh</button>
          </div>
        </div>

        {/* ── Day Filter — prominent strip ── */}
        <div style={{
          display: 'flex', gap: '8px', marginBottom: '14px',
          flexShrink: 0, flexWrap: 'wrap',
        }}>
          {['', ...DAY_OPTIONS].map(d => (
            <button key={d} type="button" onClick={() => setDayFilter(d)} style={{
              padding: '7px 18px', borderRadius: '20px', cursor: 'pointer',
              fontSize: '11px', fontWeight: '600',
              background: dayFilter === d ? '#FF5722' : '#fff',
              color:      dayFilter === d ? '#fff'    : '#555',
              border:     dayFilter === d ? 'none'    : '1px solid #e0e0e0',
              transition: 'all .15s',
            }}>{d || 'All Days'}</button>
          ))}
        </div>

        {/* ── Desktop filters ── */}
        <div className="cs-filter-desktop" style={{
          display: 'flex', flexWrap: 'wrap', gap: '10px',
          marginBottom: '16px', alignItems: 'flex-end',
          minWidth: 0, flexShrink: 0,
        }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>
              Search (name, phone, address, cow no.)
            </label>
            <input type="text" placeholder="Search…" value={search}
              onChange={e => setSearch(e.target.value)}
              style={inputStyle} />
          </div>

          {[
            { label: 'Status', value: statusFilter, set: setStatusFilter,
              opts: ALL_STATUSES.map(s => ({ v: s, l: s })) },
            { label: 'Rider', value: riderFilter, set: setRiderFilter,
              opts: riders.map(r => ({ v: String(r.rider_id), l: r.rider_name })) },
            { label: 'Area', value: areaFilter, set: setAreaFilter,
              opts: areas.map(a => ({ v: a, l: a })) },
            { label: 'Order type', value: typeFilter, set: setTypeFilter,
              opts: orderTypes.map(t => ({ v: t, l: t })) },
          ].map(({ label, value, set, opts }) => (
            <div key={label} style={{ width: 130 }}>
              <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>{label}</label>
              <select value={value} onChange={e => set(e.target.value)} style={inputStyle}>
                <option value="">All</option>
                {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          ))}

          <button type="button" onClick={resetFilters} style={{
            padding: '6px 13px', height: '29px', background: '#fff',
            color: '#555', border: '1px solid #e0e0e0', borderRadius: '6px',
            fontSize: '11px', fontWeight: '600', cursor: 'pointer',
          }}>Reset</button>
        </div>

        {/* ── Mobile filter toggle ── */}
        <div className="cs-filter-toggle" style={{ display: 'none', gap: '8px', marginBottom: '8px', flexShrink: 0, alignItems: 'center' }}>
          <input type="text" placeholder="Search…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px' }} />
          <button type="button" onClick={() => setMobileFiltersOpen(v => !v)} style={{
            padding: '9px 12px', borderRadius: '8px',
            border: `1px solid ${mobileFiltersOpen ? '#FF5722' : '#e0e0e0'}`,
            background: mobileFiltersOpen ? '#fff4f0' : '#fff',
            color: mobileFiltersOpen ? '#FF5722' : '#555',
            fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap',
          }}>⚙ Filters</button>
        </div>

        <div className="cs-filter-mobile" style={{ display: 'none' }}>
          {mobileFiltersOpen && (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px', marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { label: 'Status', value: statusFilter, set: setStatusFilter, opts: ALL_STATUSES.map(s => ({ v: s, l: s })) },
                { label: 'Rider', value: riderFilter, set: setRiderFilter, opts: riders.map(r => ({ v: String(r.rider_id), l: r.rider_name })) },
                { label: 'Area', value: areaFilter, set: setAreaFilter, opts: areas.map(a => ({ v: a, l: a })) },
                { label: 'Order type', value: typeFilter, set: setTypeFilter, opts: orderTypes.map(t => ({ v: t, l: t })) },
              ].map(({ label, value, set, opts }) => (
                <div key={label}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>{label}</label>
                  <select value={value} onChange={e => set(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px' }}>
                    <option value="">All</option>
                    {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
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
          <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', marginBottom: '13px', flexShrink: 0, fontSize: '10px', fontWeight: '600' }}>
            {err}
          </div>
        )}

        {/* ── Result count ── */}
        {!loading && (
          <div style={{ fontSize: '10px', color: '#999', marginBottom: '8px', flexShrink: 0 }}>
            Showing {orders.length} order{orders.length !== 1 ? 's' : ''}
          </div>
        )}

        {/* ── Table ── */}
        <div className="cs-table-wrap" style={{ flex: 1, minHeight: 0, overflow: 'auto', borderRadius: '10px', border: '1px solid #ececec' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading…</div>
          ) : orders.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666', fontSize: '11px' }}>No orders found.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: '#fafafa' }}>
                  {['Order ID', 'Customer', 'Phone', 'Address', 'Day / Slot', 'Type & Hissa', 'Rider', 'Status'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '10px 10px',
                      borderBottom: '1px solid #e0e0e0', color: '#555',
                      fontWeight: '600', whiteSpace: 'nowrap', fontSize: '10px',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((o, idx) => (
                  <tr key={o.order_id} style={{
                    borderBottom: '1px solid #f3f3f3',
                    background: idx % 2 === 0 ? '#fff' : '#FAFAFA',
                  }}>
                    <td style={{ padding: '9px 10px', color: '#777', fontWeight: '500' }}>#{o.order_id}</td>
                    <td style={{ padding: '9px 10px', fontWeight: '500', color: '#333' }}>
                      {o.booking_name || o.shareholder_name || '—'}
                    </td>
                    <td style={{ padding: '9px 10px', color: '#555' }}>{o.contact || o.alt_contact || '—'}</td>
                    <td style={{ padding: '9px 10px', color: '#555', maxWidth: '200px' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.address || '—'}
                      </div>
                      {o.area && <div style={{ fontSize: '9px', color: '#aaa', marginTop: '2px' }}>{o.area}</div>}
                    </td>
                    <td style={{ padding: '9px 10px', color: '#555', whiteSpace: 'nowrap' }}>
                      <div>{o.day || '—'}</div>
                      {o.slot && <div style={{ fontSize: '9px', color: '#aaa' }}>{o.slot}</div>}
                    </td>
                    <td style={{ padding: '9px 10px', color: '#555', whiteSpace: 'nowrap' }}>
                      <div>{o.order_type || '—'}</div>
                      <div style={{ fontSize: '9px', color: '#aaa' }}>
                        {[o.cow_number && `Cow ${o.cow_number}`, o.hissa_number && `Hissa ${o.hissa_number}`].filter(Boolean).join(' · ') || ''}
                      </div>
                    </td>
                    <td style={{ padding: '9px 10px', color: '#555' }}>
                      {o.rider_id ? (riderMap[o.rider_id] || `Rider #${o.rider_id}`) : (
                        <span style={{ color: '#bbb', fontStyle: 'italic' }}>Unassigned</span>
                      )}
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <StatusBadge status={o.delivery_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}