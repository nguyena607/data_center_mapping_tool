<script>
  import { onMount } from 'svelte';
  import * as d3 from 'd3';

  const BWS_CONFIG = [
    { key: 'Low (<10%)', label: 'Low', color: '#f2d65a' },
    { key: 'Low - Medium (10-20%)', label: 'Low-Med', color: '#edaa4c' },
    { key: 'Medium - High (20-40%)', label: 'Med-High', color: '#bd5826' },
    { key: 'High (40-80%)', label: 'High', color: '#e31414' },
    { key: 'Extremely High (>80%)', label: 'Extreme', color: '#610606' },
    { key: 'Arid and Low Water Use', label: 'Arid', color: '#718096' },
  ];

  const STATUS_CONFIG = [
    { key: 'Operating', label: 'Operating' },
    { key: 'Proposed', label: 'Proposed' },
  ];

  const SUPPORTED_LABELS = new Set(BWS_CONFIG.map((bucket) => bucket.key));
  const VIEW_CONFIG = [
    { key: 'snapshot', label: 'Snapshot' },
    { key: 'states', label: 'States' },
  ];
  const TOP_STATE_LIMIT = 15;

  let cardEl;
  let loading = $state(true);
  let error = $state('');
  let summary = $state([]);
  let stateMatrix = $state([]);
  let matchedRows = $state(0);
  let totalRows = $state(0);
  let maxStateBucketCount = $state(0);
  let collapsed = $state(false);
  let activeView = $state('snapshot');
  let tooltip = $state({
    visible: false,
    x: 0,
    y: 0,
    title: '',
    subtitle: '',
    meta: '',
  });

  onMount(async () => {
    try {
      const csvText = await fetch('/data_centers_with_derived_columns.csv').then((response) => response.text());
      const rows = d3.csvParse(csvText);
      const matched = rows.filter((row) => SUPPORTED_LABELS.has(row.bws_label));

      totalRows = rows.length;
      matchedRows = matched.length;

      summary = STATUS_CONFIG.map((status) => {
        const statusRows = matched.filter((row) => row.status === status.key);
        const total = statusRows.length;

        return {
          ...status,
          total,
          segments: BWS_CONFIG.map((bucket) => {
            const count = statusRows.filter((row) => row.bws_label === bucket.key).length;
            return {
              ...bucket,
              count,
              percent: total ? (count / total) * 100 : 0,
            };
          }),
        };
      });

      const stateCounts = new Map();

      for (const row of matched) {
        const state = row.state?.trim();
        if (!state) continue;

        if (!stateCounts.has(state)) {
          stateCounts.set(state, {
            state,
            total: 0,
            buckets: Object.fromEntries(BWS_CONFIG.map((bucket) => [bucket.key, 0])),
          });
        }

        const entry = stateCounts.get(state);
        entry.total += 1;
        entry.buckets[row.bws_label] += 1;
      }

      const rankedStates = [...stateCounts.values()]
        .sort((a, b) => b.total - a.total || a.state.localeCompare(b.state))
        .slice(0, TOP_STATE_LIMIT);

      maxStateBucketCount = Math.max(
        0,
        ...rankedStates.flatMap((row) => BWS_CONFIG.map((bucket) => row.buckets[bucket.key])),
      );

      stateMatrix = rankedStates.map((row) => ({
        state: row.state,
        total: row.total,
        buckets: BWS_CONFIG.map((bucket) => ({
          ...bucket,
          count: row.buckets[bucket.key],
          percentOfState: row.total ? (row.buckets[bucket.key] / row.total) * 100 : 0,
        })),
      }));
    } catch (err) {
      error = err?.message || 'Unable to load water stress summary.';
    } finally {
      loading = false;
    }
  });

  function formatPercent(value) {
    if (!Number.isFinite(value)) return '0%';
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}%`;
  }

  function bubbleDiameter(count) {
    if (!count || !maxStateBucketCount) return 0;

    const min = 8;
    const max = 28;
    const ratio = Math.sqrt(count / maxStateBucketCount);
    return min + ratio * (max - min);
  }

  function setTooltipPosition(clientX, clientY) {
    if (!cardEl) return;

    const rect = cardEl.getBoundingClientRect();
    const width = 190;
    const height = 84;
    const padding = 14;

    let x = clientX - rect.left + 12;
    let y = clientY - rect.top + 12;

    if (x + width > rect.width - padding) {
      x = rect.width - width - padding;
    }

    if (y + height > rect.height - padding) {
      y = rect.height - height - padding;
    }

    tooltip = {
      ...tooltip,
      x: Math.max(padding, x),
      y: Math.max(padding, y),
    };
  }

  function showTooltipFromEvent(event, payload) {
    tooltip = {
      visible: true,
      x: 0,
      y: 0,
      title: payload.title,
      subtitle: payload.subtitle || '',
      meta: payload.meta || '',
    };

    if (event?.clientX !== undefined && event?.clientY !== undefined) {
      setTooltipPosition(event.clientX, event.clientY);
      return;
    }

    const rect = event?.currentTarget?.getBoundingClientRect?.();
    if (!rect) return;

    setTooltipPosition(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function moveTooltip(event) {
    if (!tooltip.visible) return;
    if (event?.clientX === undefined || event?.clientY === undefined) return;
    setTooltipPosition(event.clientX, event.clientY);
  }

  function hideTooltip() {
    tooltip = {
      visible: false,
      x: 0,
      y: 0,
      title: '',
      subtitle: '',
      meta: '',
    };
  }
</script>

<section class="summary-card" bind:this={cardEl} aria-label="Water stress summary">
  <div class="card-header">
    <div>
      <h2>Water Stress Snapshot</h2>
      <p>Facility patterns across WRI water-stress categories.</p>
    </div>

    <button
      class="collapse-btn"
      type="button"
      aria-expanded={!collapsed}
      aria-label={collapsed ? 'Expand water stress snapshot' : 'Collapse water stress snapshot'}
      onclick={() => collapsed = !collapsed}
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d={collapsed ? 'M6 8l4 4 4-4' : 'M6 12l4-4 4 4'}
        />
      </svg>
    </button>
  </div>

  {#if !collapsed}
    <div class="tabs" role="tablist" aria-label="Water stress analysis views">
      {#each VIEW_CONFIG as view}
        <button
          type="button"
          class="tab"
          class:active={activeView === view.key}
          aria-pressed={activeView === view.key}
          onclick={() => activeView = view.key}
        >
          {view.label}
        </button>
      {/each}
    </div>

    {#if loading}
      <p class="status">Loading summary…</p>
    {:else if error}
      <p class="status">{error}</p>
    {:else if activeView === 'snapshot'}
      <div class="rows">
        {#each summary as row}
          <div class="summary-row">
            <div class="row-meta">
              <span class="row-label">{row.label}</span>
              <span class="row-total">{row.total} matched facilities</span>
            </div>

            <div class="bar" aria-label={`${row.label} water stress distribution`}>
              {#each row.segments as segment}
                {#if segment.count > 0}
                  <button
                    type="button"
                    class="segment"
                    style={`width:${segment.percent}%;background:${segment.color}`}
                    aria-label={`${row.label}, ${segment.label}, ${segment.count} facilities, ${formatPercent(segment.percent)}`}
                    onmouseenter={(event) => showTooltipFromEvent(event, {
                      title: `${row.label} · ${segment.label}`,
                      subtitle: `${segment.count} facilities`,
                      meta: `${formatPercent(segment.percent)} of ${row.label.toLowerCase()} matched facilities`,
                    })}
                    onmousemove={moveTooltip}
                    onmouseleave={hideTooltip}
                    onfocus={(event) => showTooltipFromEvent(event, {
                      title: `${row.label} · ${segment.label}`,
                      subtitle: `${segment.count} facilities`,
                      meta: `${formatPercent(segment.percent)} of ${row.label.toLowerCase()} matched facilities`,
                    })}
                    onblur={hideTooltip}
                  ></button>
                {/if}
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <div class="legend">
        {#each BWS_CONFIG as bucket}
          <div class="legend-item">
            <span class="swatch" style={`background:${bucket.color}`}></span>
            <span>{bucket.label}</span>
          </div>
        {/each}
      </div>

      <p class="footnote">
        Hover any bar segment for share and count. Based on {matchedRows} of {totalRows} facilities with matched WRI polygons.
      </p>
    {:else}
      <div class="states-view">
        <div class="states-meta">
          <p>Top {TOP_STATE_LIMIT} states ranked by matched facilities.</p>
          <p>Bubble size shows facility count in each water-stress bucket.</p>
        </div>

        <div class="matrix">
          <div class="corner-cell">State</div>
          {#each BWS_CONFIG as bucket}
            <div class="matrix-header-cell" title={bucket.key}>{bucket.label}</div>
          {/each}

          {#each stateMatrix as row}
            <div class="state-label-cell">
              <span>{row.state}</span>
              <span class="state-total-badge">{row.total}</span>
            </div>

            {#each row.buckets as bucket}
              <div class="matrix-cell">
                {#if bucket.count > 0}
                  <button
                    type="button"
                    class="bubble"
                    style={`width:${bubbleDiameter(bucket.count)}px;height:${bubbleDiameter(bucket.count)}px;background:${bucket.color}`}
                    aria-label={`${row.state}, ${bucket.label}, ${bucket.count} facilities, ${formatPercent(bucket.percentOfState)} of state total`}
                    onmouseenter={(event) => showTooltipFromEvent(event, {
                      title: `${row.state} · ${bucket.label}`,
                      subtitle: `${bucket.count} facilities`,
                      meta: `${formatPercent(bucket.percentOfState)} of ${row.state} matched facilities`,
                    })}
                    onmousemove={moveTooltip}
                    onmouseleave={hideTooltip}
                    onfocus={(event) => showTooltipFromEvent(event, {
                      title: `${row.state} · ${bucket.label}`,
                      subtitle: `${bucket.count} facilities`,
                      meta: `${formatPercent(bucket.percentOfState)} of ${row.state} matched facilities`,
                    })}
                    onblur={hideTooltip}
                  ></button>
                {/if}
              </div>
            {/each}
          {/each}
        </div>

        <div class="legend compact">
          {#each BWS_CONFIG as bucket}
            <div class="legend-item">
              <span class="swatch" style={`background:${bucket.color}`}></span>
              <span>{bucket.label}</span>
            </div>
          {/each}
        </div>

        <p class="footnote">
          States are ranked by total matched facilities across all statuses. Hover any bubble for bucket share and count.
        </p>
      </div>
    {/if}
  {/if}

  {#if tooltip.visible}
    <div class="tooltip" style={`left:${tooltip.x}px;top:${tooltip.y}px`}>
      <div class="tooltip-title">{tooltip.title}</div>
      {#if tooltip.subtitle}
        <div class="tooltip-subtitle">{tooltip.subtitle}</div>
      {/if}
      {#if tooltip.meta}
        <div class="tooltip-meta">{tooltip.meta}</div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .summary-card {
    position: absolute;
    left: 16px;
    bottom: 16px;
    width: min(480px, calc(100% - 32px));
    max-height: min(72vh, 760px);
    overflow: auto;
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 16px;
    background: rgba(15, 23, 42, 0.9);
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.32);
    backdrop-filter: blur(14px);
    padding: 14px 14px 12px;
    z-index: 6;
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .card-header h2 {
    color: #f8fafc;
    font-size: 14px;
    font-weight: 700;
    margin-bottom: 3px;
  }

  .card-header p,
  .status,
  .footnote,
  .states-meta p {
    color: #94a3b8;
    font-size: 11px;
    line-height: 1.4;
  }

  .collapse-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 999px;
    background: rgba(30, 41, 59, 0.8);
    color: #cbd5e1;
    cursor: pointer;
    flex-shrink: 0;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .collapse-btn:hover {
    border-color: rgba(125, 211, 252, 0.55);
    background: rgba(37, 51, 73, 0.95);
  }

  .collapse-btn svg {
    width: 16px;
    height: 16px;
  }

  .tabs {
    display: inline-flex;
    gap: 6px;
    margin-top: 14px;
    padding: 4px;
    border-radius: 999px;
    background: rgba(30, 41, 59, 0.9);
  }

  .tab {
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: #94a3b8;
    cursor: pointer;
    font-size: 11px;
    font-weight: 700;
    padding: 6px 10px;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .tab.active {
    background: rgba(59, 130, 246, 0.2);
    color: #dbeafe;
  }

  .rows,
  .states-view {
    margin-top: 14px;
  }

  .rows {
    display: grid;
    gap: 12px;
  }

  .summary-row {
    display: grid;
    gap: 6px;
  }

  .row-meta {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }

  .row-label {
    color: #e2e8f0;
    font-size: 12px;
    font-weight: 700;
  }

  .row-total {
    color: #94a3b8;
    font-size: 11px;
  }

  .bar {
    display: flex;
    width: 100%;
    height: 18px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(51, 65, 85, 0.72);
  }

  .segment {
    height: 100%;
    border: 0;
    padding: 0;
    margin: 0;
    cursor: pointer;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 10px;
    margin-top: 14px;
  }

  .legend.compact {
    margin-top: 12px;
  }

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #cbd5e1;
    font-size: 11px;
  }

  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    flex-shrink: 0;
  }

  .footnote {
    margin-top: 12px;
  }

  .states-meta {
    display: grid;
    gap: 2px;
  }

  .matrix {
    display: grid;
    grid-template-columns: 92px repeat(6, 1fr);
    gap: 8px 6px;
    align-items: center;
    margin-top: 12px;
  }

  .corner-cell,
  .matrix-header-cell {
    color: #94a3b8;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .matrix-header-cell {
    text-align: center;
  }

  .state-label-cell {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
    color: #e2e8f0;
    font-size: 12px;
    font-weight: 600;
  }

  .state-total-badge {
    color: #94a3b8;
    font-size: 10px;
    font-weight: 700;
  }

  .matrix-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 34px;
  }

  .bubble {
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 999px;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
  }

  .bubble:hover,
  .segment:hover,
  .bubble:focus-visible,
  .segment:focus-visible,
  .tab:focus-visible,
  .collapse-btn:focus-visible {
    outline: 2px solid rgba(125, 211, 252, 0.75);
    outline-offset: 2px;
  }

  .tooltip {
    position: absolute;
    width: 190px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 12px;
    background: rgba(15, 23, 42, 0.98);
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.32);
    padding: 10px 11px;
    pointer-events: none;
    z-index: 8;
  }

  .tooltip-title {
    color: #f8fafc;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.35;
  }

  .tooltip-subtitle {
    color: #dbeafe;
    font-size: 11px;
    margin-top: 4px;
  }

  .tooltip-meta {
    color: #94a3b8;
    font-size: 11px;
    line-height: 1.35;
    margin-top: 4px;
  }

  @media (max-width: 700px) {
    .summary-card {
      left: 12px;
      right: 12px;
      bottom: 12px;
      width: auto;
      max-height: calc(100vh - 120px);
    }

    .matrix {
      grid-template-columns: 80px repeat(6, minmax(32px, 1fr));
    }

    .matrix-header-cell,
    .corner-cell,
    .state-total-badge {
      font-size: 9px;
    }
  }
</style>
