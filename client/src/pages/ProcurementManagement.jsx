import { useCallback, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { API_BASE as API } from '../config/api';
import { useAuth } from '../context/AuthContext';
const PAGE_SIZE = 50;

const COLUMNS = [
  { key: 'procurement_id', label: 'Procurement ID' },
  { key: 'type', label: 'Type' },
  { key: 'no_of_animals', label: 'No. of animals' },
  { key: 'price_per_unit', label: 'Price per unit' },
  { key: 'total_price', label: 'Total price' },
  { key: 'price_paid', label: 'Price paid' },
  { key: 'price_due', label: 'Price due' },
  { key: 'per_unit_weight', label: 'Per unit weight' },
  { key: 'date', label: 'Date' },
];

const AMOUNT_KEYS = ['price_per_unit', 'total_price', 'price_paid', 'price_due', 'per_unit_weight'];

function formatAmount(val) {
  if (val == null || val === '') return '—';
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  return Math.round(n).toLocaleString('en-PK');
}

function formatDate(val) {
  if (val == null || val === '') return '—';
  const s = String(val);
  return s.includes('T') ? s.split('T')[0] : s;
}

const defaultEditRow = () => ({
  procurement_id: '',
  type: '',
  no_of_animals: '',
  price_per_unit: '',
  total_price: '',
  price_paid: '',
  price_due: '',
  per_unit_weight: '',
  date: '',
});

function n2(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function money(n) {
  if (!Number.isFinite(n)) return '';
  return (Math.round(n * 100) / 100).toFixed(2);
}

export default function ProcurementManagement() {
  const { authFetch } = useAuth();
  const token = localStorage.getItem('token');

  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ types: [] });
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [yearFilter, setYearFilter] = useState('2026');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(defaultEditRow);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const lastPriceEditedRef = useRef('total'); // total | ppu
  const lastPayEditedRef = useRef('paid'); // paid | due

  const fetchFilters = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
      const url = `${API}/procurement/filters${params.toString() ? `?${params}` : ''}`;
      const res = await authFetch(url);
      if (res.ok) setFilters(await res.json());
    } catch {
      // ignore
    }
  }, [authFetch, yearFilter]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (type) params.set('type', type);
      if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));

      const res = await authFetch(`${API}/procurement?${params}`);
      if (!res.ok) {
        setError('Failed to load procurements');
        return;
      }
      const json = await res.json();
      setRows(Array.isArray(json.data) ? json.data : []);
      setTotalCount(typeof json.total === 'number' ? json.total : (json.data?.length ?? 0));
    } catch {
      setError('Failed to load procurements');
    } finally {
      setLoading(false);
    }
  }, [authFetch, search, type, yearFilter, page]);

  useEffect(() => { fetchFilters(); }, [fetchFilters]);
  useEffect(() => { setPage(1); }, [search, type, yearFilter]);
  useEffect(() => { fetchRows(); }, [fetchRows]);

  const toggleSelect = (id) => setSelectedIds((p) => {
    const n = new Set(p);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const toggleSelectAll = () => {
    if (rows.length > 0 && selectedIds.size === rows.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(rows.map((r) => r.procurement_id)));
  };

  const handleEdit = (r) => {
    setEditRow({
      procurement_id: r.procurement_id,
      type: r.type ?? '',
      no_of_animals: r.no_of_animals ?? '',
      price_per_unit: r.price_per_unit ?? '',
      total_price: r.total_price ?? '',
      price_paid: r.price_paid ?? '',
      price_due: r.price_due ?? '',
      per_unit_weight: r.per_unit_weight ?? '',
      date: formatDate(r.date),
    });
    lastPriceEditedRef.current = 'total';
    lastPayEditedRef.current = 'paid';
    setEditOpen(true);
  };

  // auto-calcs in edit modal
  useEffect(() => {
    if (!editOpen) return;
    const animals = Math.max(0, parseInt(editRow.no_of_animals, 10) || 0);
    if (animals <= 0) return;

    const total = n2(editRow.total_price);
    const ppu = n2(editRow.price_per_unit);

    if (lastPriceEditedRef.current === 'total' && total != null) {
      const nextPpu = money(total / animals);
      if (String(editRow.price_per_unit) !== nextPpu) setEditRow((p) => ({ ...p, price_per_unit: nextPpu }));
      return;
    }
    if (lastPriceEditedRef.current === 'ppu' && ppu != null) {
      const nextTotal = money(ppu * animals);
      if (String(editRow.total_price) !== nextTotal) setEditRow((p) => ({ ...p, total_price: nextTotal }));
    }
  }, [editOpen, editRow.no_of_animals, editRow.total_price, editRow.price_per_unit]);

  useEffect(() => {
    if (!editOpen) return;
    const total = n2(editRow.total_price) ?? 0;
    const paid = n2(editRow.price_paid);
    const due = n2(editRow.price_due);

    if (lastPayEditedRef.current === 'paid') {
      const nextDue = money(Math.max(0, total - (paid ?? 0)));
      if (String(editRow.price_due) !== nextDue) setEditRow((p) => ({ ...p, price_due: nextDue }));
      return;
    }
    const nextPaid = money(Math.max(0, total - (due ?? 0)));
    if (String(editRow.price_paid) !== nextPaid) setEditRow((p) => ({ ...p, price_paid: nextPaid }));
  }, [editOpen, editRow.total_price, editRow.price_paid, editRow.price_due]);

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const res = await authFetch(`${API}/procurement/${encodeURIComponent(editRow.procurement_id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: editRow.type,
          no_of_animals: editRow.no_of_animals,
          price_per_unit: editRow.price_per_unit,
          total_price: editRow.total_price,
          price_paid: editRow.price_paid,
          price_due: editRow.price_due,
          per_unit_weight: editRow.per_unit_weight,
          date: editRow.date,
        }),
      });
      if (res.ok) {
        setEditOpen(false);
        fetchRows();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || 'Failed to update procurement');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    try {
      const res = await authFetch(`${API}/procurement/${encodeURIComponent(deleteConfirm.procurement_id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setDeleteConfirm(null);
        setSelectedIds((p) => {
          const n = new Set(p);
          n.delete(deleteConfirm.procurement_id);
          return n;
        });
        fetchRows();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || 'Failed to delete');
      }
    } finally {
      setDeleteConfirm(null);
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setType('');
    setYearFilter('2026');
    setSelectedIds(new Set());
    setError('');
  };

  const handleExport = async () => {
    try {
      const ids = Array.from(selectedIds);
      // fetch all data for export with current filters
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (type) params.set('type', type);
      if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);

      const limit = 100;
      let pageNum = 1;
      let all = [];
      let total = 0;
      let keepGoing = true;

      while (keepGoing) {
        params.set('page', String(pageNum));
        params.set('limit', String(limit));
        const res = await authFetch(`${API}/procurement?${params}`);
        if (!res.ok) { alert('Failed to load data for export'); return; }
        const json = await res.json();
        const data = Array.isArray(json.data) ? json.data : [];
        total = typeof json.total === 'number' ? json.total : 0;
        all = all.concat(data);
        if (data.length < limit || all.length >= total) keepGoing = false;
        pageNum++;
        if (pageNum > 200) keepGoing = false; // safety guard
      }

      const toExport = ids.length > 0 ? all.filter((r) => ids.includes(r.procurement_id)) : all;
      if (!toExport.length) { alert('No data to export'); return; }

      const headers = COLUMNS.map((c) => c.label);
      const rows2 = toExport.map((row) => COLUMNS.map((col) => {
        const val = row[col.key];
        if (AMOUNT_KEYS.includes(col.key)) {
          const n = Number(val);
          return Number.isFinite(n) ? n : (val ?? '');
        }
        if (col.key === 'date') return formatDate(val);
        return val != null ? String(val) : '—';
      }));

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows2]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Procurements');
      XLSX.writeFile(wb, `procurements-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      alert('Export failed');
    }
  };

  return (
    <>
      <style>{`
        @keyframes modalSlideInFromLeft {
          from { transform: translateX(-18px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @media (max-width: 767px) {
          .pm-root { padding: 16px 12px 24px !important; overflow: auto !important; }
          .pm-header { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; margin-bottom: 12px !important; }
          .pm-header h2 { font-size: 16px !important; }
          .pm-filter { flex-wrap: wrap !important; }
          .pm-table-wrap { display: block !important; }
          .pm-edit-modal-wrap { align-items: flex-end !important; padding: 0 !important; }
          .pm-edit-modal-box {
            border-radius: 20px 20px 0 0 !important;
            width: 100vw !important;
            max-width: 100vw !important;
            max-height: 92dvh !important;
            padding: 20px 16px 36px !important;
            animation: modalSlideInFromLeft .25s ease-out both !important;
          }
          .pm-edit-grid { grid-template-columns: 1fr 1fr !important; gap: 10px 12px !important; }
          .pm-edit-actions { flex-direction: column !important; }
          .pm-edit-actions button { width: 100% !important; padding: 13px !important; font-size: 13px !important; border-radius: 10px !important; }
        }
      `}</style>

      <div className="pm-root" style={{ padding: '19px', fontFamily: "'Poppins','Inter',sans-serif", display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>
        <div className="pm-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333', whiteSpace: 'nowrap' }}>Procurement Management</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '10px', color: '#666', whiteSpace: 'nowrap' }}>Year</label>
            <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px', minWidth: '112px' }}>
              <option value="all">All</option>
              <option value="2026">Year 2026</option>
              <option value="2025">Year 2025</option>
              <option value="2024">Year 2024</option>
            </select>
          </div>
        </div>

        <div className="pm-filter" style={{ display: 'flex', flexWrap: 'nowrap', gap: '10px', marginBottom: '16px', alignItems: 'flex-end', overflowX: 'auto', minWidth: 0, flexShrink: 0 }}>
          <div style={{ flex: '1 1 180px', minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Search (ID, type)</label>
            <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fetchRows()} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }} />
          </div>
          <div style={{ width: 180, minWidth: 180, flexShrink: 0 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px', whiteSpace: 'nowrap' }}>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }}>
              <option value="">All</option>
              {(filters.types || []).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button type="button" onClick={fetchRows} style={{ padding: '6px 13px', height: '29px', background: '#1565C0', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Apply</button>
            <button type="button" onClick={handleResetFilters} style={{ padding: '6px 13px', height: '29px', background: '#fff', color: '#555', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Reset</button>
            <button type="button" onClick={handleExport} style={{ padding: '6px 13px', height: '29px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Export</button>
          </div>
        </div>

        {error && <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', marginBottom: '13px', flexShrink: 0, fontSize: '10px' }}>{error}</div>}

        <div className="pm-table-wrap" style={{ flex: 1, minHeight: '304px', overflow: 'auto', border: '1px solid #e0e0e0', borderRadius: '6px', background: '#fff' }}>
          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading procurements...</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', tableLayout: 'auto' }}>
              <thead>
                <tr style={{ background: '#f5f5f5' }}>
                  <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap', width: '40px' }}>
                    <input type="checkbox" checked={rows.length > 0 && selectedIds.size === rows.length} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                  </th>
                  {COLUMNS.map((col) => (
                    <th key={col.key} style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' }}>{col.label}</th>
                  ))}
                  <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={COLUMNS.length + 2} style={{ padding: '24px', textAlign: 'center', color: '#666' }}>No procurements found.</td></tr>
                ) : rows.map((row) => (
                  <tr key={row.procurement_id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '6px', whiteSpace: 'nowrap', fontSize: '11px' }}>
                      <input type="checkbox" checked={selectedIds.has(row.procurement_id)} onChange={() => toggleSelect(row.procurement_id)} style={{ cursor: 'pointer' }} />
                    </td>
                    {COLUMNS.map((col) => (
                      <td key={col.key} style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                        {AMOUNT_KEYS.includes(col.key) ? formatAmount(row[col.key])
                          : col.key === 'date' ? formatDate(row[col.key])
                          : (row[col.key] != null ? String(row[col.key]) : '—')}
                      </td>
                    ))}
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                      <button type="button" onClick={() => handleEdit(row)} title="Edit" style={{ marginRight: '6px', padding: '4px', cursor: 'pointer', background: 'none', border: 'none', verticalAlign: 'middle' }}>
                        <img src="/icons/edit.png" alt="Edit" style={{ width: '15px', height: '15px', display: 'block' }} />
                      </button>
                      <button type="button" onClick={() => setDeleteConfirm(row)} title="Delete" style={{ padding: '4px', cursor: 'pointer', background: 'none', border: 'none', verticalAlign: 'middle' }}>
                        <img src="/icons/delete.png" alt="Delete" style={{ width: '18px', height: '18px', display: 'block' }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!loading && totalCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', padding: '12px 0', borderTop: '1px solid #e0e0e0', marginTop: '8px', flexShrink: 0 }}>
            <span style={{ fontSize: '13px', color: '#666' }}>Showing {rows.length} of {totalCount} procurements</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ padding: '6px 12px', fontSize: '10px', background: page <= 1 ? '#f0f0f0' : '#fff', color: page <= 1 ? '#999' : '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>Previous</button>
              {(() => {
                const sp = 5;
                let start = Math.max(1, page - Math.floor(sp / 2));
                let end = Math.min(totalPages, start + sp - 1);
                if (end - start + 1 < sp) start = Math.max(1, end - sp + 1);
                const pages = [];
                for (let i = start; i <= end; i++) pages.push(i);
                return pages.map((p) => (
                  <button key={p} type="button" onClick={() => setPage(p)} style={{ minWidth: '32px', padding: '6px 10px', fontSize: '10px', background: p === page ? '#1565C0' : '#fff', color: p === page ? '#fff' : '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: 'pointer', fontWeight: p === page ? 600 : 400 }}>{p}</button>
                ));
              })()}
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} style={{ padding: '6px 12px', fontSize: '10px', background: page >= totalPages ? '#f0f0f0' : '#fff', color: page >= totalPages ? '#999' : '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}>Next</button>
            </div>
          </div>
        )}

        {editOpen && (
          <div className="pm-edit-modal-wrap" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={() => !saving && setEditOpen(false)}>
            <div className="pm-edit-modal-box" style={{ background: '#fff', borderRadius: '12px', padding: '16px 20px', width: 'min(680px, 95vw)', maxHeight: '85vh', overflowY: 'auto', boxSizing: 'border-box' }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Edit Procurement</h3>
              <div className="pm-edit-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                {[
                  { key: 'procurement_id', ro: true },
                  { key: 'type', ro: false },
                  { key: 'no_of_animals', ro: false },
                  { key: 'total_price', ro: false },
                  { key: 'price_per_unit', ro: false },
                  { key: 'price_paid', ro: false },
                  { key: 'price_due', ro: false },
                  { key: 'per_unit_weight', ro: false },
                  { key: 'date', ro: false },
                ].map(({ key, ro }) => (
                  <div key={key} style={{ minWidth: 0 }}>
                    <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '2px' }}>{key.replace(/_/g, ' ')}</label>
                    {key === 'type' ? (
                      <select
                        disabled={ro}
                        value={editRow[key] ?? ''}
                        onChange={(e) => setEditRow((p) => ({ ...p, [key]: e.target.value }))}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '10px', ...(ro && { backgroundColor: '#f5f5f5', cursor: 'not-allowed' }) }}
                      >
                        <option value="">Select type</option>
                        {(filters.types?.length ? filters.types : ['Cow (Premium)', 'Cow(Standard)', 'Goat']).map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    ) : (
                      <input
                        disabled={ro}
                        readOnly={ro}
                        type={key === 'date' ? 'date' : (key === 'no_of_animals' ? 'number' : 'text')}
                        value={editRow[key] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (key === 'total_price') lastPriceEditedRef.current = 'total';
                          if (key === 'price_per_unit') lastPriceEditedRef.current = 'ppu';
                          if (key === 'price_paid') lastPayEditedRef.current = 'paid';
                          if (key === 'price_due') lastPayEditedRef.current = 'due';
                          setEditRow((p) => ({ ...p, [key]: val }));
                        }}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '10px', ...(ro && { backgroundColor: '#f5f5f5', cursor: 'not-allowed' }) }}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="pm-edit-actions" style={{ marginTop: '14px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setEditOpen(false)} disabled={saving} style={{ padding: '5px 11px', fontSize: '10px', background: '#f5f5f5', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Close</button>
                <button type="button" onClick={handleSaveEdit} disabled={saving} style={{ padding: '5px 11px', fontSize: '10px', background: '#1565C0', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </div>
          </div>
        )}

        {deleteConfirm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: '16px' }}>
            <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '400px', width: '100%' }}>
              <p style={{ margin: '0 0 16px 0', fontSize: '14px' }}>Delete procurement <strong>{deleteConfirm.procurement_id}</strong>? This cannot be undone.</p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setDeleteConfirm(null)} style={{ padding: '8px 16px', background: '#f5f5f5', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>No</button>
                <button type="button" onClick={handleDeleteConfirm} style={{ padding: '8px 16px', background: '#c62828', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Yes, delete</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}

