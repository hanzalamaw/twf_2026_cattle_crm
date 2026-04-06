import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { API_BASE as API } from '../config/api';

const COLUMNS = [
  { key: 'expense_id', label: 'Expense ID' },
  { key: 'done_at', label: 'Date' },
  { key: 'description', label: 'Description' },
  { key: 'bank', label: 'Bank' },
  { key: 'cash', label: 'Cash' },
  { key: 'total', label: 'Total' },
  { key: 'done_by', label: 'Done By' },
  { key: 'source', label: 'Source' },
];

const AMOUNT_KEYS = ['bank', 'cash', 'total'];

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

const PAGE_SIZE = 50;

export default function AccountingExpenses() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ totalBank: 0, totalCash: 0 });
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [amountVisible, setAmountVisible] = useState(false);
  const [yearFilter, setYearFilter] = useState('2026');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const searchInputRef = useRef(null);

  const token = localStorage.getItem('token');

  const expenseRowKey = (r) => `${r.source}-${r.expense_id}`;

  const fetchSummary = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (sourceFilter === 'farm') params.set('source', 'farm');
      if (sourceFilter === 'booking') params.set('source', 'booking');
      const res = await fetch(`${API}/accounting/expenses/summary?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSummary({ totalBank: Number(data.totalBank ?? 0), totalCash: Number(data.totalCash ?? 0) });
      }
    } catch (e) {
      console.error(e);
    }
  }, [token, yearFilter, debouncedSearch, sourceFilter]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (sourceFilter === 'farm') params.set('source', 'farm');
      if (sourceFilter === 'booking') params.set('source', 'booking');

      const res = await fetch(`${API}/accounting/expenses?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRows(Array.isArray(data.data) ? data.data : []);
        setTotalCount(typeof data.total === 'number' ? data.total : 0);
      } else {
        setError('Failed to load expenses');
      }
    } catch (e) {
      setError('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [token, yearFilter, page, debouncedSearch, sourceFilter]);

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
  }, [yearFilter, debouncedSearch, sourceFilter]);

  const toggleSelect = (key) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const toggleSelectAll = () =>
    rows.length === 0 || selectedIds.size === rows.length
      ? setSelectedIds(new Set())
      : setSelectedIds(new Set(rows.map(expenseRowKey)));

  const handleExport = async () => {
    const ids = Array.from(selectedIds);
    const params = new URLSearchParams();
    if (yearFilter && yearFilter !== 'all') params.set('year', yearFilter);
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
      const res = await fetch(`${API}/accounting/expenses?${params.toString()}`, {
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

    const toExport = ids.length > 0 ? all.filter((r) => ids.includes(expenseRowKey(r))) : all;

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
        if (col.key === 'done_at') return formatDate(val);
        return val != null ? String(val) : '—';
      })
    );
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sheetRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
    XLSX.writeFile(wb, `accounting-expenses-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (loading && rows.length === 0) {
    return (
      <div style={{ padding: '19px', fontFamily: "'Poppins', 'Inter', sans-serif" }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '16px' }}>Expenses</h2>
        <div style={{ padding: '32px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading...</div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media (max-width: 767px) {
          .acc-exp-root { padding: 16px 12px 24px !important; }
          .acc-exp-topbar h2 {
            flex: 1 !important; min-width: 0 !important;
            padding: 0 clamp(48px, 14vw, 56px) 0 0 !important;
            font-size: clamp(15px, 4.3vw, 17px) !important;
            min-height: 55px !important; display: flex !important; align-items: center !important;
          }
          .acc-exp-topbar-controls { display: none !important; }
          .acc-exp-mobile-bar { display: flex !important; flex-wrap: wrap !important; gap: 8px !important; margin-bottom: 12px !important; align-items: center !important; }
        }
      `}</style>

      <div
        className="acc-exp-root"
        style={{
          padding: '19px',
          fontFamily: "'Poppins', 'Inter', sans-serif",
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          height: '100%',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        <div className="acc-exp-topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333' }}>Expenses</h2>
          <div className="acc-exp-topbar-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '10px', color: '#666' }}>Year</label>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              style={{ padding: '6px 10px', fontSize: '10px', borderRadius: '6px', border: '1px solid #e0e0e0', cursor: 'pointer' }}
            >
              <option value="all">All</option>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
            </select>
            <label style={{ fontSize: '10px', color: '#666' }}>Source</label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              style={{ padding: '6px 10px', fontSize: '10px', borderRadius: '6px', border: '1px solid #e0e0e0', minWidth: '130px', cursor: 'pointer' }}
            >
              <option value="all">All</option>
              <option value="booking">Booking Management</option>
              <option value="farm">Farm Management</option>
            </select>
            <button type="button" onClick={handleExport} style={{ padding: '6px 13px', fontSize: '11px', fontWeight: '600', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
              Export
            </button>
            <button
              type="button"
              onClick={() => setAmountVisible((v) => !v)}
              style={{ padding: '6px 8px', border: '1px solid #e0e0e0', borderRadius: '6px', background: '#f0f0f0', cursor: 'pointer' }}
            >
              <img src={amountVisible ? '/icons/hide.png' : '/icons/show.png'} alt="" style={{ width: '18px', height: '18px' }} />
            </button>
          </div>
        </div>

        <div className="acc-exp-mobile-bar" style={{ display: 'none' }}>
          <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} style={{ padding: '8px', fontSize: '12px', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
            <option value="all">All years</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
          </select>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} style={{ padding: '8px', fontSize: '12px', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
            <option value="all">All sources</option>
            <option value="booking">Booking</option>
            <option value="farm">Farm</option>
          </select>
          <button type="button" onClick={handleExport} style={{ padding: '8px 12px', fontSize: '11px', fontWeight: '600', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
            Export
          </button>
          <button type="button" onClick={() => setAmountVisible((v) => !v)} style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e0e0e0', background: '#f0f0f0' }}>
            <img src={amountVisible ? '/icons/hide.png' : '/icons/show.png'} alt="" style={{ width: '18px', height: '18px' }} />
          </button>
        </div>

        {error && (
          <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', marginBottom: '12px', fontSize: '11px' }}>{error}</div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          <div style={{ flex: '1 1 160px', padding: '14px 12px', borderRadius: '10px', border: '1px solid #f1f1f1', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/icons/pending_payments_amount.png" alt="" style={{ width: '50px', height: '50px' }} />
            <div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>Bank (filtered)</div>
              <div style={{ fontSize: '18px', fontWeight: '600' }}>
                {amountVisible ? formatAmount(summary.totalBank) : <span style={{ filter: 'blur(6px)', userSelect: 'none' }}>{formatAmount(summary.totalBank)}</span>}
              </div>
            </div>
          </div>
          <div style={{ flex: '1 1 160px', padding: '14px 12px', borderRadius: '10px', border: '1px solid #f1f1f1', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/icons/pending_payments_amount.png" alt="" style={{ width: '50px', height: '50px' }} />
            <div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>Cash (filtered)</div>
              <div style={{ fontSize: '18px', fontWeight: '600' }}>
                {amountVisible ? formatAmount(summary.totalCash) : <span style={{ filter: 'blur(6px)', userSelect: 'none' }}>{formatAmount(summary.totalCash)}</span>}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px', maxWidth: '400px' }}>
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <SearchIcon />
            </span>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search expenses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 12px 8px 32px',
                fontSize: '12px',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
                outline: 'none',
              }}
            />
          </div>
          {debouncedSearch && (
            <span style={{ fontSize: '11px', color: '#888' }}>
              {totalCount} row{totalCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div style={{ flex: 1, minHeight: '300px', overflow: 'auto' }}>
          <div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', background: '#fff', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', borderBottom: '2px solid #e0e0e0', width: '40px' }}>
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
                      <td colSpan={COLUMNS.length + 1} style={{ padding: '28px', textAlign: 'center', color: '#666' }}>
                        No expenses match your filters.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={expenseRowKey(row)} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '6px', whiteSpace: 'nowrap', fontSize: '11px' }}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(expenseRowKey(row))}
                            onChange={() => toggleSelect(expenseRowKey(row))}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                        {COLUMNS.map((col) => (
                          <td
                            key={col.key}
                            style={{ padding: '8px', textAlign: AMOUNT_KEYS.includes(col.key) ? 'right' : 'left' }}
                          >
                            {col.key === 'done_at'
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

        {!loading && totalCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', padding: '12px 0', borderTop: '1px solid #e0e0e0', marginTop: '8px' }}>
            <span style={{ fontSize: '13px', color: '#666' }}>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
            </span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{ padding: '6px 12px', fontSize: '10px', border: '1px solid #e0e0e0', borderRadius: '6px', background: page <= 1 ? '#f0f0f0' : '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
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
                      background: p === page ? '#2563eb' : '#fff',
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
                style={{ padding: '6px 12px', fontSize: '10px', border: '1px solid #e0e0e0', borderRadius: '6px', background: page >= Math.ceil(totalCount / PAGE_SIZE) ? '#f0f0f0' : '#fff', cursor: page >= Math.ceil(totalCount / PAGE_SIZE) ? 'not-allowed' : 'pointer' }}
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
