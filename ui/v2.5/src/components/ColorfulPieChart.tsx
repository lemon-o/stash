import React, { useMemo, useState } from "react";
import { useHistory } from "react-router-dom";
import { Icon } from "src/components/Shared/Icon";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";

export interface PieSegment {
  id: string;
  label: string;
  value: number;
  formattedValue?: string;
  color: string;
  gradientEnd?: string;
  link?: string;
  icon?: IconDefinition;
}

export interface ColorfulPieChartProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: IconDefinition;
  segments: PieSegment[];
  totalLabel?: string;
  formattedTotal?: string;
  centerSubtext?: string;
  emptyText?: string;
  className?: string;
}

function getSlicePath(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  const angleDiff = endAngle - startAngle;
  if (angleDiff >= 359.99) {
    return `M ${cx} ${cy - outerRadius} A ${outerRadius} ${outerRadius} 0 1 1 ${cx} ${cy + outerRadius} A ${outerRadius} ${outerRadius} 0 1 1 ${cx} ${cy - outerRadius} M ${cx} ${cy - innerRadius} A ${innerRadius} ${innerRadius} 0 1 0 ${cx} ${cy + innerRadius} A ${innerRadius} ${innerRadius} 0 1 0 ${cx} ${cy - innerRadius} Z`.trim();
  }

  const radStart = ((startAngle - 90) * Math.PI) / 180;
  const radEnd = ((endAngle - 90) * Math.PI) / 180;

  const x1 = cx + outerRadius * Math.cos(radStart);
  const y1 = cy + outerRadius * Math.sin(radStart);
  const x2 = cx + outerRadius * Math.cos(radEnd);
  const y2 = cy + outerRadius * Math.sin(radEnd);

  const x3 = cx + innerRadius * Math.cos(radEnd);
  const y3 = cy + innerRadius * Math.sin(radEnd);
  const x4 = cx + innerRadius * Math.cos(radStart);
  const y4 = cy + innerRadius * Math.sin(radStart);

  const largeArc = angleDiff > 180 ? 1 : 0;

  return `M ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`;
}

function getSliceOffset(
  startAngle: number,
  endAngle: number,
  distance: number = 6
): { dx: number; dy: number } {
  const angleDiff = endAngle - startAngle;
  if (angleDiff >= 359.99) {
    return { dx: 0, dy: 0 };
  }
  const midAngle = (startAngle + endAngle) / 2;
  const radMid = ((midAngle - 90) * Math.PI) / 180;
  return {
    dx: distance * Math.cos(radMid),
    dy: distance * Math.sin(radMid),
  };
}

export const ColorfulPieChart: React.FC<ColorfulPieChartProps> = ({
  title,
  subtitle,
  icon,
  segments,
  totalLabel = "总计",
  formattedTotal,
  centerSubtext,
  emptyText = "暂无数据",
  className = "",
}) => {
  const history = useHistory();
  const chartUid = useMemo(
    () => "chart-" + Math.random().toString(36).substring(2, 9),
    []
  );
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const totalValue = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);

  // Compute angles for non-zero segments
  const nonZeroSegments = segments.filter((s) => s.value > 0);
  let currentAngle = 0;
  const sliceAngles = new Map<
    string,
    { startAngle: number; endAngle: number; pct: number }
  >();

  if (totalValue > 0) {
    nonZeroSegments.forEach((seg) => {
      const pct = (seg.value / totalValue) * 100;
      const span = (seg.value / totalValue) * 360;
      const start = currentAngle;
      const end = currentAngle + span;
      sliceAngles.set(seg.id, {
        startAngle: start,
        endAngle: end,
        pct,
      });
      currentAngle += span;
    });
  }

  const activeSegment = hoveredId
    ? segments.find((s) => s.id === hoveredId)
    : null;
  const activePct =
    activeSegment && totalValue > 0
      ? ((activeSegment.value / totalValue) * 100).toFixed(1)
      : null;

  const handleNavigate = (link?: string) => {
    if (link) {
      history.push(link);
    }
  };

  const cx = 120;
  const cy = 120;
  const outerR = 94;
  const innerR = 58;

  return (
    <div className={`stats-pie-card ${className}`}>
      <div className="stats-pie-header">
        <div className="stats-pie-title-wrap">
          {icon && (
            <span className="stats-pie-icon">
              <Icon icon={icon} />
            </span>
          )}
          <div>
            <h4 className="stats-pie-title">{title}</h4>
            {subtitle && <p className="stats-pie-subtitle">{subtitle}</p>}
          </div>
        </div>
      </div>

      <div className="stats-pie-body">
        {/* SVG Donut */}
        <div className="stats-pie-donut-wrapper">
          <svg
            className="stats-pie-svg"
            viewBox="0 0 240 240"
            role="img"
            aria-label={typeof title === "string" ? title : "Pie Chart"}
          >
            <defs>
              {segments.map((seg, idx) => (
                <linearGradient
                  key={seg.id}
                  id={`grad-${chartUid}-${idx}`}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor={seg.color} />
                  <stop
                    offset="100%"
                    stopColor={seg.gradientEnd || seg.color}
                  />
                </linearGradient>
              ))}
              <filter
                id={`glow-${chartUid}`}
                x="-20%"
                y="-20%"
                width="140%"
                height="140%"
              >
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {totalValue === 0 ? (
              <path
                d={getSlicePath(cx, cy, outerR, innerR, 0, 360)}
                fill="none"
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth="2"
                strokeDasharray="6 4"
              />
            ) : (
              nonZeroSegments.map((seg, idx) => {
                const angleData = sliceAngles.get(seg.id);
                if (!angleData) return null;

                const { startAngle, endAngle } = angleData;
                const pathData = getSlicePath(
                  cx,
                  cy,
                  outerR,
                  innerR,
                  startAngle,
                  endAngle
                );
                const isHovered = hoveredId === seg.id;
                const isOtherHovered = hoveredId !== null && !isHovered;
                const { dx, dy } = getSliceOffset(startAngle, endAngle, 6);

                return (
                  <path
                    key={seg.id}
                    d={pathData}
                    fill={`url(#grad-${chartUid}-${idx})`}
                    stroke="rgba(18, 18, 22, 0.95)"
                    strokeWidth="2"
                    className="stats-pie-slice"
                    style={{
                      transform: isHovered
                        ? `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`
                        : "none",
                      filter: isHovered ? `url(#glow-${chartUid})` : "none",
                      opacity: isOtherHovered ? 0.45 : 1,
                      cursor: seg.link ? "pointer" : "default",
                    }}
                    onMouseEnter={() => setHoveredId(seg.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => handleNavigate(seg.link)}
                  />
                );
              })
            )}
          </svg>

          {/* Center Content Overlay */}
          <div className="stats-pie-center-overlay">
            {activeSegment ? (
              <>
                <span className="stats-pie-center-label">
                  {activeSegment.label}
                </span>
                <span
                  className="stats-pie-center-big"
                  style={{ color: activeSegment.color }}
                >
                  {activePct}%
                </span>
                <span className="stats-pie-center-sub">
                  {activeSegment.formattedValue ||
                    activeSegment.value.toLocaleString()}
                </span>
              </>
            ) : totalValue === 0 ? (
              <>
                <span className="stats-pie-center-label">{totalLabel}</span>
                <span className="stats-pie-center-big">0</span>
                <span className="stats-pie-center-sub">{emptyText}</span>
              </>
            ) : (
              <>
                <span className="stats-pie-center-label">{totalLabel}</span>
                <span className="stats-pie-center-big">
                  {formattedTotal || totalValue.toLocaleString()}
                </span>
                {centerSubtext && (
                  <span className="stats-pie-center-sub">{centerSubtext}</span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Legend List */}
        <div className="stats-pie-legend">
          {segments.map((seg) => {
            const isHovered = hoveredId === seg.id;
            const pct =
              totalValue > 0
                ? ((Math.max(0, seg.value) / totalValue) * 100).toFixed(1)
                : "0.0";

            return (
              <div
                key={seg.id}
                className={`stats-pie-legend-row ${isHovered ? "active" : ""} ${
                  seg.link ? "clickable" : ""
                }`}
                onMouseEnter={() => setHoveredId(seg.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => handleNavigate(seg.link)}
              >
                <div className="stats-pie-legend-left">
                  <span
                    className="stats-pie-legend-dot"
                    style={{
                      backgroundColor: seg.color,
                      boxShadow: isHovered ? `0 0 8px ${seg.color}` : "none",
                    }}
                  />
                  {seg.icon && (
                    <span className="stats-pie-legend-icon">
                      <Icon icon={seg.icon} />
                    </span>
                  )}
                  <span className="stats-pie-legend-label">{seg.label}</span>
                </div>

                <div className="stats-pie-legend-right">
                  <span className="stats-pie-legend-value">
                    {seg.formattedValue || seg.value.toLocaleString()}
                  </span>
                  <span
                    className="stats-pie-legend-badge"
                    style={{
                      color: seg.color,
                      backgroundColor: `${seg.color}20`,
                      borderColor: `${seg.color}40`,
                    }}
                  >
                    {pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ColorfulPieChart;
