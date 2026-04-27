// src/pages/Dashboard.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { API_BASE } from "../config/api";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, LabelList,
} from "recharts";

const fmt = (n) => Number(n || 0).toLocaleString("en-PK");
const DEV_PREVIEW_TOTAL_ORDERS = null;
const FIXED_TYPES_BOOKING = [
  { key: "premium",  label: "Hissa - Premium"  },
  { key: "standard", label: "Hissa - Standard" },
  { key: "waqf",     label: "Hissa - Waqf"     },
  { key: "goat",     label: "Goat (Hissa)"     },
];

const FIXED_TYPES_FARM = [
  { key: "cow",  label: "Fancy Cow" },
  { key: "goat", label: "Goat" },
];

const FIXED_TYPES_ACCOUNTING = [
  { key: "premium", label: "Hissa - Premium" },
  { key: "standard", label: "Hissa - Standard" },
  { key: "waqf", label: "Hissa - Waqf" },
  { key: "goat", label: "Goat (Hissa)" },
  { key: "cow", label: "Fancy Cow" },
  { key: "farm_goat", label: "Goat" },
];

/* ── Animated number hook ── */
const useCountUp = (value, { duration = 600 } = {}) => {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(0);
  const fromRef = useRef(0);
  const toRef   = useRef(0);
  useEffect(() => {
    const to = Number(value || 0);
    const from = Number(display || 0);
    if (!Number.isFinite(to)) { setDisplay(0); return; }
    if (to === from) return;
    fromRef.current = from; toRef.current = to; startRef.current = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(fromRef.current + (toRef.current - fromRef.current) * eased);
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

/* ── KPI Box ── */
const KPIBox = ({ title, value, icon, bubble, isMoney, isPercent, reveal = true, trend }) => {
  const [hovered, setHovered] = useState(false);
  const numeric = Number(String(value ?? "").replace(/[^0-9.-]/g, "").trim());
  const canAnimate = Number.isFinite(numeric);
  const renderFormatted = () => {
    if (value === "—" || value === null || value === undefined) return "—";
    if (canAnimate) {
      return (
        <AnimatedNumber value={numeric} duration={600} format={(n) => {
          const rounded = isPercent ? Number(n).toFixed(1) : Math.round(n);
          if (isPercent) return `${rounded}%`;
          if (isMoney)   return `PKR ${fmt(rounded)}`;
          return fmt(rounded);
        }} />
      );
    }
    return value;
  };
  return (
    <div className={`kpiCard animPop ${hovered ? "kpiCardHovered" : ""}`}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div className="kpiIcon">
        {typeof icon === "string" && (icon.startsWith("/") || icon.endsWith(".png"))
          ? <img src={icon} alt="" className="kpiIconImg" />
          : icon}
      </div>
      <div className="kpiText">
        <div className="kpiTitle">{title}</div>
        <div className={`kpiValue ${reveal ? "" : "kpiBlurField"}`}>{renderFormatted()}</div>
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

/* ── Segment colours ── */
const SEGMENT_COLORS = {
  premium:  { fill: "#FF5722" }, standard: { fill: "#2196F3" },
  waqf:     { fill: "#4CAF50" }, goat:     { fill: "#FF9800" },
  cow:      { fill: "#3B82F6" },
  farm_goat:{ fill: "#10B981" },
  remaining:{ fill: "#EAEAEA" },
};

/* ── Donut ── */
const TargetDonut = ({ achieved=0, target=2000, size=220, stroke=20, breakdown=[], activeKey, onSegmentHover }) => {
  const isOver = achieved > target;
  const overAmount = isOver ? achieved - target : 0;
  const overPct = target > 0 ? (overAmount / target) * 100 : 0;
  const innerRadius = (size - stroke) / 2;
  const innerC = 2 * Math.PI * innerRadius;
  const cx = size / 2, cy = size / 2;
  const outerStroke = 8;
  const outerRadius = (size - stroke) / 2 + stroke / 2 + outerStroke / 2 + 4;
  const outerC = 2 * Math.PI * outerRadius;
  const segments = [];
  let cursor = 0;
  breakdown.forEach((b) => {
    const ratio = target > 0 ? Math.min(Number(b.value || 0) / target, 1) : 0;
    const dash = innerC * ratio;
    segments.push({ key: b.key, label: b.label, value: b.value, pct: b.percentage, dash, offset: cursor });
    cursor += dash;
  });
  if (!isOver) {
    const ach = breakdown.reduce((s, b) => s + Number(b.value || 0), 0);
    const rem = target > 0 ? Math.max(0, (target - ach) / target) : 1;
    segments.push({ key: "remaining", label: "Remaining", value: Math.max(0, target - ach), pct: null, dash: innerC * rem, offset: cursor });
  }
  const overDash = outerC * Math.min(overAmount / target, 1);
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
          return (
            <circle key={seg.key} cx={cx} cy={cy} r={innerRadius}
              stroke={color} strokeWidth={isActive ? stroke + 6 : stroke}
              strokeLinecap="butt" fill="none"
              strokeDasharray={`${seg.dash} ${innerC - seg.dash}`}
              strokeDashoffset={-seg.offset} transform={rotate}
              opacity={isAnyActive && !isActive ? 0.3 : 1}
              style={{ transition: "opacity .2s, stroke-width .2s", cursor: seg.key !== "remaining" ? "pointer" : "default" }}
              onMouseEnter={() => seg.key !== "remaining" && onSegmentHover?.(seg.key)}
              onMouseLeave={() => onSegmentHover?.(null)}
            />
          );
        })}
        {isOver && (
          <>
            <circle cx={cx} cy={cy} r={outerRadius} stroke="#fde68a" strokeWidth={outerStroke} fill="none" opacity={0.4} />
            <circle cx={cx} cy={cy} r={outerRadius} stroke="url(#overGold)" strokeWidth={outerStroke}
              strokeLinecap="round" fill="none"
              strokeDasharray={`${overDash} ${outerC - overDash}`} strokeDashoffset={0}
              transform={rotate} style={{ filter: "drop-shadow(0 0 4px rgba(251,191,36,0.6))" }} />
            <defs>
              <linearGradient id="overGold" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f59e0b" /><stop offset="100%" stopColor="#fbbf24" />
              </linearGradient>
            </defs>
            {(() => {
              const angle = -Math.PI / 2 + Math.min(overAmount / target, 1) * 2 * Math.PI;
              return <text x={cx + outerRadius * Math.cos(angle)} y={cy + outerRadius * Math.sin(angle)} textAnchor="middle" dominantBaseline="middle" fontSize="12" style={{ userSelect: "none" }}>⭐</text>;
            })()}
          </>
        )}
      </svg>
      <div className="donutCenter">
        {activeKey && activeKey !== "remaining" ? (() => {
          const seg = segments.find(s => s.key === activeKey);
          const color = SEGMENT_COLORS[activeKey]?.fill || "#FF5722";
          return (<>
            <div className="donutSmall" style={{ color }}>{seg?.label}</div>
            <div className="donutBig" style={{ color }}><AnimatedNumber value={Number(seg?.value || 0)} duration={400} format={(n) => fmt(Math.round(n))} /></div>
            <div className="donutRed" style={{ color: "#6b7280" }}>{seg?.pct?.toFixed(1)}% of total</div>
          </>);
        })() : isOver ? (<>
          <div className="donutSmall" style={{ color: "#6b7280" }}>Total Orders</div>
          <div className="donutBig donutBigBold" style={{ color: "#111827" }}><AnimatedNumber value={achieved} duration={750} format={(n) => fmt(Math.round(n))} /></div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
            <span style={{ fontSize: 13, color: "#d97706", fontWeight: 600 }}>🎯 </span>
            <span style={{ fontSize: 12, color: "#d97706", fontWeight: 600 }}>Target Hit!</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2, fontSize: 11, color: "#6b7280" }}>
            <span>+<AnimatedNumber value={overAmount} duration={800} format={(n) => fmt(Math.round(n))} /> over</span>
            <span>(<AnimatedNumber value={overPct} duration={800} format={(n) => `+${n.toFixed(1)}%`} />)</span>
          </div>
        </>) : (<>
          <div className="donutSmall">Total Orders:</div>
          <div className="donutBig donutBigBold"><AnimatedNumber value={achieved} duration={750} format={(n) => fmt(Math.round(n))} /></div>
          <div className="donutRed">Remaining: <AnimatedNumber value={Math.max(0, target - achieved)} duration={750} format={(n) => fmt(Math.round(n))} /></div>
        </>)}
      </div>
    </div>
  );
};

const ProgressRow = ({ label, value, percentage, color, active, onHover, segmentKey, goalValue }) => {
  const pct = Number.isFinite(percentage) ? percentage : 0;
  const hasGoal = Number.isFinite(Number(goalValue)) && Number(goalValue) > 0;
  return (
    <div className={`progressRow animSlide ${active ? "progressRowActive" : ""}`}
      onMouseEnter={() => onHover?.(segmentKey)} onMouseLeave={() => onHover?.(null)} style={{ cursor: "pointer" }}>
      <div className="progressHead">
        <div className="progressLabel">
          <span className="progressDot" style={{ background: color }} />{label}
        </div>
        <div className="progressVal">
          <AnimatedNumber value={Number(value || 0)} duration={600} format={(n) => fmt(Math.round(n))} />
          {hasGoal && (
            <span className="progressPct"> / {fmt(Number(goalValue))}</span>
          )}{" "}
          <span className="progressPct">({pct.toFixed(1)}%)</span>
        </div>
      </div>
      <div className="progressTrack">
        <div className="progressFill progressAnim" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
    </div>
  );
};

const TargetAchievement = ({ achieved, target, breakdown }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeKey, setActiveKey] = useState(null);
  return (
    <div className="card animCard" style={{ paddingBottom: 24 }}>
      <div className="cardTitleBig cardTitleClickable" onClick={() => setCollapsed(v => !v)}>
        TARGET ACHIEVEMENT <span className="collapseChevron">{collapsed ? "▶" : "▼"}</span>
      </div>
      {!collapsed && (
        <div className="targetGrid">
          <div className="donutWrap">
            <TargetDonut achieved={achieved} target={target} breakdown={breakdown} activeKey={activeKey} onSegmentHover={setActiveKey} />
          </div>
          <div className="progressWrap">
            {(breakdown || []).map((b) => (
              <ProgressRow key={b.key} segmentKey={b.key} label={b.label} value={b.value}
                percentage={b.percentage} color={SEGMENT_COLORS[b.key]?.fill || "#FF5722"}
                active={activeKey === b.key} onHover={setActiveKey} goalValue={b.goalValue} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Day Wise — desktop table, mobile stacked cards ── */
const DayWiseSummary = ({ days }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [highlightRow, setHighlightRow] = useState(null);
  const dayList = days || [];
  const firstDay = dayList[0];
  const typeKeys = firstDay?.columnKeys?.length ? firstDay.columnKeys : ["premium", "standard", "waqf", "goat"];
  const colLabels = firstDay?.columns?.length ? firstDay.columns : ["Premium", "Standard", "Waqf", "Goat", "Total"];
  const rowLabels = ["Total Orders", "Payment Cleared", "Pending (Completely)", "Pending (Partially)"];
  const renderCell = (val) => {
    const num = Number(val);
    return Number.isFinite(num) ? <AnimatedNumber value={num} duration={600} format={(n) => fmt(Math.round(n))} /> : (val ?? "—");
  };
  const rowColors = { "Total Orders": "#FF5722", "Payment Cleared": "#4CAF50", "Pending (Completely)": "#f59e0b", "Pending (Partially)": "#2196F3" };

  return (
    <div className="card animCard">
      <div className="cardTitleBig cardTitleClickable" onClick={() => setCollapsed(v => !v)}>
        DAY WISE SUMMARY <span className="collapseChevron">{collapsed ? "▶" : "▼"}</span>
      </div>
      {!collapsed && (
        <>
          {/* Desktop table */}
          <div className="dayWiseTableWrap">
            <table className="tblDayWise">
              <thead>
                <tr>
                  <th className="dayWiseCorner" rowSpan={2}>Category</th>
                  {dayList.map((d, di) => (
                    <th key={d.key} colSpan={colLabels.length} className={`dayWiseDayHeader${di > 0 ? " dayWiseDayHeaderSep" : ""}`}>{d.title}</th>
                  ))}
                </tr>
                <tr>
                  {dayList.map((d, di) =>
                    colLabels.map((col, ci) => (
                      <th key={`${d.key}-${col}-${ci}`} className={`dayWiseColHeader${di > 0 && ci === 0 ? " dayWiseColGroupStart" : ""}`}>{col}</th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {rowLabels.map((label) => (
                  <tr key={label} className={highlightRow === label ? "dayWiseRowHighlight" : ""}
                    onMouseEnter={() => setHighlightRow(label)} onMouseLeave={() => setHighlightRow(null)}>
                    <td className="dayWiseRowLabel">{label}</td>
                    {dayList.map((d, di) => {
                      const row = (d.data || []).find((r) => r.label === label);
                      if (!row) return colLabels.map((col, ci) => (
                        <td key={`${d.key}-${label}-${col}-${ci}`} className={`dayWiseCell${di > 0 && ci === 0 ? " dayWiseCellGroupStart" : ""}`}>—</td>
                      ));
                      return (
                        <React.Fragment key={d.key}>
                          {typeKeys.map((tk, ti) => (
                            <td
                              key={tk}
                              className={`dayWiseCell${di > 0 && ti === 0 ? " dayWiseCellGroupStart" : ""}`}
                            >
                              {renderCell(row[tk])}
                            </td>
                          ))}
                          <td className="dayWiseCell dayWiseCellTotal">{renderCell(row.total)}</td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

/* ── Reference Wise — desktop table, mobile stacked cards ── */
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
    { key: "name",                   label: "Reference",       numeric: false },
    { key: "leadsGenerated",         label: "Leads Generated", numeric: true  },
    { key: "leadsConverted",         label: "Leads Converted", numeric: true  },
    { key: "totalRevenueGenerated",  label: "Total Revenue",   numeric: true  },
    { key: "conversionRate",         label: "Conv. Rate",      numeric: true  },
  ];
  return (
    <div className="card animCard">
      <div className="cardTitleBig cardTitleClickable" onClick={() => setCollapsed(v => !v)}>
        REFERENCE WISE SUMMARY <span className="collapseChevron">{collapsed ? "▶" : "▼"}</span>
      </div>
      {!collapsed && (
        <>
          {/* Desktop table */}
          <div className="tableWrapRef">
            <table className="tblRefOld">
              <thead>
                <tr>
                  {cols.map(c => (
                    <th key={c.key} className={`${c.numeric ? "sortableCol" : ""} ${sortKey === c.key ? "activeSortCol" : ""}`}
                      onClick={c.numeric ? () => handleSort(c.key) : undefined}
                      style={c.numeric ? { cursor: "pointer", userSelect: "none" } : {}}>
                      {c.label}{c.numeric && <span className="sortIcon">{sortKey === c.key ? (sortDir === "asc" ? " ↑" : " ↓") : " ↕"}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.name} className="animRow refRow">
                    <td>{r.name}</td>
                    <td><AnimatedNumber value={Number(r.leadsGenerated || 0)} duration={650} format={(n) => fmt(Math.round(n))} /></td>
                    <td><AnimatedNumber value={Number(r.leadsConverted || 0)} duration={650} format={(n) => fmt(Math.round(n))} /></td>
                    <td>Rs. <AnimatedNumber value={Number(r.totalRevenueGenerated || 0)} duration={650} format={(n) => fmt(Math.round(n))} /></td>
                    <td><AnimatedNumber value={Number(r.conversionRate || 0)} duration={600} format={(n) => `${Math.round(n)}%`} /></td>
                  </tr>
                ))}
                {sorted.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "#9ca3af", padding: "16px" }}>No results found</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

/* ── Source Wise ── */
const SourceWiseSummary = ({ sources }) => {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="card animCard sourceWiseCard">
      <div className="sourceCardHeader">
        <div className="cardTitle cardTitleClickable" onClick={() => setCollapsed(v => !v)}>
          SOURCE-WISE ORDER SUMMARY <span className="collapseChevron">{collapsed ? "▶" : "▼"}</span>
        </div>
      </div>
      {!collapsed && (
        <div className="sourceGrid">
          {(sources || []).map((s, i) => (
            <div key={s.sourceName + i} className="sourceCard animPop sourceCardInteractive">
              <div className="sourceIcon"><span className="sourcePin">▶</span></div>
              <div className="sourceName">{s.sourceName}</div>
              <div className="sourceCount"><AnimatedNumber value={Number(s.count || 0)} duration={500} format={(n) => fmt(Math.round(n))} /></div>
            </div>
          ))}
          {(!sources || sources.length === 0) && <div className="sourceCard sourceCardEmpty">No source data</div>}
        </div>
      )}
    </div>
  );
};

/* ── Area Wise Bar Chart ── */
const AreaWiseChart = ({ areas }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [metric, setMetric] = useState("total");
  const [activeArea, setActiveArea] = useState(null);
  const wrapText = (text, maxChars = 10) => {
    const value = String(text || "");
    const words = value.split(" ");
  
    const lines = [];
    let line = "";
  
    words.forEach((word) => {
      if ((line + " " + word).trim().length <= maxChars) {
        line = (line + " " + word).trim();
      } else {
        if (line) lines.push(line);
        line = word;
      }
    });
  
    if (line) lines.push(line);
  
    return lines.length ? lines : [value];
  };
  
  const CustomXAxisTick = ({ x, y, payload }) => {
    const lines = wrapText(payload.value, 12).slice(0, 3);
  
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          textAnchor="middle"
          fill="#374151"
          fontSize={10}
          fontFamily="'Poppins','Inter',sans-serif"
        >
          {lines.map((line, index) => (
            <tspan key={index} x={0} dy={index === 0 ? 12 : 12}>
              {line}
            </tspan>
          ))}
        </text>
      </g>
    );
  };

  const data = useMemo(
    () => (areas || []).slice(0, 20).map((a) => ({ ...a, name: a.area })),
    [areas]
  );

  const metricOptions = [
    { key: "total",   label: "All Orders",  color: "#FF5722" },
    { key: "cleared", label: "Cleared",     color: "#4CAF50" },
    { key: "pending", label: "Pending",     color: "#f59e0b" },
  ];
  const active = metricOptions.find((m) => m.key === metric) || metricOptions[0];

  const CustomTooltip = ({ active: a, payload, label }) => {
    if (!a || !payload?.length || !label) return null;
    const p = payload[0]?.payload || {};
    return (
      <div className="chartTooltip">
        <div className="chartTooltipTitle">{label}</div>
        <div className="chartTooltipRow">
          <span>Total:</span><span>{fmt(Number(p.total || 0))}</span>
        </div>
        <div className="chartTooltipRow" style={{ color: "#166534" }}>
          <span>Cleared:</span><span>{fmt(Number(p.cleared || 0))}</span>
        </div>
        <div className="chartTooltipRow" style={{ color: "#b45309" }}>
          <span>Pending:</span><span>{fmt(Number(p.pending || 0))}</span>
        </div>
      </div>
    );
  };

  if (!data.length) return (
    <div className="card animCard">
      <div className="cardTitleBig">AREA WISE ORDERS</div>
      <div className="chartPlaceholder">No area data for selected year</div>
    </div>
  );

  return (
    <div className="card animCard">
      <div className="salesOverviewHeader" style={{ marginBottom: collapsed ? 0 : 10 }}>
        <div
          className="cardTitle cardTitleClickable salesOverviewTitle"
          onClick={() => setCollapsed((v) => !v)}
        >
          AREA WISE ORDERS <span className="collapseChevron">{collapsed ? "▶" : "▼"}</span>
        </div>
        {!collapsed && (
          <div className="salesOverviewHeaderRight">
            <div className="viewToggle">
              {metricOptions.map((m) => (
                <button
                  key={m.key}
                  className={`viewToggleBtn ${metric === m.key ? "viewToggleActive" : ""}`}
                  style={metric === m.key ? { background: m.color } : {}}
                  onClick={() => setMetric(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="chartScrollX">
  <div style={{ minWidth: Math.max(data.length * 85, 900), height: 260 }}>
    <ResponsiveContainer width="100%" height={360}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 8, left: 0, bottom: 80 }}
        onMouseLeave={() => setActiveArea(null)}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
        <XAxis
  dataKey="name"
  tick={<CustomXAxisTick />}
  stroke="#6b7280"
  interval={0}
  height={95}
/>
        <YAxis
          tick={{ fontSize: 11, fontFamily: "'Poppins','Inter',sans-serif" }}
          stroke="#6b7280"
          tickFormatter={(v) => fmt(v)}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,87,34,0.06)" }} />
        <Bar
          dataKey={metric}
          radius={[4, 4, 0, 0]}
          maxBarSize={36}
          onMouseEnter={(d) => setActiveArea(d.area)}
        >
          {data.map((entry) => (
            <Cell
              key={entry.area}
              fill={
                activeArea === null || activeArea === entry.area
                  ? active.color
                  : `${active.color}55`
              }
            />
          ))}
          <LabelList
            dataKey={metric}
            position="top"
            style={{
              fontSize: 10,
              fontFamily: "'Poppins','Inter',sans-serif",
              fill: "#374151",
              fontWeight: 600,
            }}
            formatter={(v) => fmt(v)}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </div>  
  </div>
)}
    </div>
  );
};


/* ── Sales Overview ── */
const SalesOverviewChart = ({ series, reveal }) => {
  const [chartType, setChartType] = useState("line");
  const [metric, setMetric] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const data = useMemo(() => (series || []).map((d) => ({ ...d, name: d.date })), [series]);
  const metricOptions = [{ key: "orders", label: "Orders" }, { key: "totalSales", label: "Total Sales" }];
  const activeMetric = metric !== null && metricOptions.some((m) => m.key === metric) ? metric : (reveal ? "totalSales" : "orders");
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length || !label) return null;
    const p = payload[0]?.payload || {};
    return (
      <div className="chartTooltip">
        <div className="chartTooltipTitle">{label}</div>
        <div className="chartTooltipRow"><span>Orders:</span><span>{fmt(Number(p.orders || 0))}</span></div>
        <div className="chartTooltipRow green"><span>Total Sales:</span><span>Rs {fmt(Number(p.totalSales || 0))}</span></div>
        <div className="chartTooltipRow"><span>Qty:</span><span>{fmt(Number(p.totalQuantity || 0))}</span></div>
        <div className="chartTooltipRow"><span>Avg Value:</span><span>Rs {fmt(Number(p.avgOrderValue || 0))}</span></div>
      </div>
    );
  };
  if (!data.length) return (
    <div className="card animCard"><div className="cardTitle">SALES OVERVIEW</div>
      <div className="chartPlaceholder">No data for selected year</div></div>
  );
  return (
    <div className="card animCard">
      <div className="salesOverviewHeader" style={{ marginBottom: collapsed ? 0 : 10 }}>
        <div className="cardTitle cardTitleClickable salesOverviewTitle" onClick={() => setCollapsed(v => !v)}>
          SALES OVERVIEW <span className="collapseChevron">{collapsed ? "▶" : "▼"}</span>
        </div>
        {!collapsed && (
          <div className="salesOverviewHeaderRight">
            <div className="viewToggle">
              <button className={`viewToggleBtn ${chartType === "line" ? "viewToggleActive" : ""}`} onClick={() => setChartType("line")}>〜 Line</button>
              <button className={`viewToggleBtn ${chartType === "bar"  ? "viewToggleActive" : ""}`} onClick={() => setChartType("bar")}>▦ Bar</button>
            </div>
          </div>
        )}
      </div>
      {!collapsed && (<>
        <div className="metricChips">
          {metricOptions.map(m => (
            <button key={m.key} className={`metricChip ${activeMetric === m.key ? "metricChipActive" : ""}`} onClick={() => setMetric(m.key)}>{m.label}</button>
          ))}
        </div>
        <div className="chartWrap">
          <ResponsiveContainer width="100%" height={280}>
            {chartType === "line" ? (
              <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fontFamily: "'Poppins','Inter',sans-serif" }} stroke="#6b7280" />
                <YAxis tick={{ fontSize: 11, fontFamily: "'Poppins','Inter',sans-serif" }} stroke="#6b7280" tickFormatter={(v) => fmt(v)} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#FF5722", strokeWidth: 1 }} />
                <Line type="monotone" dataKey={activeMetric} stroke="#FF5722" strokeWidth={2}
                  dot={{ fill: "#FF5722", r: 3 }} activeDot={{ r: 5, fill: "#FF5722", stroke: "#fff", strokeWidth: 2 }} />
              </LineChart>
            ) : (
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fontFamily: "'Poppins','Inter',sans-serif" }} stroke="#6b7280" />
                <YAxis tick={{ fontSize: 11, fontFamily: "'Poppins','Inter',sans-serif" }} stroke="#6b7280" tickFormatter={(v) => fmt(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey={activeMetric} fill="#FF5722" radius={[4, 4, 0, 0]}>
                  {data.map((_, idx) => <Cell key={idx} fill={idx % 2 === 0 ? "#FF5722" : "#FF8A65"} />)}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </>)}
    </div>
  );
};

/* ════════════════════════════════════════
   Dashboard
════════════════════════════════════════ */
const Dashboard = () => {
  const { user } = useAuth();
  const location = useLocation();
  const isFarm = location.pathname.startsWith("/farm");
  const isAccounting = location.pathname.startsWith("/accounting");
  const [year, setYear] = useState("2026");
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState(null);
  const [targetData, setTargetData] = useState(null);
  const [days, setDays] = useState([]);
  const [sources, setSources] = useState([]);
  const [references, setReferences] = useState([]);
  const [salesOverview, setSalesOverview] = useState([]);
  const [kpiValuesVisible, setKpiValuesVisible] = useState(false);
  const token = useMemo(() => localStorage.getItem("token"), []);
  const [areas, setAreas] = useState([]);

  const fetchAll = useCallback(async (opts = {}) => {
    const silent = opts.silent === true;
    try {
      if (!silent) setLoading(true);
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const y = encodeURIComponent(year);
      const base = isAccounting ? `${API_BASE}/accounting/dashboard` : isFarm ? `${API_BASE}/farm/dashboard` : `${API_BASE}/dashboard`;
      const dayPromise = isFarm && !isAccounting
        ? Promise.resolve({ json: async () => ({ days: [] }) })
        : fetch(`${base}/day-wise?year=${y}`, { headers });

        const [k, t, d, src, r, sales, a] = await Promise.all([
          fetch(`${base}/kpis?year=${y}`, { headers }),
          fetch(`${base}/target-achievement?year=${y}`, { headers }),
          dayPromise,
          fetch(`${base}/source-wise?year=${y}`, { headers }),
          fetch(`${base}/reference-wise?year=${y}`, { headers }),
          fetch(`${base}/sales-overview?year=${y}`, { headers }),
          isFarm || isAccounting
            ? Promise.resolve({ json: async () => ({ areas: [] }) })
            : fetch(`${base}/area-wise?year=${y}`, { headers }),
        ]);
        const [kj, tj, dj, srcj, rj, salesj, aj] = await Promise.all([
          k.json(), t.json(), d.json(), src.json(), r.json(), sales.json(), a.json(),
        ]);
        setKpis(kj.kpis || null); setTargetData(tj || null);
        setDays(dj.days || []); setSources(srcj.sources || []);
        setReferences(rj.references || []); setSalesOverview(salesj.series || []);
        setAreas(aj.areas || []);
    } catch (e) {
      console.error(e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [year, token, isFarm, isAccounting]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const farmTypeGoals = { cow: 10, goat: 60 };
  const bookingTypeGoals = { goat: 40 };
  const achievedReal = Number(targetData?.target?.achievedTotal || 0);
  const bookingAchievedForTarget = Number(targetData?.target?.achievedForTarget || 0);
  const achievedForDonut = Number.isFinite(Number(DEV_PREVIEW_TOTAL_ORDERS)) && DEV_PREVIEW_TOTAL_ORDERS !== null
    ? Number(DEV_PREVIEW_TOTAL_ORDERS)
    : (isFarm ? achievedReal : bookingAchievedForTarget || achievedReal);
  const targetTotal = isAccounting
    ? Number(targetData?.target?.targetTotal ?? 2110)
    : isFarm
      ? Number(targetData?.target?.targetTotal || 70)
      : year === "all" ? 3500 : Number(targetData?.target?.targetTotal || 2000);
  const apiMap = new Map((Array.isArray(targetData?.breakdown) ? targetData.breakdown : []).map((b) => [String(b.key), b]));
  const fixedTypes = isAccounting ? FIXED_TYPES_ACCOUNTING : isFarm ? FIXED_TYPES_FARM : FIXED_TYPES_BOOKING;
  const fixedBreakdown = fixedTypes.map((t) => {
    const found = apiMap.get(t.key);
    const value = Number(found?.value || 0);
    if (isFarm) {
      const goalValue = Number(farmTypeGoals[t.key] || 0);
      return {
        key: t.key,
        label: t.label,
        value,
        goalValue,
        percentage: goalValue > 0 ? (value / goalValue) * 100 : 0,
      };
    }
  if (isAccounting) {
    return { key: t.key, label: t.label, value, percentage: achievedReal > 0 ? (value / achievedReal) * 100 : 0 };
  }
    const bookingGoal = Number(bookingTypeGoals[t.key] || 0);
    if (bookingGoal > 0) {
      return {
        key: t.key,
        label: t.label,
        value,
        goalValue: bookingGoal,
        percentage: (value / bookingGoal) * 100,
      };
    }
    return { key: t.key, label: t.label, value, percentage: achievedReal > 0 ? (value / achievedReal) * 100 : 0 };
  });

  return (
    <div className="page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }

        .page { font-family:'Poppins','Inter',sans-serif; padding:12px 16px; display:flex; flex-direction:column; gap:10px; }
        .page * { font-family:inherit; }


        /* animations */
        .animCard  { animation:cardIn  .35s ease-out both; }
        .animPop   { animation:popIn   .35s ease-out both; }
        .animFade  { animation:fadeIn  .45s ease-out both; }
        .animSlide { animation:slideIn .40s ease-out both; }
        .animRow   { animation:fadeUp  .35s ease-out both; }
        @keyframes cardIn  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes popIn   { from{opacity:0;transform:scale(.96)}       to{opacity:1;transform:scale(1)} }
        @keyframes fadeIn  { from{opacity:0}                            to{opacity:1} }
        @keyframes slideIn { from{opacity:0;transform:translateX(-4px)} to{opacity:1;transform:translateX(0)} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(4px)}  to{opacity:1;transform:translateY(0)} }
        .progressAnim { animation:barGrow .6s ease-out both; transform-origin:left; }
        @keyframes barGrow { from{transform:scaleX(0)} to{transform:scaleX(1)} }
        @keyframes spin { to{transform:rotate(360deg)} }

        /* show/hide on breakpoint */
        .deskOnly { display:block; }
        .mobOnly  { display:none;  }

        /* header */
        .header { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
        .hTitle { margin:0; font-size:17px; font-weight:600; color:#111827; }
        .hSub   { margin:4px 0 0; font-size:13px; color:#6b7280; }
        .headerRight { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .lastRefreshed { font-size:11px; color:#9ca3af; white-space:nowrap; }

        /* unified control buttons */
        .ctrlBtn {
          padding:7px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff;
          cursor:pointer; font-size:13px; font-weight:500; color:#374151;
          display:flex; align-items:center; gap:5px;
          box-shadow:0 2px 6px rgba(0,0,0,0.04); transition:all .15s;
          -webkit-appearance:none; appearance:none; white-space:nowrap; line-height:1;
        }
        .ctrlBtn:hover  { background:#fff4f0; border-color:#FF5722; color:#FF5722; }
        .ctrlBtn:active { transform:scale(.96); }
        .ctrlBtn:disabled { opacity:.6; cursor:not-allowed; }
        .ctrlBtnIcon { font-size:14px; display:inline-block; }
        .ctrlBtnIcon.spinning { animation:spin .7s linear infinite; }

        .ctrlSelect {
          padding:7px 30px 7px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff;
          cursor:pointer; font-size:13px; font-weight:500; color:#374151;
          box-shadow:0 2px 6px rgba(0,0,0,0.04); transition:all .15s;
          -webkit-appearance:none; appearance:none;
          background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
          background-repeat:no-repeat; background-position:right 10px center;
        }
        .ctrlSelect:hover { background-color:#fff4f0; border-color:#FF5722; color:#FF5722; }
        .ctrlSelect:focus { outline:none; border-color:#FF5722; box-shadow:0 0 0 3px rgba(255,87,34,.1); }

        .ctrlIconBtn {
          padding:7px 10px; border-radius:10px; border:1px solid #e5e7eb; background:#fff;
          cursor:pointer; display:flex; align-items:center; justify-content:center;
          box-shadow:0 2px 6px rgba(0,0,0,0.04); transition:all .15s; line-height:1;
        }
        .ctrlIconBtn:hover  { background:#fff4f0; border-color:#FF5722; }
        .ctrlIconBtn:active { transform:scale(.96); }
        .ctrlIconBtnImg { width:18px; height:18px; display:block; }

        /* KPI */
        .kpiGrid { display:grid; grid-template-columns:repeat(3,minmax(160px,1fr)); gap:8px; }
        .kpiCard { background:#fff; border-radius:10px; padding:14px 12px; min-height:72px; display:flex; align-items:center; gap:8px; box-shadow:0 2px 8px rgba(0,0,0,0.04); border:1px solid #f1f1f1; position:relative; overflow:hidden; transition:transform .18s,box-shadow .18s,border-color .18s; cursor:default; }
        .kpiCard:hover,.kpiCardHovered { transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,0,0,0.09); border-color:#FF5722; }
        .kpiGlow { position:absolute; inset:0; opacity:.07; pointer-events:none; border-radius:inherit; }
        .kpiIcon { width:64px; height:64px; display:flex; align-items:center; justify-content:center; flex:0 0 auto; transition:transform .2s; }
        .kpiIconImg { width:50px; height:50px; object-fit:contain; }
        .kpiCard:hover .kpiIcon { transform:scale(1.08); }
        .kpiText { display:flex; flex-direction:column; justify-content:center; gap:2px; }
        .kpiTitle { font-size:11px; font-weight:400; color:#6b7280; }
        .kpiValue { font-size:18px; font-weight:600; color:#111827; line-height:1.2; }
        .kpiTrend { font-size:11px; margin-top:2px; font-weight:500; }
        .kpiTrendUp { color:#16a34a; } .kpiTrendDown { color:#dc2626; }
        .kpiBlurField { filter:blur(6px); opacity:.35; user-select:none; pointer-events:none; background:rgba(0,0,0,0.03); border-radius:10px; padding:6px 10px; display:inline-block; min-width:140px; }


        .chartScrollX {
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 8px;
}



        /* card shell */
        .card { background:#fff; border-radius:10px; padding:12px; border:1px solid #f1f1f1; box-shadow:0 2px 8px rgba(0,0,0,0.04); transition:box-shadow .2s; }
        .card:hover { box-shadow:0 4px 16px rgba(0,0,0,0.07); }
        .cardTitle,.cardTitleBig { text-align:center; font-size:15px; font-weight:600; letter-spacing:.2px; color:#111827; margin-bottom:10px; white-space:nowrap; }
        .cardTitleClickable { cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; user-select:none; transition:color .15s; }
        .cardTitleClickable:hover { color:#FF5722; }
        .collapseChevron { font-size:11px; font-weight:500; }

        /* target */
        .targetGrid { display:grid; grid-template-columns:240px 1fr; gap:16px; align-items:center; min-height:320px; }
        .donutCenter { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; white-space:nowrap; pointer-events:none; }
        .donutSmall { font-size:12px; font-weight:500; color:#374151; }
        .donutBig { font-size:28px; font-weight:600; color:#1f2937; }
        .donutBigBold { font-size:38px !important; font-weight:700 !important; }
        .donutRed { font-size:12px; font-weight:400; color:#b91c1c; font-style:italic; }
        .donutWrap { display:flex; flex-direction:column; align-items:center; gap:10px; }
        .progressWrap { display:flex; flex-direction:column; gap:10px; }
        .progressRow { display:flex; flex-direction:column; gap:4px; padding:6px 8px; border-radius:8px; border:1px solid transparent; transition:background .15s,border-color .15s,transform .15s,box-shadow .15s; }
        .progressRowActive { background:#fafafa; border-color:#e5e7eb; transform:translateX(3px); box-shadow:0 2px 8px rgba(0,0,0,0.06); }
        .progressHead { display:flex; justify-content:space-between; align-items:center; gap:8px; }
        .progressLabel { font-size:12px; font-weight:500; color:#111827; white-space:nowrap; display:flex; align-items:center; gap:6px; }
        .progressDot { width:8px; height:8px; border-radius:50%; flex-shrink:0; transition:transform .2s; }
        .progressRowActive .progressDot { transform:scale(1.5); }
        .progressVal { font-size:12px; font-weight:600; color:#111827; white-space:nowrap; }
        .progressPct { font-weight:500; color:#374151; font-size:11px; }
        .progressTrack { height:7px; border-radius:999px; background:#e5e7eb; overflow:hidden; }
        .progressFill { height:100%; border-radius:999px; }

        /* day wise desktop */
        .dayWiseTableWrap { width:100%; overflow-x:auto; border-radius:12px; border:1px solid #e5e7eb; }
        .tblDayWise { width:100%; border-collapse:separate; border-spacing:0; background:#fff; min-width:640px; }
        .tblDayWise th,.tblDayWise td { padding:8px 10px; font-size:13px; font-weight:400; border-bottom:1px solid #e5e7eb; border-right:1px solid #e5e7eb; }
        .tblDayWise th:last-child,.tblDayWise td:last-child { border-right:none; }
        .tblDayWise tbody tr:last-child td { border-bottom:none; }
        .dayWiseCorner { background:#f3f4f6; width:170px; min-width:170px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.4px; color:#6b7280; text-align:center; vertical-align:middle; }
        .dayWiseDayHeader { background:#FF5722; color:#fff; font-weight:600; font-size:13px; text-align:center; padding:10px 12px; }
        .dayWiseDayHeaderSep { border-left:4px solid #fff !important; }
        .dayWiseColHeader { background:#f9fafb; color:#374151; font-weight:500; font-size:12px; text-align:center; }
        .dayWiseColGroupStart { border-left:4px solid #fff !important; }
        .dayWiseCellGroupStart { border-left:4px solid #fff !important; }
        .dayWiseRowLabel { background:#f3f4f6; color:#374151; font-weight:500; font-size:13px; border-right:1px solid #e5e7eb; }
        .dayWiseCell { text-align:center; color:#111827; font-size:13px; font-weight:400; }
        .dayWiseCellTotal { font-weight:600; }
        .dayWiseRowHighlight td { background:#fff4f0 !important; }

        /* reference desktop */
        .tableWrapRef { width:100%; overflow-x:auto; border-radius:12px; }
        .tblRefOld { width:100%; border-collapse:separate; border-spacing:0; background:#f7f7f7; border:1px solid #ededed; border-radius:10px; overflow:hidden; min-width:560px; table-layout:fixed; }
        .tblRefOld th,.tblRefOld td { padding:8px 10px; font-size:12px; font-weight:400; color:#374151; text-align:center; border-bottom:1px solid #ededed; border-right:1px solid #ededed; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .tblRefOld th { background:#f0f0f0; font-weight:600; white-space:normal; line-height:1.25; }
        .tblRefOld tr:last-child td { border-bottom:none; }
        .tblRefOld th:last-child,.tblRefOld td:last-child { border-right:none; }
        .tblRefOld th:first-child,.tblRefOld td:first-child { text-align:left; width:140px; font-weight:600; background:#fafafa; white-space:nowrap; }
        .sortableCol:hover { background:#ffe8e0 !important; color:#FF5722; }
        .activeSortCol { background:#fff0eb !important; color:#FF5722; }
        .sortIcon { font-size:11px; opacity:.8; }
        .refRow:hover td { background:#fff8f6 !important; }

        /* source */
        .sourceWiseCard { background:#fff; }
        .sourceCardHeader { display:flex; justify-content:center; align-items:center; margin-bottom:12px; }
        .sourceCardHeader .cardTitle { margin-bottom:0; }
        .sourceGrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:10px; width:100%; min-width:0; }
        .sourceCard { background:#fff; border-radius:8px; padding:8px 12px; display:flex; align-items:center; gap:8px; border:1px solid #e8e8e8; min-height:40px; min-width:0; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.04); transition:transform .15s,box-shadow .15s; }
        .sourceCardInteractive:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,0,0,0.08); }
        .sourceCardEmpty { justify-content:center; color:#6b7280; font-size:11px; }
        .sourceIcon { width:24px; height:24px; border-radius:5px; background:#7c3aed; color:#fff; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:10px; }
        .sourceName { font-size:11px; font-weight:500; color:#111827; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .sourceCount { font-size:12px; font-weight:600; color:#111827; white-space:nowrap; flex-shrink:0; }

        /* sales */
        .salesOverviewHeader { display:flex; justify-content:space-between; align-items:center; position:relative; }
        .salesOverviewTitle { position:absolute; left:50%; transform:translateX(-50%); }
        .salesOverviewHeaderRight { margin-left:auto; z-index:1; }
        .viewToggle { display:flex; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden; }
        .viewToggleBtn { padding:6px 12px; border:none; background:#fff; font-size:12px; font-weight:500; color:#6b7280; cursor:pointer; transition:background .15s,color .15s; }
        .viewToggleBtn:hover { background:#f9f9f9; color:#374151; }
        .viewToggleActive { background:#FF5722 !important; color:#fff !important; }
        .metricChips { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px; }
        .metricChip { padding:5px 12px; border-radius:20px; border:1px solid #e5e7eb; background:#f9fafb; font-size:12px; font-weight:500; color:#6b7280; cursor:pointer; transition:all .15s; }
        .metricChip:hover { border-color:#FF5722; color:#FF5722; background:#fff4f0; }
        .metricChipActive { background:#FF5722 !important; color:#fff !important; border-color:#FF5722 !important; }
        .chartWrap { width:100%; min-height:260px; }
        .chartPlaceholder { padding:24px; text-align:center; color:#6b7280; font-size:13px; }
        .chartTooltip { background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:10px 12px; box-shadow:0 4px 12px rgba(0,0,0,.1); font-size:12px; min-width:180px; }
        .chartTooltipTitle { font-weight:600; font-size:12px; margin-bottom:6px; color:#111827; border-bottom:1px solid #eee; padding-bottom:4px; }
        .chartTooltipRow { display:flex; justify-content:space-between; gap:12px; margin-top:4px; }
        .chartTooltipRow.green { color:#166534; }

        /* ════════════════════════════════
           MOBILE
        ════════════════════════════════ */
        @media (max-width: 767px) {
          .deskOnly { display:none !important; }
          .mobOnly  { display:block !important; }

          /* align page heading with fixed mobile menu button */
          .page { padding:16px 10px 28px; gap:8px; }

          /* header */
          .header { flex-direction:column; align-items:flex-start; gap:8px; }
          .hTitle {
            min-height:55px; display:flex; align-items:center; box-sizing:border-box;
            font-size:clamp(15px, 4.3vw, 17px); font-weight:600; color:#111827; line-height:1.25;
            padding-top:0; margin:0;
          }
          .hSub   { font-size:11px; }
          .headerRight { width:100%; gap:6px; }
          .lastRefreshed { width:100%; order:-1; font-size:10px; }

          /* KPI — 2 col */
          .kpiGrid { grid-template-columns:1fr 1fr; gap:6px; }
          .kpiCard { padding:10px 8px; min-height:60px; gap:6px; }
          .kpiIcon { width:36px; height:36px; }
          .kpiIconImg { width:28px; height:28px; }
          .kpiTitle { font-size:9px; }
          .kpiValue { font-size:13px; }
          .kpiBlurField { min-width:60px; padding:3px 5px; }

          /* card titles */
          .cardTitleBig,.cardTitle { font-size:12px; white-space:normal; }

          /* target — stack vertically */
          .targetGrid { grid-template-columns:1fr; min-height:unset; gap:12px; }
          .donutWrap { align-items:center; }

          /* source — 2 col on mobile */
          .sourceGrid { grid-template-columns:1fr 1fr; gap:6px; overflow:hidden; }
          .sourceCard { padding:7px 8px; gap:6px; min-width:0; overflow:hidden; }
          .sourceName { font-size:10px; }
          .sourceCount { font-size:11px; }

          /* sales chart — unstack header */
          .salesOverviewHeader { flex-direction:column; align-items:flex-start; gap:6px; }
          .salesOverviewTitle { position:static; transform:none; font-size:12px; }
          .salesOverviewHeaderRight { margin-left:0; }
          .chartWrap { min-height:200px; }

          /* ── Mobile Day Wise stacked cards ── */
          .mDayCard {
            background:#fafafa; border:1px solid #e5e7eb; border-radius:12px;
            padding:12px; margin-bottom:10px;
          }
          .mDayCard:last-child { margin-bottom:0; }
          .mDayCardTitle {
            font-size:12px; font-weight:700; color:#fff;
            background:#FF5722; border-radius:8px; padding:5px 10px;
            margin-bottom:10px; text-align:center; letter-spacing:.3px;
          }
          .mDayRow {
            background:#fff; border-radius:8px; border:1px solid #f0f0f0;
            padding:8px 10px; margin-bottom:6px;
          }
          .mDayRow:last-child { margin-bottom:0; }
          .mDayRowLabel {
            font-size:11px; font-weight:600; color:#374151;
            border-left:3px solid #FF5722; padding-left:8px;
            margin-bottom:8px; line-height:1.3;
          }
          .mDayRowGrid {
            display:grid; grid-template-columns:repeat(5,1fr); gap:4px;
          }
          .mDayCell { text-align:center; }
          .mDayCellKey { font-size:9px; font-weight:500; color:#9ca3af; text-transform:uppercase; letter-spacing:.3px; margin-bottom:2px; }
          .mDayCellVal { font-size:12px; font-weight:600; color:#111827; }

          /* ── Mobile Reference stacked cards ── */
          .mRefList { display:flex; flex-direction:column; gap:8px; }
          .mRefCard {
            background:#fafafa; border:1px solid #e5e7eb; border-radius:12px; padding:12px;
          }
          .mRefName {
            font-size:13px; font-weight:700; color:#111827; margin-bottom:10px;
            padding-bottom:8px; border-bottom:1px solid #f0f0f0;
          }
          .mRefGrid {
            display:grid; grid-template-columns:1fr 1fr; gap:8px;
          }
          .mRefCell { }
          .mRefCellWide { grid-column:span 2; }
          .mRefCellLabel { font-size:10px; font-weight:500; color:#9ca3af; text-transform:uppercase; letter-spacing:.3px; margin-bottom:2px; }
          .mRefCellVal { font-size:14px; font-weight:600; color:#111827; }

          .mEmpty { text-align:center; color:#9ca3af; font-size:12px; padding:16px; }
        }

        @media (max-width: 400px) {
          .kpiGrid { grid-template-columns:1fr; }
          .mDayRowGrid { grid-template-columns:repeat(3,1fr); }
          .sourceGrid { grid-template-columns:1fr; }
        }
      `}</style>

      {/* Header */}
      <div className="header">
        <div>
          <h1 className="hTitle">{isFarm ? "Farm Dashboard" : isAccounting ? "Accounting & Finance" : "Dashboard"}</h1>
          <p className="hSub">Welcome, {user?.username || "Manager"}</p>
        </div>
        <div className="headerRight">
          <select className="ctrlSelect" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="all">All Year</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
          </select>
          <button type="button" className="ctrlIconBtn"
            onClick={() => setKpiValuesVisible((v) => !v)}
            title={kpiValuesVisible ? "Hide Amounts" : "Show Amounts"}>
            <img src={kpiValuesVisible ? "/icons/hide.png" : "/icons/show.png"}
              alt={kpiValuesVisible ? "Hide" : "Show"} className="ctrlIconBtnImg" />
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpiGrid">
        <KPIBox title="Total Orders"            value={kpis?.totalOrders}          icon="/icons/total_orders.png"             bubble="#e8f6ff" reveal={kpiValuesVisible} />
        <KPIBox title="Payments Clearance"      value={kpis?.clearanceRate}         icon="/icons/payments_cleared.png"         bubble="#e6f9eb" isPercent reveal={kpiValuesVisible} />
        <KPIBox title="Pending Payments"        value={kpis?.pendingPaymentsCount}  icon="/icons/pending_payments.png"         bubble="#fce7ef" reveal={kpiValuesVisible} />
        <KPIBox title="Total Sales"             value={kpis?.totalSales}            icon="/icons/total_orders_amount.png"      bubble="#fff4e5" isMoney reveal={kpiValuesVisible} />
        <KPIBox title="Received Payments"       value={kpis?.receivedPayments}      icon="/icons/payment_clearance_amount.png" bubble="#e6f9eb" isMoney reveal={kpiValuesVisible} />
        <KPIBox title="Pending Payments Amount" value={kpis?.pendingAmount}         icon="/icons/pending_payments_amount.png"  bubble="#fde8e8" isMoney reveal={kpiValuesVisible} />
      </div>

      {loading ? (
        <div className="card animCard" style={{ textAlign: "center", color: "#6b7280" }}>Loading dashboard...</div>
      ) : (<>
        <TargetAchievement achieved={achievedForDonut} target={targetTotal} breakdown={fixedBreakdown} />
        {(isAccounting || !isFarm) && <DayWiseSummary days={days} />}
        <SourceWiseSummary sources={sources} />
        <ReferenceWiseSummary references={references} />

{!isFarm && !isAccounting && <AreaWiseChart areas={areas} />}

<SalesOverviewChart series={salesOverview} reveal={kpiValuesVisible} />
      </>)}
    </div>
  );
};

export default Dashboard;