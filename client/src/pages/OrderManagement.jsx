import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';

const API = 'http://localhost:5000';
const PAGE_SIZE = 50;

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
        minWidth: '72px',
        height: '22px',
        padding: '0 10px',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: '600',
        whiteSpace: 'nowrap',
        border: '1px solid',
        textAlign: 'center',
        lineHeight: '20px',
        boxSizing: 'border-box',
        ...(isPending
          ? { color: '#C30730', background: '#FBEDF0', borderColor: '#C30730' }
          : { color: '#07C339', background: '#E6F9EB', borderColor: '#07C339' }),
      }}
    >
      {isPending ? 'Pending' : (status ? 'Received' : '—')}
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

function validateOrderEdit(row) {
  const errors = {};
  const trim = (v) => (v == null ? '' : String(v).trim());

  if (!trim(row.customer_id)) errors.customer_id = 'Customer ID is required';
  if (!trim(row.booking_name)) errors.booking_name = 'Booking name is required';
  if (!trim(row.shareholder_name)) errors.shareholder_name = 'Shareholder name is required';

  const phone = trim(row.phone_number);
  if (!phone) errors.phone_number = 'Phone number is required';
  else if (!/^[\d\s\-+()]{7,20}$/.test(phone)) errors.phone_number = 'Enter a valid phone number (7–20 digits/symbols)';

  const dateStr = trim(row.booking_date);
  if (dateStr) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateStr)) errors.booking_date = 'Date must be YYYY-MM-DD';
    else {
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) errors.booking_date = 'Invalid date';
    }
  }

  const numFields = ['total_amount', 'received', 'pending'];
  for (const key of numFields) {
    const val = trim(row[key]);
    if (val === '') continue;
    const n = Number(val);
    if (Number.isNaN(n) || n < 0) errors[key] = 'Must be a number ≥ 0';
  }

  if (!errors.phone_number && trim(row.phone_number).length > 20) errors.phone_number = 'Phone number too long';
  if (!errors.customer_id && trim(row.customer_id).length > 50) errors.customer_id = 'Customer ID too long';
  if (!errors.booking_name && trim(row.booking_name).length > 100) errors.booking_name = 'Booking name too long';
  if (!errors.shareholder_name && trim(row.shareholder_name).length > 100) errors.shareholder_name = 'Shareholder name too long';

  return errors;
}

export default function OrderManagement() {
  const [orders, setOrders] = useState([]);
  const [filters, setFilters] = useState({ slots: [], order_types: [], days: [], references: [] });
  const [search, setSearch] = useState('');
  const [slot, setSlot] = useState('');
  const [orderType, setOrderType] = useState('');
  const [day, setDay] = useState('');
  const [reference, setReference] = useState('');
  const [cowNumber, setCowNumber] = useState('');
  const [yearFilter, setYearFilter] = useState('2026');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(defaultEditRow);
  const [editPreviousRow, setEditPreviousRow] = useState(null);
  const [editErrors, setEditErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

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
      if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      const res = await fetch(`${API}/api/booking/orders?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        const data = Array.isArray(json) ? json : json.data;
        const total = typeof json.total === 'number' ? json.total : (data?.length ?? 0);
        setOrders(Array.isArray(data) ? data : []);
        setTotalCount(total);
      } else {
        setError('Failed to load orders');
      }
    } catch (e) {
      setError('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [token, search, slot, orderType, day, reference, cowNumber, yearFilter, page]);

  useEffect(() => { fetchFilters(); }, [fetchFilters]);
  useEffect(() => { setPage(1); }, [search, slot, orderType, day, reference, cowNumber, yearFilter]);
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
    const initial = {
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
    };
    setEditPreviousRow(initial);
    setEditRow({ ...initial });
    setEditErrors({});
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    const errors = validateOrderEdit(editRow);
    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }
    setEditErrors({});
    setSaving(true);
    try {
      const payload = { ...editRow };
      if (payload.booking_date != null && payload.booking_date !== '') {
        const s = String(payload.booking_date);
        const dateOnly = s.includes('T') ? s.split('T')[0] : s.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || s;
        payload.booking_date = dateOnly;
      }
      const res = await fetch(`${API}/api/booking/orders/${encodeURIComponent(editRow.order_id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setEditOpen(false);
        setEditPreviousRow(null);
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
      const res = await fetch(`${API}/api/booking/orders/${encodeURIComponent(cancelConfirm.order_id)}/cancel`, {
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

  const handleResetFilters = () => {
    setSearch('');
    setSlot('');
    setOrderType('');
    setDay('');
    setReference('');
    setCowNumber('');
    setYearFilter('2026');
    setSelectedIds(new Set());
    setError('');
  };

  const handleExport = async () => {
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
    try {
      const filters = {};
      if (search?.trim()) filters.search = search.trim();
      if (slot) filters.slot = slot;
      if (orderType) filters.order_type = orderType;
      if (day) filters.day = day;
      if (reference) filters.reference = reference;
      if (cowNumber?.trim()) filters.cow_number = cowNumber.trim();
      if (yearFilter) filters.year = yearFilter;
      const payload = {
        count: toExport.length,
        ...(Object.keys(filters).length > 0 && { filters }),
        ...(ids.length > 0 && { order_ids: ids }),
      };
      await fetch(`${API}/api/booking/orders/export-audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.error('Export audit failed', e);
    }
  };

  const filterRowStyle = {
    display: 'flex',
    flexWrap: 'nowrap',
    gap: '10px',
    marginBottom: '16px',
    alignItems: 'flex-end',
    overflowX: 'auto',
    minWidth: 0,
  };
  const filterFieldStyle = (width) => ({
    width: width || 96,
    minWidth: width || 96,
    flexShrink: 0,
  });

  const labelStyle = { display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px', whiteSpace: 'nowrap' };

  return (
    <div style={{
      padding: '19px',
      fontFamily: "'Poppins', 'Inter', sans-serif",
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      height: '100%',
      overflow: 'hidden',
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333', whiteSpace: 'nowrap' }}>
          Order Management
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ ...labelStyle, marginBottom: 0, marginRight: '6px' }}>Year</label>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px', minWidth: '112px' }}
          >
            <option value="all">All</option>
            <option value="2026">Year 2026</option>
            <option value="2025">Year 2025</option>
            <option value="2024">Year 2024</option>
          </select>
        </div>
      </div>

      <div style={{ ...filterRowStyle, flexShrink: 0 }}>
        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
          <label style={labelStyle}>Search (name, phone, area, address)</label>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchOrders()}
            style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }}
          />
        </div>
        <div style={filterFieldStyle(88)}>
          <label style={labelStyle}>Cow number</label>
          <input
            type="text"
            placeholder="Cow #"
            value={cowNumber}
            onChange={(e) => setCowNumber(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchOrders()}
            style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }}
          />
        </div>
        <div style={filterFieldStyle(104)}>
          <label style={labelStyle}>Slot</label>
          <select value={slot} onChange={(e) => setSlot(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }}>
            <option value="">All</option>
            {filters.slots.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={filterFieldStyle(104)}>
          <label style={labelStyle}>Type</label>
          <select value={orderType} onChange={(e) => setOrderType(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }}>
            <option value="">All</option>
            {filters.order_types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={filterFieldStyle(80)}>
          <label style={labelStyle}>Day</label>
          <select value={day} onChange={(e) => setDay(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }}>
            <option value="">All</option>
            {filters.days.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div style={filterFieldStyle(88)}>
          <label style={labelStyle}>Reference</label>
          <select value={reference} onChange={(e) => setReference(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }}>
            <option value="">All</option>
            {filters.references.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button type="button" onClick={fetchOrders} style={{ padding: '6px 13px', height: '29px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Apply
          </button>
          <button type="button" onClick={handleResetFilters} style={{ padding: '6px 13px', height: '29px', background: '#fff', color: '#555', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Reset
          </button>
          <button type="button" onClick={handleExport} style={{ padding: '6px 13px', height: '29px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Export
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', marginBottom: '13px', flexShrink: 0, fontSize: '10px' }}>{error}</div>
      )}

      <div style={{
        flex: 1,
        minHeight: '304px',
        overflow: 'auto',
        border: '1px solid #e0e0e0',
        borderRadius: '6px',
        background: '#fff',
      }}>
        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading orders...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', tableLayout: 'auto' }}>
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
                      <button type="button" onClick={() => handleEdit(row)} title="Edit" style={{ marginRight: '6px', padding: '4px', fontSize: '10px', cursor: 'pointer', background: 'none', border: 'none', verticalAlign: 'middle' }}><img src="/icons/edit.png" alt="Edit" style={{ width: '15px', height: '15px', display: 'block' }} /></button>
                      <button type="button" onClick={() => handleInvoice(row.customer_id)} title="Invoice" style={{ marginRight: '6px', padding: '4px', fontSize: '10px', cursor: 'pointer', background: 'none', border: 'none', verticalAlign: 'middle' }}><img src="/icons/invoice.png" alt="Invoice" style={{ width: '21px', height: '21px', display: 'block' }} /></button>
                      <button type="button" onClick={() => handleCancelClick(row)} title="Cancel" style={{ padding: '4px', fontSize: '10px', cursor: 'pointer', color: '#c62828', background: 'none', border: 'none', verticalAlign: 'middle' }}><img src="/icons/delete.png" alt="Cancel" style={{ width: '18px', height: '18px', display: 'block' }} /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {!loading && totalCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', padding: '12px 0', borderTop: '1px solid #e0e0e0', marginTop: '8px' }}>
          <span style={{ fontSize: '13px', color: '#666' }}>
            Showing {orders.length} of {totalCount} orders
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                padding: '6px 12px',
                fontSize: '10px',
                background: page <= 1 ? '#f0f0f0' : '#fff',
                color: page <= 1 ? '#999' : '#333',
                border: '1px solid #e0e0e0',
                borderRadius: '6px',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
              }}
            >
              Previous
            </button>
            {(() => {
              const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
              const showPages = 5;
              let start = Math.max(1, page - Math.floor(showPages / 2));
              let end = Math.min(totalPages, start + showPages - 1);
              if (end - start + 1 < showPages) start = Math.max(1, end - showPages + 1);
              const pages = [];
              for (let i = start; i <= end; i++) pages.push(i);
              return (
                <>
                  {pages.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p)}
                      style={{
                        minWidth: '32px',
                        padding: '6px 10px',
                        fontSize: '10px',
                        background: p === page ? '#FF5722' : '#fff',
                        color: p === page ? '#fff' : '#333',
                        border: '1px solid #e0e0e0',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: p === page ? 600 : 400,
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </>
              );
            })()}
            <button
              type="button"
              disabled={page >= Math.ceil(totalCount / PAGE_SIZE)}
              onClick={() => setPage((p) => Math.min(Math.ceil(totalCount / PAGE_SIZE) || 1, p + 1))}
              style={{
                padding: '6px 12px',
                fontSize: '10px',
                background: page >= Math.ceil(totalCount / PAGE_SIZE) ? '#f0f0f0' : '#fff',
                color: page >= Math.ceil(totalCount / PAGE_SIZE) ? '#999' : '#333',
                border: '1px solid #e0e0e0',
                borderRadius: '6px',
                cursor: page >= Math.ceil(totalCount / PAGE_SIZE) ? 'not-allowed' : 'pointer',
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {editOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => !saving && (setEditErrors({}), setEditOpen(false), setEditPreviousRow(null))}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '16px 20px', width: 'min(680px, 95vw)', maxHeight: '85vh', overflowY: 'auto', overflowX: 'hidden', boxSizing: 'border-box' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Edit Order</h3>
            {Object.keys(editErrors).length > 0 && (
              <div style={{ marginBottom: '10px', padding: '8px 10px', background: '#fef2f2', color: '#b91c1c', borderRadius: '6px', fontSize: '12px' }}>
                Please fix the errors below before saving.
              </div>
            )}
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>Update to</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
              {['order_id', 'customer_id', 'cow', 'hissa', 'slot', 'booking_name', 'shareholder_name', 'phone_number', 'alt_phone', 'address', 'area', 'day', 'type', 'booking_date', 'total_amount', 'received', 'pending', 'source', 'reference'].map((key) => {
                const isReadOnly = key === 'order_id' || key === 'received' || key === 'pending';
                return (
                  <div key={key} style={{ minWidth: 0 }}>
                    <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' }}>{key.replace(/_/g, ' ')}</label>
                    <input
                      disabled={isReadOnly}
                      readOnly={isReadOnly}
                      value={editRow[key] ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditRow((p) => {
                          const next = { ...p, [key]: val };
                          if (key === 'total_amount') {
                            const total = parseFloat(val) || 0;
                            const received = parseFloat(p.received) || 0;
                            next.pending = Math.max(0, total - received).toFixed(2);
                          }
                          return next;
                        });
                        if (editErrors[key]) setEditErrors((p) => { const n = { ...p }; delete n[key]; return n; });
                      }}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: editErrors[key] ? '1px solid #dc2626' : '1px solid #e0e0e0',
                        fontSize: '10px',
                        ...(isReadOnly && { backgroundColor: '#f5f5f5', cursor: 'not-allowed' }),
                      }}
                    />
                    {editErrors[key] && <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>{editErrors[key]}</div>}
                  </div>
                );
              })}
              <div style={{ minWidth: 0, gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' }}>description</label>
                <textarea
                  value={editRow.description ?? ''}
                  onChange={(e) => setEditRow((p) => ({ ...p, description: e.target.value }))}
                  rows={2}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '13px', resize: 'vertical' }}
                />
              </div>
            </div>
            <div style={{ marginTop: '14px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setEditOpen(false)} disabled={saving} style={{ padding: '5px 11px', fontSize: '10px', background: '#f5f5f5', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Close</button>
              <button type="button" onClick={handleSaveEdit} disabled={saving} style={{ padding: '5px 11px', fontSize: '10px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {cancelConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '400px' }}>
            <p style={{ margin: '0 0 16px 0' }}>Move this order to cancelled orders? This will remove it from the orders table.</p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setCancelConfirm(null)} style={{ padding: '6px 13px', background: '#f5f5f5', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '10px' }}>No</button>
              <button type="button" onClick={handleCancelConfirm} style={{ padding: '6px 13px', background: '#c62828', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '10px' }}>Yes, cancel order</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
