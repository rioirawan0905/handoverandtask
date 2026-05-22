import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

export interface HandoverTask {
  id: string;
  description: string;
  ownerName: string;
  priority: "High" | "Medium" | "Low";
  dueDate: string;
  completed: boolean;
}

interface UpcomingTasksChartProps {
  tasks: HandoverTask[];
  activeTheme: {
    id: string;
    isDark: boolean;
    cardBg: string;
    cardBorder: string;
    cardTitleText: string;
    cardSubText: string;
    mutedBg: string;
    analyticsDarkAccent?: string;
  };
  referenceDateStr?: string;
}

export const UpcomingTasksChart: React.FC<UpcomingTasksChartProps> = ({
  tasks = [],
  activeTheme,
  referenceDateStr = "2026-05-20",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 260 });
  const [hoveredDay, setHoveredDay] = useState<{
    dateStr: string;
    dayLabel: string;
    tasks: HandoverTask[];
  } | null>(null);

  // Measure container dimensions using ResizeObserver for responsive width fitting
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width } = entries[0].contentRect;
      // Maintain proper responsive scaling bounds
      setDimensions({
        width: Math.max(width, 280),
        height: 240,
      });
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Compute 7 days starting from reference date
  const getNext7Days = () => {
    const datesList = [];
    const baseDate = new Date(referenceDateStr);
    for (let i = 0; i < 7; i++) {
      const nextDate = new Date(baseDate);
      nextDate.setDate(baseDate.getDate() + i);

      const yyyy = nextDate.getFullYear();
      const mm = String(nextDate.getMonth() + 1).padStart(2, "0");
      const dd = String(nextDate.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;

      // Create human readable labels
      const formatter = new Intl.DateTimeFormat("en", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      const label = formatter.format(nextDate); // e.g. "Wed, May 20"

      datesList.push({ 
        dateStr, 
        label, 
        shortLabel: label.split(",")[0] + " " + label.split(" ")[2] 
      });
    }
    return datesList;
  };

  const dayData = getNext7Days().map((day) => {
    const dayTasks = tasks.filter(
      (t) => !t.completed && t.dueDate === day.dateStr
    );
    const high = dayTasks.filter((t) => t.priority === "High").length;
    const med = dayTasks.filter((t) => t.priority === "Medium").length;
    const low = dayTasks.filter((t) => t.priority === "Low").length;
    return {
      ...day,
      tasks: dayTasks,
      total: dayTasks.length,
      high,
      med,
      low,
    };
  });

  // Render D3 chart inside SVG
  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous layouts

    // Margins set up for elegant frameless floating aesthetics
    const margin = { top: 25, right: 10, bottom: 35, left: 25 };
    const chartWidth = dimensions.width - margin.left - margin.right;
    const chartHeight = dimensions.height - margin.top - margin.bottom;

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // X scale
    const x = d3
      .scaleBand()
      .domain(dayData.map((d) => d.shortLabel))
      .range([0, chartWidth])
      .padding(0.35);

    // Y scale
    const maxVal = d3.max(dayData, (d) => d.total) || 0;
    const yTicksMax = maxVal === 0 ? 4 : Math.ceil(maxVal) + 1;
    const y = d3
      .scaleLinear()
      .domain([0, yTicksMax])
      .range([chartHeight, 0]);

    // Grid lines for cleaner technical presentation (custom-styled ticks)
    g.append("g")
      .attr("class", "grid-lines")
      .call(
        d3
          .axisLeft(y)
          .tickSize(-chartWidth)
          .ticks(Math.min(yTicksMax, 5))
          .tickFormat(() => "")
      )
      .call((gGrid) => {
        gGrid.select(".domain").remove();
        gGrid.selectAll(".tick line")
          .attr("stroke", activeTheme.isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(15, 23, 42, 0.04)")
          .attr("stroke-width", 1)
          .attr("stroke-dasharray", "3 3");
      });

    // X Axis (clean frameless presentation)
    const xAxis = d3.axisBottom(x);
    g.append("g")
      .attr("transform", `translate(0, ${chartHeight})`)
      .call(xAxis)
      .call((gAxis) => {
        gAxis.select(".domain").remove(); // Remove solid dark line for clean style
        gAxis.selectAll(".tick line").remove(); // Hide tick spikes
        gAxis.selectAll(".tick text")
          .attr("fill", activeTheme.isDark ? "#64748b" : "#64748b")
          .attr("font-size", "9px")
          .attr("font-family", "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace")
          .attr("font-weight", "600")
          .attr("dy", "12px");
      });

    // Y Axis (clean floating ticks)
    const yAxis = d3.axisLeft(y).ticks(Math.min(yTicksMax, 5)).tickFormat(d3.format("d"));
    g.append("g")
      .call(yAxis)
      .call((gAxis) => {
        gAxis.select(".domain").remove(); // Remove boundary line
        gAxis.selectAll(".tick line").remove(); // Hide tick spikes
        gAxis.selectAll(".tick text")
          .attr("fill", activeTheme.isDark ? "#64748b" : "#64748b")
          .attr("font-size", "9px")
          .attr("font-family", "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace")
          .attr("font-weight", "600")
          .attr("dx", "-4px");
      });

    // Color definitions
    const accentColor = activeTheme.analyticsDarkAccent || "#4f46e5";

    // Rounded clipping path helper for aesthetic modern bars
    dayData.forEach((d, i) => {
      const barX = x(d.shortLabel) || 0;
      const barWidth = x.bandwidth();
      const barHeight = chartHeight - y(d.total);

      // We group rect elements to support stack color accents or a single interactive hover bar
      const barGroup = g.append("g")
        .style("cursor", "pointer")
        .on("mouseenter", function() {
          d3.select(this).select(".col-track")
            .attr("fill", activeTheme.isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.06)");
          setHoveredDay({
            dateStr: d.dateStr,
            dayLabel: d.label,
            tasks: d.tasks,
          });
        })
        .on("mouseleave", function() {
          d3.select(this).select(".col-track")
            .attr("fill", activeTheme.isDark ? "rgba(255, 255, 255, 0.015)" : "rgba(15, 23, 42, 0.015)");
          setHoveredDay(null);
        });

      // 1. Column Track Background for Vercel/Linear-like premium aesthetics
      barGroup.append("rect")
        .attr("class", "col-track")
        .attr("x", barX)
        .attr("y", 0)
        .attr("width", barWidth)
        .attr("height", chartHeight)
        .attr("rx", 5)
        .attr("fill", activeTheme.isDark ? "rgba(255, 255, 255, 0.015)" : "rgba(15, 23, 42, 0.015)")
        .style("transition", "fill 0.15s ease");

      // 2. Direct bar fill with animations
      if (barHeight > 0) {
        barGroup.append("rect")
          .attr("x", barX)
          .attr("y", chartHeight) // transition entry
          .attr("width", barWidth)
          .attr("height", 0)
          .attr("rx", 5)
          .attr("fill", d.high > 0 ? "#f43f5e" : d.med > 0 ? "#f59e0b" : accentColor)
          .attr("opacity", activeTheme.isDark ? 0.85 : 0.9)
          .transition()
          .duration(600)
          .delay(i * 30)
          .attr("y", y(d.total))
          .attr("height", barHeight);
      } else {
        // 3. Precise 3px bottom indicator track for 0-task nodes to prevent disjointed chart look
        barGroup.append("rect")
          .attr("x", barX)
          .attr("y", chartHeight - 3)
          .attr("width", barWidth)
          .attr("height", 3)
          .attr("rx", 1.5)
          .attr("fill", activeTheme.isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.06)");
      }

      // 4. Value Label above the bar
      if (d.total > 0) {
        barGroup.append("text")
          .attr("x", barX + barWidth / 2)
          .attr("y", chartHeight) // transition entry
          .attr("text-anchor", "middle")
          .attr("fill", activeTheme.isDark ? "#cbd5e1" : "#1e293b")
          .attr("font-size", "9px")
          .attr("font-weight", "600")
          .attr("font-family", "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace")
          .style("pointer-events", "none") // prevent intercepting pointer
          .transition()
          .duration(650)
          .delay(i * 30)
          .attr("y", y(d.total) - 7)
          .text(d.total);
      }
    });

  }, [dayData, dimensions, activeTheme]);

  return (
    <div
      ref={containerRef}
      className={`${activeTheme.cardBg} border ${activeTheme.cardBorder} rounded-xl p-5 shadow-xs space-y-4`}
    >
      <div className={`border-b ${activeTheme.cardBorder} pb-3 flex items-center justify-between flex-wrap gap-2`}>
        <div>
          <h4 className={`text-xs font-bold font-display uppercase tracking-wider ${activeTheme.cardTitleText} flex items-center gap-1.5`}>
            📈 7-Day Rotational Due Date Distribution
          </h4>
          <p className={`text-[10px] ${activeTheme.cardSubText} mt-0.5 leading-relaxed`}>
            Dynamic interactive visualization of shift active/backlog task load distributions due next 7 days.
          </p>
        </div>
        <div className="flex gap-3.5 font-mono text-[9px] uppercase tracking-wider font-bold">
          <span className="flex items-center gap-1 text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block"></span> Normal
          </span>
          <span className="flex items-center gap-1 text-amber-500">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] inline-block"></span> Med
          </span>
          <span className="flex items-center gap-1 text-rose-500">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block"></span> High
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
        <div className="md:col-span-2 relative flex items-center justify-center">
          <svg
            ref={svgRef}
            width={dimensions.width}
            height={dimensions.height}
            className="overflow-visible"
          />
        </div>

        {/* Real-time Interactive Tooltip Card */}
        <div className={`${activeTheme.mutedBg} border ${activeTheme.cardBorder} rounded-lg p-3.5 flex flex-col justify-between text-xs`}>
          {hoveredDay ? (
            <div className="space-y-2.5 h-full flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b pb-1.5 border-slate-500/20">
                  <span className={`font-bold ${activeTheme.cardTitleText}`}>
                    {hoveredDay.dayLabel}
                  </span>
                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    hoveredDay.tasks.length > 0 ? "bg-amber-500/20 text-amber-500" : "bg-emerald-500/20 text-emerald-500"
                  }`}>
                    {hoveredDay.tasks.length} items
                  </span>
                </div>
                {hoveredDay.tasks.length > 0 ? (
                  <div className="space-y-1.5 pt-1.5 max-h-[125px] overflow-y-auto pr-1">
                    {hoveredDay.tasks.map((t) => (
                      <div
                        key={t.id}
                        className="p-1.5 rounded bg-white/5 border border-slate-500/10 flex flex-col gap-0.5"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-[8px] font-bold px-1 rounded truncate max-w-[70px] ${
                            t.priority === "High" ? "bg-rose-500/20 text-rose-400" : t.priority === "Medium" ? "bg-amber-500/20 text-amber-400" : "bg-slate-500/20 text-slate-400"
                          }`}>
                            {t.priority}
                          </span>
                          <span className={`text-[8px] ${activeTheme.cardSubText} font-mono truncate max-w-[80px]`}>
                            {t.ownerName.split(" ")[0]}
                          </span>
                        </div>
                        <p className={`text-[10px] ${activeTheme.cardTitleText} leading-snug line-clamp-2`}>
                          {t.description}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-500">
                    <span className="text-base">✨</span>
                    <p className="text-[10px] font-mono mt-1 opacity-70">No actions due on this date</p>
                  </div>
                )}
              </div>
              <p className={`text-[9px] ${activeTheme.cardSubText} border-t pt-1 border-slate-500/10 font-mono opacity-80`}>
                Hover over days on the left to inspect dynamic on-shift rosters.
              </p>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-3 text-slate-400">
              <span className="text-lg text-indigo-500 mb-1.5 animate-pulse">📊</span>
              <p className={`font-semibold text-xs ${activeTheme.cardTitleText}`}>Interactive Inspection</p>
              <p className="text-[9px] leading-relaxed mt-1 text-slate-400/80">
                Hover over any column in the D3 chart to dynamically populate this inspector card with specific active checklists and on-shift tasks.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
