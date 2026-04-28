import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE as API } from '../config/api';

const STATS_YEAR_MIN = 2020;

function statsYearOptions() {
  const y = new Date().getFullYear();
  const max = Math.max(y + 1, STATS_YEAR_MIN);
  const opts = [];
  for (let i = max; i >= STATS_YEAR_MIN; i--) opts.push(i);
  return opts;
}

const DAYS = ['DAY 1', 'DAY 2', 'DAY 3'];
const TYPES = [
  { key: 'standard', label: 'HISSA - STANDARD', orderType: 'Hissa - Standard', cowPrefix: 'S' },
  { key: 'premium', label: 'HISSA - PREMIUM', orderType: 'Hissa - Premium', cowPrefix: 'P' },
  { key: 'waqf', label: 'HISSA - WAQF', orderType: 'Hissa - Waqf', cowPrefix: 'W' },
  { key: 'goat_hissa', label: 'GOAT (HISSA)', orderType: 'Goat (Hissa)', cowPrefix: 'G' },
];

const SLOT_ORDER = ['SLOT 1', 'SLOT 2', 'SLOT 3'];
const SLOT_COLORS = {
  'SLOT 1': { bg: '#FFF6CC', pill: '#FDE68A' }, // soft yellow
  'SLOT 2': { bg: '#DCFFCF', pill: '#BBF7D0' }, // soft green
  'SLOT 3': { bg: '#CFF4FF', pill: '#A5F3FC' }, // soft blue
};

function clampInt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.trunc(x));
}

function chooseSlot(slotCounts) {
  // Choose the most common slot from actual data (ties → SLOT 1 then SLOT 2 then SLOT 3)
  let best = null;
  let bestCount = -1;
  for (const s of SLOT_ORDER) {
    const c = clampInt(slotCounts?.[s]);
    if (c > bestCount) {
      bestCount = c;
      best = s;
    }
  }
  return bestCount > 0 ? best : null;
}

function computeStatus(totalHissa, maxHissa = 7) {
  const t = clampInt(totalHissa);
  const m = Math.max(1, clampInt(maxHissa) || 7);
  return t >= m ? 'Closed' : 'Available';
}

function normalizeDay(value) {
  const s = String(value ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  const compact = s.replace(/\s+/g, '');
  if (compact === 'DAY1' || compact === '1') return 'DAY 1';
  if (compact === 'DAY2' || compact === '2') return 'DAY 2';
  if (compact === 'DAY3' || compact === '3') return 'DAY 3';
  return s;
}

function normalizeSlot(value) {
  const s = String(value ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  return SLOT_ORDER.includes(s) ? s : null;
}

function isGoatHissaOrder(row) {
  const type = String(row?.order_type ?? row?.orderType ?? '').trim().toLowerCase().replace(/[\s\-()]/g, '');
  const cow = String(row?.cow ?? '').trim().toUpperCase();
  return type === 'goathissa' || cow.startsWith('G');
}

export default function Stats() {
  const { authFetch } = useAuth();
  const token = localStorage.getItem('token');

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [raw, setRaw] = useState(null);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [ordersRaw, setOrdersRaw] = useState([]);

  const yearOptions = useMemo(() => statsYearOptions(), []);

  const hdrs = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const fetchSheet = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/booking/hissa-sheet?year=${encodeURIComponent(year)}`, {
        headers: hdrs(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Failed to load stats sheet');
      setRaw(data);
    } catch (e) {
      setRaw(null);
      throw e;
    }
  }, [authFetch, hdrs, year]);

  const fetchOrders = useCallback(async () => {
    try {
      const allRows = [];
      const limit = 1000;
      let pageNum = 1;

      while (true) {
        const params = new URLSearchParams();
        params.set('year', String(year));
        params.set('page', String(pageNum));
        params.set('limit', String(limit));
        params.set('order_type', 'Goat (Hissa)');

        const res = await authFetch(`${API}/booking/orders?${params.toString()}`, {
          headers: hdrs(),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || 'Failed to load goat orders');

        const rows = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
        allRows.push(...rows);

        const total = Number(data?.total || 0);
        if (!rows.length || rows.length < limit || (total > 0 && allRows.length >= total)) break;
        pageNum += 1;
      }

      setOrdersRaw(allRows);
    } catch (e) {
      setOrdersRaw([]);
      throw e;
    }
  }, [authFetch, hdrs, year]);

  useEffect(() => {
    let alive = true;
  
    (async () => {
      setLoading(true);
      setError('');
      try {
        await Promise.all([fetchSheet(), fetchOrders()]);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || 'Failed to load stats sheet');
      } finally {
        if (alive) setLoading(false);
      }
    })();
  
    return () => {
      alive = false;
    };
  }, [fetchSheet, fetchOrders]);



  const sheet = useMemo(() => {
    const types = raw?.types && typeof raw.types === 'object' ? raw.types : {};
    const out = {};
  
    for (const t of TYPES) {
      out[t.key] = {};
      for (const day of DAYS) {
        out[t.key][day] = [];
      }
    }
  
    // existing standard / premium / waqf from hissa-sheet
    for (const t of TYPES.filter((x) => x.key !== 'goat_hissa')) {
      for (const day of DAYS) {
        const cowsObj = types?.[t.orderType]?.[day] || {};
        const cowIds = Object.keys(cowsObj);
  
        cowIds.sort((a, b) => {
          const na = parseInt(String(a).replace(/^\D+/, ''), 10) || 0;
          const nb = parseInt(String(b).replace(/^\D+/, ''), 10) || 0;
          return na - nb;
        });
  
        out[t.key][day] = cowIds.map((cow) => {
          const cell = cowsObj[cow] || {};
          const total = clampInt(cell.total_hissa);
          const slot = chooseSlot(cell.slot_counts);
          const status = computeStatus(total, 7);
  
          return {
            cow,
            totalHissa: total,
            slot,
            status,
          };
        });
      }
    }
  
    // goat (hissa) from orders table
    // Fetching is paginated, and day/slot values are normalized so DAY1/day 1/1 all map correctly.
    const goatOrders = (Array.isArray(ordersRaw) ? ordersRaw : []).filter((row) => {
      const day = normalizeDay(row?.day);
      return isGoatHissaOrder(row) && DAYS.includes(day);
    });

    const groupedGoats = {
      'DAY 1': [],
      'DAY 2': [],
      'DAY 3': [],
    };

    for (const row of goatOrders) {
      const cow = String(row?.cow ?? '').trim().toUpperCase();
      const day = normalizeDay(row?.day);
      const slot = normalizeSlot(row?.slot);

      if (!cow || !DAYS.includes(day)) continue;

      groupedGoats[day].push({
        cow,
        totalHissa: '-',
        slot,
        status: 'Closed',
      });
    }

    for (const day of DAYS) {
      groupedGoats[day].sort((a, b) => {
        const na = parseInt(String(a.cow).replace(/^\D+/, ''), 10) || 0;
        const nb = parseInt(String(b.cow).replace(/^\D+/, ''), 10) || 0;
        return na - nb;
      });
  
      out.goat_hissa[day] = groupedGoats[day];
    }
  
    return out;
  }, [raw, ordersRaw]);

  const exportCsv = useCallback(() => {
    if (!sheet) return;
    setExporting(true);
    try {
      const csvValue = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const makeRow = (...cols) => cols.map(csvValue).join(',');
      const lines = [];

      // Build CSV grouped exactly like the page: by Day, then Type, then table rows.
      for (const day of DAYS) {
        lines.push(makeRow(day, '', '', '', '', ''));
        for (const t of TYPES) {
          const typeRows = sheet?.[t.key]?.[day] || [];
          if (!typeRows.length) continue;
          lines.push(makeRow('', t.label, '', '', '', ''));
          lines.push(makeRow('', 'Cow #', 'Total Hissa', 'Status', 'Slot', ''));
          for (const r of typeRows) {
            lines.push(makeRow('', '', r.cow, r.totalHissa, r.status, r.slot || ''));
          }
          lines.push(makeRow('', '', '', '', '', ''));
        }
        lines.push(makeRow('', '', '', '', '', ''));
      }

      const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stats-${year}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, [sheet, year]);

  const s = {
    page: { padding: 24, fontFamily: "'Poppins', system-ui, sans-serif", background: '#ffffff' },
    topRow: { position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', width: 920, maxWidth: '100%' },
    yearFilter: { position: 'absolute', left: 0, top: 0, display: 'flex', alignItems: 'center', gap: 8 },
    yearLabel: { fontSize: 11, fontWeight: 600, color: '#374151' },
    yearSelect: {
      padding: '6px 10px',
      borderRadius: 8,
      border: '1px solid #d1d5db',
      fontSize: 12,
      fontWeight: 500,
      color: '#111827',
      background: '#fff',
      cursor: 'pointer',
      minWidth: 88,
    },
    legend: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 },
    legendItem: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, fontWeight: 600, letterSpacing: 0.3, color: '#6B7280' },
    pill: (slot) => ({ width: 20, height: 8, borderRadius: 10, background: SLOT_COLORS[slot]?.pill || '#E5E7EB', border: '1px solid rgba(0,0,0,0.05)' }),
    exportWrap: { position: 'absolute', right: 0, top: 0, display: 'flex', alignItems: 'center' },
    btn: {
      padding: '7px 12px',
      borderRadius: 8,
      border: '1px solid #0F766E',
      background: '#0F766E',
      color: '#ffffff',
      fontSize: 12,
      fontWeight: 600,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      opacity: exporting ? 0.8 : 1,
    },
    error: { marginTop: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid #FECACA', background: '#FEF2F2', color: '#991B1B', fontSize: 12, fontWeight: 500 },
    sheetWrap: { width: '100%', display: 'flex', justifyContent: 'center' },
    sheet: { width: 920, maxWidth: '100%' },
    cols: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 26, alignItems: 'start' },
    dayHeader: { background: '#0F766E', color: '#fff', borderRadius: 6, padding: '10px 0', textAlign: 'center', fontSize: 20, fontWeight: 800, letterSpacing: 0.6, marginBottom: 10 },
    card: { background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB', overflow: 'hidden', marginBottom: 16 },
    cardTitle: { background: '#E5E7EB', textAlign: 'center', padding: '8px 10px', fontSize: 12, fontWeight: 800, color: '#111827', letterSpacing: 0.3 },
    tableWrap: { paddingTop: 4 },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
    th: { background: '#E5E7EB', padding: '7px 10px', fontWeight: 700, color: '#374151', borderTop: '1px solid #D1D5DB', borderBottom: '1px solid #D1D5DB' },
    td: { padding: '7px 10px', borderBottom: '1px solid rgba(0,0,0,0.06)', color: '#111827' },
    tdCenter: { textAlign: 'center' },
    tdRight: { textAlign: 'center' },
    rowBg: (slot) => ({ background: SLOT_COLORS[slot]?.bg || '#fff' }),
  };

  return (
    <div style={s.page}>
      <div style={s.topRow}>
        <div style={s.yearFilter}>
          <span style={s.yearLabel}>Year</span>
          <select
            aria-label="Booking year"
            style={s.yearSelect}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            disabled={loading}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div style={s.legend}>
          <div style={s.legendItem}><span style={s.pill('SLOT 1')} />SLOT 1</div>
          <div style={s.legendItem}><span style={s.pill('SLOT 2')} />SLOT 2</div>
          <div style={s.legendItem}><span style={s.pill('SLOT 3')} />SLOT 3</div>
        </div>

        <div style={s.exportWrap}>
          <button type="button" style={s.btn} onClick={exportCsv} disabled={loading || exporting}>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      {error && <div style={s.error}>{error}</div>}

      <div style={s.sheetWrap}>
        <div style={s.sheet}>
          <div style={s.cols}>
            {DAYS.map((day) => (
              <div key={day}>
                <div style={s.dayHeader}>{day}</div>

                {TYPES.map((t) => (
                  <div key={t.key} style={s.card}>
                    <div style={s.cardTitle}>{t.label}</div>
                    <div style={s.tableWrap}>
                      <table style={s.table}>
                        <thead>
                          <tr>
                            <th style={s.th}>Cow #</th>
                            <th style={{ ...s.th, textAlign: 'center' }}>Total Hissa</th>
                            <th style={{ ...s.th, textAlign: 'center' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(sheet?.[t.key]?.[day] || []).map((r) => (
                            <tr key={`${day}-${t.key}-${r.cow}`} style={s.rowBg(r.slot)}>
                              <td style={s.td}>{r.cow}</td>
                              <td style={{ ...s.td, ...s.tdRight }}>{r.totalHissa}</td>
                              <td style={{ ...s.td, ...s.tdCenter }}>{r.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

