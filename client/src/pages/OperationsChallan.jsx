import { useCallback, useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config/api';

const REGENERATE_EMAIL = 'hanzalamawahab@gmail.com';

function statusBadge(s) {
  const st = s || 'Pending';
  const map = {
    Delivered: { bg: '#E8F5E9', fg: '#2E7D32' },
    Dispatched: { bg: '#E3F2FD', fg: '#1565C0' },
    'Rider Assigned': { bg: '#FFF8E1', fg: '#F57C00' },
    'Returned to Farm': { bg: '#FFEBEE', fg: '#C62828' },
    Pending: { bg: '#F5F5F5', fg: '#666' },
  };
  const { bg, fg } = map[st] || map.Pending;
  return <span style={{ padding: '3px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '500', background: bg, color: fg, whiteSpace: 'nowrap' }}>{st}</span>;
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
  const left = 34;
  const right = 561;
  let pageNo = 0;

  for (const item of items) {
    const orders = Array.isArray(item.orders) ? item.orders : [];
    const rowsPerPage = 22;
    const pages = Math.max(1, Math.ceil(orders.length / rowsPerPage));
    for (let p = 0; p < pages; p += 1) {
      if (pageNo > 0) doc.addPage();
      pageNo += 1;
      const c = item.challan;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text(`Challan #${c.challan_id}`, left, 40);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Date: ${c.challan_date || '—'}   Day/Slot: ${c.day || '—'} / ${c.slot || '—'}`, left, 58);
      doc.text(`Address: ${short(c.address, 90) || '—'}`, left, 73);
      doc.text(`Area: ${short(c.area || '—', 22)}   Rider: ${short(item.rider?.rider_name || '—', 22)}   Status: ${c.delivery_status || 'Pending'}`, left, 88);
      doc.text(`Total hissa: ${c.total_hissa ?? 0}`, left, 103);
      doc.text(`Page ${p + 1}/${pages}`, right, 40, { align: 'right' });
      doc.setFillColor(245, 245, 245);
      doc.rect(left, 120, right - left, 18, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('Order', left + 8, 132);
      doc.text('Contact', left + 76, 132);
      doc.text('Shareholder', left + 182, 132);
      doc.text('Type / Hissa', left + 410, 132);
      doc.setFont('helvetica', 'normal');
      let y = 150;
      const start = p * rowsPerPage;
      const end = Math.min(start + rowsPerPage, orders.length);
      if (start >= end) {
        doc.text('No orders linked to this challan.', left + 8, y);
      } else {
        for (let i = start; i < end; i += 1) {
          const o = orders[i];
          doc.text(String(o.order_id ?? '—'), left + 8, y);
          doc.text(short(o.contact || '—', 20), left + 76, y);
          doc.text(short(o.shareholder_name || '—', 42), left + 182, y);
          doc.text(short(`${o.order_type || '—'} / ${o.hissa_number || '—'}`, 24), left + 410, y);
          y += 18;
        }
      }
    }
  }
  doc.save(`challan-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export default function OperationsChallan() {
  const { user, authFetch } = useAuth();
  const emailOk = (user?.email || '').trim().toLowerCase() === REGENERATE_EMAIL;
  const [challans, setChallans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterDay, setFilterDay] = useState('');
  const [filterSlot, setFilterSlot] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      const cRes = await authFetch(`${API_BASE}/operations/challans`);
      if (!cRes.ok) throw new Error((await cRes.json().catch(() => ({}))).message || 'Failed to load challans');
      const cData = await cRes.json();
      setChallans(cData.challans || []);
    } catch (e) {
      setErr(e.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { load(); }, [load]);
  const dayOptions = useMemo(() => [...new Set(challans.map((c) => String(c.day || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [challans]);
  const slotOptions = useMemo(() => {
    const all = new Set();
    for (const c of challans) {
      String(c.slot || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => all.add(s));
    }
    return [...all].sort((a, b) => a.localeCompare(b));
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
  const pagedRows = useMemo(() => displayRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [displayRows, page]);
  useEffect(() => { setPage(1); }, [search, filterDay, filterSlot]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const toggleOne = (id) => setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleSelectAll = () => {
    const allSelected = displayRows.length > 0 && displayRows.every((c) => selectedIds.has(c.challan_id));
    setSelectedIds(allSelected ? new Set() : new Set(displayRows.map((c) => c.challan_id)));
  };
  const allFilteredSelected = displayRows.length > 0 && displayRows.every((c) => selectedIds.has(c.challan_id));

  const openChallanModal = async (token) => {
    if (!token) return;
    const res = await authFetch(`${API_BASE}/operations/challans/by-token/${encodeURIComponent(token)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.message || 'Challan not found'); return; }
    setModal(data);
  };

  const doRegenerate = async () => {
    setConfirmRegen(false);
    setBusy(true);
    setErr('');
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/regenerate-from-orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Regenerate failed');
      setMsg(`Regenerated ${data.groups ?? 0} challan groups.`);
      await load();
    } catch (e) { setErr(e.message || 'Regenerate failed'); }
    setBusy(false);
  };

  const onPrintPdf = async () => {
    const ids = selectedIds.size ? [...selectedIds] : displayRows.map((c) => c.challan_id);
    if (!ids.length) return alert('No challans to print.');
    setBusy(true);
    setErr('');
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/bulk-detail`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challan_ids: ids }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not build PDF');
      if (!Array.isArray(data.items) || data.items.length === 0) throw new Error('No data to print');
      generatePdf(data.items);
    } catch (e) { setErr(e.message || 'PDF generation failed'); }
    setBusy(false);
  };

  return (
    <>
      <div className="om-root" style={{ padding: '19px', fontFamily: "'Poppins','Inter',sans-serif", display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>
        <div className="om-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333' }}>Challan Management</h2>
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#888' }}>Showing only 2026 challans. Print PDF respects active filters; if rows are selected then only selected rows are exported.</p>
          </div>
          {(busy || saving) && <span style={{ fontSize: '10px', color: '#999', fontWeight: '600' }}>{busy ? 'Working…' : 'Saving…'}</span>}
        </div>
        <div className="om-filter-desktop" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 320px', minWidth: 280 }}><label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Search</label><input type="text" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }} /></div>
          <div style={{ width: 130, minWidth: 130 }}><label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Day</label><select value={filterDay} onChange={(e) => setFilterDay(e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }}><option value="">All</option>{dayOptions.map((d) => <option key={d} value={d}>{d}</option>)}</select></div>
          <div style={{ width: 130, minWidth: 130 }}><label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Slot</label><select value={filterSlot} onChange={(e) => setFilterSlot(e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }}><option value="">All</option>{slotOptions.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" disabled={busy} onClick={onPrintPdf} style={{ padding: '6px 13px', height: '29px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600' }}>Print PDF</button>
            <button type="button" onClick={load} style={{ padding: '6px 13px', height: '29px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '11px' }}>Refresh</button>
            {emailOk && <button type="button" onClick={() => setConfirmRegen(true)} style={{ padding: '6px 13px', height: '29px', background: '#FFEBEE', color: '#C62828', border: '1px solid #FFCDD2', borderRadius: '6px', fontSize: '11px' }}>Generate data (2026)</button>}
          </div>
        </div>
        {msg && <div style={{ padding: '10px', background: '#E8F5E9', color: '#2E7D32', borderRadius: '6px', marginBottom: '12px', fontSize: '10px', fontWeight: '600' }}>{msg}</div>}
        {err && <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', marginBottom: '13px', fontSize: '10px', fontWeight: '600' }}>{err}</div>}
        <div className="om-table-wrap" style={{ flex: 1, minHeight: '304px', overflow: 'auto', border: '1px solid #e0e0e0', borderRadius: '6px', background: '#fff' }}>
          {loading ? <div style={{ padding: '32px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading…</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
              <thead><tr style={{ background: '#f5f5f5' }}><th style={{ padding: '10px 8px', borderBottom: '2px solid #e0e0e0' }}><input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} /></th>{['Address', 'Day', 'Slot', 'Area', 'Hissa', 'Shareholders', 'Status'].map((h) => <th key={h} style={{ padding: '10px 8px', textAlign: 'left', borderBottom: '2px solid #e0e0e0' }}>{h}</th>)}</tr></thead>
              <tbody>
                {pagedRows.length === 0 ? <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#666' }}>No rows found.</td></tr> : pagedRows.map((c) => {
                  const st = c.delivery_status || 'Pending';
                  const names = c.shareholders_csv || '—';
                  return (
                    <tr key={c.challan_id} style={{ borderBottom: '1px solid #f0f0f0', cursor: c.qr_token ? 'pointer' : 'default' }} onClick={() => c.qr_token && openChallanModal(c.qr_token)}>
                      <td style={{ padding: '10px 8px' }} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(c.challan_id)} onChange={() => toggleOne(c.challan_id)} /></td>
                      <td style={{ padding: '10px 8px', maxWidth: 220 }}>{formatAddress(c.address) || '—'}</td><td style={{ padding: '10px 8px' }}>{c.day || '—'}</td><td style={{ padding: '10px 8px' }}>{c.slot || '—'}</td><td style={{ padding: '10px 8px' }}>{c.area || '—'}</td><td style={{ padding: '10px 8px' }}>{c.total_hissa ?? c.order_count ?? '—'}</td>
                      <td style={{ padding: '10px 8px', maxWidth: 170 }} title={names}>{names.length > 48 ? `${names.slice(0, 48)}…` : names}</td><td style={{ padding: '10px 8px' }}>{statusBadge(st)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {!loading && displayRows.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', padding: '12px 0', borderTop: '1px solid #e0e0e0', marginTop: '8px', flexShrink: 0 }}>
            <span style={{ fontSize: '11px', color: '#666' }}>Showing {pagedRows.length} of {displayRows.length} challans</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ padding: '6px 12px', fontSize: '10px' }}>Previous</button>
              <span style={{ fontSize: '11px', color: '#666' }}>Page {page} / {totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} style={{ padding: '6px 12px', fontSize: '10px' }}>Next</button>
            </div>
          </div>
        )}
      </div>
      {confirmRegen && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setConfirmRegen(false)}><div style={{ background: '#fff', borderRadius: '18px', border: '1.5px solid #F0F0F0', padding: '20px', maxWidth: '440px', width: '100%' }} onClick={(e) => e.stopPropagation()}><h2 style={{ margin: '0 0 8px', fontSize: '16px' }}>Regenerate all 2026 challans?</h2><p style={{ margin: '0 0 18px', fontSize: '12px', color: '#666' }}>This deletes all rows in challan and challan_orders, then rebuilds only from 2026 orders.</p><div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}><button type="button" onClick={() => setConfirmRegen(false)}>Cancel</button><button type="button" onClick={doRegenerate} style={{ background: '#C62828', color: '#fff' }}>Yes, regenerate</button></div></div></div>}
      {modal && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={() => setModal(null)}><div style={{ background: '#fff', borderRadius: '18px', border: '1.5px solid #F0F0F0', padding: '20px', maxWidth: '520px', width: '100%', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}><h2 style={{ margin: 0, fontSize: '16px' }}>Challan #{modal.challan?.challan_id}</h2><button type="button" onClick={() => setModal(null)} style={{ background: 'none', border: 'none', fontSize: '24px' }}>×</button></div><p style={{ fontSize: '11px', margin: '0 0 6px' }}><strong>Address:</strong> {formatAddress(modal.challan?.address)}</p><p style={{ fontSize: '11px', margin: '0 0 6px' }}><strong>Day / slot:</strong> {modal.challan?.day || '—'} · {modal.challan?.slot || '—'}</p><p style={{ fontSize: '11px', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}><strong>Status:</strong> {statusBadge(modal.challan?.delivery_status)}</p><div style={{ maxHeight: '220px', overflow: 'auto', border: '1px solid #F0F0F0', borderRadius: '8px' }}><table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}><thead><tr style={{ background: '#FAFAFA' }}>{['Order', 'Contact', 'Shareholder', 'Type / Hissa'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #E0E0E0' }}>{h}</th>)}</tr></thead><tbody>{modal.orders?.map((o) => <tr key={o.order_id} style={{ borderBottom: '1px solid #F0F0F0' }}><td style={{ padding: '8px' }}>{o.order_id}</td><td style={{ padding: '8px' }}>{o.contact}</td><td style={{ padding: '8px' }}>{o.shareholder_name}</td><td style={{ padding: '8px' }}>{o.order_type} / {o.hissa_number}</td></tr>)}</tbody></table></div></div></div>}
    </>
  );
}
