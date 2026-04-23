import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config/api';

const STATUSES = ['Pending', 'Rider Assigned', 'Dispatched', 'Delivered', 'Returned to Farm'];

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

function extractChallanToken(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  try {
    const u = new URL(t);
    const q = u.searchParams.get('challan');
    if (q) return q.trim();
  } catch { /* not absolute URL */ }
  if (t.includes('challan=')) {
    const m = t.match(/[?&]challan=([^&]+)/i);
    if (m) {
      try { return decodeURIComponent(m[1]).trim(); } catch { return m[1].trim(); }
    }
  }
  return t;
}

const selectStyle = {
  fontSize: '10px', padding: '6px 8px', borderRadius: '6px',
  border: '1px solid #E0E0E0', background: '#FAFAFA', color: '#333', maxWidth: '140px',
};

const PAGE_SIZE = 50;

// Searchable dropdown for rider assignment
function SearchableRiderSelect({ value, disabled, onChange, riders, title }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);

  const selected = riders.find((r) => String(r.rider_id) === String(value));
  const label = selected ? `${selected.rider_name} (${selected.contact || 'N/A'})` : '— Unassigned';

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return riders;
    return riders.filter((r) =>
      (r.rider_name || '').toLowerCase().includes(q) ||
      (r.contact || '').toLowerCase().includes(q) ||
      (r.vehicle || '').toLowerCase().includes(q)
    );
  }, [riders, query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false); setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: 'relative', minWidth: '130px', maxWidth: '160px' }}>
      <button
        type="button" disabled={disabled} title={title}
        onClick={() => { if (!disabled) { setOpen((v) => !v); setQuery(''); } }}
        style={{
          width: '100%', textAlign: 'left', fontSize: '10px', padding: '5px 8px',
          borderRadius: '6px', border: '1px solid #E0E0E0',
          background: disabled ? '#F5F5F5' : '#FAFAFA',
          color: disabled ? '#aaa' : '#333',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{label}</span>
        <span style={{ fontSize: '8px', flexShrink: 0, opacity: 0.5 }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', zIndex: 200, top: '100%', left: 0, marginTop: '4px',
          width: '230px', background: '#fff', border: '1px solid #e0e0e0',
          borderRadius: '8px', boxShadow: '0 6px 20px rgba(0,0,0,0.12)', overflow: 'hidden',
        }}>
          <div style={{ padding: '8px' }}>
            <input
              autoFocus type="text" placeholder="Search name, phone, vehicle…"
              value={query} onChange={(e) => setQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '10px', outline: 'none' }}
            />
          </div>
          <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
            <div
              style={{ padding: '7px 12px', fontSize: '10px', color: '#888', cursor: 'pointer', borderTop: '1px solid #f5f5f5' }}
              onMouseDown={(e) => { e.preventDefault(); onChange(''); setOpen(false); setQuery(''); }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#fafafa'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >— Unassigned</div>
            {filtered.map((r) => (
              <div
                key={r.rider_id}
                onMouseDown={(e) => { e.preventDefault(); onChange(String(r.rider_id)); setOpen(false); setQuery(''); }}
                style={{
                  padding: '7px 12px', fontSize: '10px', cursor: 'pointer',
                  background: String(r.rider_id) === String(value) ? '#FFF4F0' : 'transparent',
                  color: String(r.rider_id) === String(value) ? '#FF5722' : '#333',
                  borderTop: '1px solid #f5f5f5',
                }}
                onMouseEnter={(e) => { if (String(r.rider_id) !== String(value)) e.currentTarget.style.background = '#fafafa'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = String(r.rider_id) === String(value) ? '#FFF4F0' : 'transparent'; }}
              >
                <div style={{ fontWeight: '500' }}>{r.rider_name}</div>
                <div style={{ fontSize: '9px', color: '#999', marginTop: '1px' }}>{[r.contact, r.vehicle].filter(Boolean).join(' · ')}</div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: '10px', color: '#aaa', textAlign: 'center' }}>No riders found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OperationsDeliveries() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { authFetch } = useAuth();

  const [groups, setGroups] = useState([]);
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [filterDay, setFilterDay] = useState('Day 1');
  const [filterSlots, setFilterSlots] = useState([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterRider, setFilterRider] = useState('');
  const [page, setPage] = useState(1);
  const [scanMatchToken, setScanMatchToken] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [scanErr, setScanErr] = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [slotDropdownOpen, setSlotDropdownOpen] = useState(false);

  const scannerRef = useRef(null);
  const groupsRef = useRef(groups);
  useEffect(() => { groupsRef.current = groups; }, [groups]);

  const load = useCallback(async () => {
    setErr(''); setLoading(true);
    try {
      const [gRes, rRes] = await Promise.all([
        authFetch(`${API_BASE}/operations/deliveries/groups`),
        authFetch(`${API_BASE}/operations/riders`),
      ]);
      if (!gRes.ok) throw new Error((await gRes.json().catch(() => ({}))).message || 'Failed to load deliveries');
      const gData = await gRes.json();
      setGroups(gData.groups || []);
      if (rRes.ok) setRiders(await rRes.json());
      else setRiders([]);
    } catch (e) {
      setErr(e.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { load(); }, [load]);

  const dayOptions = useMemo(() => {
    const s = new Set();
    for (const g of groups) {
      if (g.day != null && String(g.day).trim() !== '') s.add(String(g.day).trim());
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [groups]);

  const slotOptions = useMemo(() => {
    const s = new Set();
    for (const g of groups) {
      for (const slot of (g.slots || [])) {
        if (slot != null && String(slot).trim() !== '') s.add(String(slot).trim());
      }
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [groups]);

  const riderMap = useMemo(() => {
    const m = {};
    riders.forEach((r) => { m[r.rider_id] = r; });
    return m;
  }, [riders]);

  const displayGroups = useMemo(() => {
    let list = groups;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((g) => {
        const hay = [g.address, g.area, g.day, g.slot, ...(g.shareholder_names || [])]
          .filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    if (filterDay) list = list.filter((g) => String(g.day || '').trim() === filterDay);
    if (filterSlots.length) list = list.filter((g) => (g.slots || []).some((s) => filterSlots.includes(String(s).trim())));
    if (filterStatus) list = list.filter((g) => (g.challan?.delivery_status || 'Pending') === filterStatus);
    if (filterRider) list = list.filter((g) => String(g.challan?.rider_id || '') === filterRider);
    if (scanMatchToken) list = list.filter((g) => g.challan?.qr_token === scanMatchToken);
    return list;
  }, [groups, search, filterDay, filterSlots, filterStatus, filterRider, scanMatchToken]);

  const totalPages = Math.max(1, Math.ceil(displayGroups.length / PAGE_SIZE));
  const pagedGroups = useMemo(() => displayGroups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [displayGroups, page]);
  useEffect(() => { setPage(1); }, [search, filterDay, filterSlots, filterStatus, filterRider, scanMatchToken]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const summary = useMemo(() => {
    let totalPremium = 0, totalStandard = 0, totalGoat = 0;
    for (const g of displayGroups) {
      totalPremium  += Number(g.premium_hissa_count  || g.challan?.total_premium_hissa  || 0);
      totalStandard += Number(g.standard_hissa_count || g.challan?.total_standard_hissa || 0);
      totalGoat     += Number(g.goat_hissa_count     || g.challan?.total_goat_hissa     || 0);
    }
    return { totalHissa: totalPremium + totalStandard, totalPremium, totalStandard, totalGoat };
  }, [displayGroups]);

  const rowDomId = (g) => {
    if (g.challan?.challan_id) return `dlv-challan-${g.challan.challan_id}`;
    return `dlv-grp-${String(g.group_key || '').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  };

  useEffect(() => {
    if (!scanMatchToken) return;
    const first = displayGroups[0];
    if (!first) return;
    document.getElementById(rowDomId(first))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [scanMatchToken, displayGroups]);

  const openChallanModal = useCallback(async (token) => {
    if (!token) return;
    setErr('');
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/by-token/${encodeURIComponent(token)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Challan not found');
      setModal(data);
    } catch (e) {
      setErr(e.message || 'Failed to open challan');
    }
  }, [authFetch]);

  const challanParam = searchParams.get('challan');
  useEffect(() => {
    if (challanParam) openChallanModal(challanParam);
  }, [challanParam, openChallanModal]);

  const closeModal = () => {
    setModal(null);
    const next = new URLSearchParams(searchParams);
    next.delete('challan');
    setSearchParams(next, { replace: true });
  };

  const stopScanner = useCallback(async () => {
    const inst = scannerRef.current;
    scannerRef.current = null;
    if (!inst) return;
    try { await inst.stop(); } catch { /* already stopped */ }
    try { inst.clear(); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!scanOpen) return undefined;
    setScanErr('');
    const regionId = 'qr-reader-deliveries';
    let cancelled = false;
    (async () => {
      await new Promise((r) => setTimeout(r, 100));
      if (cancelled) return;
      const mount = document.getElementById(regionId);
      if (mount) mount.innerHTML = '';
      try {
        const html5 = new Html5Qrcode(regionId);
        scannerRef.current = html5;
        await html5.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 260 } },
          (decodedText) => {
            const token = extractChallanToken(decodedText);
            if (!token) return;
            const found = groupsRef.current.some((g) => g.challan?.qr_token === token);
            if (!found) { setScanErr('No delivery row matches this challan QR.'); return; }
            setScanMatchToken(token);
            setScanOpen(false);
            stopScanner();
          },
          () => {}
        );
      } catch (e) {
        if (!cancelled) setScanErr(e.message || 'Could not start camera');
      }
    })();
    return () => { cancelled = true; stopScanner(); };
  }, [scanOpen, stopScanner]);

  const updateModalStatus = async (delivery_status) => {
    if (!modal?.challan?.challan_id) return;
    setSaving(true);
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/${modal.challan.challan_id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delivery_status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Update failed');
      await openChallanModal(modal.challan.qr_token);
      await load();
    } catch (e) { setErr(e.message || 'Update failed'); } finally { setSaving(false); }
  };

  const updateModalRider = async (rider_id) => {
    if (!modal?.challan?.challan_id) return;
    setSaving(true);
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/${modal.challan.challan_id}/rider`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rider_id: rider_id === '' ? null : Number(rider_id) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Update failed');
      await openChallanModal(modal.challan.qr_token);
      await load();
    } catch (e) { setErr(e.message || 'Update failed'); } finally { setSaving(false); }
  };

  const patchGroupRider = async (challanId, rider_id) => {
    if (!challanId) return;
    setSaving(true);
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/${challanId}/rider`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rider_id: rider_id === '' ? null : Number(rider_id) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Update failed');
      await load();
    } catch (e) { setErr(e.message || 'Update failed'); } finally { setSaving(false); }
  };

  const patchGroupStatus = async (challanId, delivery_status) => {
    if (!challanId) return;
    setSaving(true);
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/${challanId}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delivery_status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Update failed');
      await load();
    } catch (e) { setErr(e.message || 'Update failed'); } finally { setSaving(false); }
  };

  const resetFilters = () => {
    setSearch(''); setFilterDay('Day 1'); setFilterSlots([]);
    setFilterStatus(''); setFilterRider(''); setSlotDropdownOpen(false); setScanMatchToken('');
  };
  const toggleSlot = (slot) => setFilterSlots((prev) => prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]);
  const riderOptions = useMemo(() => riders.map((r) => ({ id: String(r.rider_id), label: `${r.rider_name || ''} (${r.contact || 'N/A'}) [${r.vehicle || 'No vehicle'}]` })), [riders]);

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '6px 10px', borderRadius: '6px',
    border: '1px solid #e0e0e0', fontSize: '11px', background: '#fff',
  };

  return (
    <>
      <style>{`
        @media (max-width: 767px) {
          .om-root            { padding: 16px 12px 24px !important; overflow: auto !important; }
          .om-header          { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; margin-bottom: 12px !important; }
          .om-filter-desktop  { display: none !important; }
          .om-filter-toggle   { display: flex !important; }
          .om-filter-mobile   { display: block !important; }
          .om-table-wrap      { display: block !important; }
        }
      `}</style>

      <div className="om-root" style={{ padding: '19px', fontFamily: "'Poppins','Inter',sans-serif", display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>

        {/* Header */}
        <div className="om-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333' }}>Deliveries Management</h2>
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#888', fontWeight: '500', lineHeight: 1.45, maxWidth: '720px' }}>
              Orders grouped by delivery address; assign riders and status per challan. Click a row (with a challan) for details. Scan a challan QR to filter this table to that row.
            </p>
          </div>
          {saving && <span style={{ fontSize: '10px', color: '#999', fontWeight: '600' }}>Saving…</span>}
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px', marginBottom: '12px' }}>
          {[['Total Hissa', summary.totalHissa], ['Total Premium', summary.totalPremium], ['Total Standard', summary.totalStandard], ['Total Goat (Hissa)', summary.totalGoat]].map(([k, v]) => (
            <div key={k} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '10px' }}>
              <div style={{ fontSize: '10px', color: '#777' }}>{k}</div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Day selector */}
        <div style={{ borderTop: '1px solid #e6e6e6', marginBottom: '12px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', width: '100%', gap: '8px', marginBottom: '12px' }}>
          {['Day 1', 'Day 2', 'Day 3'].map((d) => (
            <button key={d} type="button" onClick={() => setFilterDay(d)}
              style={{ width: '100%', padding: '9px 10px', borderRadius: '8px', border: '1px solid #e0e0e0', background: filterDay === d ? '#FF5722' : '#fff', color: filterDay === d ? '#fff' : '#333', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}>
              {d}
            </button>
          ))}
        </div>

        {/* Desktop filters */}
        <div className="om-filter-desktop" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', alignItems: 'flex-end', minWidth: 0, flexShrink: 0 }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Search (address, area, shareholders)</label>
            <input type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ minWidth: 180, maxWidth: 240, position: 'relative' }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Slots</label>
            <button type="button" onClick={() => setSlotDropdownOpen((v) => !v)}
              style={{ width: '100%', textAlign: 'left', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#fff', fontSize: '11px', cursor: 'pointer' }}>
              {filterSlots.length ? `${filterSlots.length} slot(s) selected` : 'All slots'}
            </button>
            {slotDropdownOpen && (
              <div style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, top: '100%', marginTop: '4px', maxHeight: '180px', overflow: 'auto', border: '1px solid #e0e0e0', borderRadius: '6px', background: '#fff', padding: '6px' }}>
                {slotOptions.map((s) => (
                  <label key={s} style={{ display: 'block', fontSize: '10px', padding: '3px 0' }}>
                    <input type="checkbox" checked={filterSlots.includes(s)} onChange={() => toggleSlot(s)} /> {s}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div style={{ width: 130 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Status</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={inputStyle}>
              <option value="">All</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ width: 230 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Rider</label>
            <select value={filterRider} onChange={(e) => setFilterRider(e.target.value)} style={inputStyle}>
              <option value="">All</option>
              {riderOptions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setScanOpen(true)}
              style={{ padding: '6px 13px', height: '29px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Scan QR</button>
            <button type="button" onClick={load}
              style={{ padding: '6px 13px', height: '29px', background: '#fff', color: '#555', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Refresh</button>
            <button type="button" onClick={resetFilters}
              style={{ padding: '6px 13px', height: '29px', background: '#fff', color: '#555', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Reset</button>
          </div>
        </div>

        {/* Mobile filter toggle */}
        <div className="om-filter-toggle" style={{ display: 'none', gap: '8px', marginBottom: '8px', flexShrink: 0, alignItems: 'center' }}>
          <input type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px' }} />
          <button type="button" onClick={() => setMobileFiltersOpen((v) => !v)}
            style={{ padding: '9px 12px', borderRadius: '8px', border: `1px solid ${mobileFiltersOpen ? '#FF5722' : '#e0e0e0'}`, background: mobileFiltersOpen ? '#fff4f0' : '#fff', color: mobileFiltersOpen ? '#FF5722' : '#555', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>⚙ Filters</button>
          <button type="button" onClick={() => setScanOpen(true)}
            style={{ padding: '9px 12px', borderRadius: '8px', background: '#FF5722', color: '#fff', border: 'none', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Scan</button>
        </div>

        <div className="om-filter-mobile" style={{ display: 'none' }}>
          {mobileFiltersOpen && (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px', marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { label: 'Status', value: filterStatus, set: setFilterStatus, opts: STATUSES.map((s) => ({ v: s, l: s })) },
                { label: 'Rider',  value: filterRider,  set: setFilterRider,  opts: riderOptions.map((r) => ({ v: r.id, l: r.label })) },
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

        {scanMatchToken && (
          <div style={{ padding: '10px 12px', background: '#E8F5E9', border: '1px solid #C8E6C9', borderRadius: '6px', marginBottom: '12px', flexShrink: 0, fontSize: '11px', color: '#2E7D32', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
            <span>Showing the delivery group for the scanned challan QR.</span>
            <button type="button" onClick={() => setScanMatchToken('')} style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #81C784', background: '#fff', color: '#2E7D32', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>Clear scan filter</button>
          </div>
        )}

        {err && (
          <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', marginBottom: '13px', flexShrink: 0, fontSize: '10px', fontWeight: '600' }}>{err}</div>
        )}

        {/* Result count */}
        {!loading && (
          <div style={{ fontSize: '10px', color: '#999', marginBottom: '8px', flexShrink: 0 }}>
            Showing {displayGroups.length} of {groups.length} group{groups.length !== 1 ? 's' : ''}
          </div>
        )}

        {/* ── TABLE — CS design ── */}
        <div className="om-table-wrap" style={{ flex: 1, minHeight: 0, overflow: 'auto', borderRadius: '10px', border: '1px solid #ececec' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading…</div>
          ) : displayGroups.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666', fontSize: '11px' }}>
              {groups.length === 0 ? 'No orders with addresses to show.' : 'No rows match the current filters.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: '#fafafa' }}>
                  {['Status', 'Rider', 'Customer ID', 'Booking Name', 'Address', 'Phone', 'Alt Phone', 'Day / Slot', 'Area', 'Standard', 'Premium', 'Goat (Hissa)', 'Total Hissa', 'Shareholders'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 10px', borderBottom: '1px solid #e0e0e0', color: '#555', fontWeight: '600', whiteSpace: 'nowrap', fontSize: '10px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedGroups.map((g, idx) => {
                  const c = g.challan;
                  const st = c?.delivery_status || 'Pending';
                  const names = (g.shareholder_names || []).join(', ') || '—';
                  const isScanHit = scanMatchToken && c?.qr_token === scanMatchToken;
                  return (
                    <tr
                      key={g.group_key}
                      id={rowDomId(g)}
                      style={{ borderBottom: '1px solid #f3f3f3', background: isScanHit ? '#FFF8E1' : (idx % 2 === 0 ? '#fff' : '#FAFAFA'), cursor: c?.qr_token ? 'pointer' : 'default' }}
                      onClick={() => c?.qr_token && openChallanModal(c.qr_token)}
                      onMouseEnter={(e) => { if (!isScanHit) e.currentTarget.style.background = '#f5f9ff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = isScanHit ? '#FFF8E1' : (idx % 2 === 0 ? '#fff' : '#FAFAFA'); }}
                    >
                      {/* Status — inline select, stop propagation */}
                      <td style={{ padding: '9px 10px' }} onClick={(e) => e.stopPropagation()}>
                        <select value={st} disabled={!c} title={!c ? 'Generate challan data first (Challan tab)' : ''}
                          onChange={(e) => patchGroupStatus(c.challan_id, e.target.value)}
                          style={{ ...selectStyle, opacity: c ? 1 : 0.5 }}>
                          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      {/* Rider — searchable dropdown, stop propagation */}
                      <td style={{ padding: '9px 10px' }} onClick={(e) => e.stopPropagation()}>
                        <SearchableRiderSelect
                          value={c?.rider_id ?? ''}
                          disabled={!c}
                          title={!c ? 'Generate challan data first (Challan tab)' : ''}
                          riders={riders}
                          onChange={(riderId) => patchGroupRider(c.challan_id, riderId)}
                        />
                      </td>
                      <td style={{ padding: '9px 10px', color: '#777', fontWeight: '500' }}>{(g.customer_ids || []).join(', ') || '—'}</td>
                      <td style={{ padding: '9px 10px', fontWeight: '500', color: '#333' }}>{(g.booking_names || []).join(', ') || '—'}</td>
                      <td style={{ padding: '9px 10px', color: '#555', maxWidth: '200px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.address || '—'}</div>
                      </td>
                      <td style={{ padding: '9px 10px', color: '#555' }}>
                        <div>{(g.contacts || []).join(', ') || '—'}</div>
                      </td>
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
        {!loading && displayGroups.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', paddingTop: '10px', flexShrink: 0 }}>
            <span style={{ fontSize: '10px', color: '#999' }}>Showing {pagedGroups.length} of {displayGroups.length} groups</span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
              <span style={{ fontSize: '10px' }}>Page {page}/{totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Scan QR modal */}
      {scanOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '16px' }}
          onClick={() => { setScanOpen(false); }} role="presentation">
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e0e0e0', padding: '18px', maxWidth: '400px', width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}
            onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Scan challan QR">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: '#333' }}>Scan challan QR</h3>
              <button type="button" onClick={() => setScanOpen(false)} style={{ border: 'none', background: 'none', fontSize: '22px', color: '#888', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: '11px', color: '#666', lineHeight: 1.5 }}>Point the camera at the challan QR code. The table will filter to the matching delivery group.</p>
            <div id="qr-reader-deliveries" style={{ borderRadius: '10px', overflow: 'hidden', minHeight: '240px', background: '#111' }} />
            {scanErr && <div style={{ marginTop: '10px', padding: '8px 10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', fontSize: '10px', fontWeight: '600' }}>{scanErr}</div>}
          </div>
        </div>
      )}

      {/* Challan detail modal — CS modal design */}
      {modal && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
          onClick={closeModal}
          role="presentation"
        >
          <div
            style={{ background: '#FFFFFF', borderRadius: '18px', border: '1.5px solid #F0F0F0', padding: '20px', maxWidth: '520px', width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.12)' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={`Challan #${modal.challan?.challan_id} details`}
          >
            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#333' }}>Challan #{modal.challan?.challan_id}</h2>
              <button type="button" onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: '24px', color: '#888', cursor: 'pointer', padding: '0', width: '30px', height: '30px', lineHeight: 1 }}>×</button>
            </div>

            {/* Status badge */}
            <div style={{ marginBottom: '16px' }}>
              <StatusBadge status={modal.challan?.delivery_status} />
            </div>

            {/* Info rows */}
            {[
              ['Address',  modal.challan?.address || '—'],
              ['Day',      modal.challan?.day || '—'],
              ['Slot',     modal.challan?.slot || '—'],
              ['Rider',    modal.rider?.rider_name || 'Unassigned'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', gap: '8px', marginBottom: '8px', fontSize: '11px' }}>
                <span style={{ fontWeight: '600', minWidth: '90px', flexShrink: 0, color: '#555' }}>{label}:</span>
                <span style={{ color: value === 'Unassigned' ? '#bbb' : '#333', fontStyle: value === 'Unassigned' ? 'italic' : 'normal' }}>{value}</span>
              </div>
            ))}

            {/* Divider */}
            <div style={{ borderTop: '1px solid #f0f0f0', margin: '14px 0' }} />

            {/* Editable status */}
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', marginBottom: '4px', color: '#333' }}>Update Status</label>
            <select value={modal.challan?.delivery_status || 'Pending'} disabled={saving} onChange={(e) => updateModalStatus(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E0E0E0', fontSize: '10px', marginBottom: '12px', background: '#FAFAFA', boxSizing: 'border-box' }}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            {/* Editable rider */}
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', marginBottom: '4px', color: '#333' }}>Assign Rider</label>
            <select value={modal.challan?.rider_id ?? ''} disabled={saving} onChange={(e) => updateModalRider(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E0E0E0', fontSize: '10px', marginBottom: '14px', background: '#FAFAFA', boxSizing: 'border-box' }}>
              <option value="">— Unassigned</option>
              {riders.map((r) => <option key={r.rider_id} value={r.rider_id}>{r.rider_name}</option>)}
            </select>

            {/* Orders sub-table */}
            <div style={{ borderTop: '1px solid #f0f0f0', marginBottom: '12px' }} />
            <p style={{ margin: '0 0 8px', fontSize: '11px', fontWeight: '600', color: '#333' }}>Orders on this challan</p>
            <div style={{ maxHeight: '200px', overflow: 'auto', border: '1px solid #F0F0F0', borderRadius: '8px' }}>
              <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0 }}>
                  <tr style={{ background: '#FAFAFA' }}>
                    {['Order', 'Contact', 'Shareholder', 'Type / Hissa'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px', fontWeight: '600', color: '#555', borderBottom: '1px solid #E0E0E0' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modal.orders?.map((o, i) => (
                    <tr key={o.order_id} style={{ borderBottom: '1px solid #F0F0F0', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={{ padding: '8px', color: '#777' }}>#{o.order_id}</td>
                      <td style={{ padding: '8px', color: '#555' }}>{o.contact || '—'}</td>
                      <td style={{ padding: '8px', color: '#333', fontWeight: '500' }}>{o.shareholder_name || '—'}</td>
                      <td style={{ padding: '8px', color: '#555' }}>{o.order_type}{o.hissa_number ? ` / Hissa ${o.hissa_number}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Close */}
            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button type="button" onClick={closeModal}
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