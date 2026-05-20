<script>
  const examplePrompts = [
    'How many data centers are there in Illinois?',
    'Show proposed data centers in California on the map.',
    'Filter the dashboard to Texas and count operating facilities.',
    'Which operators appear most often in Virginia?',
    'Show high water stress areas on the map.',
  ];

  const datasets = [
    {
      name: 'FracTracker data center inventory',
      description: 'Point-level facility and project records used for the dots on the map and the facility detail sidebar.',
      fields: 'Includes location, status, operator, tenant, size, power, cooling, community response, and source links.',
    },
    {
      name: 'WRI water stress overlay',
      description: 'Polygon overlay used for the colored background regions in the water-stress legend.',
      fields: 'Shows baseline water stress categories such as Low, High, and Extremely High.',
    },
  ];

  let open = $state(false);

  function togglePanel() {
    open = !open;
  }

  function closePanel() {
    open = false;
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      closePanel();
    }
  }
</script>

<svelte:document onkeydown={handleKeydown} />

<div class="info-panel">
  <button
    class="info-trigger"
    type="button"
    aria-expanded={open}
    aria-haspopup="dialog"
    aria-label="Open app information"
    onclick={togglePanel}
  >
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
      <circle cx="10" cy="10" r="7.25" />
      <path stroke-linecap="round" d="M10 8.1h.01" />
      <path stroke-linecap="round" stroke-linejoin="round" d="M9.35 10h.65v3h.65" />
    </svg>
    Info
  </button>

  {#if open}
    <button
      class="backdrop"
      type="button"
      aria-label="Close information panel"
      onclick={closePanel}
    ></button>

    <section class="panel" role="dialog" aria-label="Map guide and dataset information">
      <div class="panel-header">
        <div>
          <h2>Map Guide</h2>
          <p>Quick help for prompts, controls, and datasets.</p>
        </div>
        <button class="close-btn" type="button" aria-label="Close information panel" onclick={closePanel}>
          ×
        </button>
      </div>

      <div class="panel-body">
        <section>
          <h3>Try asking</h3>
          <ul>
            {#each examplePrompts as prompt}
              <li>{prompt}</li>
            {/each}
          </ul>
        </section>

        <section>
          <h3>Datasets</h3>
          <div class="dataset-list">
            {#each datasets as dataset}
              <article>
                <h4>{dataset.name}</h4>
                <p>{dataset.description}</p>
                <p class="muted">{dataset.fields}</p>
              </article>
            {/each}
          </div>
        </section>

        <section>
          <h3>How to use the map</h3>
          <ul>
            <li>Use the search bar to find facilities by name, city, county, operator, tenant, purpose, or state.</li>
            <li>Use the status chips to show only operating, proposed, or other project states.</li>
            <li>Use the water-stress chips to turn WRI regions on and off behind the facility dots.</li>
            <li>Click any dot to open the detail sidebar, then use chat to answer dataset questions or apply filters.</li>
          </ul>
        </section>
      </div>
    </section>
  {/if}
</div>

<style>
  .info-panel {
    position: relative;
    z-index: 40;
  }

  .info-trigger {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1px solid #344055;
    border-radius: 999px;
    background: #111827;
    color: #e2e8f0;
    padding: 7px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
  }

  .info-trigger:hover {
    background: #182235;
    border-color: #4a90d9;
    transform: translateY(-1px);
  }

  .info-trigger svg {
    width: 14px;
    height: 14px;
  }

  .backdrop {
    position: fixed;
    inset: 0;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    cursor: default;
  }

  .panel {
    position: absolute;
    top: calc(100% + 10px);
    right: 0;
    width: min(420px, calc(100vw - 24px));
    max-height: min(72vh, 720px);
    overflow: auto;
    border: 1px solid #2d3748;
    border-radius: 18px;
    background:
      linear-gradient(180deg, rgba(32, 44, 68, 0.98), rgba(20, 27, 42, 0.98));
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(16px);
  }

  .panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 18px 12px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  }

  .panel-header h2 {
    font-size: 15px;
    font-weight: 700;
    color: #f8fafc;
    margin-bottom: 4px;
  }

  .panel-header p {
    font-size: 12px;
    color: #94a3b8;
  }

  .close-btn {
    border: 1px solid #344055;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.8);
    color: #cbd5e1;
    width: 30px;
    height: 30px;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
  }

  .panel-body {
    display: grid;
    gap: 18px;
    padding: 16px 18px 18px;
  }

  section h3 {
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #7dd3fc;
    margin-bottom: 10px;
  }

  ul {
    display: grid;
    gap: 8px;
    padding-left: 18px;
    color: #dbeafe;
  }

  li {
    font-size: 13px;
    line-height: 1.45;
  }

  .dataset-list {
    display: grid;
    gap: 10px;
  }

  article {
    border: 1px solid rgba(96, 165, 250, 0.15);
    border-radius: 14px;
    background: rgba(15, 23, 42, 0.55);
    padding: 12px 13px;
  }

  article h4 {
    font-size: 13px;
    font-weight: 700;
    color: #f8fafc;
    margin-bottom: 6px;
  }

  article p {
    font-size: 12px;
    line-height: 1.45;
    color: #cbd5e1;
  }

  .muted {
    margin-top: 6px;
    color: #94a3b8;
  }

  @media (max-width: 700px) {
    .panel {
      position: fixed;
      top: 68px;
      right: 12px;
      left: 12px;
      width: auto;
      max-height: calc(100vh - 88px);
    }
  }
</style>
