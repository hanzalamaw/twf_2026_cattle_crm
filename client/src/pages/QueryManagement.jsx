import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';

const API = 'http://localhost:5000';
const PAGE_SIZE = 50;

const COLUMNS = [
  { key: 'lead_id', label: 'Lead ID' },
  { key: 'customer_id', label: 'Customer ID' },
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
  { key: 'source', label: 'Source' },
  { key: 'reference', label: 'Reference' },
  { key: 'description', label: 'Description' },
  { key: 'created_at', label: 'Created' },
];

const AMOUNT_KEYS = ['total_amount'];

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

function formatCreated(val) {
  if (val == null || val === '') return '—';
  try {
    return new Date(val).toLocaleString();
  } catch {
    return String(val);
  }
}

export default function QueryManagement() {
  const [leads, setLeads] = useState([]);
  const [filters, setFilters] = useState({ order_types: [], days: [], references: [] });
  const [search, setSearch] = useState('');
  const [orderType, setOrderType] = useState('');
  const [day, setDay] = useState('');
  const [reference, setReference] = useState('');
  const [yearFilter, setYearFilter] = useState('2026');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [confirmingLeadId, setConfirmingLeadId] = useState(null);
  const [confirmModalLead, setConfirmModalLead] = useState(null);
  const [area, setArea] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [editPreviousRow, setEditPreviousRow] = useState(null);
  const [editErrors, setEditErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const token = localStorage.getItem('token');

  const fetchFilters = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
      const url = params.toString() ? `${API}/api/booking/leads/filters?${params.toString()}` : `${API}/api/booking/leads/filters`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFilters(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, [token, yearFilter]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (orderType) params.set('order_type', orderType);
      if (day) params.set('day', day);
      if (reference) params.set('reference', reference);
      if (area) params.set('area', area);
      if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      const res = await fetch(`${API}/api/booking/leads?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        const data = Array.isArray(json) ? json : json.data;
        const total = typeof json.total === 'number' ? json.total : (data?.length ?? 0);
        setLeads(Array.isArray(data) ? data : []);
        setTotalCount(total);
      } else {
        setError('Failed to load queries');
      }
    } catch (e) {
      setError('Failed to load queries');
    } finally {
      setLoading(false);
    }
  }, [token, search, orderType, day, reference, area, yearFilter, page]);

  useEffect(() => { fetchFilters(); }, [fetchFilters]);
  useEffect(() => { setPage(1); }, [search, orderType, day, reference, area, yearFilter]);
  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const toggleSelect = (leadId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === leads.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(leads.map((r) => r.lead_id)));
  };

  const handleResetFilters = () => {
    setSearch('');
    setOrderType('');
    setDay('');
    setReference('');
    setArea('');
    setYearFilter('2026');
    setSelectedIds(new Set());
    setError('');
  };

  const handleConfirmClick = (lead) => setConfirmModalLead(lead);

  const handleConfirmOrder = async () => {
    if (!confirmModalLead) return;
    const lead = confirmModalLead;
    setConfirmingLeadId(lead.lead_id);
    setError('');
    try {
      const res = await fetch(`${API}/api/booking/leads/${encodeURIComponent(lead.lead_id)}/confirm-order`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.order_id) {
        setConfirmModalLead(null);
        setSelectedIds((prev) => { const next = new Set(prev); next.delete(lead.lead_id); return next; });
        fetchLeads();
      } else {
        setError(data.message || 'Failed to confirm order');
      }
    } catch (e) {
      setError('Failed to confirm order');
    } finally {
      setConfirmingLeadId(null);
    }
  };

  const handleEditLead = (row) => {
    const initial = {
      lead_id: row.lead_id,
      customer_id: row.customer_id ?? '',
      phone_number: row.phone_number ?? '',
      alt_phone: row.alt_phone ?? '',
      type: row.type ?? '',
      booking_name: row.booking_name ?? '',
      shareholder_name: row.shareholder_name ?? '',
      address: row.address ?? '',
      area: row.area ?? '',
      day: row.day ?? '',
      booking_date: formatDate(row.booking_date),
      total_amount: row.total_amount ?? '',
      source: row.source ?? '',
      reference: row.reference ?? '',
      description: row.description ?? '',
    };
    setEditPreviousRow(initial);
    setEditRow({ ...initial });
    setEditErrors({});
    setEditOpen(true);
  };

  const validateLeadEdit = (row) => {
    const err = {};
    const trim = (v) => (v == null ? '' : String(v).trim());
    if (!trim(row.booking_name)) err.booking_name = 'Booking name is required';
    if (!trim(row.shareholder_name)) err.shareholder_name = 'Shareholder name is required';
    const phone = trim(row.phone_number);
    if (!phone) err.phone_number = 'Phone number is required';
    else if (!/^[\d\s\-+()]{7,20}$/.test(phone)) err.phone_number = 'Enter a valid phone number (7–20 digits/symbols)';
    const dateStr = trim(row.booking_date);
    if (dateStr) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) err.booking_date = 'Date must be YYYY-MM-DD';
      else if (Number.isNaN(new Date(dateStr).getTime())) err.booking_date = 'Invalid date';
    }
    const total = trim(row.total_amount);
    if (total !== '') {
      const n = Number(total);
      if (Number.isNaN(n) || n < 0) err.total_amount = 'Must be a number ≥ 0';
    }
    if (trim(row.phone_number).length > 20) err.phone_number = err.phone_number || 'Phone number too long';
    if (trim(row.booking_name).length > 100) err.booking_name = err.booking_name || 'Booking name too long';
    if (trim(row.shareholder_name).length > 100) err.shareholder_name = err.shareholder_name || 'Shareholder name too long';
    return err;
  };

  const handleSaveEdit = async () => {
    if (!editRow) return;
    const err = validateLeadEdit(editRow);
    if (Object.keys(err).length > 0) { setEditErrors(err); return; }
    setEditErrors({});
    setSaving(true);
    try {
      const payload = { ...editRow };
      delete payload.lead_id;
      if (payload.booking_date) payload.booking_date = String(payload.booking_date).split('T')[0] || payload.booking_date;
      const res = await fetch(`${API}/api/booking/leads/${encodeURIComponent(editRow.lead_id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setEditOpen(false);
        setEditRow(null);
        setEditPreviousRow(null);
        fetchLeads();
      } else {
        setEditErrors({ submit: data.message || 'Failed to update lead' });
      }
    } catch (e) {
      setEditErrors({ submit: 'Failed to update lead' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLead = async () => {
    if (!deleteConfirm) return;
    const leadId = deleteConfirm.lead_id;
    setDeleteConfirm(null);
    try {
      const res = await fetch(`${API}/api/booking/leads/${encodeURIComponent(leadId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSelectedIds((prev) => { const next = new Set(prev); next.delete(leadId); return next; });
        fetchLeads();
      } else {
        setError(data.message || 'Failed to delete lead');
      }
    } catch (e) {
      setError('Failed to delete lead');
    }
  };

  const handleExport = async () => {
    const ids = Array.from(selectedIds);
    // Fetch ALL leads matching current filters (paginate; server caps at 100 per request)
    let allLeads = [];
    const limit = 100;
    let pageNum = 1;
    let total = 0;
    do {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (orderType) params.set('order_type', orderType);
      if (day) params.set('day', day);
      if (reference) params.set('reference', reference);
      if (area) params.set('area', area);
      if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
      params.set('page', String(pageNum));
      params.set('limit', String(limit));
      const res = await fetch(`${API}/api/booking/leads?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError('Failed to load queries for export');
        return;
      }
      const json = await res.json();
      const data = Array.isArray(json) ? json : json.data;
      total = typeof json.total === 'number' ? json.total : 0;
      const chunk = Array.isArray(data) ? data : [];
      allLeads = allLeads.concat(chunk);
      if (chunk.length < limit || allLeads.length >= total) break;
      pageNum += 1;
    } while (true);

    const toExport = ids.length ? allLeads.filter((r) => ids.includes(r.lead_id)) : allLeads;
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
        if (col.key === 'created_at') return formatCreated(val);
        return val != null ? String(val) : '—';
      })
    );
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Queries');
    XLSX.writeFile(wb, `queries-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
    try {
      const filters = {};
      if (search?.trim()) filters.search = search.trim();
      if (area) filters.area = area;
      if (orderType) filters.order_type = orderType;
      if (day) filters.day = day;
      if (reference) filters.reference = reference;
      if (yearFilter) filters.year = yearFilter;
      const payload = {
        count: toExport.length,
        ...(Object.keys(filters).length > 0 && { filters }),
        ...(ids.length > 0 && { lead_ids: ids }),
      };
      await fetch(`${API}/api/booking/leads/export-audit`, {
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
          Query Management
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
            <option value="2024">Before 2025</option>
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
            onKeyDown={(e) => e.key === 'Enter' && fetchLeads()}
            style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }}
          />
        </div>
        <div style={filterFieldStyle(88)}>
          <label style={labelStyle}>Area</label>
          <select value={area} onChange={(e) => setArea(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }}>
            <option value="">All</option>
            {filters.areas?.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div style={filterFieldStyle(104)}>
          <label style={labelStyle}>Type</label>
          <select value={orderType} onChange={(e) => setOrderType(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }}>
            <option value="">All</option>
            {filters.order_types?.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={filterFieldStyle(80)}>
          <label style={labelStyle}>Day</label>
          <select value={day} onChange={(e) => setDay(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }}>
            <option value="">All</option>
            {filters.days?.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div style={filterFieldStyle(88)}>
          <label style={labelStyle}>Reference</label>
          <select value={reference} onChange={(e) => setReference(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }}>
            <option value="">All</option>
            {filters.references?.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button type="button" onClick={fetchLeads} style={{ padding: '6px 13px', height: '29px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Apply</button>
          <button type="button" onClick={handleResetFilters} style={{ padding: '6px 13px', height: '29px', background: '#fff', color: '#555', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Reset</button>
          <button type="button" onClick={handleExport} style={{ padding: '6px 13px', height: '29px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Export</button>
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
          <div style={{ padding: '32px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading queries...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', tableLayout: 'auto' }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap', width: '40px' }}>
                  <input type="checkbox" checked={leads.length > 0 && selectedIds.size === leads.length} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                </th>
                <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap', width: '120px' }}>Confirm Order</th>
                {COLUMNS.map((col) => (
                  <th key={col.key} style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' }}>{col.label}</th>
                ))}
                <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length + 3} style={{ padding: '24px', textAlign: 'center', color: '#666' }}>No queries found.</td>
                </tr>
              ) : (
                leads.map((row) => (
                  <tr key={row.lead_id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                      <input type="checkbox" checked={selectedIds.has(row.lead_id)} onChange={() => toggleSelect(row.lead_id)} style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleConfirmClick(row)}
                        disabled={confirmingLeadId === row.lead_id}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: '600',
                          background: confirmingLeadId === row.lead_id ? '#e0e0e0' : '#166534',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: confirmingLeadId === row.lead_id ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {confirmingLeadId === row.lead_id ? '...' : 'Confirm'}
                      </button>
                    </td>
                    {COLUMNS.map((col) => (
                      <td key={col.key} style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                        {AMOUNT_KEYS.includes(col.key) ? (
                          formatAmount(row[col.key])
                        ) : col.key === 'booking_date' ? (
                          formatDate(row[col.key])
                        ) : col.key === 'created_at' ? (
                          formatCreated(row[col.key])
                        ) : (
                          (row[col.key] != null ? String(row[col.key]) : '—')
                        )}
                      </td>
                    ))}
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                      <button type="button" onClick={() => handleEditLead(row)} title="Edit" style={{ marginRight: '8px', padding: '4px', cursor: 'pointer', background: 'none', border: 'none', verticalAlign: 'middle' }}><img src="/icons/edit.png" alt="Edit" style={{ width: '15px', height: '15px', display: 'block' }} /></button>
                      <button type="button" onClick={() => setDeleteConfirm(row)} title="Delete" style={{ padding: '4px', cursor: 'pointer', background: 'none', border: 'none', verticalAlign: 'middle' }}><img src="/icons/delete.png" alt="Delete" style={{ width: '18px', height: '18px', display: 'block' }} /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {confirmModalLead && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }} onClick={() => !confirmingLeadId && setConfirmModalLead(null)}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '400px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Confirm order</h3>
            <p style={{ margin: '0 0 16px 0', color: '#555' }}>Are you sure you want to create an order from lead &quot;{confirmModalLead.booking_name || confirmModalLead.lead_id}&quot;? This will move the lead to Orders.</p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => !confirmingLeadId && setConfirmModalLead(null)} disabled={!!confirmingLeadId} style={{ padding: '8px 16px', background: '#f5f5f5', border: 'none', borderRadius: '8px', cursor: confirmingLeadId ? 'not-allowed' : 'pointer' }}>No</button>
              <button type="button" onClick={handleConfirmOrder} disabled={!!confirmingLeadId} style={{ padding: '8px 16px', background: '#166534', color: '#fff', border: 'none', borderRadius: '8px', cursor: confirmingLeadId ? 'not-allowed' : 'pointer' }}>{confirmingLeadId ? '...' : 'Yes, confirm'}</button>
            </div>
          </div>
        </div>
      )}

      {editOpen && editRow && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => !saving && (setEditOpen(false), setEditRow(null), setEditPreviousRow(null))}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '16px 20px', width: 'min(680px, 95vw)', maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Edit Lead</h3>
            {(editErrors.submit || Object.keys(editErrors).some((k) => k !== 'submit' && editErrors[k])) && (
              <div style={{ marginBottom: '10px', padding: '8px', background: '#fef2f2', color: '#b91c1c', borderRadius: '6px', fontSize: '12px' }}>
                {editErrors.submit || 'Please fix the errors below.'}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
              {['customer_id', 'phone_number', 'alt_phone', 'type', 'booking_name', 'shareholder_name', 'address', 'area', 'day', 'booking_date', 'total_amount', 'source', 'reference'].map((key) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' }}>{key.replace(/_/g, ' ')}</label>
                  <input
                    disabled={key === 'lead_id'}
                    value={editRow[key] ?? ''}
                    onChange={(e) => { setEditRow((p) => ({ ...p, [key]: e.target.value })); if (editErrors[key]) setEditErrors((p) => ({ ...p, [key]: undefined })); }}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: editErrors[key] ? '1px solid #dc2626' : '1px solid #e0e0e0', fontSize: '13px' }}
                  />
                  {editErrors[key] && <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>{editErrors[key]}</div>}
                </div>
              ))}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' }}>description</label>
                <textarea value={editRow.description ?? ''} onChange={(e) => setEditRow((p) => ({ ...p, description: e.target.value }))} rows={2} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '13px' }} />
              </div>
            </div>
            <div style={{ marginTop: '14px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setEditOpen(false)} disabled={saving} style={{ padding: '6px 14px', fontSize: '13px', background: '#f5f5f5', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Close</button>
              <button type="button" onClick={handleSaveEdit} disabled={saving} style={{ padding: '6px 14px', fontSize: '13px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '400px' }}>
            <p style={{ margin: '0 0 16px 0' }}>Delete this lead permanently? This cannot be undone.</p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setDeleteConfirm(null)} style={{ padding: '8px 16px', background: '#f5f5f5', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={handleDeleteLead} style={{ padding: '8px 16px', background: '#c62828', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {!loading && totalCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', padding: '12px 0', borderTop: '1px solid #e0e0e0', marginTop: '8px' }}>
          <span style={{ fontSize: '13px', color: '#666' }}>
            Showing {leads.length} of {totalCount} queries
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
    </div>
  );
}
