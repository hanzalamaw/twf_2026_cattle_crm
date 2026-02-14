import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';

const API = 'http://localhost:5000';

const COLUMNS = [
  { key: 'customer_id', label: 'Customer ID' },
  { key: 'order_id', label: 'Order ID' },
  { key: 'cow', label: 'Cow' },
  { key: 'hissa', label: 'Hissa' },
  { key: 'slot', label: 'Slot' },
  { key: 'booking_name', label: 'Booking Name' },
  { key: 'shareholder_name', label: 'Shareholder Name' },
  { key: 'phone_number', label: 'Phone Number' },
  { key: 'alt_phone', label: 'Alt. Phone' },
  { key: 'address', label: 'Address' },
  { key: 'area', label: 'Area' },
  { key: 'day', label: 'Day' },
  { key: 'type', label: 'Type' },
  { key: 'booking_date', label: 'Booking Date' },
  { key: 'total_amount', label: 'Total Amount' },
  { key: 'bank', label: 'Bank' },
  { key: 'cash', label: 'Cash' },
  { key: 'received', label: 'Received' },
  { key: 'pending', label: 'Pending' },
  { key: 'source', label: 'Source' },
  { key: 'reference', label: 'Reference' },
  { key: 'description', label: 'Description' },
  { key: 'payment_status', label: 'Payment Status' },
];

const AMOUNT_KEYS = ['total_amount', 'bank', 'cash', 'received', 'pending'];

function formatAmount(val) {
  if (val == null || val === '') return '—';
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  return Math.round(n).toLocaleString('en-PK');
}

function formatDate(val) {
  if (val == null || val === '') return '—';
  const s = String(val);
  if (s.includes('T')) return s.split('T')[0];
  return s;
}

function StatusPill({ status }) {
  const isPending = status === 'Pending';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 10px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: '600',
        whiteSpace: 'nowrap',
        border: '1px solid',
        ...(isPending
          ? { color: '#b91c1c', background: '#fef2f2', borderColor: '#b91c1c' }
          : { color: '#166534', background: '#f0fdf4', borderColor: '#166534' }),
      }}
    >
      {status || '—'}
    </span>
  );
}

const defaultEditRow = () => ({
  order_id: '',
  customer_id: '',
  cow: '',
  hissa: '',
  slot: '',
  booking_name: '',
  shareholder_name: '',
  phone_number: '',
  alt_phone: '',
  address: '',
  area: '',
  day: '',
  type: '',
  booking_date: '',
  total_amount: '',
  received: '',
  pending: '',
  source: '',
  reference: '',
  description: '',
});

export default function OrderManagement() {
  const [orders, setOrders] = useState([]);
  const [filters, setFilters] = useState({ slots: [], order_types: [], days: [], references: [] });
  const [search, setSearch] = useState('');
  const [slot, setSlot] = useState('');
  const [orderType, setOrderType] = useState('');
  const [day, setDay] = useState('');
  const [reference, setReference] = useState('');
  const [cowNumber, setCowNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(defaultEditRow);
  const [saving, setSaving] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(null);

  const token = localStorage.getItem('token');

  const fetchFilters = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/booking/orders/filters`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFilters(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, [token]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (slot) params.set('slot', slot);
      if (orderType) params.set('order_type', orderType);
      if (day) params.set('day', day);
      if (reference) params.set('reference', reference);
      if (cowNumber.trim()) params.set('cow_number', cowNumber.trim());
      const res = await fetch(`${API}/api/booking/orders?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      } else {
        setError('Failed to load orders');
      }
    } catch (e) {
      setError('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [token, search, slot, orderType, day, reference, cowNumber]);

  useEffect(() => { fetchFilters(); }, [fetchFilters]);
  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const toggleSelect = (orderId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === orders.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(orders.map((r) => r.order_id)));
  };

  const handleEdit = (row) => {
    setEditRow({
      order_id: row.order_id,
      customer_id: row.customer_id ?? '',
      cow: row.cow ?? '',
      hissa: row.hissa ?? '',
      slot: row.slot ?? '',
      booking_name: row.booking_name ?? '',
      shareholder_name: row.shareholder_name ?? '',
      phone_number: row.phone_number ?? '',
      alt_phone: row.alt_phone ?? '',
      address: row.address ?? '',
      area: row.area ?? '',
      day: row.day ?? '',
      type: row.type ?? '',
      booking_date: formatDate(row.booking_date),
      total_amount: row.total_amount ?? '',
      received: row.received ?? '',
      pending: row.pending ?? '',
      source: row.source ?? '',
      reference: row.reference ?? '',
      description: row.description ?? '',
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/booking/orders/${editRow.order_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editRow),
      });
      if (res.ok) {
        setEditOpen(false);
        fetchOrders();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || 'Failed to update order');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleInvoice = async (customerId) => {
    try {
      const res = await fetch(`${API}/api/booking/invoice/${encodeURIComponent(customerId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.message || 'Failed to generate invoice');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice-${customerId}-2026.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Failed to generate invoice');
    }
  };

  const handleCancelClick = (row) => setCancelConfirm(row);
  const handleCancelConfirm = async () => {
    if (!cancelConfirm) return;
    try {
      const res = await fetch(`${API}/api/booking/orders/${cancelConfirm.order_id}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setCancelConfirm(null);
        fetchOrders();
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(cancelConfirm.order_id);
          return next;
        });
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || 'Failed to cancel order');
      }
    } finally {
      setCancelConfirm(null);
    }
  };

  const handleExport = () => {
    const ids = Array.from(selectedIds);
    const toExport = ids.length ? orders.filter((r) => ids.includes(r.order_id)) : orders;
    if (toExport.length === 0) {
      alert('Select at least one row to export, or leave none selected to export all.');
      return;
    }
    const headers = COLUMNS.map((c) => c.label);
    const rows = toExport.map((row) =>
      COLUMNS.map((col) => {
        const val = row[col.key];
        if (AMOUNT_KEYS.includes(col.key)) return formatAmount(val);
        if (col.key === 'booking_date') return formatDate(val);
        if (col.key === 'payment_status') return val || '—';
        return val != null ? String(val) : '—';
      })
    );
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');
    XLSX.writeFile(wb, `orders-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const filterRowStyle = {
    display: 'grid',
    gridTemplateColumns: 'minmax(180px, 1fr) minmax(100px, 120px) minmax(100px, 140px) minmax(100px, 140px) minmax(80px, 120px) minmax(80px, 120px) auto',
    gap: '12px',
    marginBottom: '20px',
    alignItems: 'end',
  };

  return (
    <div style={{ padding: '24px', fontFamily: "'Poppins', 'Inter', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333' }}>
          Order Management
        </h2>
        <button
          type="button"
          onClick={handleExport}
          style={{
            padding: '8px 16px',
            background: '#2e7d32',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          Export
        </button>
      </div>

      <div style={filterRowStyle}>
        <div style={{ minWidth: 0 }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Search (name, phone, area, address)</label>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchOrders()}
            style={{ width: '100%', minWidth: 0, padding: '8px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '14px' }}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Cow number</label>
          <input
            type="text"
            placeholder="Cow #"
            value={cowNumber}
            onChange={(e) => setCowNumber(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchOrders()}
            style={{ width: '100%', minWidth: 0, padding: '8px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '14px' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Slot</label>
          <select value={slot} onChange={(e) => setSlot(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '14px' }}>
            <option value="">All</option>
            {filters.slots.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Type</label>
          <select value={orderType} onChange={(e) => setOrderType(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '14px' }}>
            <option value="">All</option>
            {filters.order_types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Day</label>
          <select value={day} onChange={(e) => setDay(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '14px' }}>
            <option value="">All</option>
            {filters.days.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Reference</label>
          <select value={reference} onChange={(e) => setReference(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '14px' }}>
            <option value="">All</option>
            {filters.references.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <button type="button" onClick={fetchOrders} style={{ padding: '8px 16px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
          Apply
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px', background: '#FFF5F2', color: '#C62828', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>
      )}

      <div style={{ overflowX: 'auto', border: '1px solid #e0e0e0', borderRadius: '8px', background: '#fff' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Loading orders...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'auto' }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap', width: '40px' }}>
                  <input type="checkbox" checked={orders.length > 0 && selectedIds.size === orders.length} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                </th>
                {COLUMNS.map((col) => (
                  <th key={col.key} style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' }}>{col.label}</th>
                ))}
                <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length + 2} style={{ padding: '24px', textAlign: 'center', color: '#666' }}>No orders found.</td>
                </tr>
              ) : (
                orders.map((row) => (
                  <tr key={row.order_id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                      <input type="checkbox" checked={selectedIds.has(row.order_id)} onChange={() => toggleSelect(row.order_id)} style={{ cursor: 'pointer' }} />
                    </td>
                    {COLUMNS.map((col) => (
                      <td key={col.key} style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                        {col.key === 'payment_status' ? (
                          <StatusPill status={row[col.key]} />
                        ) : AMOUNT_KEYS.includes(col.key) ? (
                          formatAmount(row[col.key])
                        ) : col.key === 'booking_date' ? (
                          formatDate(row[col.key])
                        ) : (
                          (row[col.key] != null ? String(row[col.key]) : '—')
                        )}
                      </td>
                    ))}
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                      <button type="button" onClick={() => handleEdit(row)} style={{ marginRight: '8px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}>Edit</button>
                      <button type="button" onClick={() => handleInvoice(row.customer_id)} style={{ marginRight: '8px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}>Invoice</button>
                      <button type="button" onClick={() => handleCancelClick(row)} style={{ padding: '4px 8px', fontSize: '12px', cursor: 'pointer', color: '#c62828' }}>Cancel</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {editOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => !saving && setEditOpen(false)}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '520px', width: '90%', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0' }}>Edit Order</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {['order_id', 'customer_id', 'cow', 'hissa', 'slot', 'booking_name', 'shareholder_name', 'phone_number', 'alt_phone', 'address', 'area', 'day', 'type', 'booking_date', 'total_amount', 'received', 'pending', 'source', 'reference'].map((key) => (
                <div key={key} style={{ gridColumn: key === 'address' || key === 'reference' || key === 'description' ? '1 / -1' : 'auto' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>{key.replace(/_/g, ' ')}</label>
                  <input
                    disabled={key === 'order_id'}
                    value={editRow[key] ?? ''}
                    onChange={(e) => setEditRow((p) => ({ ...p, [key]: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '14px' }}
                  />
                </div>
              ))}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>description</label>
                <textarea value={editRow.description ?? ''} onChange={(e) => setEditRow((p) => ({ ...p, description: e.target.value }))} rows={2} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '14px' }} />
              </div>
            </div>
            <div style={{ marginTop: '20px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setEditOpen(false)} disabled={saving} style={{ padding: '8px 16px', background: '#f5f5f5', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Close</button>
              <button type="button" onClick={handleSaveEdit} disabled={saving} style={{ padding: '8px 16px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {cancelConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '400px' }}>
            <p style={{ margin: '0 0 16px 0' }}>Move this order to cancelled orders? This will remove it from the orders table.</p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setCancelConfirm(null)} style={{ padding: '8px 16px', background: '#f5f5f5', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>No</button>
              <button type="button" onClick={handleCancelConfirm} style={{ padding: '8px 16px', background: '#c62828', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Yes, cancel order</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
