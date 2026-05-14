<script>
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import * as topojson from 'topojson-client';

  let {
    activeStatuses,
    searchQuery,
    activeBWSLabels,
    selectedCenter,
    onSelect,
    visibleCount = $bindable(0),
  } = $props();

  const STATE_NAMES = {
    AL:'alabama', AK:'alaska', AZ:'arizona', AR:'arkansas', CA:'california',
    CO:'colorado', CT:'connecticut', DE:'delaware', FL:'florida', GA:'georgia',
    HI:'hawaii', ID:'idaho', IL:'illinois', IN:'indiana', IA:'iowa', KS:'kansas',
    KY:'kentucky', LA:'louisiana', ME:'maine', MD:'maryland', MA:'massachusetts',
    MI:'michigan', MN:'minnesota', MS:'mississippi', MO:'missouri', MT:'montana',
    NE:'nebraska', NV:'nevada', NH:'new hampshire', NJ:'new jersey', NM:'new mexico',
    NY:'new york', NC:'north carolina', ND:'north dakota', OH:'ohio', OK:'oklahoma',
    OR:'oregon', PA:'pennsylvania', RI:'rhode island', SC:'south carolina',
    SD:'south dakota', TN:'tennessee', TX:'texas', UT:'utah', VT:'vermont',
    VA:'virginia', WA:'washington', WV:'west virginia', WI:'wisconsin', WY:'wyoming',
    DC:'district of columbia',
  };

  const STATUS_COLOR = {
    'Operating':                             '#48bb78',
    'Proposed':                              '#63b3ed',
    'Approved/Permitted/Under construction': '#f6ad55',
    'Expanding':                             '#9f7aea',
    'Suspended':                             '#718096',
    'Cancelled':                             '#fc8181',
    'Unknown':                               '#a0aec0',
  };

  const SEARCH_FIELDS = [
    'facility_name',
    'city',
    'operator_name',
    'tenant',
    'purpose',
    'county',
  ];

  let container;
  let allData = $state([]);
  let tooltip = $state({ visible: false, x: 0, y: 0, center: null });

  let dotsGroup = null;
  let projection = null;
  let spatialLayer = null;
  let spatialBWSGeojson = null;
  let currentZoom = 1;

  let filteredData = $derived(
    allData.filter(d => {
      // console.log(d);
      if (!activeStatuses.has(d.status)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const stateAbbrev = (d.state || '').toLowerCase();
        const stateFull = STATE_NAMES[d.state] || '';
        return (
          SEARCH_FIELDS.some(field => (d[field] || '').toLowerCase().includes(q)) ||
          stateAbbrev === q ||
          stateFull.includes(q)
        );
      }
      return true;
    })
  );

  $effect(() => {
    // Always read filteredData and selectedCenter so Svelte tracks them as deps.
    // This effect re-runs whenever filters change (even before map is ready).
    const data = filteredData;
    const sel = selectedCenter;
    visibleCount = data.length;
    if (dotsGroup && projection) {
      renderDots(data, sel);
    }
  });

  $effect(() => {
    const labels = [...activeBWSLabels];
    redrawPolygons();
  });

  onMount(async () => {
    const [csvText, usAtlas, spatialGeojson] = await Promise.all([
      fetch('/data_centers.csv').then(r => r.text()),
      fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json').then(r => r.json()),
      fetch('/wri_usa.geojson').then(r => r.json()),
    ]);

    buildMap(usAtlas, spatialGeojson);

    allData = d3.csvParse(csvText).filter(d => {
      const lat = parseFloat(d.lat);
      const lon = parseFloat(d.long);
      return !isNaN(lat) && !isNaN(lon) && lat > 18 && lat < 72 && lon > -170 && lon < -60;
    }).map(d => ({
      ...d,
      lat: parseFloat(d.lat),
      lon: parseFloat(d.long),
    }));
  });

  function dotRadius(d) {
    switch (d.sizerank) {
      case 'Mega campus (>1,000 MW)':  return 7;
      case 'Hyperscale (100-999 MW)':
      case 'Hyperscale (101-999 MW)':  return 5;
      case 'Large (51-99 MW)':         return 4;
      case 'Medium (11-50 MW)':        return 3;
      case 'Small (0-10 MW)':          return 2.5;
      default:                         return 3;
    }
  }

  function buildMap(usAtlas, spatialGeojson) {
    const W = container.clientWidth;
    const H = container.clientHeight;
    spatialBWSGeojson = spatialGeojson;

    projection = d3.geoAlbersUsa()
      .translate([W / 2, H / 2])
      .scale(W * 1.05);

    const path = d3.geoPath().projection(projection);

    const svg = d3.select(container)
      .append('svg')
      .attr('width', W)
      .attr('height', H)
      .style('display', 'block');

    const g = svg.append('g');

    svg.call(
      d3.zoom()
        .scaleExtent([1, 20])
        .on('zoom', e => {
          g.attr('transform', e.transform);
          currentZoom = e.transform.k;
          g.selectAll('circle.dc-dot')
            .attr('r', d => dotRadius(d) / Math.sqrt(currentZoom));
        })
    );

    // State fills
    g.append('g')
      .selectAll('path')
      .data(topojson.feature(usAtlas, usAtlas.objects.states).features)
      .join('path')
      .attr('d', path)
      .attr('fill', '#1e2535')
      .attr('stroke', '#2d3748')
      .attr('stroke-width', 0.5);

    // Spatial polygons
    spatialLayer = g.append('g')
      .attr('class', 'spatial-layer');
    redrawPolygons();
    
    // State borders
    g.append('path')
      .datum(topojson.mesh(usAtlas, usAtlas.objects.states, (a, b) => a !== b))
      .attr('d', path)
      .attr('fill', 'none')
      .attr('stroke', '#4a5568')
      .attr('stroke-width', 0.3);

    dotsGroup = g.append('g').attr('class', 'dots-group');
  }

  function renderDots(data, selected) {
    const joined = dotsGroup
      .selectAll('circle.dc-dot')
      .data(data, d => d.facility_name + '|' + d.lat + '|' + d.lon);

    joined.exit().remove();

    joined.enter()
      .append('circle')
      .attr('class', 'dc-dot')
      .style('cursor', 'pointer')
      .merge(joined)
      .attr('cx', d => {
        const p = projection([d.lon, d.lat]);
        return p ? p[0] : -9999;
      })
      .attr('cy', d => {
        const p = projection([d.lon, d.lat]);
        return p ? p[1] : -9999;
      })
      .attr('r', d => dotRadius(d) / Math.sqrt(currentZoom))
      .attr('fill', d => STATUS_COLOR[d.status] || '#a0aec0')
      .attr('opacity', d => selected && selected !== d ? 0.4 : 0.85)
      .attr('stroke', d => selected === d ? '#fff' : 'rgba(0,0,0,0.3)')
      .attr('stroke-width', d => selected === d ? 1.5 : 0.5)
      .on('mouseenter', (event, d) => {
        tooltip = { visible: true, center: d, x: event.clientX + 14, y: event.clientY - 10 };
        d3.select(event.currentTarget).raise()
          .attr('opacity', 1).attr('stroke', '#fff').attr('stroke-width', 1.5);
      })
      .on('mousemove', event => {
        tooltip = { ...tooltip, x: event.clientX + 14, y: event.clientY - 10 };
      })
      .on('mouseleave', (event, d) => {
        tooltip = { ...tooltip, visible: false };
        d3.select(event.currentTarget)
          .attr('opacity', selected && selected !== d ? 0.4 : 0.85)
          .attr('stroke', selected === d ? '#fff' : 'rgba(0,0,0,0.3)')
          .attr('stroke-width', selected === d ? 1.5 : 0.5);
      })
      .on('click', (event, d) => {
        event.stopPropagation();
        onSelect(d);
      });
  }

  function redrawPolygons() {
    if (!spatialLayer || !spatialBWSGeojson) return;

    const filtered = spatialBWSGeojson.features.filter(d =>
      activeBWSLabels.has(d.properties.bws_label)
    );

    const path = d3.geoPath().projection(projection);

    const polygons = spatialLayer
      .selectAll('path')
      .data(filtered, d => d.properties.id || d.properties.bws_label);

    polygons.exit().remove();

    const enter = polygons.enter()
      .append('path')
      .attr('d', path)
      .attr('opacity', 0.5)
      .attr('stroke', 'none');

    enter
      .merge(polygons)
      .attr('d', path)
      .attr('fill', d => {
        const label = d.properties.bws_label;

        if (label === 'Low (<10%)') return '#edd09f';
        if (label === 'Low - Medium (10-20%)') return '#edaa4c';
        if (label === 'Medium - High (20-40%)') return '#bd5826';
        if (label === 'High (40-80%)') return '#e31414';
        if (label === 'Extremely High (>80%)') return '#610606';

        return '#718096';
      })
      .attr('opacity', 0.5)
      .on('mouseenter', (event, d) => {

        d3.select(event.currentTarget)
          .raise()
          .attr('opacity', 0.8)
          .attr('stroke', '#ffffff')
          .attr('stroke-width', 0.8);

        tooltip = {
          visible: true,
          polygon: {
            bws_label: d.properties.bws_label,
            bws_score: d.properties.bws_score.toFixed(2)
          },
          x: event.clientX + 14,
          y: event.clientY - 10
        };
      })
      .on('mousemove', event => {
        tooltip = {
          ...tooltip,
          x: event.clientX + 14,
          y: event.clientY - 10
        };
      })

      .on('mouseleave', (event) => {
        d3.select(event.currentTarget)
          .attr('opacity', 0.5)
          .attr('stroke', 'none');

        tooltip = { ...tooltip, visible: false };
      });
  }

</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="map-container" bind:this={container} onclick={() => onSelect(null)}></div>

{#if tooltip.visible}

  <!-- Data center tooltip -->
  {#if tooltip.center}
    <div class="tooltip" style="left:{tooltip.x}px;top:{tooltip.y}px">
      <div class="tt-name">{tooltip.center.facility_name || 'Unknown'}</div>
      <div class="tt-loc">{[tooltip.center.city, tooltip.center.state].filter(Boolean).join(', ')}</div>
      <div class="tt-status" style="color:{STATUS_COLOR[tooltip.center.status] || '#a0aec0'}">
        {tooltip.center.status}
      </div>
      {#if tooltip.center.mw && tooltip.center.mw !== 'Unknown'}
        <div class="tt-mw">{tooltip.center.mw} MW</div>
      {/if}
    </div>
  {/if}

  <!-- Polygon tooltip -->
  {#if tooltip.polygon}
    <div class="tooltip" style="left:{tooltip.x}px;top:{tooltip.y}px">
      <div class="tt-name">
        Baseline Annual Water Stress
      </div>

      <div class="tt-status">
        {tooltip.polygon.bws_label}
      </div>

      <div class="tt-mw">
        Score: {tooltip.polygon.bws_score}
      </div>
    </div>
  {/if}

{/if}

<style>
  .map-container {
    flex: 1;
    width: 100%;
    height: 100%;
    background: #0f1117;
    position: relative;
  }

  .map-container :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }

  .tooltip {
    position: fixed;
    background: #1a1f2e;
    border: 1px solid #2d3748;
    border-radius: 6px;
    padding: 8px 10px;
    pointer-events: none;
    z-index: 200;
    min-width: 140px;
    max-width: 220px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  }

  .tt-name {
    font-size: 13px;
    font-weight: 600;
    color: #e2e8f0;
    margin-bottom: 2px;
    line-height: 1.3;
  }

  .tt-loc {
    font-size: 12px;
    color: #a0aec0;
    margin-bottom: 3px;
  }

  .tt-status {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 2px;
  }

  .tt-mw {
    font-size: 11px;
    color: #718096;
  }
</style>
