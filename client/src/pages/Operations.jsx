import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { OPERATION_MODULES } from './operationModules';

/**
 * Same card grid as Select Management — styles live in OperationsLayout (mob-*).
 */
export default function Operations() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const perms = user?.permissions || {};
  const [mounted, setMounted] = useState(false);
  const [pressedId, setPressedId] = useState(null);
  const [accessBlocked, setAccessBlocked] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const hasAccess = (key) => !!perms[key];
  const accessibleCount = OPERATION_MODULES.filter((m) => hasAccess(m.permission)).length;

  const handleClick = (m) => {
    if (!hasAccess(m.permission)) {
      setAccessBlocked(m.name);
      setTimeout(() => setAccessBlocked(null), 3000);
      return;
    }
    setAccessBlocked(null);
    navigate(m.path);
  };

  return (
    <>
      <div className={`mob-toast ${accessBlocked ? 'show' : ''}`}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        No permission for {accessBlocked}
      </div>

      <div className="mob-grid">
        {OPERATION_MODULES.map((m, idx) => {
          const accessible = hasAccess(m.permission);
          const isLastOdd = idx === OPERATION_MODULES.length - 1 && OPERATION_MODULES.length % 2 !== 0;
          return (
            <button
              key={m.id}
              type="button"
              className={`mob-card ${!accessible ? 'locked' : ''} ${isLastOdd ? 'wide' : ''} ${mounted ? 'ready' : ''}`}
              style={{
                animationDelay: `${idx * 55}ms`,
                borderColor: pressedId === m.id ? m.accent : undefined,
              }}
              onClick={() => handleClick(m)}
              onTouchStart={() => accessible && setPressedId(m.id)}
              onTouchEnd={() => setPressedId(null)}
              onMouseDown={() => accessible && setPressedId(m.id)}
              onMouseUp={() => setPressedId(null)}
            >
              <div className="mob-card-icon" style={{ background: m.soft }}>
                {m.emoji}
              </div>
              <div className="mob-card-body">
                <div className="mob-card-name">{m.name}</div>
                <div className="mob-card-desc">{m.desc}</div>
              </div>
              {!accessible && <span className="mob-lock-badge">🔒</span>}
              {isLastOdd && accessible && (
                <span className="mob-card-arrow">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="mob-count">
        {accessibleCount} of {OPERATION_MODULES.length} modules available
      </p>
    </>
  );
}
