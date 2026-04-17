import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config/api';

const STATUSES = ['Pending', 'Rider Assigned', 'Dispatched', 'Delivered', 'Returned to Farm'];

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
  return (
    <span style={{ padding: '3px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '500', background: bg, color: fg, whiteSpace: 'nowrap' }}>
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
  } catch {
    /* not absolute URL */
  }
  if (t.includes('challan=')) {
    const m = t.match(/[?&]challan=([^&]+)/i);
    if (m) {
      try {
        return decodeURIComponent(m[1]).trim();
      } catch {
        return m[1].trim();
      }
    }
  }
  return t;
}

const selectStyle = {
  fontSize: '10px',
  padding: '6px 8px',
  borderRadius: '6px',
  border: '1px solid #E0E0E0',
  background: '#FAFAFA',
  color: '#333',
  maxWidth: '140px',
};

export default function OperationsDeliveries() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { authFetch } = useAuth();

  const [groups, setGroups] = useState([]);
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [modal, setModal] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [filterDay, setFilterDay] = useState('');
  const [filterSlot, setFilterSlot] = useState('');
  const [scanMatchToken, setScanMatchToken] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [scanErr, setScanErr] = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const scannerRef = useRef(null);
  const groupsRef = useRef(groups);
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  const load = useCallback(async () => {
    setErr('');
    setLoading(true);
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

  useEffect(() => {
    load();
  }, [load]);

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
      if (g.slot != null && String(g.slot).trim() !== '') s.add(String(g.slot).trim());
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [groups]);

  const displayGroups = useMemo(() => {
    let list = groups;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((g) => {
        const hay = [
          g.address,
          g.area,
          g.day,
          g.slot,
          ...(g.shareholder_names || []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }
    if (filterDay) list = list.filter((g) => String(g.day || '').trim() === filterDay);
    if (filterSlot) list = list.filter((g) => String(g.slot || '').trim() === filterSlot);
    if (scanMatchToken) {
      list = list.filter((g) => g.challan?.qr_token === scanMatchToken);
    }
    return list;
  }, [groups, search, filterDay, filterSlot, scanMatchToken]);

  const rowDomId = (g) => {
    if (g.challan?.challan_id) return `dlv-challan-${g.challan.challan_id}`;
    const safe = String(g.group_key || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `dlv-grp-${safe}`;
  };

  useEffect(() => {
    if (!scanMatchToken) return;
    const first = displayGroups[0];
    if (!first) return;
    const el = document.getElementById(rowDomId(first));
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [scanMatchToken, displayGroups]);

  const openChallanModal = useCallback(async (token) => {
    if (!token) return;
    setErr('');
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/by-token/${encodeURIComponent(token)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Challan not found');
      setModal(data);
      const url = `${window.location.origin}/operations/deliveries?challan=${encodeURIComponent(token)}`;
      setQrDataUrl(await QRCode.toDataURL(url, { width: 160, margin: 1 }));
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
    setQrDataUrl('');
    const next = new URLSearchParams(searchParams);
    next.delete('challan');
    setSearchParams(next, { replace: true });
  };

  const stopScanner = useCallback(async () => {
    const inst = scannerRef.current;
    scannerRef.current = null;
    if (!inst) return;
    try {
      await inst.stop();
    } catch {
      /* already stopped */
    }
    try {
      inst.clear();
    } catch {
      /* ignore */
    }
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
            if (!found) {
              setScanErr('No delivery row matches this challan QR.');
              return;
            }
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
    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [scanOpen, stopScanner]);

  const updateModalStatus = async (delivery_status) => {
    if (!modal?.challan?.challan_id) return;
    setSaving(true);
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/${modal.challan.challan_id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delivery_status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Update failed');
      await openChallanModal(modal.challan.qr_token);
      await load();
    } catch (e) {
      setErr(e.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const updateModalRider = async (rider_id) => {
    if (!modal?.challan?.challan_id) return;
    setSaving(true);
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/${modal.challan.challan_id}/rider`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rider_id: rider_id === '' ? null : Number(rider_id) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Update failed');
      await openChallanModal(modal.challan.qr_token);
      await load();
    } catch (e) {
      setErr(e.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const patchGroupRider = async (challanId, rider_id) => {
    if (!challanId) return;
    setSaving(true);
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/${challanId}/rider`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rider_id: rider_id === '' ? null : Number(rider_id) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Update failed');
      await load();
    } catch (e) {
      setErr(e.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const patchGroupStatus = async (challanId, delivery_status) => {
    if (!challanId) return;
    setSaving(true);
    try {
      const res = await authFetch(`${API_BASE}/operations/challans/${challanId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delivery_status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Update failed');
      await load();
    } catch (e) {
      setErr(e.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const resetFilters = () => {
    setSearch('');
    setFilterDay('');
    setFilterSlot('');
    setScanMatchToken('');
  };

  return (
    <>
      <style>{`
        @media (max-width: 767px) {
          .om-root            { padding: 16px 12px 24px !important; overflow: auto !important; }
          .om-header          { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; margin-bottom: 12px !important; }
          .om-header h2       {
            min-height: 55px !important; display: flex !important; align-items: center !important; box-sizing: border-box !important;
            margin: 0 !important; padding: 0 !important;
            font-size: clamp(15px, 4.3vw, 17px) !important; font-weight: 600 !important; color: #333 !important; line-height: 1.25 !important;
          }
          .om-filter-desktop  { display: none !important; }
          .om-filter-toggle   { display: flex !important; }
          .om-filter-mobile   { display: block !important; }
          .om-table-wrap      { display: block !important; }
        }
      `}</style>

      <div
        className="om-root"
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
        <div className="om-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333', whiteSpace: 'nowrap' }}>Deliveries Management</h2>
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#888', fontWeight: '500', lineHeight: 1.45, maxWidth: '720px' }}>
              Orders grouped by delivery address; assign riders and status per challan. Click a row (with a challan) for details. Scan a challan QR to filter this table to that row.
            </p>
          </div>
          {saving && <span style={{ fontSize: '10px', color: '#999', fontWeight: '600' }}>Saving…</span>}
        </div>

        <div className="om-filter-desktop" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', alignItems: 'flex-end', minWidth: 0, flexShrink: 0 }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Search (address, area, shareholders)</label>
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }}
            />
          </div>
          <div style={{ width: 100, minWidth: 100, flexShrink: 0 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px', whiteSpace: 'nowrap' }}>Day</label>
            <select value={filterDay} onChange={(e) => setFilterDay(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }}>
              <option value="">All</option>
              {dayOptions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div style={{ width: 112, minWidth: 112, flexShrink: 0 }}>
            <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px', whiteSpace: 'nowrap' }}>Slot</label>
            <select value={filterSlot} onChange={(e) => setFilterSlot(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '11px' }}>
              <option value="">All</option>
              {slotOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setScanOpen(true)}
              style={{ padding: '6px 13px', height: '29px', background: '#FF5722', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Scan QR
            </button>
            <button
              type="button"
              onClick={load}
              style={{ padding: '6px 13px', height: '29px', background: '#fff', color: '#555', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Refresh
            </button>
            <button type="button" onClick={resetFilters} style={{ padding: '6px 13px', height: '29px', background: '#fff', color: '#555', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Reset
            </button>
          </div>
        </div>

        <div className="om-filter-toggle" style={{ display: 'none', gap: '8px', marginBottom: '8px', flexShrink: 0, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search…"
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
          <button
            type="button"
            onClick={() => setScanOpen(true)}
            style={{ padding: '9px 12px', borderRadius: '8px', background: '#FF5722', color: '#fff', border: 'none', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Scan
          </button>
        </div>

        <div className="om-filter-mobile" style={{ display: 'none' }}>
          {mobileFiltersOpen && (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px', marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Day</label>
                <select value={filterDay} onChange={(e) => setFilterDay(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px' }}>
                  <option value="">All</option>
                  {dayOptions.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' }}>Slot</label>
                <select value={filterSlot} onChange={(e) => setFilterSlot(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e0e0e0', fontSize: '13px' }}>
                  <option value="">All</option>
                  {slotOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
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

        {scanMatchToken && (
          <div style={{ padding: '10px 12px', background: '#E8F5E9', border: '1px solid #C8E6C9', borderRadius: '6px', marginBottom: '12px', flexShrink: 0, fontSize: '11px', color: '#2E7D32', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
            <span>Showing the delivery group for the scanned challan QR.</span>
            <button type="button" onClick={() => setScanMatchToken('')} style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #81C784', background: '#fff', color: '#2E7D32', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>
              Clear scan filter
            </button>
          </div>
        )}

        {err && (
          <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', marginBottom: '13px', flexShrink: 0, fontSize: '10px', fontWeight: '600' }}>
            {err}
          </div>
        )}

        <div className="om-table-wrap" style={{ flex: 1, minHeight: '304px', overflow: 'auto', border: '1px solid #e0e0e0', borderRadius: '6px', background: '#fff' }}>
          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading…</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', tableLayout: 'auto' }}>
              <thead>
                <tr style={{ background: '#f5f5f5' }}>
                  {['Address', 'Day', 'Slot', 'Area', 'Hissa', 'Shareholders', 'Status', 'Rider', 'Set status'].map((h) => (
                    <th key={h} style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayGroups.map((g) => {
                  const c = g.challan;
                  const st = c?.delivery_status || 'Pending';
                  const names = (g.shareholder_names || []).join(', ') || '—';
                  const isScanHit = scanMatchToken && c?.qr_token === scanMatchToken;
                  return (
                    <tr
                      key={g.group_key}
                      id={rowDomId(g)}
                      style={{
                        transition: 'background 0.2s',
                        background: isScanHit ? '#FFF8E1' : 'transparent',
                        cursor: c?.qr_token ? 'pointer' : 'default',
                      }}
                      onClick={() => c?.qr_token && openChallanModal(c.qr_token)}
                      onMouseEnter={(e) => {
                        if (!isScanHit) e.currentTarget.style.background = '#fafafa';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isScanHit ? '#FFF8E1' : 'transparent';
                      }}
                    >
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', whiteSpace: 'normal', maxWidth: '220px', color: '#333', fontWeight: '500', verticalAlign: 'middle' }} title={g.address}>
                        {g.address || '—'}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'middle' }}>{g.day || '—'}</td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'middle' }}>{g.slot || '—'}</td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'middle' }}>{g.area || '—'}</td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'middle' }}>{g.hissa_count}</td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', whiteSpace: 'normal', maxWidth: '160px', color: '#666', verticalAlign: 'middle' }} title={names}>
                        {names.length > 48 ? `${names.slice(0, 48)}…` : names}
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'middle' }}>{statusBadge(st)}</td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'middle' }} onClick={(e) => e.stopPropagation()}>
                        <select
                          value={c?.rider_id ?? ''}
                          disabled={!c}
                          title={!c ? 'Generate challan data first (Challan tab)' : ''}
                          onChange={(e) => patchGroupRider(c.challan_id, e.target.value)}
                          style={{ ...selectStyle, opacity: c ? 1 : 0.5 }}
                        >
                          <option value="">—</option>
                          {riders.map((r) => (
                            <option key={r.rider_id} value={r.rider_id}>{r.rider_name}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'middle' }} onClick={(e) => e.stopPropagation()}>
                        <select
                          value={st}
                          disabled={!c}
                          title={!c ? 'Generate challan data first (Challan tab)' : ''}
                          onChange={(e) => patchGroupStatus(c.challan_id, e.target.value)}
                          style={{ ...selectStyle, opacity: c ? 1 : 0.5 }}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!loading && displayGroups.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: '#666', fontSize: '11px' }}>
              {groups.length === 0 ? 'No orders with addresses to show.' : 'No rows match the current filters.'}
            </div>
          )}
        </div>
      </div>

      {scanOpen && (
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
          onClick={() => { setScanOpen(false); }}
          role="presentation"
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '14px',
              border: '1px solid #e0e0e0',
              padding: '18px',
              maxWidth: '400px',
              width: '100%',
              boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Scan challan QR"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: '#333' }}>Scan challan QR</h3>
              <button
                type="button"
                onClick={() => setScanOpen(false)}
                style={{ border: 'none', background: 'none', fontSize: '22px', color: '#888', cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: '11px', color: '#666', lineHeight: 1.5 }}>
              Point the camera at the challan QR code. The table will filter to the matching delivery group.
            </p>
            <div id="qr-reader-deliveries" style={{ borderRadius: '10px', overflow: 'hidden', minHeight: '240px', background: '#111' }} />
            {scanErr && (
              <div style={{ marginTop: '10px', padding: '8px 10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', fontSize: '10px', fontWeight: '600' }}>
                {scanErr}
              </div>
            )}
          </div>
        </div>
      )}

      {modal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={closeModal}
          role="presentation"
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '18px',
              border: '1.5px solid #F0F0F0',
              padding: '20px',
              maxWidth: '520px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 10px 40px rgba(0,0,0,0.12)',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#333' }}>Challan #{modal.challan?.challan_id}</h2>
              <button
                type="button"
                onClick={closeModal}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  color: '#888',
                  cursor: 'pointer',
                  padding: '0',
                  width: '30px',
                  height: '30px',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            {qrDataUrl && (
              <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <img src={qrDataUrl} alt="Challan QR" style={{ width: 160, height: 160 }} />
              </div>
            )}
            <p style={{ fontSize: '11px', color: '#333', margin: '0 0 6px' }}><strong>Address:</strong> {modal.challan?.address}</p>
            <p style={{ fontSize: '11px', color: '#333', margin: '0 0 6px' }}><strong>Day / slot:</strong> {modal.challan?.day || '—'} · {modal.challan?.slot || '—'}</p>
            <p style={{ fontSize: '11px', color: '#333', margin: '0 0 12px' }}><strong>Rider:</strong> {modal.rider?.rider_name || '—'}</p>

            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', marginBottom: '4px', color: '#333' }}>Status (all orders on this challan)</label>
            <select
              value={modal.challan?.delivery_status || 'Pending'}
              disabled={saving}
              onChange={(e) => updateModalStatus(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E0E0E0', fontSize: '10px', marginBottom: '12px', background: '#FAFAFA', boxSizing: 'border-box' }}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', marginBottom: '4px', color: '#333' }}>Assign rider</label>
            <select
              value={modal.challan?.rider_id ?? ''}
              disabled={saving}
              onChange={(e) => updateModalRider(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E0E0E0', fontSize: '10px', marginBottom: '12px', background: '#FAFAFA', boxSizing: 'border-box' }}
            >
              <option value="">—</option>
              {riders.map((r) => (
                <option key={r.rider_id} value={r.rider_id}>{r.rider_name}</option>
              ))}
            </select>

            <div style={{ maxHeight: '200px', overflow: 'auto', border: '1px solid #F0F0F0', borderRadius: '8px' }}>
              <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#FAFAFA' }}>
                    {['Order', 'Contact', 'Shareholder', 'Type / Hissa'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px', fontWeight: '600', color: '#666', borderBottom: '1px solid #E0E0E0' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modal.orders?.map((o) => (
                    <tr key={o.order_id} style={{ borderBottom: '1px solid #F0F0F0' }}>
                      <td style={{ padding: '8px' }}>{o.order_id}</td>
                      <td style={{ padding: '8px' }}>{o.contact}</td>
                      <td style={{ padding: '8px' }}>{o.shareholder_name}</td>
                      <td style={{ padding: '8px' }}>{o.order_type} / {o.hissa_number}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
