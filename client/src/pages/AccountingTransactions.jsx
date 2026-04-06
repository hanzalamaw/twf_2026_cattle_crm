import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { API_BASE as API } from '../config/api';

const COLUMNS = [
  { key: 'customer_id', label: 'Cust ID' },
  { key: 'order_id', label: 'Order ID' },
  { key: 'booking_name', label: 'Booking Name' },
  { key: 'contact', label: 'Contact' },
  { key: 'payment_date', label: 'Payment Date' },
  { key: 'order_type', label: 'Order Type' },
  { key: 'total_received', label: 'Total Amount Received' },
  { key: 'bank', label: 'Bank' },
  { key: 'cash', label: 'Cash' },
  { key: 'source', label: 'Source' },
];

const AMOUNT_KEYS = ['total_received', 'bank', 'cash'];

const TYPE_COLORS = {
  'Hissa - Premium': { bg: '#fff4f0', color: '#FF5722' },
  'Hissa - Standard': { bg: '#e8f4ff', color: '#2196F3' },
  'Hissa - Waqf': { bg: '#edfbee', color: '#4CAF50' },
  'Goat (Hissa)': { bg: '#fff8e8', color: '#FF9800' },
  Cow: { bg: '#eff6ff', color: '#3B82F6' },
  Goat: { bg: '#ecfdf5', color: '#10B981' },
};

function formatAmount(val) {
  if (val == null || val === '') return '—';
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  return `Rs ${Math.round(n).toLocaleString('en-PK')}`;
}

function formatDate(val) {
  if (val == null || val === '') return '—';
  const s = String(val);
  if (s.includes('T')) return s.split('T')[0];
  return s;
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const PAGE_SIZE = 50;

export default function AccountingTransactions() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ totalBank: 0, totalCash: 0 });
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [amountVisible, setAmountVisible] = useState(false);
  const [yearFilter, setYearFilter] = useState('2026');
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [appliedTypes, setAppliedTypes] = useState([]);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const [filters, setFilters] = useState({ order_types: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const typeDropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  const token = localStorage.getItem('token');

  const fetchFilters = useCallback(async () => {
    try {
      const res = await fetch(`${API}/accounting/payments/filters`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setFilters({ order_types: data.order_types || [] });
      }
    } catch (e) {
      console.error(e);
    }
  }, [token]);

  const fetchSummary = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (sourceFilter === 'farm') params.set('source', 'farm');
      if (sourceFilter === 'booking') params.set('source', 'booking');
      appliedTypes.forEach((t) => params.append('order_type', t));
      const res = await fetch(`${API}/accounting/payments/summary?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSummary({ totalBank: Number(data.totalBank ?? 0), totalCash: Number(data.totalCash ?? 0) });
      }
    } catch (e) {
      console.error(e);
    }
  }, [token, yearFilter, debouncedSearch, sourceFilter, appliedTypes]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
      appliedTypes.forEach((t) => params.append('order_type', t));
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (sourceFilter === 'farm') params.set('source', 'farm');
      if (sourceFilter === 'booking') params.set('source', 'booking');

      const res = await fetch(`${API}/accounting/payments?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRows(Array.isArray(data.data) ? data.data : []);
        setTotalCount(typeof data.total === 'number' ? data.total : 0);
      } else {
        setError('Failed to load payments');
      }
    } catch (e) {
      setError('Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [token, yearFilter, appliedTypes, page, debouncedSearch, sourceFilter]);

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);
  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);
  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [yearFilter, appliedTypes, debouncedSearch, sourceFilter]);

  useEffect(() => {
    if (!typeDropdownOpen) return;
    const onDocClick = (e) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target)) setTypeDropdownOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [typeDropdownOpen]);

  const typeOptions =
    filters.order_types && filters.order_types.length > 0
      ? filters.order_types
      : [...new Set(rows.map((o) => o.order_type).filter(Boolean))].sort();

  const payKey = (id) => String(id);
  const toggleSelect = (id) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      const k = payKey(id);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const toggleSelectAll = () =>
    rows.length === 0 || selectedIds.size === rows.length
      ? setSelectedIds(new Set())
      : setSelectedIds(new Set(rows.map((r) => payKey(r.payment_id))));

  const handleExport = async () => {
    const ids = Array.from(selectedIds);
    const params = new URLSearchParams();
    if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
    appliedTypes.forEach((t) => params.append('order_type', t));
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (sourceFilter === 'farm') params.set('source', 'farm');
    if (sourceFilter === 'booking') params.set('source', 'booking');

    const all = [];
    let p = 1;
    const limit = 200;
    let total = 0;
    do {
      params.set('page', String(p));
      params.set('limit', String(limit));
      const res = await fetch(`${API}/accounting/payments?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError('Export failed');
        return;
      }
      const data = await res.json();
      total = typeof data.total === 'number' ? data.total : 0;
      const chunk = Array.isArray(data.data) ? data.data : [];
      all.push(...chunk);
      if (chunk.length < limit || all.length >= total) break;
      p += 1;
    } while (true);

    const toExport = ids.length > 0 ? all.filter((r) => ids.includes(payKey(r.payment_id))) : all;

    if (toExport.length === 0) {
      alert(ids.length > 0 ? 'No matching selected rows to export.' : 'No rows to export.');
      return;
    }

    const headers = COLUMNS.map((c) => c.label);
    const sheetRows = toExport.map((row) =>
      COLUMNS.map((col) => {
        const val = row[col.key];
        if (AMOUNT_KEYS.includes(col.key)) {
          const n = Number(val);
          return Number.isFinite(n) ? n : val ?? '';
        }
        if (col.key === 'payment_date') return formatDate(val);
        return val != null ? String(val) : '—';
      })
    );
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sheetRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payments');
    XLSX.writeFile(wb, `accounting-payments-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (loading && rows.length === 0) {
    return (
      <div style={{ padding: '19px', fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif" }}>
        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '16px' }}>Transactions</h2>
        <div style={{ padding: '32px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading...</div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media (max-width: 767px) {
          .acc-txn-root { padding: 16px 12px 24px !important; overflow: auto !important; }
          .acc-txn-topbar { flex-wrap: nowrap !important; gap: 8px !important; margin-bottom: 12px !important; align-items: center !important; min-height: 55px !important; }
          .acc-txn-topbar h2 {
            flex: 1 !important; min-width: 0 !important;
            padding: 0 clamp(48px, 14vw, 56px) 0 0 !important; margin: 0 !important;
            font-size: clamp(15px, 4.3vw, 17px) !important; font-weight: 600 !important; color: #333 !important;
            line-height: 1.25 !important; display: flex !important; align-items: center !important;
          }
          .acc-txn-topbar-controls { display: none !important; }
          .acc-txn-mobile-fab-spacer { display: block !important; }
          .acc-txn-mobile-toolbar { display: flex !important; align-items: center !important; justify-content: space-between !important; gap: 10px !important; margin-bottom: 10px !important; flex-wrap: nowrap !important; }
          .acc-txn-mobile-toolbar-left { display: flex !important; align-items: center !important; gap: 8px !important; flex: 1 !important; min-width: 0 !important; flex-wrap: wrap !important; }
          .acc-txn-filter-chips { display: none !important; }
          .acc-txn-result-count { display: none !important; }
          .acc-txn-pagination { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }
        }
      `}</style>

      <div
        className="acc-txn-root"
        style={{
          padding: '19px',
          fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          height: '100%',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        <div
          className="acc-txn-topbar"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            flexShrink: 0,
            flexWrap: 'nowrap',
            gap: '10px',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333', flexShrink: 0 }}>Transactions</h2>
          <div
            className="acc-txn-topbar-controls"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap', marginLeft: 'auto' }}
            ref={typeDropdownRef}
          >
            <label style={{ fontSize: '10px', color: '#666', whiteSpace: 'nowrap' }}>Year</label>
            <select
              value={yearFilter}
              onChange={(e) => {
                setYearFilter(e.target.value);
                setAppliedTypes([]);
                setSelectedTypes([]);
              }}
              style={{
                padding: '6px 10px',
                fontSize: '10px',
                borderRadius: '6px',
                border: '1px solid #e0e0e0',
                background: '#fff',
                minWidth: '96px',
                cursor: 'pointer',
              }}
            >
              <option value="all">All</option>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
            </select>

            <label style={{ fontSize: '10px', color: '#666', whiteSpace: 'nowrap' }}>Source</label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              style={{
                padding: '6px 10px',
                fontSize: '10px',
                borderRadius: '6px',
                border: '1px solid #e0e0e0',
                background: '#fff',
                minWidth: '120px',
                cursor: 'pointer',
              }}
            >
              <option value="all">All</option>
              <option value="booking">Booking Management</option>
              <option value="farm">Farm Management</option>
            </select>

            <label style={{ fontSize: '12px', color: '#666', whiteSpace: 'nowrap' }}>Type</label>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setTypeDropdownOpen((v) => !v)}
                style={{
                  padding: '6px 10px',
                  fontSize: '10px',
                  borderRadius: '6px',
                  border: '1px solid #e0e0e0',
                  background: '#fff',
                  minWidth: '112px',
                  maxWidth: '160px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '6px',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedTypes.length === 0 ? 'Select types...' : selectedTypes.length === 1 ? selectedTypes[0] : `${selectedTypes.length} selected`}
                </span>
                <span style={{ flexShrink: 0 }}>{typeDropdownOpen ? '▲' : '▼'}</span>
              </button>
              {typeDropdownOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '3px',
                    background: '#fff',
                    border: '1px solid #e0e0e0',
                    borderRadius: '6px',
                    boxShadow: '0 3px 10px rgba(0,0,0,0.12)',
                    padding: '6px',
                    minWidth: '180px',
                    zIndex: 100,
                  }}
                >
                  {typeOptions.length === 0 ? (
                    <div style={{ padding: '6px', color: '#666', fontSize: '10px' }}>No types</div>
                  ) : (
                    typeOptions.map((t) => (
                      <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 6px', cursor: 'pointer', fontSize: '10px' }}>
                        <input
                          type="checkbox"
                          checked={selectedTypes.includes(t)}
                          onChange={() =>
                            setSelectedTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
                          }
                        />
                        <span>{t}</span>
                      </label>
                    ))
                  )}
                  <div style={{ borderTop: '1px solid #eee', marginTop: '6px', paddingTop: '6px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setAppliedTypes([...selectedTypes]);
                        setTypeDropdownOpen(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '5px 10px',
                        fontSize: '10px',
                        fontWeight: '500',
                        background: '#166534',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button type="button" onClick={handleExport} style={{ padding: '6px 13px', fontSize: '10px', fontWeight: '600', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Export
            </button>

            <button
              type="button"
              onClick={() => setAmountVisible((v) => !v)}
              title={amountVisible ? 'Hide' : 'Show'}
              style={{
                padding: '6px 8px',
                fontSize: '10px',
                fontWeight: '500',
                background: '#f0f0f0',
                color: '#333',
                border: '1px solid #e0e0e0',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img src={amountVisible ? '/icons/hide.png' : '/icons/show.png'} alt="" style={{ width: '18px', height: '18px', display: 'block' }} />
            </button>
          </div>

          <div className="acc-txn-mobile-fab-spacer" aria-hidden style={{ display: 'none', width: 46, height: 46, flexShrink: 0 }} />
        </div>

        {error && (
          <div style={{ padding: '12px', background: '#FFF5F2', color: '#C62828', borderRadius: '8px', marginBottom: '16px', flexShrink: 0 }}>{error}</div>
        )}

        <div className="acc-txn-mobile-toolbar" style={{ display: 'none', flexShrink: 0 }}>
          <div className="acc-txn-mobile-toolbar-left">
            <span style={{ fontSize: '11px', color: '#666' }}>Year</span>
            <select
              value={yearFilter}
              onChange={(e) => {
                setYearFilter(e.target.value);
                setAppliedTypes([]);
                setSelectedTypes([]);
              }}
              style={{ padding: '0 10px', fontSize: '12px', borderRadius: '8px', border: '1px solid #e0e0e0', minWidth: '88px', cursor: 'pointer' }}
            >
              <option value="all">All</option>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              style={{ padding: '0 10px', fontSize: '12px', borderRadius: '8px', border: '1px solid #e0e0e0', minWidth: '120px', cursor: 'pointer' }}
            >
              <option value="all">All sources</option>
              <option value="booking">Booking</option>
              <option value="farm">Farm</option>
            </select>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((v) => !v)}
              style={{
                padding: '0 12px',
                borderRadius: '8px',
                border: `1px solid ${mobileFiltersOpen ? '#FF5722' : '#e0e0e0'}`,
                background: mobileFiltersOpen ? '#fff4f0' : '#fff',
                fontSize: '12px',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              Filters
            </button>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button type="button" onClick={handleExport} style={{ padding: '6px 10px', fontSize: '11px', fontWeight: '600', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
              Export
            </button>
            <button type="button" onClick={() => setAmountVisible((v) => !v)} style={{ padding: '6px 8px', borderRadius: '8px', border: '1px solid #e0e0e0', background: '#f0f0f0', cursor: 'pointer' }}>
              <img src={amountVisible ? '/icons/hide.png' : '/icons/show.png'} alt="" style={{ width: '18px', height: '18px' }} />
            </button>
          </div>
        </div>

        {mobileFiltersOpen && (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px', marginBottom: '10px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>Order type</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {typeOptions.map((t) => {
                const tc = TYPE_COLORS[t] || { bg: '#f3f4f6', color: '#374151' };
                const checked = selectedTypes.includes(t);
                return (
                  <label
                    key={t}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${checked ? tc.color : '#e5e7eb'}`,
                      background: checked ? tc.bg : '#fafafa',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
                      }
                    />
                    <span style={{ fontSize: '13px' }}>{t}</span>
                  </label>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => {
                  setAppliedTypes([...selectedTypes]);
                  setMobileFiltersOpen(false);
                }}
                style={{ flex: 1, padding: '11px', background: '#166534', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedTypes([]);
                  setAppliedTypes([]);
                  setMobileFiltersOpen(false);
                }}
                style={{ flex: 1, padding: '11px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', cursor: 'pointer' }}
              >
                Reset
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px', flexShrink: 0 }}>
          <div style={{ flex: '1 1 160px', minWidth: '160px', padding: '14px 12px', borderRadius: '10px', border: '1px solid #f1f1f1', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <img src="/icons/total_orders_amount.png" alt="" style={{ width: '50px', height: '50px', objectFit: 'contain' }} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>Bank (filtered)</div>
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                {amountVisible ? (
                  formatAmount(summary.totalBank)
                ) : (
                  <span style={{ filter: 'blur(6px)', userSelect: 'none', display: 'inline-block', minWidth: '100px', background: 'rgba(0,0,0,0.03)', borderRadius: '10px', padding: '6px 10px' }}>
                    {formatAmount(summary.totalBank)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div style={{ flex: '1 1 160px', minWidth: '160px', padding: '14px 12px', borderRadius: '10px', border: '1px solid #f1f1f1', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <img src="/icons/total_orders_amount.png" alt="" style={{ width: '50px', height: '50px', objectFit: 'contain' }} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>Cash (filtered)</div>
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                {amountVisible ? (
                  formatAmount(summary.totalCash)
                ) : (
                  <span style={{ filter: 'blur(6px)', userSelect: 'none', display: 'inline-block', minWidth: '100px', background: 'rgba(0,0,0,0.03)', borderRadius: '10px', padding: '6px 10px' }}>
                    {formatAmount(summary.totalCash)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px', maxWidth: '380px' }}>
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <SearchIcon />
            </span>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search payments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '7px 32px 7px 30px',
                fontSize: '10px',
                borderRadius: '6px',
                border: '1px solid #e0e0e0',
                outline: 'none',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <XIcon />
              </button>
            )}
          </div>

          {(debouncedSearch || sourceFilter !== 'all' || appliedTypes.length > 0) && (
            <span className="acc-txn-result-count" style={{ fontSize: '10px', color: '#888', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
              {totalCount} payment{totalCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div style={{ flex: 1, minHeight: '260px', overflow: 'auto' }}>
          <div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', background: '#fff', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap', width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={rows.length > 0 && selectedIds.size === rows.length}
                        onChange={toggleSelectAll}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    {COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        style={{
                          padding: '10px 8px',
                          textAlign: AMOUNT_KEYS.includes(col.key) ? 'right' : 'left',
                          fontWeight: '600',
                          color: '#333',
                          borderBottom: '2px solid #e0e0e0',
                        }}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={COLUMNS.length + 1} style={{ padding: '32px', textAlign: 'center', color: '#666' }}>
                        No payments match your filters.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.payment_id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '6px', whiteSpace: 'nowrap', fontSize: '11px' }}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(payKey(row.payment_id))}
                            onChange={() => toggleSelect(row.payment_id)}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                        {COLUMNS.map((col) => (
                          <td
                            key={col.key}
                            style={{
                              padding: '8px',
                              textAlign: AMOUNT_KEYS.includes(col.key) ? 'right' : 'left',
                            }}
                          >
                            {col.key === 'payment_date'
                              ? formatDate(row[col.key])
                              : AMOUNT_KEYS.includes(col.key)
                                ? formatAmount(row[col.key])
                                : row[col.key] != null
                                  ? String(row[col.key])
                                  : '—'}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {!loading && totalCount > 0 && Math.ceil(totalCount / PAGE_SIZE) > 1 && (
          <div
            className="acc-txn-pagination"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              padding: '12px 0',
              borderTop: '1px solid #e0e0e0',
              marginTop: '8px',
            }}
          >
            <span style={{ fontSize: '13px', color: '#666' }}>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
            </span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: '6px 12px',
                  fontSize: '10px',
                  background: page <= 1 ? '#f0f0f0' : '#fff',
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
                return pages.map((p) => (
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
                ));
              })()}
              <button
                type="button"
                disabled={page >= Math.ceil(totalCount / PAGE_SIZE)}
                onClick={() => setPage((p) => Math.min(Math.ceil(totalCount / PAGE_SIZE) || 1, p + 1))}
                style={{
                  padding: '6px 12px',
                  fontSize: '10px',
                  background: page >= Math.ceil(totalCount / PAGE_SIZE) ? '#f0f0f0' : '#fff',
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
    </>
  );
}
