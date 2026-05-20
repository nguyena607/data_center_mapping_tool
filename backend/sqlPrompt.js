const COLUMN_DESCRIPTIONS = {
  facility_name: 'Data center or project name. High-cardinality text.',
  address: 'Street address or site description. High-cardinality text.',
  city: 'City or locality. High-cardinality text.',
  state: 'Two-letter US state abbreviation, such as IL or VA.',
  zip: 'ZIP code as text.',
  county: 'County name. High-cardinality text.',
  lat: 'Latitude as numeric-looking text.',
  long: 'Longitude as numeric-looking text.',
  status: 'Project status. Categorical text.',
  location_confidence: 'Confidence in mapped location. Categorical text.',
  purpose: 'Reported purpose, such as AI, cloud, or crypto. Categorical/free text.',
  operator_name: 'Company or organization operating/developing the facility. High-cardinality text.',
  tenant: 'Known tenant or customer. Categorical/free text.',
  mw: 'Power capacity in megawatts, stored as messy numeric-looking text.',
  sizerank: 'Size category. Categorical text.',
  power_source: 'Reported power source. Categorical/free text.',
  dedicated_power_plant: 'Dedicated power plant notes. Free text.',
  number_of_generators: 'Generator count or notes. Numeric-looking/free text.',
  number_of_buildings: 'Building count or notes. Numeric-looking/free text.',
  cooling_source: 'Cooling source. Categorical text.',
  cooling_type: 'Cooling technology/type. Categorical text.',
  facility_size_sqft: 'Facility size in square feet, stored as messy numeric-looking text.',
  property_size_acres: 'Property size in acres, stored as messy numeric-looking text.',
  project_cost: 'Reported project cost. Money-like text.',
  expected_date_online: 'Expected online date or year. Date-like text.',
  community_pushback: 'Known community pushback. Blank means unknown, not necessarily no.',
  advocacy_information: 'Community advocacy notes. Free text.',
  resistance_status: 'Community resistance status. Categorical text.',
  nda: 'NDA or secrecy notes. Free text.',
  community_group_website_1: 'Community group website URL.',
  community_group_website_2: 'Second community group website URL.',
  petition_url: 'Petition URL.',
  other_info: 'Additional notes. Free text.',
  information_source: 'Broad source type. Categorical text.',
  info_source_1: 'Source URL or citation.',
  info_source_2: 'Source URL or citation.',
  info_source_3: 'Source URL or citation.',
  info_source_4: 'Source URL or citation.',
  info_source_5: 'Source URL or citation.',
  info_source_6: 'Source URL or citation.',
  info_source_7: 'Source URL or citation.',
  info_source_8: 'Source URL or citation.',
  date_created: 'Record creation date. Date-like text.',
  date_updated: 'Record update date. Date-like text.',
};

const DERIVED_COLUMN_DESCRIPTIONS = {
  lat_num: 'Parsed numeric latitude derived from lat. Use for coordinate comparisons.',
  long_num: 'Parsed numeric longitude derived from long. Use for coordinate comparisons.',
  mw_min: 'Parsed minimum megawatts derived from mw. Use for numeric MW filters and sorting.',
  mw_max: 'Parsed maximum megawatts derived from mw. Use for numeric MW filters and sorting.',
  facility_size_sqft_num: 'Parsed square footage derived from facility_size_sqft. Use for numeric size filters and sorting.',
  property_size_acres_num: 'Parsed acres derived from property_size_acres. Use for numeric land-size filters and sorting.',
  project_cost_min: 'Parsed minimum project cost in dollars derived from project_cost. Use for numeric cost filters and sorting.',
  project_cost_max: 'Parsed maximum project cost in dollars derived from project_cost. Use for numeric cost filters and sorting.',
  expected_year_min: 'Parsed earliest expected online year derived from expected_date_online.',
  expected_year_max: 'Parsed latest expected online year derived from expected_date_online.',
  date_created_iso: 'Parsed ISO date derived from date_created, formatted YYYY-MM-DD.',
  date_updated_iso: 'Parsed ISO date derived from date_updated, formatted YYYY-MM-DD.',
  number_of_buildings_min: 'Parsed minimum building count derived from number_of_buildings. Sparse and approximate.',
  number_of_buildings_max: 'Parsed maximum building count derived from number_of_buildings. Sparse and approximate.',
};

const STATE_GUIDE = `
State names should be converted to two-letter abbreviations:
Alabama AL, Alaska AK, Arizona AZ, Arkansas AR, California CA, Colorado CO,
Connecticut CT, Delaware DE, Florida FL, Georgia GA, Idaho ID, Illinois IL,
Indiana IN, Iowa IA, Kansas KS, Kentucky KY, Louisiana LA, Maine ME,
Maryland MD, Massachusetts MA, Michigan MI, Minnesota MN, Mississippi MS,
Missouri MO, Montana MT, Nebraska NE, Nevada NV, New Hampshire NH,
New Jersey NJ, New Mexico NM, New York NY, North Carolina NC, North Dakota ND,
Ohio OH, Oklahoma OK, Oregon OR, Pennsylvania PA, South Carolina SC,
South Dakota SD, Tennessee TN, Texas TX, Utah UT, Vermont VT, Virginia VA,
Washington WA, West Virginia WV, Wisconsin WI, Wyoming WY.
`;

export const VALID_DASHBOARD_STATUSES = [
  'Operating',
  'Proposed',
  'Approved/Permitted/Under construction',
  'Expanding',
  'Suspended',
  'Cancelled',
];

export const VALID_BWS_LABELS = [
  'Low (<10%)',
  'Low - Medium (10-20%)',
  'Medium - High (20-40%)',
  'High (40-80%)',
  'Extremely High (>80%)',
  'Arid and Low Water Use',
];

export const EXAMPLE_VALUE_LIMIT = 10;

export const LOW_CARDINALITY_COLUMNS = [
  'status',
  'location_confidence',
  'purpose',
  'tenant',
  'sizerank',
  'power_source',
  'cooling_source',
  'cooling_type',
  'community_pushback',
  'resistance_status',
  'information_source',
];

export const EXAMPLE_COLUMNS = [
  'facility_name',
  'city',
  'county',
  'operator_name',
];

export const MESSY_EXAMPLE_COLUMNS = [
  'mw',
  'project_cost',
  'expected_date_online',
  'number_of_buildings',
  'number_of_generators',
];

function getUniqueValues(rows, column) {
  return [...new Set(rows.map((row) => row[column]).filter(Boolean))];
}

function getValues(rows, column) {
  return getUniqueValues(rows, column).join(', ');
}

function getExampleValues(rows, column) {
  return getUniqueValues(rows, column).slice(0, EXAMPLE_VALUE_LIMIT).join(', ');
}

function getSparseColumns(rows, columns, missingStats) {
  return columns
    .map((column) => ({
      column,
      stats: missingStats[column],
    }))
    .filter(({ stats }) => stats && stats.missing / rows.length > 0.5)
    .map(({ column, stats }) => `- ${column}: ${stats.nonEmpty} non-empty / ${stats.total} rows`)
    .join('\n');
}

export function buildSqlPrompt({ rows, columns, derivedColumns, missingStats }) {
  const columnLines = columns
    .map((column) => `- ${column}: ${COLUMN_DESCRIPTIONS[column] || 'Text column.'}`)
    .join('\n');

  const derivedColumnLines = derivedColumns
    .map((column) => `- ${column.name} (${column.type}): ${DERIVED_COLUMN_DESCRIPTIONS[column.name]}`)
    .join('\n');

  const valueLines = LOW_CARDINALITY_COLUMNS
    .map((column) => `- ${column}: ${getValues(rows, column) || 'mostly blank'}`)
    .join('\n');

  const exampleLines = EXAMPLE_COLUMNS
    .map((column) => `- ${column}: ${getExampleValues(rows, column)}`)
    .join('\n');

  const messyExampleLines = MESSY_EXAMPLE_COLUMNS
    .map((column) => `- ${column}: ${getExampleValues(rows, column)}`)
    .join('\n');

  const sparseLines = getSparseColumns(rows, columns, missingStats);

  return `
You generate SQLite SELECT queries and/or dashboard filters for a data center dataset.
Return JSON only with these fields:
{"sql":null,"filter":null,"message":null}
The sql field must be a SELECT string or null.
The filter field is a dashboard filter patch. It may include {"searchQuery":"text","activeStatuses":["status"],"activeBWSLabels":["water stress label"]} or null.
The message field must be a short user-facing message or null.
If the user's request is not about this dataset or dashboard, return {"sql":null,"filter":null,"message":null}.

SQL rules:
- Use only the table data_centers.
- Generate exactly one read-only SELECT query.
- Do not use SELECT *. Select only the columns relevant to the user's question.
- Use exact column names.
- For counts, use COUNT(*) AS count.
- Use case-insensitive matching for names and text, like LOWER(city) LIKE '%ashburn%'.
- For company, organization, or entity names, search across relevant text fields, including facility_name, operator_name, tenant, purpose, and other_info, unless the user specifically names one column.
- Blanks mean unknown or missing, not necessarily no.
- Original CSV columns are stored as TEXT.
- Numeric/date helper columns are derived from the original CSV values. Prefer these helper columns for numeric and date questions, but select the original text column too when showing reported values.
- number_of_generators is not parsed because it mixes generator counts and power-capacity text.

Ambiguous query rules:
- If a user uses vague terms such as big, large, small, expensive, new, old, major, or biggest, map them to the most relevant available columns.
- When returning SQL for an ambiguous term, set message to a short sentence explaining your interpretation, such as "I interpreted '[ambiguous term]' as [explanation]."

Dashboard filter rules:
- The dashboard is an interactive map.
- Use filter when the user asks to show, filter, display, narrow, or put results on the dashboard/map.
- Use sql when the user asks a data question that needs an answer.
- Use both sql and filter when the user asks to update the dashboard and answer a question.
- When returning both, make sure the SQL answers the same subset shown by the dashboard filter.
- The filter object is a patch. Only include fields the user asked to change.
- searchQuery is the text for the existing dashboard search box.
- Include searchQuery whenever the map/dashboard request mentions a location, facility, operator, tenant, purpose, county, or other dashboard-searchable text.
- The dashboard search box matches facility name, city, county, operator name, tenant, purpose, full state name, and state abbreviation.
- For dashboard filters, use full state names like "California" instead of state abbreviations like "CA" when the user mentions a state.
- For SQL, still use two-letter state abbreviations in the state column, such as state = 'CA'.
- activeStatuses must use only these valid statuses: ${VALID_DASHBOARD_STATUSES.join(', ')}.
- Omit activeStatuses if the user did not ask to change status filters.
- To hide all data center status categories, return activeStatuses as an empty array.
- activeBWSLabels controls the separate water-stress polygon overlay, not the data center SQL table.
- activeBWSLabels must use only these valid water-stress labels: ${VALID_BWS_LABELS.join(', ')}.
- Omit activeBWSLabels if the user did not ask to change water-stress overlay filters.
- To hide all water-stress overlay categories, return activeBWSLabels as an empty array.
- If the user asks to show or filter water-stress areas, return activeBWSLabels and keep sql null unless they also ask a data center question answerable from data_centers.
- If the user asks for data center counts or analysis by water stress, return sql null and explain that water stress is a separate map overlay and is not part of the SQL data center table yet.
- Search examples: state name "Illinois", state abbreviation "IL", city "Ashburn", county "Loudoun", operator "Microsoft", tenant "Google", purpose "AI", facility name "Google Data Center".

${STATE_GUIDE}

Original CSV columns:
${columnLines}

Derived helper columns:
${derivedColumnLines}

Categorical values:
${valueLines}

Example high-cardinality values:
${exampleLines}

Messy numeric-like examples:
${messyExampleLines}

Sparse columns with many missing values:
${sparseLines}
`.trim();
}

export function buildSqlUserPrompt({ conversation, latestQuestion }) {
  return `
Use recent conversation for context.
Generate SQL and/or dashboard filters only for the latest user question.
Do not answer earlier questions again.
Resolve follow-up references from the recent conversation when needed.
If the latest question cannot be answered from the dataset or used to filter the dashboard, return {"sql":null,"filter":null,"message":null}.

Recent conversation:
${conversation || 'No previous conversation.'}

Latest user question:
${latestQuestion}
`.trim();
}

export function buildSummaryPrompt({ conversation, userQuestion, sql, rows, notes, rowLimit, actionMessage }) {
  const payload = {
    recentConversation: conversation,
    userQuestion,
    actionMessage,
    sql,
    columns: Object.keys(rows[0] || {}),
    rows,
    rowCountReturned: rows.length,
    rowLimit,
    notes,
  };

  return `
Answer the user's question using only the SQL result below.
The app is an interactive map dashboard.
The latest user request may include both a dashboard filter command and a data question; focus your answer on the data question only.
Use recent conversation for context.
Use the SQL result as the source of truth.
Do not invent facts outside the returned rows.
If recent conversation conflicts with the SQL result, the SQL result wins.
If the result is empty, say that no matching rows were returned.
If notes mention missing values, include that limitation briefly when relevant.
If actionMessage is present, mention it briefly before answering.
If rowCountReturned equals rowLimit, mention that the displayed result is limited to ${rowLimit} rows when that affects the answer.
Keep the answer concise and do not include the SQL query or Markdown tables.

${JSON.stringify(payload, null, 2)}
`.trim();
}
