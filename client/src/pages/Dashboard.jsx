// src/pages/Dashboard.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";

const fmt = (n) => Number(n || 0).toLocaleString("en-PK");

// ✅ DEV ONLY: set a number here to preview donut (e.g. 1999 / 2089). Keep null to use real API value.
const DEV_PREVIEW_TOTAL_ORDERS = null;

// Fixed labels everywhere (must always render these 4)
const FIXED_TYPES = [
  { key: "premium", label: "Hissa - Premium" },
  { key: "standard", label: "Hissa - Standard" },
  { key: "waqf", label: "Hissa - Waqf" },
  { key: "goat", label: "Goat (Hissa)" },
];

const useCountUp = (value, { duration = 600 } = {}) => {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(0);
  const fromRef = useRef(0);
  const toRef = useRef(0);

  useEffect(() => {
    const to = Number(value || 0);
    const from = Number(display || 0);

    if (!Number.isFinite(to)) { setDisplay(0); return; }
    if (to === from) return;

    fromRef.current = from;
    toRef.current = to;
    startRef.current = performance.now();

    const tick = (now) => {
      const t = Math.min(1, (now - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = fromRef.current + (toRef.current - fromRef.current) * eased;
      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value]);

  return display;
};

const AnimatedNumber = ({ value, format = (n) => fmt(Math.round(n)), duration = 600, className }) => {
  const n = useCountUp(value, { duration });
  return <span className={className}>{format(n)}</span>;
};

const KPIBox = ({ title, value, icon, bubble, isMoney, isPercent, reveal = true, trend }) => {
  const [hovered, setHovered] = useState(false);
  const numeric = Number(String(value ?? "").replace(/[^0-9.-]/g, "").trim());
  const canAnimate = Number.isFinite(numeric);

  const renderFormatted = () => {
    if (value === "—" || value === null || value === undefined) return "—";
    if (canAnimate) {
      return (
        <AnimatedNumber
          value={numeric}
          duration={600}
          format={(n) => {
            const rounded = isPercent ? Number(n).toFixed(1) : Math.round(n);
            if (isPercent) return `${rounded}%`;
            if (isMoney) return `PKR ${fmt(rounded)}`;
            return fmt(rounded);
          }}
        />
      );
    }
    return value;
  };

  return (
    <div
      className={`kpiCard animPop ${hovered ? "kpiCardHovered" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="kpiIcon">
        {typeof icon === "string" && (icon.startsWith("/") || icon.endsWith(".png")) ? (
          <img src={icon} alt="" className="kpiIconImg" />
        ) : (
          icon
        )}
      </div>
      <div className="kpiText">
        <div className="kpiTitle">{title}</div>
        <div className={`kpiValue ${reveal ? "" : "kpiBlurField"}`}>
          {renderFormatted()}
        </div>
        {trend !== undefined && reveal && (
          <div className={`kpiTrend ${trend >= 0 ? "kpiTrendUp" : "kpiTrendDown"}`}>
            {trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}% vs last year
          </div>
        )}
      </div>
      {hovered && <div className="kpiGlow" style={{ background: bubble }} />}
    </div>
  );
};

const SEGMENT_COLORS = {
  premium:  { fill: "#FF5722", light: "#fff4f0" },
  standard: { fill: "#2196F3", light: "#e8f4ff" },
  waqf:     { fill: "#4CAF50", light: "#edfbee" },
  goat:     { fill: "#FF9800", light: "#fff8e8" },
  remaining:{ fill: "#EAEAEA", light: "#f5f5f5" },
};

/* -----------------------------
   Donut — with over-achievement outer ring
------------------------------ */

const TargetDonut = ({
  achieved = 0,
  target = 2000,
  size = 220,
  stroke = 20,
  breakdown = [],
  activeKey,
  onSegmentHover,
}) => {
  const isOver = achieved > target;
  const overAmount = isOver ? achieved - target : 0;
  const overPct = target > 0 ? (overAmount / target) * 100 : 0;

  const innerRadius = (size - stroke) / 2;
  const innerC = 2 * Math.PI * innerRadius;
  const cx = size / 2, cy = size / 2;

  const outerStroke = 8;
  const outerRadius = (size - stroke) / 2 + stroke / 2 + outerStroke / 2 + 4;
  const outerC = 2 * Math.PI * outerRadius;

  const capTotal = target;
  const segments = [];
  let cursor = 0;

  breakdown.forEach((b) => {
    const ratio = capTotal > 0 ? Math.min(Number(b.value || 0) / capTotal, 1) : 0;
    const dash = innerC * ratio;
    segments.push({ key: b.key, label: b.label, value: b.value, pct: b.percentage, ratio, dash, offset: cursor });
    cursor += dash;
  });

  if (!isOver) {
    const achievedTotal = breakdown.reduce((s, b) => s + Number(b.value || 0), 0);
    const remainingRatio = capTotal > 0 ? Math.max(0, (capTotal - achievedTotal) / capTotal) : 1;
    const remainingDash = innerC * remainingRatio;
    segments.push({ key: "remaining", label: "Remaining", value: Math.max(0, target - achievedTotal), pct: null, ratio: remainingRatio, dash: remainingDash, offset: cursor });
  }

  const overRatio = Math.min(overAmount / target, 1);
  const overDash = outerC * overRatio;

  const rotate = `rotate(-90 ${cx} ${cy})`;

  return (
    <div className="donutShell animFade" style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ overflow: "visible" }}>
        <circle cx={cx} cy={cy} r={innerRadius} stroke="#EAEAEA" strokeWidth={stroke} fill="none" />

        {segments.map((seg) => {
          if (seg.dash <= 0) return null;
          const color = SEGMENT_COLORS[seg.key]?.fill || "#ccc";
          const isActive = activeKey === seg.key;
          const isAnyActive = !!activeKey;
          const strokeW = isActive ? stroke + 6 : stroke;
          const opacity = isAnyActive && !isActive ? 0.3 : 1;

          return (
            <circle
              key={seg.key}
              cx={cx} cy={cy} r={innerRadius}
              stroke={color}
              strokeWidth={strokeW}
              strokeLinecap="butt"
              fill="none"
              strokeDasharray={`${seg.dash} ${innerC - seg.dash}`}
              strokeDashoffset={-seg.offset}
              transform={rotate}
              opacity={opacity}
              style={{ transition: "opacity .2s, stroke-width .2s", cursor: seg.key !== "remaining" ? "pointer" : "default" }}
              onMouseEnter={() => seg.key !== "remaining" && onSegmentHover && onSegmentHover(seg.key)}
              onMouseLeave={() => onSegmentHover && onSegmentHover(null)}
            />
          );
        })}

        {isOver && (
          <>
            <circle
              cx={cx} cy={cy} r={outerRadius}
              stroke="#fde68a"
              strokeWidth={outerStroke}
              fill="none"
              opacity={0.4}
            />
            <circle
              cx={cx} cy={cy} r={outerRadius}
              stroke="url(#overGold)"
              strokeWidth={outerStroke}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${overDash} ${outerC - overDash}`}
              strokeDashoffset={0}
              transform={rotate}
              style={{ filter: "drop-shadow(0 0 4px rgba(251,191,36,0.6))" }}
            />
            <defs>
              <linearGradient id="overGold" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#fbbf24" />
              </linearGradient>
            </defs>
            {(() => {
              const angle = -Math.PI / 2 + overRatio * 2 * Math.PI;
              const sx = cx + outerRadius * Math.cos(angle);
              const sy = cy + outerRadius * Math.sin(angle);
              return (
                <text x={sx} y={sy} textAnchor="middle" dominantBaseline="middle" fontSize="12" style={{ userSelect: "none" }}>
                  ⭐
                </text>
              );
            })()}
          </>
        )}
      </svg>

      <div className="donutCenter">
        {activeKey && activeKey !== "remaining" ? (() => {
          const seg = segments.find(s => s.key === activeKey);
          const color = SEGMENT_COLORS[activeKey]?.fill || "#FF5722";
          return (
            <>
              <div className="donutSmall" style={{ color }}>{seg?.label}</div>
              <div className="donutBig" style={{ color }}>
                <AnimatedNumber value={Number(seg?.value || 0)} duration={400} format={(n) => fmt(Math.round(n))} />
              </div>
              <div className="donutRed" style={{ color: "#6b7280" }}>
                {seg?.pct?.toFixed(1)}% of total
              </div>
            </>
          );
        })() : isOver ? (
          <>
            <div className="donutSmall" style={{ color: "#6b7280" }}>Total Orders</div>
            <div className="donutBig donutBigBold" style={{ color: "#111827" }}>
              <AnimatedNumber value={achieved} duration={750} format={(n) => fmt(Math.round(n))} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
              <span style={{ fontSize: 13, color: "#d97706", fontWeight: 600 }}>🎯 </span>
              <span style={{ fontSize: 12, color: "#d97706", fontWeight: 600 }}>Target Hit!</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2, fontSize: 11, color: "#6b7280", fontWeight: 400 }}>
              <span className="donutOverBadgeGray animPop">
                +<AnimatedNumber value={overAmount} duration={800} format={(n) => fmt(Math.round(n))} /> over
              </span>
              <span>(<AnimatedNumber value={overPct} duration={800} format={(n) => `+${n.toFixed(1)}%`} />)</span>
            </div>
          </>
        ) : (
          <>
            <div className="donutSmall">Total Orders:</div>
            <div className="donutBig donutBigBold">
              <AnimatedNumber value={achieved} duration={750} format={(n) => fmt(Math.round(n))} />
            </div>
            <div className="donutRed">
              Remaining: <AnimatedNumber value={Math.max(0, target - achieved)} duration={750} format={(n) => fmt(Math.round(n))} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const ProgressRow = ({ label, value, percentage, color, active, onHover, segmentKey }) => {
  const pct = Number.isFinite(percentage) ? percentage : 0;
  const clamped = Math.min(pct, 100);

  return (
    <div
      className={`progressRow animSlide ${active ? "progressRowActive" : ""}`}
      onMouseEnter={() => onHover && onHover(segmentKey)}
      onMouseLeave={() => onHover && onHover(null)}
      style={{ cursor: "pointer" }}
    >
      <div className="progressHead">
        <div className="progressLabel" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="progressDot" style={{ background: color }} />
          {label}
        </div>
        <div className="progressVal">
          <AnimatedNumber value={Number(value || 0)} duration={600} format={(n) => fmt(Math.round(n))} />{" "}
          <span className="progressPct">({pct.toFixed(1)}%)</span>
        </div>
      </div>
      <div className="progressTrack">
        <div
          className="progressFill progressAnim"
          style={{ width: `${clamped}%`, background: color }}
        />
      </div>
    </div>
  );
};

const TargetAchievement = ({ achieved, target, breakdown }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeKey, setActiveKey] = useState(null);

  return (
    <div className="card animCard">
      <div className="cardTitleBig cardTitleClickable" onClick={() => setCollapsed(v => !v)}>
        TARGET ACHIEVEMENT
        <span className="collapseChevron">{collapsed ? "▶" : "▼"}</span>
      </div>
      {!collapsed && (
        <div className="targetGrid">
          <div className="donutWrap">
            <TargetDonut
              achieved={achieved}
              target={target}
              breakdown={breakdown}
              activeKey={activeKey}
              onSegmentHover={setActiveKey}
            />
          </div>
          <div className="progressWrap">
            {(breakdown || []).map((b) => (
              <ProgressRow
                key={b.key}
                segmentKey={b.key}
                label={b.label}
                value={b.value}
                percentage={b.percentage}
                color={SEGMENT_COLORS[b.key]?.fill || "#FF5722"}
                active={activeKey === b.key}
                onHover={setActiveKey}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* -----------------------------
   Day Wise Summary
------------------------------ */

const DayWiseSummary = ({ days }) => {
  const [highlightRow, setHighlightRow] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const renderCell = (val) => {
    const num = Number(val);
    if (Number.isFinite(num)) {
      return <AnimatedNumber value={num} duration={600} format={(n) => fmt(Math.round(n))} />;
    }
    return val ?? "—";
  };

  const dayList = days || [];
  const rowLabels = ["Total Orders", "Payment Cleared", "Pending (Completely)", "Pending (Partially)"];
  const colLabels = ["Premium", "Standard", "Waqf", "Goat", "Total"];

  return (
    <div className="card animCard">
      <div className="cardTitleBig cardTitleClickable" onClick={() => setCollapsed(v => !v)}>
        DAY WISE SUMMARY
        <span className="collapseChevron">{collapsed ? "▶" : "▼"}</span>
      </div>
      {!collapsed && (
        <div className="dayWiseTableWrap">
          <table className="tblDayWise">
            <thead>
              <tr>
                <th className="dayWiseCorner" rowSpan={2}>Category</th>
                {dayList.map((d, di) => (
                  <th key={d.key} colSpan={5} className={`dayWiseDayHeader${di > 0 ? " dayWiseDayHeaderSep" : ""}`}>{d.title}</th>
                ))}
              </tr>
              <tr>
                {dayList.map((d, di) =>
                  colLabels.map((col, ci) => (
                    <th
                      key={`${d.key}-${col}`}
                      className={`dayWiseColHeader${di > 0 && ci === 0 ? " dayWiseColGroupStart" : ""}`}
                    >{col}</th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {rowLabels.map((label) => (
                <tr
                  key={label}
                  className={highlightRow === label ? "dayWiseRowHighlight" : ""}
                  onMouseEnter={() => setHighlightRow(label)}
                  onMouseLeave={() => setHighlightRow(null)}
                >
                  <td className="dayWiseRowLabel">{label}</td>
                  {dayList.map((d, di) => {
                    const row = (d.data || []).find((r) => r.label === label);
                    if (!row) return colLabels.map((col, ci) => (
                      <td
                        key={`${d.key}-${label}-${col}`}
                        className={`dayWiseCell${di > 0 && ci === 0 ? " dayWiseCellGroupStart" : ""}`}
                      >—</td>
                    ));
                    return (
                      <React.Fragment key={d.key}>
                        <td className={`dayWiseCell${di > 0 ? " dayWiseCellGroupStart" : ""}`}>{renderCell(row.premium)}</td>
                        <td className="dayWiseCell">{renderCell(row.standard)}</td>
                        <td className="dayWiseCell">{renderCell(row.waqf)}</td>
                        <td className="dayWiseCell">{renderCell(row.goat)}</td>
                        <td className="dayWiseCell dayWiseCellTotal">{renderCell(row.total)}</td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/* -----------------------------
   Reference Wise Summary (sortable)
------------------------------ */

const ReferenceWiseSummary = ({ references }) => {
  const [sortKey, setSortKey] = useState("leadsGenerated");
  const [sortDir, setSortDir] = useState("desc");
  const [collapsed, setCollapsed] = useState(false);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sorted = useMemo(() => {
    const list = [...(references || [])];
    list.sort((a, b) => {
      const av = Number(a[sortKey] || 0), bv = Number(b[sortKey] || 0);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [references, sortKey, sortDir]);

  const cols = [
    { key: "name", label: "Reference", numeric: false },
    { key: "leadsGenerated", label: "Leads Generated", numeric: true },
    { key: "leadsConverted", label: "Leads Converted", numeric: true },
    { key: "totalRevenueGenerated", label: "Total Revenue", numeric: true },
    { key: "conversionRate", label: "Conversion Rate", numeric: true },
  ];

  const renderCell = (val) => {
    const num = Number(val);
    if (Number.isFinite(num)) {
      return <AnimatedNumber value={num} duration={650} format={(n) => fmt(Math.round(n))} />;
    }
    return val ?? "—";
  };

  return (
    <div className="card animCard">
      <div className="cardTitleBig cardTitleClickable" onClick={() => setCollapsed(v => !v)}>
        REFERENCE WISE SUMMARY
        <span className="collapseChevron">{collapsed ? "▶" : "▼"}</span>
      </div>
      {!collapsed && (
        <>
          <div className="tableWrapRef">
            <table className="tblRefOld">
              <thead>
                <tr>
                  {cols.map(c => (
                    <th
                      key={c.key}
                      className={`${c.numeric ? "sortableCol" : ""} ${sortKey === c.key ? "activeSortCol" : ""}`}
                      onClick={c.numeric ? () => handleSort(c.key) : undefined}
                      style={c.numeric ? { cursor: "pointer", userSelect: "none" } : {}}
                    >
                      {c.label}
                      {c.numeric && (
                        <span className="sortIcon">
                          {sortKey === c.key ? (sortDir === "asc" ? " ↑" : " ↓") : " ↕"}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.name} className="animRow refRow">
                    <td>{r.name}</td>
                    <td>{renderCell(r.leadsGenerated)}</td>
                    <td>{renderCell(r.leadsConverted)}</td>
                    <td>Rs. <AnimatedNumber value={Number(r.totalRevenueGenerated || 0)} duration={650} format={(n) => fmt(Math.round(n))} /></td>
                    <td><AnimatedNumber value={Number(r.conversionRate || 0)} duration={600} format={(n) => `${Math.round(n)}%`} /></td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: "center", color: "#9ca3af", padding: "16px" }}>No results found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

/* -----------------------------
   Source Wise Summary (grid only)
------------------------------ */

const SourceWiseSummary = ({ sources }) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="card animCard sourceWiseCard">
      <div className="sourceCardHeader">
        <div className="cardTitle cardTitleClickable" onClick={() => setCollapsed(v => !v)}>
          SOURCE-WISE ORDER SUMMARY
          <span className="collapseChevron">{collapsed ? "▶" : "▼"}</span>
        </div>
      </div>

      {!collapsed && (
        <div className="sourceGrid">
          {(sources || []).map((s, i) => (
            <div key={s.sourceName + i} className="sourceCard animPop sourceCardInteractive">
              <div className="sourceIcon">
                <span className="sourcePin">▶</span>
              </div>
              <div className="sourceName">{s.sourceName}</div>
              <div className="sourceCount">
                <AnimatedNumber value={Number(s.count || 0)} duration={500} format={(n) => fmt(Math.round(n))} />
              </div>
            </div>
          ))}
          {(!sources || sources.length === 0) && (
            <div className="sourceCard sourceCardEmpty">No source data</div>
          )}
        </div>
      )}
    </div>
  );
};

/* -----------------------------
   Sales Overview
------------------------------ */

const SalesOverviewChart = ({ series, reveal }) => {
  const [chartType, setChartType] = useState("line");
  const [metric, setMetric] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const data = useMemo(() => (series || []).map((d) => ({ ...d, name: d.date })), [series]);

  const metricOptions = [
    { key: "orders", label: "Orders" },
    { key: "totalSales", label: "Total Sales" },
  ];

  const activeMetric =
    metric !== null && metricOptions.some((m) => m.key === metric)
      ? metric
      : (reveal ? "totalSales" : "orders");

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length || !label) return null;
    const p = payload[0]?.payload || {};
    return (
      <div className="chartTooltip">
        <div className="chartTooltipTitle">{label}</div>
        <div className="chartTooltipRow"><span>Orders:</span><span>{fmt(Number(p.orders || 0))}</span></div>
        <div className="chartTooltipRow green"><span>Total Sales:</span><span>Rs {fmt(Number(p.totalSales || 0))}</span></div>
        <div className="chartTooltipRow"><span>Total Quantity:</span><span>{fmt(Number(p.totalQuantity || 0))}</span></div>
        <div className="chartTooltipRow"><span>Avg Order Value:</span><span>Rs {fmt(Number(p.avgOrderValue || 0))}</span></div>
      </div>
    );
  };

  if (!data.length) {
    return (
      <div className="card animCard">
        <div className="cardTitle">SALES OVERVIEW</div>
        <div className="chartPlaceholder">No data for selected year</div>
      </div>
    );
  }

  return (
    <div className="card animCard">
      <div className="salesOverviewHeader" style={{ marginBottom: collapsed ? 0 : 10 }}>
        <div className="cardTitle cardTitleClickable salesOverviewTitle" onClick={() => setCollapsed(v => !v)}>
          SALES OVERVIEW
          <span className="collapseChevron">{collapsed ? "▶" : "▼"}</span>
        </div>
        {!collapsed && (
          <div className="salesOverviewHeaderRight">
            <div className="viewToggle">
              <button className={`viewToggleBtn ${chartType === "line" ? "viewToggleActive" : ""}`} onClick={() => setChartType("line")}>〜 Line</button>
              <button className={`viewToggleBtn ${chartType === "bar" ? "viewToggleActive" : ""}`} onClick={() => setChartType("bar")}>▦ Bar</button>
            </div>
          </div>
        )}
      </div>

      {!collapsed && (
        <>
          <div className="metricChips">
            {metricOptions.map(m => (
              <button
                key={m.key}
                className={`metricChip ${activeMetric === m.key ? "metricChipActive" : ""}`}
                onClick={() => setMetric(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="chartWrap">
            <ResponsiveContainer width="100%" height={280}>
              {chartType === "line" ? (
                <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fontFamily: "'Poppins', 'Inter', sans-serif" }} stroke="#6b7280" />
                  <YAxis tick={{ fontSize: 11, fontFamily: "'Poppins', 'Inter', sans-serif" }} stroke="#6b7280" tickFormatter={(v) => fmt(v)} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#FF5722", strokeWidth: 1 }} />
                  <Line
                    type="monotone"
                    dataKey={activeMetric}
                    stroke="#FF5722"
                    strokeWidth={2}
                    dot={{ fill: "#FF5722", r: 3 }}
                    activeDot={{ r: 5, fill: "#FF5722", stroke: "#fff", strokeWidth: 2 }}
                  />
                </LineChart>
              ) : (
                <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fontFamily: "'Poppins', 'Inter', sans-serif" }} stroke="#6b7280" />
                  <YAxis tick={{ fontSize: 11, fontFamily: "'Poppins', 'Inter', sans-serif" }} stroke="#6b7280" tickFormatter={(v) => fmt(v)} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey={activeMetric} fill="#FF5722" radius={[4, 4, 0, 0]}>
                    {data.map((_, idx) => (
                      <Cell key={idx} fill={idx % 2 === 0 ? "#FF5722" : "#FF8A65"} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
};

/* -----------------------------
   Dashboard
------------------------------ */

const Dashboard = () => {
  const { user } = useAuth();
  const [year, setYear] = useState("2026");
  const [loading, setLoading] = useState(true);

  const [kpis, setKpis] = useState(null);
  const [targetData, setTargetData] = useState(null);
  const [days, setDays] = useState([]);
  const [sources, setSources] = useState([]);
  const [references, setReferences] = useState([]);
  const [salesOverview, setSalesOverview] = useState([]);

  const [kpiValuesVisible, setKpiValuesVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const token = useMemo(() => localStorage.getItem("token"), []);

  const fetchAll = useCallback(async (opts = {}) => {
    const silent = opts.silent === true;
    try {
      if (!silent) setLoading(true);
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const y = encodeURIComponent(year);

      const [k, t, d, src, r, sales] = await Promise.all([
        fetch(`/api/dashboard/kpis?year=${y}`, { headers }),
        fetch(`/api/dashboard/target-achievement?year=${y}`, { headers }),
        fetch(`/api/dashboard/day-wise?year=${y}`, { headers }),
        fetch(`/api/dashboard/source-wise?year=${y}`, { headers }),
        fetch(`/api/dashboard/reference-wise?year=${y}`, { headers }),
        fetch(`/api/dashboard/sales-overview?year=${y}`, { headers }),
      ]);

      const kj = await k.json();
      const tj = await t.json();
      const dj = await d.json();
      const srcj = await src.json();
      const rj = await r.json();
      const salesj = await sales.json();

      if (!k.ok) throw new Error(kj?.message || "KPIs failed");
      if (!t.ok) throw new Error(tj?.message || "Target failed");
      if (!d.ok) throw new Error(dj?.message || "Day-wise failed");
      if (!src.ok) throw new Error(srcj?.message || "Source-wise failed");
      if (!r.ok) throw new Error(rj?.message || "Reference-wise failed");
      if (!sales.ok) throw new Error(salesj?.message || "Sales overview failed");

      setKpis(kj.kpis || null);
      setTargetData(tj || null);
      setDays(dj.days || []);
      setSources(srcj.sources || []);
      setReferences(rj.references || []);
      setSalesOverview(salesj.series || []);
      setLastRefreshed(new Date());
    } catch (e) {
      console.error(e);
      setKpis(null);
      setTargetData(null);
      setDays([]);
      setSources([]);
      setReferences([]);
      setSalesOverview([]);
    } finally {
      if (!silent) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [year, token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const AUTO_REFRESH_MS = 2 * 60 * 1000;
  useEffect(() => {
    const interval = setInterval(() => { fetchAll({ silent: true }); }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleRefresh = () => { setRefreshing(true); fetchAll(); };

  const achievedReal = Number(targetData?.target?.achievedTotal || 0);
  const achievedForDonut =
    Number.isFinite(Number(DEV_PREVIEW_TOTAL_ORDERS)) && DEV_PREVIEW_TOTAL_ORDERS !== null
      ? Number(DEV_PREVIEW_TOTAL_ORDERS)
      : achievedReal;
  const targetTotal = Number(targetData?.target?.targetTotal || 2000);

  const breakdownFromApi = Array.isArray(targetData?.breakdown) ? targetData.breakdown : [];
  const apiMap = new Map(breakdownFromApi.map((b) => [String(b.key), b]));

  const fixedBreakdown = FIXED_TYPES.map((t) => {
    const found = apiMap.get(t.key);
    const value = Number(found?.value || 0);
    const pct = achievedReal > 0 ? (value / achievedReal) * 100 : 0;
    return { key: t.key, label: t.label, value, percentage: pct };
  });

  return (
    <div className="page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; }

        .page {
          font-family: 'Poppins', 'Inter', sans-serif;
          padding: 12px 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        /* Cascade Poppins to every element that doesn't override it */
        .page *,
        .page input,
        .page button,
        .page select,
        .page table,
        .page th,
        .page td {
          font-family: inherit;
        }

        .animCard { animation: cardIn .35s ease-out both; }
        .animPop { animation: popIn .35s ease-out both; }
        .animFade { animation: fadeIn .45s ease-out both; }
        .animSlide { animation: slideIn .40s ease-out both; }
        .animRow { animation: fadeUp .35s ease-out both; }

        @keyframes cardIn { from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);} }
        @keyframes popIn { from{opacity:0;transform:scale(.96);}to{opacity:1;transform:scale(1);} }
        @keyframes fadeIn { from{opacity:0;}to{opacity:1;} }
        @keyframes slideIn { from{opacity:0;transform:translateX(-4px);}to{opacity:1;transform:translateX(0);} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:translateY(0);} }
        .progressAnim { animation: barGrow .6s ease-out both; transform-origin: left; }
        @keyframes barGrow { from{transform:scaleX(0);}to{transform:scaleX(1);} }
        @keyframes spin { to{transform:rotate(360deg);} }
        @keyframes pulseGold { 0%,100%{opacity:1;} 50%{opacity:.6;} }

        .header {
          display: flex; justify-content: space-between; align-items: center;
          gap: 10px; flex-wrap: wrap;
        }
        .hTitle { margin:0; font-size:17px; font-weight:600; color:#111827; font-family: inherit; }
        .hSub { margin:4px 0 0; font-size:13px; font-weight:400; color:#6b7280; font-family: inherit; }
        .headerRight { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }

        .select {
          padding: 6px 10px; border-radius: 8px; border: 1px solid #e5e7eb;
          font-size: 13px; font-weight: 400; background: #fff; cursor: pointer;
          transition: border-color .15s; font-family: inherit;
        }
        .select:hover { border-color: #FF5722; }
        .select:focus { outline: none; border-color: #FF5722; box-shadow: 0 0 0 3px rgba(255,87,34,.12); }

        .kpiToggleBtn {
          padding: 8px 10px; border-radius: 10px; border: 1px solid #e5e7eb;
          background: #fff; cursor: pointer; display: flex; align-items: center;
          justify-content: center; box-shadow: 0 6px 14px rgba(0,0,0,0.05);
          transition: background .15s, border-color .15s, transform .1s;
        }
        .kpiToggleBtn:hover { background: #fff4f0; border-color: #FF5722; }
        .kpiToggleBtn:active { transform: scale(.95); }
        .kpiToggleIcon { width:18px; height:18px; display:block; }

        .refreshBtn {
          padding: 7px 12px; border-radius: 10px; border: 1px solid #e5e7eb;
          background: #fff; cursor: pointer; font-size: 13px; font-weight: 500;
          color: #374151; display: flex; align-items: center; gap: 5px;
          transition: all .15s; box-shadow: 0 2px 6px rgba(0,0,0,0.04);
          font-family: inherit;
        }
        .refreshBtn:hover { background: #fff4f0; border-color: #FF5722; color: #FF5722; }
        .refreshIcon { font-size: 14px; display:inline-block; }
        .refreshIcon.spinning { animation: spin .7s linear infinite; }
        .lastRefreshed { font-size: 11px; color: #9ca3af; white-space: nowrap; font-weight: 400; }

        .kpiGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(160px, 1fr));
          gap: 8px;
        }
        @media (max-width:1100px) { .kpiGrid { grid-template-columns: repeat(2, minmax(160px, 1fr)); } }
        @media (max-width:720px) { .kpiGrid { grid-template-columns: 1fr; } }

        .kpiCard {
          background: #fff; border-radius: 10px; padding: 14px 12px; min-height: 72px;
          display: flex; align-items: center; gap: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04); border: 1px solid #f1f1f1;
          position: relative; overflow: hidden;
          transition: transform .18s, box-shadow .18s, border-color .18s; cursor: default;
        }
        .kpiCard:hover, .kpiCardHovered {
          transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.09); border-color: #FF5722;
        }
        .kpiGlow { position: absolute; inset: 0; opacity: .07; pointer-events: none; border-radius: inherit; transition: opacity .2s; }
        .kpiIcon {
          width: 64px; height: 64px;
          display: flex; align-items: center; justify-content: center;
          flex: 0 0 auto; transition: transform .2s;
        }
        .kpiIconImg { width: 50px; height: 50px; object-fit: contain; }
        .kpiCard:hover .kpiIcon { transform: scale(1.08); }
        .kpiText { display: flex; flex-direction: column; justify-content: center; gap: 2px; }
        .kpiTitle { font-size: 11px; font-weight: 400; color: #6b7280; font-family: inherit; }
        .kpiValue { font-size: 18px; font-weight: 600; color: #111827; line-height: 1.2; font-family: inherit; }
        .kpiTrend { font-size: 11px; margin-top: 2px; font-weight: 500; }
        .kpiTrendUp { color: #16a34a; }
        .kpiTrendDown { color: #dc2626; }

        .kpiBlurField {
          filter: blur(6px); opacity: .35; user-select: none; pointer-events: none;
          background: rgba(0,0,0,0.03); border-radius: 10px; padding: 6px 10px;
          display: inline-block; min-width: 140px;
        }

        .card {
          background: #fff; border-radius: 10px; padding: 12px;
          border: 1px solid #f1f1f1; box-shadow: 0 2px 8px rgba(0,0,0,0.04); transition: box-shadow .2s;
        }
        .card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.07); }

        .cardTitle, .cardTitleBig {
          text-align: center; font-size: 15px; font-weight: 600; letter-spacing: .2px;
          color: #111827; margin-bottom: 10px; white-space: nowrap; font-family: inherit;
        }
        @media(max-width:720px) { .cardTitleBig, .cardTitle { font-size: 14px; white-space: normal; } }

        .cardTitleClickable {
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          gap: 8px; user-select: none; transition: color .15s;
        }
        .cardTitleClickable:hover { color: #FF5722; }
        .collapseChevron { font-size: 11px; font-weight: 500; }

        /* ---- Target ---- */
        .targetGrid {
          display: grid; grid-template-columns: 240px 1fr; gap: 16px; align-items: center;
          min-height: 320px;
        }
        @media(max-width:980px) { .targetGrid { grid-template-columns: 1fr; min-height: 380px; } }

        .donutCenter {
          position: absolute; inset: 0;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          text-align: center; white-space: nowrap; pointer-events: none;
          font-family: 'Poppins', 'Inter', sans-serif;
        }
        .donutSmall { font-size: 12px; font-weight: 500; color: #374151; font-family: inherit; }
        .donutBig { font-size: 28px; font-weight: 600; color: #1f2937; font-family: inherit; }
        .donutBigBold { font-size: 38px !important; font-weight: 700 !important; }
        .donutRed { font-size: 12px; font-weight: 400; color: #b91c1c; font-style: italic; font-family: inherit; }
        .donutRed * { font-style: inherit; }

        .donutOverBadge {
          margin-top: 3px;
          background: linear-gradient(135deg, #fbbf24, #f59e0b);
          color: #78350f;
          font-size: 11px; font-weight: 600;
          padding: 2px 10px; border-radius: 20px;
          box-shadow: 0 2px 6px rgba(251,191,36,0.4);
          animation: pulseGold 2s ease-in-out infinite;
          letter-spacing: .2px; font-family: inherit;
        }
        .donutOverBadgeGray {
          color: #6b7280;
          font-size: 11px; font-weight: 500; font-family: inherit;
        }

        .progressWrap { display: flex; flex-direction: column; gap: 10px; }
        .progressRow {
          display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; border-radius: 8px;
          border: 1px solid transparent;
          transition: background .15s, border-color .15s, transform .15s, box-shadow .15s;
        }
        .progressRowActive {
          background: #fafafa; border-color: #e5e7eb;
          transform: translateX(3px); box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }
        .progressHead { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .progressLabel { font-size: 12px; font-weight: 500; color: #111827; white-space: nowrap; display: flex; align-items: center; gap: 6px; font-family: inherit; }
        .progressDot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; transition: transform .2s; }
        .progressRowActive .progressDot { transform: scale(1.5); }
        .progressVal { font-size: 12px; font-weight: 600; color: #111827; white-space: nowrap; font-family: inherit; }
        .progressPct { font-weight: 500; color: #374151; font-size: 11px; }
        .progressTrack { height: 7px; border-radius: 999px; background: #e5e7eb; overflow: hidden; }
        .progressFill { height: 100%; border-radius: 999px; }
        .donutWrap { display: flex; flex-direction: column; align-items: center; gap: 10px; }

        /* ---- Day Wise ---- */
        .dayWiseTableWrap { width: 100%; overflow-x: auto; border-radius: 12px; border: 1px solid #e5e7eb; }
        .tblDayWise {
          width: 100%; border-collapse: separate; border-spacing: 0;
          background: #fff; min-width: 640px; font-family: inherit;
        }
        .tblDayWise th, .tblDayWise td {
          padding: 8px 10px; font-size: 13px; font-weight: 400;
          border-bottom: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb; font-family: inherit;
        }
        .tblDayWise th:last-child, .tblDayWise td:last-child { border-right: none; }
        .tblDayWise tbody tr:last-child td { border-bottom: none; }
        .dayWiseCorner {
          background: #f3f4f6; width: 170px; min-width: 170px;
          font-size: 11px; font-weight: 600; text-transform: uppercase;
          letter-spacing: .4px; color: #6b7280; text-align: center; vertical-align: middle;
          border-bottom: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;
        }
        .dayWiseDayHeader {
          background: #FF5722; color: #fff; font-weight: 600; font-size: 13px;
          text-align: center; letter-spacing: .3px; padding: 10px 12px;
          border-bottom: 1px solid rgba(255,255,255,0.25);
        }
        .dayWiseDayHeaderSep { border-left: 4px solid #fff !important; }
        .dayWiseColHeader { background: #f9fafb; color: #374151; font-weight: 500; font-size: 12px; text-align: center; }
        .dayWiseColGroupStart { border-left: 4px solid #fff !important; }
        .dayWiseCellGroupStart { border-left: 4px solid #fff !important; }
        .dayWiseRowLabel { background: #f3f4f6; color: #374151; font-weight: 500; font-size: 13px; border-right: 1px solid #e5e7eb; }
        .dayWiseCell { text-align: center; color: #111827; font-size: 13px; font-weight: 400; transition: background .15s; }
        .dayWiseCellTotal { font-weight: 600; color: #111827; font-size: 13px; }
        .dayWiseRowHighlight td { background: #fff4f0 !important; }
        .tblDayWise tbody tr { transition: background .1s; }

        /* ---- Reference ---- */
        .tableWrapRef { width: 100%; overflow-x: auto; border-radius: 12px; }
        .tblRefOld {
          width: 100%; border-collapse: separate; border-spacing: 0;
          background: #f7f7f7; border: 1px solid #ededed;
          border-radius: 10px; overflow: hidden; min-width: 560px; table-layout: fixed;
          font-family: inherit;
        }
        .tblRefOld th, .tblRefOld td {
          padding: 8px 10px; font-size: 12px; font-weight: 400; color: #374151;
          text-align: center; border-bottom: 1px solid #ededed; border-right: 1px solid #ededed;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: inherit;
        }
        .tblRefOld th { background: #f0f0f0; font-weight: 600; white-space: normal; line-height: 1.25; }
        .tblRefOld tr:last-child td { border-bottom: none; }
        .tblRefOld th:last-child, .tblRefOld td:last-child { border-right: none; }
        .tblRefOld th:first-child, .tblRefOld td:first-child {
          text-align: left; width: 140px; font-weight: 600; background: #fafafa; white-space: nowrap;
        }
        .sortableCol { transition: background .15s; }
        .sortableCol:hover { background: #ffe8e0 !important; color: #FF5722; }
        .activeSortCol { background: #fff0eb !important; color: #FF5722; }
        .sortIcon { font-size: 11px; opacity: .8; font-weight: 500; }
        .refRow { transition: background .12s; }
        .refRow:hover td { background: #fff8f6 !important; }

        /* ---- Source Wise ---- */
        .sourceWiseCard { background: #fff; }
        .sourceCardHeader {
          display: flex; justify-content: center; align-items: center;
          margin-bottom: 12px; gap: 8px; flex-wrap: wrap;
        }
        .sourceCardHeader .cardTitle { margin-bottom: 0; text-align: center; }
        .sourceGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
        .sourceCard {
          background: #fff; border-radius: 8px; padding: 8px 12px;
          display: flex; align-items: center; gap: 8px; border: 1px solid #e8e8e8;
          min-height: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
          transition: transform .15s, box-shadow .15s, border-color .15s;
        }
        .sourceCardInteractive:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-color: #d1d5db; }
        .sourceCardEmpty { justify-content: center; color: #6b7280; font-size: 11px; font-weight: 400; }
        .sourceIcon {
          width: 24px; height: 24px; border-radius: 5px; background: #7c3aed; color: #fff;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 10px;
        }
        .sourcePin { font-size: 10px; }
        .sourceName { font-size: 11px; font-weight: 500; color: #111827; flex: 1; min-width: 0; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: inherit; }
        .sourceCount { font-size: 12px; font-weight: 600; color: #111827; white-space: nowrap; flex-shrink: 0; font-family: inherit; }

        /* ---- Sales Overview ---- */
        .salesOverviewHeader { display: flex; justify-content: space-between; align-items: center; position: relative; }
        .salesOverviewTitle { position: absolute; left: 50%; transform: translateX(-50%); }
        .salesOverviewHeaderRight { margin-left: auto; z-index: 1; }
        .viewToggle { display: flex; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
        .viewToggleBtn {
          padding: 6px 12px; border: none; background: #fff;
          font-size: 12px; font-weight: 500; color: #6b7280; cursor: pointer;
          transition: background .15s, color .15s; font-family: inherit;
        }
        .viewToggleBtn:hover { background: #f9f9f9; color: #374151; }
        .viewToggleActive { background: #FF5722 !important; color: #fff !important; }
        .metricChips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
        .metricChip {
          padding: 5px 12px; border-radius: 20px; border: 1px solid #e5e7eb;
          background: #f9fafb; font-size: 12px; font-weight: 500; color: #6b7280;
          cursor: pointer; transition: all .15s; font-family: inherit;
        }
        .metricChip:hover { border-color: #FF5722; color: #FF5722; background: #fff4f0; }
        .metricChipActive { background: #FF5722 !important; color: #fff !important; border-color: #FF5722 !important; }
        .chartWrap { width: 100%; min-height: 260px; }
        .chartPlaceholder { padding: 24px; text-align: center; color: #6b7280; font-size: 13px; font-weight: 400; }
        .chartTooltip {
          background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,.1); font-size: 12px; font-weight: 400;
          min-width: 180px; font-family: 'Poppins', 'Inter', sans-serif;
        }
        .chartTooltipTitle { font-weight: 600; font-size: 12px; margin-bottom: 6px; color: #111827; border-bottom: 1px solid #eee; padding-bottom: 4px; }
        .chartTooltipRow { display: flex; justify-content: space-between; gap: 12px; margin-top: 4px; }
        .chartTooltipRow.green { color: #166534; }
        .chartTooltipRow.red { color: #b91c1c; }
      `}</style>

      {/* Header */}
      <div className="header">
        <div>
          <h1 className="hTitle">Dashboard</h1>
          <p className="hSub">Welcome, {user?.username || "Manager"}</p>
        </div>
        <div className="headerRight">
          {lastRefreshed && (
            <span className="lastRefreshed">
              Updated {lastRefreshed.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button type="button" className="refreshBtn" onClick={handleRefresh} disabled={refreshing || loading}>
            <span className={`refreshIcon ${refreshing ? "spinning" : ""}`}>↻</span>
            Refresh
          </button>
          <select className="select" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="all">All Year</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
          </select>
          <button
            type="button"
            onClick={() => setKpiValuesVisible((v) => !v)}
            title={kpiValuesVisible ? "Hide Amounts" : "Show Amounts"}
            className="kpiToggleBtn"
          >
            <img
              src={kpiValuesVisible ? "/icons/hide.png" : "/icons/show.png"}
              alt={kpiValuesVisible ? "Hide" : "Show"}
              className="kpiToggleIcon"
            />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpiGrid">
        <KPIBox title="Total Orders" value={kpis ? kpis.totalOrders : "—"} icon="/icons/total_orders.png" bubble="#e8f6ff" reveal={kpiValuesVisible} />
        <KPIBox title="Payments Clearance" value={kpis ? kpis.clearanceRate : "—"} icon="/icons/payments_cleared.png" bubble="#e6f9eb" isPercent reveal={kpiValuesVisible} />
        <KPIBox title="Pending Payments" value={kpis ? kpis.pendingPaymentsCount : "—"} icon="/icons/pending_payments.png" bubble="#fce7ef" reveal={kpiValuesVisible} />
        <KPIBox title="Total Sales" value={kpis ? kpis.totalSales : "—"} icon="/icons/total_orders_amount.png" bubble="#fff4e5" isMoney reveal={kpiValuesVisible} />
        <KPIBox title="Received Payments" value={kpis ? kpis.receivedPayments : "—"} icon="/icons/payment_clearance_amount.png" bubble="#e6f9eb" isMoney reveal={kpiValuesVisible} />
        <KPIBox title="Pending Payments Amount" value={kpis ? kpis.pendingAmount : "—"} icon="/icons/pending_payments_amount.png" bubble="#fde8e8" isMoney reveal={kpiValuesVisible} />
      </div>

      {loading ? (
        <div className="card animCard" style={{ textAlign: "center", color: "#6b7280" }}>
          Loading dashboard...
        </div>
      ) : (
        <>
          <TargetAchievement achieved={achievedForDonut} target={targetTotal} breakdown={fixedBreakdown} />
          <DayWiseSummary days={days} />
          <SourceWiseSummary sources={sources} />
          <ReferenceWiseSummary references={references} />
          <SalesOverviewChart series={salesOverview} reveal={kpiValuesVisible} />
        </>
      )}
    </div>
  );
};

export default Dashboard;