import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';

const API = 'http://localhost:5000';

const EXPENSE_COLUMNS = [
  { key: 'expense_id', label: 'Expense ID' },
  { key: 'done_at', label: 'Date' },
  { key: 'description', label: 'Description' },
  { key: 'bank', label: 'Bank' },
  { key: 'cash', label: 'Cash' },
  { key: 'total', label: 'Total' },
  { key: 'done_by', label: 'Done By' },
  { key: 'created_by', label: 'Created By' },
];

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

export default function Expenses() {
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [amountVisible, setAmountVisible] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addBank, setAddBank] = useState('');
  const [addCash, setAddCash] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [addErrors, setAddErrors] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [editExpense, setEditExpense] = useState(null);
  const [editBank, setEditBank] = useState('');
  const [editCash, setEditCash] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editErrors, setEditErrors] = useState({});
  const [deleteConfirmExpense, setDeleteConfirmExpense] = useState(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [addDate, setAddDate] = useState('');
  const [addDoneBy, setAddDoneBy] = useState('');

  const [editDate, setEditDate] = useState('');
  const [editDoneBy, setEditDoneBy] = useState('');
  
  const PAGE_SIZE = 50;
  const { authFetch } = useAuth();
  const token = localStorage.getItem('token');

  const toggleSelect = (expenseId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(expenseId)) next.delete(expenseId);
      else next.add(expenseId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === expenses.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(expenses.map((r) => r.expense_id)));
  };

  const fetchSummary = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/api/booking/expenses/summary`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, [authFetch, token]);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await authFetch(`${API}/api/booking/expenses?page=${page}&limit=${PAGE_SIZE}`, { headers: { Authorization: `Bearer ${token}` } });
      let data;
      try {
        data = await res.json();
      } catch (_) {
        data = {};
      }
      if (res.ok) {
        setExpenses(Array.isArray(data.data) ? data.data : []);
        setTotalCount(typeof data.total === 'number' ? data.total : (Array.isArray(data.data) ? data.data.length : 0));
      } else {
        setExpenses([]);
        setError(data.message || 'Failed to load expenses');
      }
    } catch (e) {
      setExpenses([]);
      setError('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [authFetch, token, page]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);
  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const openAddModal = () => {
    setAddBank('');
    setAddCash('');
    setAddDescription('');
  
    setAddDate('');
    setAddDoneBy('');
  
    setAddErrors({});
    setAddModalOpen(true);
  };

  const openEditModal = (row) => {
    setEditExpense(row);
    setEditBank(String(row.bank ?? ''));
    setEditCash(String(row.cash ?? ''));
    setEditDescription(String(row.description ?? ''));
  
    setEditDate(row.done_at ? row.done_at.split('T')[0] : '');
    setEditDoneBy(String(row.done_by ?? ''));
  
    setEditErrors({});
  };

  const validateEdit = () => {
    const err = {};
    const bank = parseFloat(editBank);
    const cash = parseFloat(editCash);
    const addB = Math.max(0, Number.isNaN(bank) ? 0 : bank);
    const addC = Math.max(0, Number.isNaN(cash) ? 0 : cash);
    if (!Number.isNaN(bank) && bank < 0) err.editBank = 'Must be ≥ 0';
    if (!Number.isNaN(cash) && cash < 0) err.editCash = 'Must be ≥ 0';
    if (addB + addC === 0) err.edit = 'Enter at least one amount (Bank or Cash ≥ 0).';
    setEditErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSaveEdit = async () => {
    if (!editExpense || !validateEdit()) return;
    const bank = Math.max(0, parseFloat(editBank) || 0);
    const cash = Math.max(0, parseFloat(editCash) || 0);
    if (bank === 0 && cash === 0) return;
    setSubmitting(true);
    try {
      const res = await authFetch(`${API}/api/booking/expenses/${encodeURIComponent(editExpense.expense_id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          bank,
          cash,
          description: editDescription.trim(),
          done_at: editDate || null,
          done_by: editDoneBy.trim() || null
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setEditExpense(null);
        fetchSummary();
        fetchExpenses();
      } else {
        setError(data.message || 'Failed to update expense');
      }
    } catch (e) {
      setError('Failed to update expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row) => {
    setSubmitting(true);
    try {
      const res = await authFetch(`${API}/api/booking/expenses/${encodeURIComponent(row.expense_id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDeleteConfirmExpense(null);
        if (editExpense?.expense_id === row.expense_id) setEditExpense(null);
        setSelectedIds((prev) => { const next = new Set(prev); next.delete(row.expense_id); return next; });
        fetchSummary();
        fetchExpenses();
      } else {
        setError(data.message || 'Failed to delete expense');
      }
    } catch (e) {
      setError('Failed to delete expense');
    } finally {
      setSubmitting(false);
    }
  };

  const validateAdd = () => {
    const err = {};
    const bank = parseFloat(addBank);
    const cash = parseFloat(addCash);
    const addB = Math.max(0, Number.isNaN(bank) ? 0 : bank);
    const addC = Math.max(0, Number.isNaN(cash) ? 0 : cash);
    if (!Number.isNaN(bank) && bank < 0) err.addBank = 'Must be ≥ 0';
    if (!Number.isNaN(cash) && cash < 0) err.addCash = 'Must be ≥ 0';
    if (addB + addC === 0) err.add = 'Enter at least one amount (Bank or Cash ≥ 0).';
    setAddErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleAddExpense = async () => {
    if (!validateAdd()) return;
    const bank = Math.max(0, parseFloat(addBank) || 0);
    const cash = Math.max(0, parseFloat(addCash) || 0);
    if (bank === 0 && cash === 0) return;
    setSubmitting(true);
    try {
      const res = await authFetch(`${API}/api/booking/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          bank,
          cash,
          description: addDescription.trim(),
          done_at: addDate || null,
          done_by: addDoneBy.trim() || null
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAddModalOpen(false);
        fetchSummary();
        fetchExpenses();
      } else {
        setError(data.message || 'Failed to add expense');
      }
    } catch (e) {
      setError('Failed to add expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = async () => {
    let toExport;
    if (selectedIds.size > 0) {
      toExport = expenses.filter((e) => selectedIds.has(e.expense_id));
    } else {
      const res = await authFetch(`${API}/api/booking/expenses?page=1&limit=100000`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        setError('Failed to load expenses for export');
        return;
      }
      const data = await res.json();
      toExport = Array.isArray(data.data) ? data.data : [];
    }
    if (toExport.length === 0) {
      alert(selectedIds.size > 0 ? 'No selected expenses to export.' : 'No expenses to export.');
      return;
    }
    const exportedIds = toExport.map((e) => e.expense_id);
    const headers = EXPENSE_COLUMNS.map((c) => c.label);
    const rows = toExport.map((row) =>
      EXPENSE_COLUMNS.map((col) => {
        const val = row[col.key];
        if (['bank', 'cash', 'total'].includes(col.key)) return formatAmount(val);
        if (col.key === 'done_at') return formatDate(val);
        return val != null ? String(val) : '—';
      })
    );
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
    XLSX.writeFile(wb, `expenses-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
    try {
      await authFetch(`${API}/api/booking/expenses/export-audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ count: toExport.length, expense_ids: exportedIds }),
      });
    } catch (e) {
      console.error('Export audit failed', e);
    }
  };

  const fullDataTotalBank = summary?.totalBank ?? 0;
  const fullDataTotalCash = summary?.totalCash ?? 0;

  if (loading && expenses.length === 0) {
    return (
      <div style={{ padding: '19px', fontFamily: "'Poppins', 'Inter', sans-serif" }}>
        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '16px' }}>Expenses</h2>
        <div style={{ padding: '32px', textAlign: 'center', color: '#666', fontSize: '11px' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '19px', fontFamily: "'Poppins', 'Inter', sans-serif", display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0, flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#333', flexShrink: 0 }}>Expenses</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' }}>
          <button type="button" onClick={handleExport} style={{ padding: '6px 13px', fontSize: '11px', fontWeight: '600', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Export
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px', background: '#FFF5F2', color: '#C62828', borderRadius: '6px', marginBottom: '13px', flexShrink: 0, fontSize: '10px' }}>{error}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px', flexShrink: 0 }}>
        <button type="button" onClick={() => setAmountVisible((v) => !v)} title={amountVisible ? 'Hide' : 'Show'} style={{ padding: '6px 8px', fontSize: '10px', fontWeight: '500', background: '#f0f0f0', color: '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={amountVisible ? '/icons/hide.png' : '/icons/show.png'} alt={amountVisible ? 'Hide' : 'Show'} style={{ width: '18px', height: '18px', display: 'block' }} />
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '13px', marginBottom: '16px', flexShrink: 0, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 200px', minWidth: '180px', padding: '13px 16px', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '10px', color: '#666', marginBottom: '3px' }}>Bank</div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#166534', minHeight: '22px' }}>
            {amountVisible ? <span>{formatAmount(fullDataTotalBank)}</span> : <span style={{ filter: 'blur(6px)', userSelect: 'none', color: '#999' }}>{formatAmount(fullDataTotalBank)}</span>}
          </div>
        </div>
        <div style={{ flex: '1 1 200px', minWidth: '180px', padding: '13px 16px', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '10px', color: '#666', marginBottom: '3px' }}>Cash</div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: '#b91c1c', minHeight: '22px' }}>
            {amountVisible ? <span>{formatAmount(fullDataTotalCash)}</span> : <span style={{ filter: 'blur(6px)', userSelect: 'none', color: '#999' }}>{formatAmount(fullDataTotalCash)}</span>}
          </div>
        </div>
        <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
          <button type="button" onClick={openAddModal} style={{ padding: '6px 13px', fontSize: '11px', fontWeight: '600', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Add Expense
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: '400px', overflow: 'auto' }}>
        <div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', background: '#fff', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', whiteSpace: 'nowrap' }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap', width: '40px' }}>
                    <input type="checkbox" checked={expenses.length > 0 && selectedIds.size === expenses.length} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                  </th>
                  {EXPENSE_COLUMNS.map((col) => (
                    <th key={col.key} style={{ padding: '10px 8px', textAlign: ['bank', 'cash', 'total'].includes(col.key) ? 'right' : 'left', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap' }}>{col.label}</th>
                  ))}
                  <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '600', color: '#333', borderBottom: '2px solid #e0e0e0', whiteSpace: 'nowrap', width: '80px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr><td colSpan={EXPENSE_COLUMNS.length + 2} style={{ padding: '19px', textAlign: 'center', color: '#666', fontSize: '11px' }}>No expenses.</td></tr>
                ) : (
                  expenses.map((row) => (
                    <tr
                      key={row.expense_id}
                      style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
                      onClick={(e) => { if (!e.target.closest('input[type="checkbox"]') && !e.target.closest('button')) openEditModal(row); }}
                    >
                      <td style={{ padding: '8px', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.has(row.expense_id)} onChange={() => toggleSelect(row.expense_id)} style={{ cursor: 'pointer' }} />
                      </td>
                      {EXPENSE_COLUMNS.map((col) => (
                        <td key={col.key} style={{ padding: '8px', textAlign: ['bank', 'cash', 'total'].includes(col.key) ? 'right' : 'left', whiteSpace: 'nowrap' }}>
                          {['bank', 'cash', 'total'].includes(col.key) ? formatAmount(row[col.key]) : col.key === 'done_at' ? formatDate(row[col.key]) : (row[col.key] != null ? String(row[col.key]) : '—')}
                        </td>
                      ))}
                      <td style={{ padding: '8px', textAlign: 'center', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => setDeleteConfirmExpense(row)} disabled={submitting} title="Delete" style={{ padding: '4px', cursor: submitting ? 'not-allowed' : 'pointer', background: 'none', border: 'none', verticalAlign: 'middle', opacity: submitting ? 0.6 : 1 }}><img src="/icons/delete.png" alt="Delete" style={{ width: '18px', height: '18px', display: 'block' }} /></button>
                      </td>
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
            Showing {expenses.length} of {totalCount} expenses
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{ padding: '6px 12px', fontSize: '10px', background: page <= 1 ? '#f0f0f0' : '#fff', color: page <= 1 ? '#999' : '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
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
                      style={{ minWidth: '32px', padding: '6px 10px', fontSize: '10px', background: p === page ? '#2563eb' : '#fff', color: p === page ? '#fff' : '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: 'pointer', fontWeight: p === page ? 600 : 400 }}
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
              style={{ padding: '6px 12px', fontSize: '10px', background: page >= Math.ceil(totalCount / PAGE_SIZE) ? '#f0f0f0' : '#fff', color: page >= Math.ceil(totalCount / PAGE_SIZE) ? '#999' : '#333', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: page >= Math.ceil(totalCount / PAGE_SIZE) ? 'not-allowed' : 'pointer' }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {deleteConfirmExpense && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => !submitting && setDeleteConfirmExpense(null)}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '16px 20px', width: 'min(380px, 95vw)', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: '600', color: '#333' }}>Delete expense?</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#666' }}>
              Delete expense <strong>{deleteConfirmExpense.expense_id}</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => !submitting && setDeleteConfirmExpense(null)} disabled={submitting} style={{ padding: '6px 13px', background: '#e0e0e0', color: '#333', border: 'none', borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '10px' }}>Cancel</button>
              <button type="button" onClick={() => handleDelete(deleteConfirmExpense)} disabled={submitting} style={{ padding: '6px 13px', background: '#b91c1c', color: '#fff', border: 'none', borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '10px' }}>{submitting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {editExpense && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => !submitting && setEditExpense(null)}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '16px 20px', width: 'min(420px, 95vw)', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 13px 0', fontSize: '13px', fontWeight: '600' }}>Edit Expense</h3>
            <div style={{ fontSize: '10px', color: '#666', marginBottom: '10px' }}>Expense ID: {editExpense.expense_id} · Date: {formatDate(editExpense.done_at)}</div>
            {(editErrors.edit || editErrors.editBank || editErrors.editCash) && (
              <div style={{ marginBottom: '10px', padding: '6px', background: '#fef2f2', color: '#b91c1c', borderRadius: '6px', fontSize: '10px' }}>
                {editErrors.edit}
                {editErrors.editBank && <div>Bank: {editErrors.editBank}</div>}
                {editErrors.editCash && <div>Cash: {editErrors.editCash}</div>}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '13px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Bank (Rs)</label>
                <input type="number" min="0" step="0.01" value={editBank} onChange={(e) => { setEditBank(e.target.value); setEditErrors((p) => ({ ...p, editBank: undefined, editCash: undefined, edit: undefined })); }} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: editErrors.editBank ? '1px solid #dc2626' : '1px solid #e0e0e0', fontSize: '10px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Cash (Rs)</label>
                <input type="number" min="0" step="0.01" value={editCash} onChange={(e) => { setEditCash(e.target.value); setEditErrors((p) => ({ ...p, editCash: undefined, editBank: undefined, edit: undefined })); }} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: editErrors.editCash ? '1px solid #dc2626' : '1px solid #e0e0e0', fontSize: '10px' }} />
              </div>
            </div>
            <div style={{ marginBottom: '13px' }}>
              <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Description (optional)</label>
              <input type="text" value={editDescription} onChange={(e) => { setEditDescription(e.target.value); setEditErrors((p) => ({ ...p, edit: undefined })); }} placeholder="e.g. Fuel, stationery" style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '10px' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '13px' }}>

  {/* Date Field */}
  <div>
    <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>
      Date
    </label>
    <input
      type="date"
      value={editDate}
      onChange={(e) => setEditDate(e.target.value)}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: '6px 10px',
        borderRadius: '6px',
        border: '1px solid #e0e0e0',
        fontSize: '10px',
        height: '30px'
      }}
    />
  </div>

  {/* Done By Field */}
  <div>
    <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>
      Done By
    </label>
    <input
      type="text"
      value={editDoneBy}
      onChange={(e) => setEditDoneBy(e.target.value)}
      placeholder="Staff name"
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: '6px 10px',
        borderRadius: '6px',
        border: '1px solid #e0e0e0',
        fontSize: '10px',
        height: '30px'
      }}
    />
  </div>

</div>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => !submitting && setEditExpense(null)} disabled={submitting} style={{ padding: '6px 13px', background: '#e0e0e0', color: '#333', border: 'none', borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '10px' }}>Close</button>
              <button type="button" onClick={handleSaveEdit} disabled={submitting || ((parseFloat(editBank) || 0) === 0 && (parseFloat(editCash) || 0) === 0)} style={{ padding: '6px 13px', background: '#166534', color: '#fff', border: 'none', borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '10px' }}>{submitting ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {addModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => !submitting && setAddModalOpen(false)}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '16px 20px', width: 'min(420px, 95vw)', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 13px 0', fontSize: '13px', fontWeight: '600' }}>Add Expense</h3>
            {(addErrors.add || addErrors.addBank || addErrors.addCash) && (
              <div style={{ marginBottom: '10px', padding: '6px', background: '#fef2f2', color: '#b91c1c', borderRadius: '6px', fontSize: '10px' }}>
                {addErrors.add}
                {addErrors.addBank && <div>Bank: {addErrors.addBank}</div>}
                {addErrors.addCash && <div>Cash: {addErrors.addCash}</div>}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '13px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Bank (Rs)</label>
                <input type="number" min="0" step="0.01" value={addBank} onChange={(e) => { setAddBank(e.target.value); setAddErrors((p) => ({ ...p, addBank: undefined, addCash: undefined, add: undefined })); }} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: addErrors.addBank ? '1px solid #dc2626' : '1px solid #e0e0e0', fontSize: '10px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>Cash (Rs)</label>
                <input type="number" min="0" step="0.01" value={addCash} onChange={(e) => { setAddCash(e.target.value); setAddErrors((p) => ({ ...p, addCash: undefined, addBank: undefined, add: undefined })); }} style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: addErrors.addCash ? '1px solid #dc2626' : '1px solid #e0e0e0', fontSize: '10px' }} />
              </div>
            </div>
            <div style={{ marginBottom: '13px' }}>
  <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>
    Description (optional)
  </label>
  <input
    type="text"
    value={addDescription}
    onChange={(e) => setAddDescription(e.target.value)}
    placeholder="e.g. Fuel, stationery"
    style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '10px' }}
  />
</div>

<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '13px' }}>

  {/* Date Field */}
  <div>
    <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>
      Date
    </label>
    <input
      type="date"
      value={addDate}
      onChange={(e) => setAddDate(e.target.value)}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: '6px 10px',
        borderRadius: '6px',
        border: '1px solid #e0e0e0',
        fontSize: '10px',
        height: '30px'
      }}
    />
  </div>

  {/* Done By Field */}
  <div>
    <label style={{ display: 'block', fontSize: '10px', color: '#666', marginBottom: '3px' }}>
      Done By
    </label>
    <input
      type="text"
      value={addDoneBy}
      onChange={(e) => setAddDoneBy(e.target.value)}
      placeholder="Staff name"
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: '6px 10px',
        borderRadius: '6px',
        border: '1px solid #e0e0e0',
        fontSize: '10px',
        height: '30px'
      }}
    />
  </div>

</div>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => !submitting && setAddModalOpen(false)} disabled={submitting} style={{ padding: '6px 13px', background: '#e0e0e0', color: '#333', border: 'none', borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '10px' }}>Close</button>
              <button type="button" onClick={handleAddExpense} disabled={submitting || ((parseFloat(addBank) || 0) === 0 && (parseFloat(addCash) || 0) === 0)} style={{ padding: '6px 13px', background: '#166534', color: '#fff', border: 'none', borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '10px' }}>{submitting ? 'Submitting...' : 'Add'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
