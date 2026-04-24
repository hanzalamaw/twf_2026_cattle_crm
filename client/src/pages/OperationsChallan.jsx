import { useCallback, useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config/api';

const REGENERATE_EMAIL = 'hanzalamawahab@gmail.com';

const STATUS_STYLES = {
  Pending:            { bg: '#F5F5F5',  fg: '#666' },
  'Rider Assigned':   { bg: '#FFF8E1',  fg: '#F57C00' },
  Dispatched:         { bg: '#E3F2FD',  fg: '#1565C0' },
  Delivered:          { bg: '#E8F5E9',  fg: '#2E7D32' },
  'Returned to Farm': { bg: '#FFEBEE',  fg: '#C62828' },
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

const PAGE_SIZE = 50;

function formatAddress(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function short(v, n = 64) {
  const s = String(v ?? '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function generatePdf(items) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const left = 34, right = 561;
  let pageNo = 0;
  for (const item of items) {
    const orders = Array.isArray(item.orders) ? item.orders : [];
    const rowsPerPage = 22;
    const pages = Math.max(1, Math.ceil(orders.length / rowsPerPage));
    for (let p = 0; p < pages; p++) {
      if (pageNo > 0) doc.addPage();
      pageNo++;
      const c = item.challan;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
      doc.text(`Challan #${c.challan_id}`, left, 40);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      doc.text(`Date: ${c.challan_date || '—'}   Day/Slot: ${c.day || '—'} / ${c.slot || '—'}`, left, 58);
      doc.text(`Address: ${short(c.address, 90) || '—'}`, left, 73);
      doc.text(`Area: ${short(c.area || '—', 22)}   Rider: ${short(item.rider?.rider_name || '—', 22)}`, left, 88);
      doc.text(`Total hissa: ${c.total_hissa ?? 0}`, left, 103);
      doc.text(`Page ${p + 1}/${pages}`, right, 40, { align: 'right' });
      doc.setFillColor(245, 245, 245);
      doc.rect(left, 120, right - left, 18, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.text('Order', left + 8, 132);
      doc.text('Contact', left + 76, 132);
      doc.text('Shareholder', left + 182, 132);
      doc.text('Type / Hissa', left + 380, 132);
      doc.setFont('helvetica', 'normal');
      let y = 150;
      const start = p * rowsPerPage;
      const end = Math.min(start + rowsPerPage, orders.length);
      if (start >= end) {
        doc.text('No orders linked to this challan.', left + 8, y);
      } else {
        for (let i = start; i < end; i++) {
          const o = orders[i];
          doc.text(String(o.order_id ?? '—'), left + 8, y);
          doc.text(short(o.contact || '—', 20), left + 76, y);
          doc.text(short(o.shareholder_name || '—', 42), left + 182, y);
          doc.text(short(`${o.order_type || '—'} / ${o.hissa_number || '—'}`, 24), left + 380, y);
          y += 18;
        }
      }
    }
  }
  doc.save(`challan-${new Date().toISOString().slice(0, 10)}.pdf`);
}

const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px', background: '#fff' };

export default function OperationsChallan() {
  const { user, authFetch } = useAuth();
  const emailOk = (user?.email || '').trim().toLowerCase() === REGENERATE_EMAIL;

  const [challans,      setChallans]      = useState([]);
  const [batches,       setBatches]       = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [riders,        setRiders]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [msg,           setMsg]           = useState('');
  const [err,           setErr]           = useState('');
  const [busy,          setBusy]          = useState(false);
  const [confirmRegen,  setConfirmRegen]  = useState(false);

  const [search,      setSearch]      = useState('');
  const [filterDay,   setFilterDay]   = useState('');
  const [filterSlot,  setFilterSlot]  = useState('');
  const [page,        setPage]        = useState(1);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [modal,       setModal]       = useState(null);

  const loadBatches = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/operations/batches`);
      if (!res.ok) return;
      const data = await res.json();
      setBatches(data.batches || []);
      if (data.batches?.length && selectedBatch === null) setSelectedBatch(data.batches[0].batch_id);
    } catch { /* silent */ }
  }, [authFetch, selectedBatch]);

  const loadRiders = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/operations/riders`);
      if (res.ok) setRiders(await res.json());
    } catch { /* silent */ }
  }, [authFetch]);

  const load = useCallback(async () => {
    setErr(''); setLoading(true);
    try {
      const qs = selectedBatch ? `?batch_id=${selectedBatch}` : '';
      const res = await authFetch(`${API_BASE}/operations/challans${qs}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to load challans');
      const data = await res.json();
      setChallans(data.challans || []);
    } catch (e) {
      setErr(e.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [authFetch, selectedBatch]);

  useEffect(() => { loadBatches(); loadRiders(); }, []);
  useEffect(() => { if (selectedBatch !== null) load(); }, [load, selectedBatch]);

  const riderMap = useMemo(() => {
    const m = {};
    riders.forEach((r) => { m[r.rider_id] = r.rider_name; });
    return m;
  }, [riders]);

  const dayOptions  = useMemo(() => [...new Set(challans.map((c) => String(c.day || '').trim()).filter(Boolean))].sort(), [challans]);
  const slotOptions = useMemo(() => {
    const all = new Set();
    challans.forEach((c) => String(c.slot || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => all.add(s)));
    return [...all].sort();
  }, [challans]);

  const displayRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return challans.filter((c) => {
      if (filterDay && String(c.day || '').trim() !== filterDay) return false;
      if (filterSlot) {
        const slots = String(c.slot || '').split(',').map((s) => s.trim()).filter(Boolean);
        if (!slots.includes(filterSlot)) return false;
      }
      if (!q) return true;
      const hay = [c.address, c.area, c.day, c.slot, c.booking_name, c.shareholders_csv].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [challans, search, filterDay, filterSlot]);

  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  const pagedRows  = useMemo(() => displayRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [displayRows, page]);
  useEffect(() => { setPage(1); }, [search, filterDay, filterSlot, selectedBatch]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const toggleOne = (id) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = () => {
    const allSel = displayRows.length > 0 && displayRows.every((c) => selectedIds.has(c.challan_id));
    setSelectedIds(allSel ? new Set() : new Set(displayRows.map((c) => c.challan_id)));
  };
  const allFilteredSelected = displayRows.length > 0 && displayRows.every((c) => selectedIds.has(c.challan_id));

  const openChallanModal = async (token) => {
    if (!token) return;
    setErr('');
    const res = await authFetch(`${API_BASE}/operations/challans/by-token/${encodeURIComponent(token)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.message || 'Challan not found'); return; }
    setModal(data);
  };

  const doRegenerate = async () => {
    setConfirmRegen(false); setBusy(true); setErr('');
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/regenerate-from-orders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Regenerate failed');
      setMsg(`Batch "${data.batch_label}" created — ${data.groups ?? 0} challan groups.`);
      const bRes = await authFetch(`${API_BASE}/operations/batches`);
      if (bRes.ok) {
        const bData = await bRes.json();
        setBatches(bData.batches || []);
        if (bData.batches?.length) setSelectedBatch(bData.batches[0].batch_id);
      }
    } catch (e) { setErr(e.message || 'Regenerate failed'); }
    setBusy(false);
  };

  const onPrintPdf = async () => {
    const ids = selectedIds.size ? [...selectedIds] : displayRows.map((c) => c.challan_id);
    if (!ids.length) return alert('No challans to print.');
    setBusy(true); setErr('');
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/bulk-detail`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challan_ids: ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not build PDF');
      if (!Array.isArray(data.items) || data.items.length === 0) throw new Error('No data to print');
      generatePdf(data.items);
    } catch (e) { setErr(e.message || 'PDF generation failed'); }
    setBusy(false);
  };

  function challanDerivedStatus(c) {
    const total = Number(c.orders_total || 0);
    const delivered = Number(c.orders_delivered || 0);
    if (total === 0) return 'Pending';
    if (delivered === total) return 'Delivered';
    if (delivered > 0) return 'Dispatched';
    if (c.rider_id) return 'Rider Assigned';
    return 'Pending';
  }

  const selectedBatchLabel = batches.find((b) => b.batch_id === selectedBatch)?.label || '';

  return (
    <>
      <div style={{ padding: '19px', fontFamily: "'Poppins','Inter',sans-serif", display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333' }}>Challan Management</h2>
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#888' }}>
              Showing challans for the selected batch. Print PDF respects active filters; selected rows only if any are checked.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {busy && <span style={{ fontSize: '10px', color: '#999', fontWeight: '600' }}>Working…</span>}
            {/* Batch dropdown */}
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

        <div style={{ borderTop: '1px solid #e6e6e6', marginBottom: '12px' }} />

        {/* Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '14px', alignItems: 'flex-end', flexShrink: 0 }}>
          <div style={{ flex: '1 1 280px', minWidth: 200 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Search</label>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} style={inputStyle} placeholder="Address, area, shareholders…" />
          </div>
          <div style={{ width: 130 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Day</label>
            <select value={filterDay} onChange={(e) => setFilterDay(e.target.value)} style={inputStyle}>
              <option value="">All</option>
              {dayOptions.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div style={{ width: 130 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Slot</label>
            <select value={filterSlot} onChange={(e) => setFilterSlot(e.target.value)} style={inputStyle}>
              <option value="">All</option>
              {slotOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" disabled={busy} onClick={onPrintPdf}
              style={{ padding: '6px 13px', height: '29px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>Print PDF</button>
            <button type="button" onClick={load}
              style={{ padding: '6px 13px', height: '29px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>Refresh</button>
            {emailOk && (
              <button type="button" onClick={() => setConfirmRegen(true)}
                style={{ padding: '6px 13px', height: '29px', background: '#FFEBEE', color: '#C62828', border: '1px solid #FFCDD2', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>
                Generate data (new batch)
              </button>
            )}
          </div>
        </div>

        {msg && <div style={{ padding: '10px', background: '#E8F5E9', color: '#2E7D32', borderRadius: '6px', marginBottom: '12px', fontSize: '10px', fontWeight: '600' }}>{msg}</div>}
        {err && <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', marginBottom: '13px', fontSize: '10px', fontWeight: '600' }}>{err}</div>}

        {!loading && (
          <div style={{ fontSize: '10px', color: '#999', marginBottom: '8px', flexShrink: 0 }}>
            Showing {displayRows.length} of {challans.length} challan{challans.length !== 1 ? 's' : ''}
          </div>
        )}

        {/* Table */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', borderRadius: '10px', border: '1px solid #ececec' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading…</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: '#fafafa' }}>
                  <th style={{ padding: '10px 10px', borderBottom: '1px solid #e0e0e0' }}>
                    <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} />
                  </th>
                  {['Status', 'Rider', 'Customer ID', 'Booking Name', 'Address', 'Phone', 'Alt Phone', 'Day / Slot', 'Area', 'Standard', 'Premium', 'Goat (Hissa)', 'Total Hissa', 'Shareholders'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 10px', borderBottom: '1px solid #e0e0e0', color: '#555', fontWeight: '600', whiteSpace: 'nowrap', fontSize: '10px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedRows.length === 0 ? (
                  <tr><td colSpan={15} style={{ padding: '40px', textAlign: 'center', color: '#666', fontSize: '11px' }}>No rows found.</td></tr>
                ) : pagedRows.map((c, idx) => {
                  const st = challanDerivedStatus(c);
                  const names = c.shareholders_csv || '—';
                  const contacts = c.contacts_csv || '—';
                  const altContacts = c.alt_contacts_csv || '';
                  const customerIds = c.customer_ids_csv || '—';
                  return (
                    <tr key={c.challan_id}
                      style={{ borderBottom: '1px solid #f3f3f3', background: idx % 2 === 0 ? '#fff' : '#FAFAFA', cursor: c.qr_token ? 'pointer' : 'default' }}
                      onClick={() => c.qr_token && openChallanModal(c.qr_token)}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f5f9ff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#FAFAFA'; }}
                    >
                      <td style={{ padding: '9px 10px' }} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.has(c.challan_id)} onChange={() => toggleOne(c.challan_id)} />
                      </td>
                      <td style={{ padding: '9px 10px' }}><StatusBadge status={st} /></td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>
                        {c.rider_id ? (riderMap[c.rider_id] || `Rider #${c.rider_id}`) : <span style={{ color: '#bbb', fontStyle: 'italic' }}>Unassigned</span>}
                      </td>
                      <td style={{ padding: '9px 10px', color: '#777', fontWeight: '500' }}>{customerIds}</td>
                      <td style={{ padding: '9px 10px', fontWeight: '500', color: '#333' }}>{c.booking_name || '—'}</td>
                      <td style={{ padding: '9px 10px', color: '#555', maxWidth: '200px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatAddress(c.address) || '—'}</div>
                      </td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{contacts}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{altContacts || <span style={{ color: '#ccc' }}>—</span>}</td>
                      <td style={{ padding: '9px 10px', color: '#555', whiteSpace: 'nowrap' }}>
                        <div>{c.day || '—'}</div>
                        {c.slot && <div style={{ fontSize: '9px', color: '#aaa' }}>{c.slot}</div>}
                      </td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{c.area || '—'}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{c.total_standard_hissa || 0}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{c.total_premium_hissa || 0}</td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>{c.total_goat_hissa || 0}</td>
                      <td style={{ padding: '9px 10px', color: '#555', fontWeight: '600' }}>{c.total_hissa ?? c.order_count ?? '—'}</td>
                      <td style={{ padding: '9px 10px', color: '#666', maxWidth: '160px' }} title={names}>
                        {names.length > 48 ? `${names.slice(0, 48)}…` : names}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && displayRows.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', paddingTop: '10px', flexShrink: 0 }}>
            <span style={{ fontSize: '10px', color: '#999' }}>Showing {pagedRows.length} of {displayRows.length} challans</span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
              <span style={{ fontSize: '10px' }}>Page {page}/{totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Confirm regenerate */}
      {confirmRegen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setConfirmRegen(false)}>
          <div style={{ background: '#fff', borderRadius: '18px', border: '1.5px solid #F0F0F0', padding: '20px', maxWidth: '440px', width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.12)' }}
            onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: '600', color: '#333' }}>Generate new batch of challans?</h2>
            <p style={{ margin: '0 0 18px', fontSize: '12px', color: '#666' }}>
              This creates a <strong>new batch</strong> from current 2026 orders. Existing batches and their challans are preserved.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setConfirmRegen(false)}
                style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #e0e0e0', background: '#fff', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
              <button type="button" onClick={doRegenerate}
                style={{ padding: '9px 18px', borderRadius: '8px', background: '#C62828', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Yes, generate</button>
            </div>
          </div>
        </div>
      )}

      {/* Challan detail modal — view only, no status/rider editing */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
          onClick={() => setModal(null)} role="presentation">
          <div style={{ background: '#FFFFFF', borderRadius: '18px', border: '1.5px solid #F0F0F0', padding: '20px', maxWidth: '620px', width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.12)' }}
            onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Challan #${modal.challan?.challan_id}`}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#333' }}>Challan #{modal.challan?.challan_id}</h2>
              <button type="button" onClick={() => setModal(null)} style={{ background: 'none', border: 'none', fontSize: '24px', color: '#888', cursor: 'pointer', lineHeight: 1, width: '30px', height: '30px' }}>×</button>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <StatusBadge status={modal.challan?.derived_status} />
            </div>

            {[
              ['Address', modal.challan?.address ? formatAddress(modal.challan.address) : '—'],
              ['Area',    modal.challan?.area || '—'],
              ['Day',     modal.challan?.day || '—'],
              ['Slot',    modal.challan?.slot || '—'],
              ['Rider',   modal.rider?.rider_name || 'Unassigned'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', gap: '8px', marginBottom: '8px', fontSize: '11px' }}>
                <span style={{ fontWeight: '600', minWidth: '70px', flexShrink: 0, color: '#555' }}>{label}:</span>
                <span style={{ color: value === 'Unassigned' ? '#bbb' : '#333', fontStyle: value === 'Unassigned' ? 'italic' : 'normal' }}>{value}</span>
              </div>
            ))}

            <div style={{ borderTop: '1px solid #f0f0f0', marginBottom: '10px', marginTop: '14px' }} />
            <p style={{ margin: '0 0 8px', fontSize: '11px', fontWeight: '600', color: '#333' }}>Orders on this challan</p>
            <div style={{ maxHeight: '320px', overflow: 'auto', border: '1px solid #F0F0F0', borderRadius: '8px' }}>
              <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0 }}>
                  <tr style={{ background: '#FAFAFA' }}>
                    {['Order', 'Contact', 'Alt Contact', 'Shareholder', 'Type', 'Cow #', 'Hissa #', 'Slot', 'Description', 'Status'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px', fontWeight: '600', color: '#555', borderBottom: '1px solid #E0E0E0', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(modal.orders || []).length === 0 ? (
                    <tr><td colSpan={10} style={{ padding: '20px', textAlign: 'center', color: '#aaa', fontSize: '10px' }}>No orders linked.</td></tr>
                  ) : (modal.orders || []).map((o, i) => (
                    <tr key={o.order_id} style={{ borderBottom: '1px solid #F0F0F0', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={{ padding: '8px', color: '#777' }}>#{o.order_id}</td>
                      <td style={{ padding: '8px', color: '#555' }}>{o.contact || '—'}</td>
                      <td style={{ padding: '8px', color: '#555' }}>{o.alt_contact || '—'}</td>
                      <td style={{ padding: '8px', color: '#333', fontWeight: '500' }}>{o.shareholder_name || '—'}</td>
                      <td style={{ padding: '8px', color: '#555', whiteSpace: 'nowrap' }}>{o.order_type || '—'}</td>
                      <td style={{ padding: '8px', color: '#555' }}>{o.cow_number ? `Cow ${o.cow_number}` : '—'}</td>
                      <td style={{ padding: '8px', color: '#555' }}>{o.hissa_number ? `Hissa ${o.hissa_number}` : '—'}</td>
                      <td style={{ padding: '8px', color: '#555', whiteSpace: 'nowrap' }}>{o.slot || '—'}</td>
                      <td style={{ padding: '8px', color: '#555', maxWidth: '120px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.description || ''}>{o.description || '—'}</div>
                      </td>
                      <td style={{ padding: '8px' }}><StatusBadge status={o.delivery_status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button type="button" onClick={() => setModal(null)}
                style={{ padding: '9px 20px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}