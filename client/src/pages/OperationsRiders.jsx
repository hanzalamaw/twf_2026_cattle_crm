import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../config/api';
import { getOperationsSocket } from '../utils/operationsSocket';
import { useAuth } from '../context/AuthContext';

const RIDER_STATUSES = ['Available', 'On Delivery', 'Off Duty', 'Suspended'];

function riderStatusBadge(status) {
  const st = status || 'Available';
  const map = {
    Available: { bg: '#E8F5E9', fg: '#2E7D32' },
    'On Delivery': { bg: '#E3F2FD', fg: '#1565C0' },
    'Off Duty': { bg: '#FFF8E1', fg: '#F57C00' },
    Suspended: { bg: '#FFEBEE', fg: '#C62828' },
  };
  const { bg, fg } = map[st] || map.Available;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '999px',
        fontSize: '10px',
        fontWeight: '600',
        background: bg,
        color: fg,
        whiteSpace: 'nowrap',
      }}
    >
      {st}
    </span>
  );
}

function money(n) {
  return `Rs. ${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 11px',
  borderRadius: '8px',
  border: '1px solid #e0e0e0',
  fontSize: '12px',
  background: '#fff',
};

const compactSelectStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid #e0e0e0',
  fontSize: '11px',
  background: '#FAFAFA',
  color: '#333',
};

export default function OperationsRiders() {
  const { authFetch } = useAuth();

  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [err, setErr] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dayFilter, setDayFilter] = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [ordersModal, setOrdersModal] = useState(null);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const [form, setForm] = useState({
    rider_name: '',
    contact: '',
    vehicle: '',
    cnic: '',
    number_plate: '',
    amount_per_delivery: '',
  });

  const load = useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (dayFilter) qs.set('day', dayFilter);

      const res = await authFetch(`${API_BASE}/operations/riders/details${qs.toString() ? `?${qs.toString()}` : ''}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to load riders');

      setRiders(data.riders || []);
    } catch (e) {
      setErr(e.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [authFetch, dayFilter]);

  useEffect(() => {
    load();
  }, [load]);

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

  const filteredRiders = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = riders;

    if (q) {
      list = list.filter((r) => {
        const hay = [
          r.rider_name,
          r.contact,
          r.vehicle,
          r.number_plate,
          r.cnic,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }

    if (statusFilter) {
      list = list.filter((r) => (r.availability || 'Available') === statusFilter);
    }

    return list;
  }, [riders, search, statusFilter]);

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setDayFilter('');
  };

  const patchRider = async (riderId, payload) => {
    setSavingId(riderId);
    setErr('');
    try {
      const res = await authFetch(`${API_BASE}/operations/riders/${riderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Update failed');
      await load();
    } catch (e) {
      setErr(e.message || 'Update failed');
    } finally {
      setSavingId(null);
    }
  };

  const openOrders = async (rider) => {
    setOrdersModal({ rider, orders: [] });
    setOrdersLoading(true);
    setErr('');
    try {
      const qs = new URLSearchParams();
      if (dayFilter) qs.set('day', dayFilter);

      const res = await authFetch(
        `${API_BASE}/operations/riders/${rider.rider_id}/orders${qs.toString() ? `?${qs.toString()}` : ''}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to load rider orders');

      setOrdersModal({
        rider: data.rider || rider,
        orders: data.orders || [],
      });
    } catch (e) {
      setErr(e.message || 'Failed to load rider orders');
    } finally {
      setOrdersLoading(false);
    }
  };

  const submitAddRider = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const res = await authFetch(`${API_BASE}/operations/riders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rider_name: form.rider_name,
          contact: form.contact || null,
          vehicle: form.vehicle || null,
          cnic: form.cnic || null,
          number_plate: form.number_plate || null,
          amount_per_delivery: form.amount_per_delivery === '' ? 0 : Number(form.amount_per_delivery),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to create rider');

      setForm({
        rider_name: '',
        contact: '',
        vehicle: '',
        cnic: '',
        number_plate: '',
        amount_per_delivery: '',
      });
      setAddOpen(false);
      await load();
    } catch (e2) {
      setErr(e2.message || 'Failed to create rider');
    }
  };

  return (
    <>
      <style>{`
        @media (max-width: 767px) {
          .or-root { padding: 16px 12px 24px !important; overflow: auto !important; }
          .or-header { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; margin-bottom: 12px !important; }
          .or-header h2 {
            min-height: 55px !important;
            display: flex !important;
            align-items: center !important;
            margin: 0 !important;
            font-size: clamp(15px, 4.3vw, 17px) !important;
            font-weight: 600 !important;
            color: #333 !important;
            line-height: 1.25 !important;
          }
          .or-filter-desktop { display: none !important; }
          .or-filter-toggle { display: flex !important; }
          .or-filter-mobile { display: block !important; }
          .or-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <div
        className="or-root"
        style={{
          padding: '19px',
          fontFamily: "'Poppins','Inter',sans-serif",
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          height: '100%',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        <div
          className="or-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            flexWrap: 'wrap',
            gap: '12px',
            flexShrink: 0,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333', whiteSpace: 'nowrap' }}>
              Rider Management
            </h2>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '11px',
                color: '#888',
                fontWeight: '500',
                lineHeight: 1.45,
                maxWidth: '760px',
              }}
            >
              Register riders, track availability, update operational status, and monitor delivery earnings and assigned orders.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {savingId && (
              <span style={{ fontSize: '10px', color: '#999', fontWeight: '600', alignSelf: 'center' }}>
                Saving…
              </span>
            )}
            <button
              type="button"
              onClick={load}
              style={{
                padding: '7px 13px',
                background: '#fff',
                color: '#555',
                border: '1px solid #e0e0e0',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              style={{
                padding: '7px 13px',
                background: '#FF5722',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Add Rider
            </button>
          </div>
        </div>

        <div
          className="or-filter-desktop"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            marginBottom: '16px',
            alignItems: 'flex-end',
            minWidth: 0,
            flexShrink: 0,
          }}
        >
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>
              Search (name, phone, vehicle)
            </label>
            <input
              type="text"
              placeholder="Search rider…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...inputStyle, padding: '6px 10px', fontSize: '11px' }}
            />
          </div>

          <div style={{ width: 140 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>
              Rider status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ ...inputStyle, padding: '6px 10px', fontSize: '11px' }}
            >
              <option value="">All</option>
              {RIDER_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div style={{ width: 110 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>
              Day
            </label>
            <select
              value={dayFilter}
              onChange={(e) => setDayFilter(e.target.value)}
              style={{ ...inputStyle, padding: '6px 10px', fontSize: '11px' }}
            >
              <option value="">All</option>
              <option value="Day 1">Day 1</option>
              <option value="Day 2">Day 2</option>
              <option value="Day 3">Day 3</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={resetFilters}
              style={{
                padding: '6px 13px',
                height: '29px',
                background: '#fff',
                color: '#555',
                border: '1px solid #e0e0e0',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Reset
            </button>
          </div>
        </div>

        <div className="or-filter-toggle" style={{ display: 'none', gap: '8px', marginBottom: '8px', flexShrink: 0, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search rider…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px' }}
          />
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((v) => !v)}
            style={{
              padding: '9px 12px',
              borderRadius: '8px',
              border: `1px solid ${mobileFiltersOpen ? '#FF5722' : '#e0e0e0'}`,
              background: mobileFiltersOpen ? '#fff4f0' : '#fff',
              color: mobileFiltersOpen ? '#FF5722' : '#555',
              fontSize: '13px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            ⚙ Filters
          </button>
        </div>

        <div className="or-filter-mobile" style={{ display: 'none' }}>
          {mobileFiltersOpen && (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px', marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Rider status</label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px' }}>
                  <option value="">All</option>
                  {RIDER_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Day</label>
                <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px' }}>
                  <option value="">All</option>
                  <option value="Day 1">Day 1</option>
                  <option value="Day 2">Day 2</option>
                  <option value="Day 3">Day 3</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => setMobileFiltersOpen(false)} style={{ flex: 1, padding: '10px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                  Done
                </button>
                <button type="button" onClick={() => { resetFilters(); setMobileFiltersOpen(false); }} style={{ flex: 1, padding: '10px', background: '#fff', color: '#555', border: '1px solid #e0e0e0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>

        {err && (
          <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', marginBottom: '13px', flexShrink: 0, fontSize: '10px', fontWeight: '600' }}>
            {err}
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#666', fontSize: '11px' }}>
              Loading…
            </div>
          ) : filteredRiders.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#666', fontSize: '11px', border: '1px solid #e0e0e0', borderRadius: '8px', background: '#fff' }}>
              {riders.length === 0 ? 'No riders found.' : 'No riders match the current filters.'}
            </div>
          ) : (
            <div
              className="or-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '14px',
              }}
            >
              {filteredRiders.map((r) => (
                <div
                  key={r.rider_id}
                  style={{
                    background: '#fff',
                    border: '1px solid #e8e8e8',
                    borderRadius: '14px',
                    padding: '14px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: '#333', lineHeight: 1.3 }}>
                        {r.rider_name}
                      </h3>
                      <p style={{ margin: '5px 0 0', fontSize: '11px', color: '#777', lineHeight: 1.5 }}>
                        {r.contact || 'No phone'} {r.vehicle ? `• ${r.vehicle}` : ''} {r.number_plate ? `• ${r.number_plate}` : ''}
                      </p>
                    </div>
                    {riderStatusBadge(r.availability)}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      gap: '10px',
                      background: '#FAFAFA',
                      borderRadius: '10px',
                      padding: '10px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px' }}>Delivered</div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#333' }}>{r.deliveries_completed || 0}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px' }}>Pending</div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#333' }}>{r.pending_deliveries || 0}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px' }}>Per delivery</div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#333' }}>{money(r.amount_per_delivery)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px' }}>Total made</div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#333' }}>{money(r.total_amount_made)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px' }}>Total paid</div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#333' }}>{money(r.total_paid)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px' }}>Balance due</div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: r.balance_due > 0 ? '#C62828' : '#2E7D32' }}>
                        {money(r.balance_due)}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '4px' }}>
                        Change status
                      </label>
                      <select
                        value={r.availability || 'Available'}
                        onChange={(e) => patchRider(r.rider_id, { availability: e.target.value })}
                        style={compactSelectStyle}
                        disabled={savingId === r.rider_id}
                      >
                        {RIDER_STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '4px' }}>
                        Amount / delivery
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={r.amount_per_delivery || 0}
                        onBlur={(e) => {
                          const next = Number(e.target.value || 0);
                          if (Number(next) !== Number(r.amount_per_delivery || 0)) {
                            patchRider(r.rider_id, { amount_per_delivery: next });
                          }
                        }}
                        style={compactSelectStyle}
                        disabled={savingId === r.rider_id}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '4px' }}>
                        Total paid
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={r.total_paid || 0}
                        onBlur={(e) => {
                          const next = Number(e.target.value || 0);
                          if (Number(next) !== Number(r.total_paid || 0)) {
                            patchRider(r.rider_id, { total_paid: next });
                          }
                        }}
                        style={compactSelectStyle}
                        disabled={savingId === r.rider_id}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => openOrders(r)}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid #e0e0e0',
                          background: '#fff',
                          color: '#333',
                          fontSize: '11px',
                          fontWeight: '600',
                          cursor: 'pointer',
                        }}
                      >
                        View assigned orders
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {addOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={() => setAddOpen(false)}
          role="presentation"
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '16px',
              border: '1px solid #eee',
              padding: '18px',
              width: '100%',
              maxWidth: '520px',
              boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Add rider"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#333' }}>Add new rider</h3>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '22px', color: '#888', cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <form onSubmit={submitAddRider}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Rider name</label>
                  <input
                    type="text"
                    required
                    value={form.rider_name}
                    onChange={(e) => setForm((p) => ({ ...p, rider_name: e.target.value }))}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Phone</label>
                  <input
                    type="text"
                    value={form.contact}
                    onChange={(e) => setForm((p) => ({ ...p, contact: e.target.value }))}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Vehicle</label>
                  <input
                    type="text"
                    value={form.vehicle}
                    onChange={(e) => setForm((p) => ({ ...p, vehicle: e.target.value }))}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>CNIC</label>
                  <input
                    type="text"
                    value={form.cnic}
                    onChange={(e) => setForm((p) => ({ ...p, cnic: e.target.value }))}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Vehicle number</label>
                  <input
                    type="text"
                    value={form.number_plate}
                    onChange={(e) => setForm((p) => ({ ...p, number_plate: e.target.value }))}
                    style={inputStyle}
                  />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Amount per delivery</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount_per_delivery}
                    onChange={(e) => setForm((p) => ({ ...p, amount_per_delivery: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #e0e0e0',
                    background: '#fff',
                    color: '#555',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#FF5722',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  Save rider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {ordersModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '16px',
          }}
          onClick={() => setOrdersModal(null)}
          role="presentation"
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '16px',
              border: '1px solid #eee',
              padding: '18px',
              width: '100%',
              maxWidth: '900px',
              maxHeight: '88vh',
              overflow: 'auto',
              boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Assigned rider orders"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#333' }}>
                  {ordersModal.rider?.rider_name} — Assigned orders
                </h3>
                <p style={{ margin: '5px 0 0', fontSize: '11px', color: '#777' }}>
                  {ordersModal.rider?.contact || 'No phone'} {ordersModal.rider?.vehicle ? `• ${ordersModal.rider.vehicle}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOrdersModal(null)}
                style={{ background: 'none', border: 'none', fontSize: '22px', color: '#888', cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {ordersLoading ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#666', fontSize: '12px' }}>Loading…</div>
            ) : ordersModal.orders?.length ? (
              <div style={{ border: '1px solid #ececec', borderRadius: '10px', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ background: '#fafafa' }}>
                      {['Challan', 'Day', 'Slot', 'Address', 'Order', 'Contact', 'Shareholder', 'Type / Hissa', 'Status'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid #e0e0e0', color: '#555', fontWeight: '600', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ordersModal.orders.map((o, idx) => (
                      <tr key={`${o.challan_id}-${o.order_id}-${idx}`} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '9px 8px' }}>#{o.challan_id}</td>
                        <td style={{ padding: '9px 8px' }}>{o.day || '—'}</td>
                        <td style={{ padding: '9px 8px' }}>{o.slot || '—'}</td>
                        <td style={{ padding: '9px 8px', maxWidth: '220px' }}>{o.address || '—'}</td>
                        <td style={{ padding: '9px 8px' }}>{o.order_id}</td>
                        <td style={{ padding: '9px 8px' }}>{o.contact || o.alt_contact || '—'}</td>
                        <td style={{ padding: '9px 8px' }}>{o.shareholder_name || o.booking_name || '—'}</td>
                        <td style={{ padding: '9px 8px' }}>
                          {o.order_type || '—'} / {o.hissa_number || '—'}
                        </td>
                        <td style={{ padding: '9px 8px' }}>{o.delivery_status || 'Pending'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '24px', textAlign: 'center', color: '#666', fontSize: '12px' }}>
                No assigned orders found.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}