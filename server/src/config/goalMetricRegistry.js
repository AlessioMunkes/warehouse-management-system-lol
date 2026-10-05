const MEASUREMENT_TYPES = Object.freeze({
  COUNT: 'COUNT',
  SUM: 'SUM',
  RATE: 'RATE',
  SNAPSHOT: 'SNAPSHOT',
  DURATION: 'DURATION',
});

const GOAL_TYPES = Object.freeze({
  TARGET: 'TARGET',
  DIRECTIONAL: 'DIRECTIONAL',
});

const DIRECTIONS = Object.freeze({
  INCREASE: 'INCREASE',
  DECREASE: 'DECREASE',
  MAINTAIN: 'MAINTAIN',
});

const COMPARISON_TYPES = Object.freeze({
  TARGET: 'TARGET',
  PREVIOUS_PERIOD: 'PREVIOUS_PERIOD',
});

export const GOAL_METRIC_DOMAINS = Object.freeze({
  NOURISH_OUR_CHILDREN: 'Nourish Our Children',
  WAREHOUSE: 'Warehouse',
  LOVE_ACTIVISM: 'Love Activism',
  FEED_THE_SOIL: 'Feed the Soil',
  DONATIONS: 'Donations',
  COMMUNITY: 'Community',
  FINANCE: 'Finance',
});

export const GOAL_METRIC_MEASUREMENT_TYPES = MEASUREMENT_TYPES;
export const GOAL_METRIC_GOAL_TYPES = GOAL_TYPES;
export const GOAL_METRIC_DIRECTIONS = DIRECTIONS;
export const GOAL_METRIC_COMPARISON_TYPES = COMPARISON_TYPES;

const targetOnly = Object.freeze([GOAL_TYPES.TARGET]);
const directionalOnly = Object.freeze([GOAL_TYPES.DIRECTIONAL]);
const targetAndDirectional = Object.freeze([GOAL_TYPES.TARGET, GOAL_TYPES.DIRECTIONAL]);

const increaseOnly = Object.freeze([DIRECTIONS.INCREASE]);
const decreaseOnly = Object.freeze([DIRECTIONS.DECREASE]);
const maintainOnly = Object.freeze([DIRECTIONS.MAINTAIN]);
const increaseOrMaintain = Object.freeze([DIRECTIONS.INCREASE, DIRECTIONS.MAINTAIN]);
const decreaseOrMaintain = Object.freeze([DIRECTIONS.DECREASE, DIRECTIONS.MAINTAIN]);
const anyDirection = Object.freeze([DIRECTIONS.INCREASE, DIRECTIONS.DECREASE, DIRECTIONS.MAINTAIN]);

const noFilters = Object.freeze([]);

const defineMetric = (metric) => Object.freeze({
  comparisonType: COMPARISON_TYPES.PREVIOUS_PERIOD,
  supportedFilters: noFilters,
  ...metric,
});

export const GOAL_METRICS = Object.freeze([
  defineMetric({
    id: 'ecd_new_registrations',
    label: 'New ECD registrations',
    description: 'Number of ECD centres registered during the goal period.',
    domain: GOAL_METRIC_DOMAINS.NOURISH_OUR_CHILDREN,
    measurementType: MEASUREMENT_TYPES.COUNT,
    unit: 'centres',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: increaseOnly,
    supportedFilters: Object.freeze(['cohort', 'status']),
    measurementKey: 'ecd.newRegistrations',
    explanationContext: 'Tracks growth in newly registered ECD centres for Nourish Our Children.',
  }),
  defineMetric({
    id: 'ecd_active_centres',
    label: 'Active ECD centres',
    description: 'Number of ECD centres currently active.',
    domain: GOAL_METRIC_DOMAINS.NOURISH_OUR_CHILDREN,
    measurementType: MEASUREMENT_TYPES.SNAPSHOT,
    unit: 'centres',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: increaseOrMaintain,
    supportedFilters: Object.freeze(['cohort']),
    measurementKey: 'ecd.activeCentres',
    explanationContext: 'Measures the active ECD centre base at the time progress is requested.',
  }),
  defineMetric({
    id: 'ecd_children_supported',
    label: 'Children supported',
    description: 'Number of children supported by active ECD centres.',
    domain: GOAL_METRIC_DOMAINS.NOURISH_OUR_CHILDREN,
    measurementType: MEASUREMENT_TYPES.SUM,
    unit: 'children',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: increaseOrMaintain,
    supportedFilters: Object.freeze(['cohort', 'status']),
    measurementKey: 'ecd.childrenSupported',
    explanationContext: 'Summarises children served through ECD centres.',
  }),
  defineMetric({
    id: 'ecd_collection_compliance',
    label: 'ECD collection compliance',
    description: 'Percentage of expected ECD collections completed during the goal period.',
    domain: GOAL_METRIC_DOMAINS.NOURISH_OUR_CHILDREN,
    measurementType: MEASUREMENT_TYPES.RATE,
    unit: 'percent',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: increaseOrMaintain,
    supportedFilters: Object.freeze(['cohort']),
    measurementKey: 'ecd.collectionCompliance',
    explanationContext: 'Compares completed ECD collections against expected collections.',
  }),
  defineMetric({
    id: 'ecd_non_collections',
    label: 'ECD non-collections',
    description: 'Number of expected ECD collections not completed during the goal period.',
    domain: GOAL_METRIC_DOMAINS.NOURISH_OUR_CHILDREN,
    measurementType: MEASUREMENT_TYPES.COUNT,
    unit: 'collections',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: decreaseOrMaintain,
    supportedFilters: Object.freeze(['cohort']),
    measurementKey: 'ecd.nonCollections',
    explanationContext: 'Counts missed ECD collections in the selected period.',
  }),
  defineMetric({
    id: 'ecd_repeat_non_collections',
    label: 'Repeat ECD non-collections',
    description: 'Number of ECD centres with repeated missed collections during the goal period.',
    domain: GOAL_METRIC_DOMAINS.NOURISH_OUR_CHILDREN,
    measurementType: MEASUREMENT_TYPES.COUNT,
    unit: 'centres',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: decreaseOrMaintain,
    supportedFilters: Object.freeze(['cohort']),
    measurementKey: 'ecd.repeatNonCollections',
    explanationContext: 'Highlights ECD centres repeatedly missing collections.',
  }),
  defineMetric({
    id: 'ecd_late_collections',
    label: 'Late ECD collections',
    description: 'Number of ECD collections completed late during the goal period.',
    domain: GOAL_METRIC_DOMAINS.NOURISH_OUR_CHILDREN,
    measurementType: MEASUREMENT_TYPES.COUNT,
    unit: 'collections',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: decreaseOrMaintain,
    supportedFilters: Object.freeze(['cohort']),
    measurementKey: 'ecd.lateCollections',
    explanationContext: 'Counts ECD collections marked late in the selected period.',
  }),

  defineMetric({
    id: 'dispatch_volume',
    label: 'Dispatch volume',
    description: 'Total number of dispatches completed during the goal period.',
    domain: GOAL_METRIC_DOMAINS.WAREHOUSE,
    measurementType: MEASUREMENT_TYPES.COUNT,
    unit: 'dispatches',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: increaseOrMaintain,
    supportedFilters: Object.freeze(['warehouse', 'dispatchType']),
    measurementKey: 'warehouse.dispatchVolume',
    explanationContext: 'Tracks completed warehouse dispatch activity.',
  }),
  defineMetric({
    id: 'dispatch_shortages',
    label: 'Dispatch shortages',
    description: 'Number of dispatches with shortages during the goal period.',
    domain: GOAL_METRIC_DOMAINS.WAREHOUSE,
    measurementType: MEASUREMENT_TYPES.COUNT,
    unit: 'shortages',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: decreaseOrMaintain,
    supportedFilters: Object.freeze(['warehouse', 'product']),
    measurementKey: 'warehouse.dispatchShortages',
    explanationContext: 'Counts shortage incidents recorded against dispatches.',
  }),
  defineMetric({
    id: 'stock_variance',
    label: 'Stock variance',
    description: 'Recorded difference between expected and actual stock levels.',
    domain: GOAL_METRIC_DOMAINS.WAREHOUSE,
    measurementType: MEASUREMENT_TYPES.SUM,
    unit: 'kg',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: decreaseOrMaintain,
    supportedFilters: Object.freeze(['warehouse', 'product']),
    measurementKey: 'warehouse.stockVariance',
    explanationContext: 'Measures stock accuracy by tracking inventory variance.',
  }),
  defineMetric({
    id: 'low_stock_items',
    label: 'Low stock items',
    description: 'Number of inventory items below their low stock threshold.',
    domain: GOAL_METRIC_DOMAINS.WAREHOUSE,
    measurementType: MEASUREMENT_TYPES.SNAPSHOT,
    unit: 'items',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: decreaseOrMaintain,
    supportedFilters: Object.freeze(['warehouse', 'category']),
    measurementKey: 'warehouse.lowStockItems',
    explanationContext: 'Shows how many items are currently below their stock threshold.',
  }),
  defineMetric({
    id: 'decanting_wastage',
    label: 'Decanting wastage',
    description: 'Total wastage recorded during decanting in the goal period.',
    domain: GOAL_METRIC_DOMAINS.WAREHOUSE,
    measurementType: MEASUREMENT_TYPES.SUM,
    unit: 'kg',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: decreaseOrMaintain,
    supportedFilters: Object.freeze(['product']),
    measurementKey: 'warehouse.decantingWastage',
    explanationContext: 'Tracks recorded decanting wastage by product and period.',
  }),
  defineMetric({
    id: 'supplier_lead_time',
    label: 'Supplier lead time',
    description: 'Average time between procurement order and receipt.',
    domain: GOAL_METRIC_DOMAINS.WAREHOUSE,
    measurementType: MEASUREMENT_TYPES.DURATION,
    unit: 'days',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: decreaseOrMaintain,
    supportedFilters: Object.freeze(['supplier', 'product']),
    measurementKey: 'warehouse.supplierLeadTime',
    explanationContext: 'Measures procurement responsiveness from supplier order to warehouse receipt.',
  }),

  defineMetric({
    id: 'volunteer_bookings',
    label: 'Volunteer bookings',
    description: 'Number of volunteer bookings made during the goal period.',
    domain: GOAL_METRIC_DOMAINS.LOVE_ACTIVISM,
    measurementType: MEASUREMENT_TYPES.COUNT,
    unit: 'bookings',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: increaseOrMaintain,
    supportedFilters: Object.freeze(['eventType', 'eventId']),
    measurementKey: 'loveActivism.volunteerBookings',
    explanationContext: 'Tracks volunteer booking demand for Love Activism events.',
  }),
  defineMetric({
    id: 'volunteer_attendance',
    label: 'Volunteer attendance',
    description: 'Number of attended volunteer bookings during the goal period.',
    domain: GOAL_METRIC_DOMAINS.LOVE_ACTIVISM,
    measurementType: MEASUREMENT_TYPES.COUNT,
    unit: 'attendances',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: increaseOrMaintain,
    supportedFilters: Object.freeze(['eventType', 'eventId']),
    measurementKey: 'loveActivism.volunteerAttendance',
    explanationContext: 'Counts volunteers who attended scheduled Love Activism events.',
  }),
  defineMetric({
    id: 'volunteer_hours',
    label: 'Volunteer hours',
    description: 'Total volunteer hours recorded during the goal period.',
    domain: GOAL_METRIC_DOMAINS.LOVE_ACTIVISM,
    measurementType: MEASUREMENT_TYPES.SUM,
    unit: 'hours',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: increaseOrMaintain,
    supportedFilters: Object.freeze(['eventType', 'eventId']),
    measurementKey: 'loveActivism.volunteerHours',
    explanationContext: 'Measures total volunteer contribution time.',
  }),
  defineMetric({
    id: 'volunteer_capacity_utilisation',
    label: 'Volunteer capacity utilisation',
    description: 'Percentage of available volunteer capacity booked or attended.',
    domain: GOAL_METRIC_DOMAINS.LOVE_ACTIVISM,
    measurementType: MEASUREMENT_TYPES.RATE,
    unit: 'percent',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: increaseOrMaintain,
    supportedFilters: Object.freeze(['eventType', 'eventId']),
    measurementKey: 'loveActivism.volunteerCapacityUtilisation',
    explanationContext: 'Compares volunteer participation against available event capacity.',
  }),
  defineMetric({
    id: 'volunteer_no_shows',
    label: 'Volunteer no-shows',
    description: 'Number of booked volunteers who did not attend during the goal period.',
    domain: GOAL_METRIC_DOMAINS.LOVE_ACTIVISM,
    measurementType: MEASUREMENT_TYPES.COUNT,
    unit: 'no-shows',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: decreaseOrMaintain,
    supportedFilters: Object.freeze(['eventType', 'eventId']),
    measurementKey: 'loveActivism.volunteerNoShows',
    explanationContext: 'Counts missed volunteer attendances after booking.',
  }),

  defineMetric({
    id: 'compost_kits_issued',
    label: 'Compost kits issued',
    description: 'Number of compost kits issued during the goal period.',
    domain: GOAL_METRIC_DOMAINS.FEED_THE_SOIL,
    measurementType: MEASUREMENT_TYPES.COUNT,
    unit: 'kits',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: increaseOrMaintain,
    supportedFilters: Object.freeze(['site', 'recipientType']),
    measurementKey: 'feedTheSoil.compostKitsIssued',
    explanationContext: 'Tracks compost kit distribution for Feed the Soil.',
  }),
  defineMetric({
    id: 'compost_logged',
    label: 'Compost logged',
    description: 'Number of compost activity logs recorded during the goal period.',
    domain: GOAL_METRIC_DOMAINS.FEED_THE_SOIL,
    measurementType: MEASUREMENT_TYPES.COUNT,
    unit: 'logs',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: increaseOrMaintain,
    supportedFilters: Object.freeze(['site']),
    measurementKey: 'feedTheSoil.compostLogged',
    explanationContext: 'Counts Feed the Soil compost activity records.',
  }),
  defineMetric({
    id: 'compost_dispatched',
    label: 'Compost dispatched',
    description: 'Number of compost dispatches completed during the goal period.',
    domain: GOAL_METRIC_DOMAINS.FEED_THE_SOIL,
    measurementType: MEASUREMENT_TYPES.COUNT,
    unit: 'dispatches',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: increaseOrMaintain,
    supportedFilters: Object.freeze(['site', 'recipientType']),
    measurementKey: 'feedTheSoil.compostDispatched',
    explanationContext: 'Tracks completed compost dispatches.',
  }),
  defineMetric({
    id: 'compost_kg_dispatched',
    label: 'Compost kilograms dispatched',
    description: 'Total kilograms of compost dispatched during the goal period.',
    domain: GOAL_METRIC_DOMAINS.FEED_THE_SOIL,
    measurementType: MEASUREMENT_TYPES.SUM,
    unit: 'kg',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: increaseOrMaintain,
    supportedFilters: Object.freeze(['site', 'recipientType']),
    measurementKey: 'feedTheSoil.compostKgDispatched',
    explanationContext: 'Measures compost volume distributed by weight.',
  }),

  defineMetric({
    id: 'donation_count',
    label: 'Donation count',
    description: 'Number of donations recorded during the goal period.',
    domain: GOAL_METRIC_DOMAINS.DONATIONS,
    measurementType: MEASUREMENT_TYPES.COUNT,
    unit: 'donations',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: increaseOrMaintain,
    supportedFilters: Object.freeze(['donationType', 'donorType']),
    measurementKey: 'donations.count',
    explanationContext: 'Counts donations recorded in WMS.',
  }),
  defineMetric({
    id: 'donation_value',
    label: 'Donation value',
    description: 'Total value of donations recorded during the goal period.',
    domain: GOAL_METRIC_DOMAINS.DONATIONS,
    measurementType: MEASUREMENT_TYPES.SUM,
    unit: 'currency',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: increaseOrMaintain,
    supportedFilters: Object.freeze(['donationType', 'donorType']),
    measurementKey: 'donations.value',
    explanationContext: 'Measures donation value recorded for financial and operational review.',
  }),
  defineMetric({
    id: 'donations_recognised_as_inventory',
    label: 'Donations recognised as inventory',
    description: 'Number of donations recognised into warehouse inventory during the goal period.',
    domain: GOAL_METRIC_DOMAINS.DONATIONS,
    measurementType: MEASUREMENT_TYPES.COUNT,
    unit: 'donations',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: increaseOrMaintain,
    supportedFilters: Object.freeze(['donationType', 'product']),
    measurementKey: 'donations.recognisedAsInventory',
    explanationContext: 'Tracks donations that have been converted into warehouse stock records.',
  }),

  defineMetric({
    id: 'community_requests_fulfilled',
    label: 'Community requests fulfilled',
    description: 'Number of community requests fulfilled during the goal period.',
    domain: GOAL_METRIC_DOMAINS.COMMUNITY,
    measurementType: MEASUREMENT_TYPES.COUNT,
    unit: 'requests',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: increaseOrMaintain,
    supportedFilters: Object.freeze(['requestType', 'community']),
    measurementKey: 'community.requestsFulfilled',
    explanationContext: 'Counts fulfilled community requests.',
  }),
  defineMetric({
    id: 'community_response_time',
    label: 'Community response time',
    description: 'Average time taken to respond to community requests.',
    domain: GOAL_METRIC_DOMAINS.COMMUNITY,
    measurementType: MEASUREMENT_TYPES.DURATION,
    unit: 'days',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: decreaseOrMaintain,
    supportedFilters: Object.freeze(['requestType', 'community']),
    measurementKey: 'community.responseTime',
    explanationContext: 'Measures responsiveness to community requests.',
  }),

  defineMetric({
    id: 'failed_quickbooks_syncs',
    label: 'Failed QuickBooks syncs',
    description: 'Number of failed QuickBooks sync attempts during the goal period.',
    domain: GOAL_METRIC_DOMAINS.FINANCE,
    measurementType: MEASUREMENT_TYPES.COUNT,
    unit: 'sync failures',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: decreaseOrMaintain,
    supportedFilters: Object.freeze(['syncType']),
    measurementKey: 'finance.failedQuickBooksSyncs',
    explanationContext: 'Tracks failed finance integration sync attempts.',
  }),
  defineMetric({
    id: 'finance_handoff_completion',
    label: 'Finance handoff completion',
    description: 'Percentage of required finance handoffs completed during the goal period.',
    domain: GOAL_METRIC_DOMAINS.FINANCE,
    measurementType: MEASUREMENT_TYPES.RATE,
    unit: 'percent',
    supportedGoalTypes: targetAndDirectional,
    supportedDirections: increaseOrMaintain,
    supportedFilters: Object.freeze(['handoffType']),
    measurementKey: 'finance.handoffCompletion',
    explanationContext: 'Measures completion of operational handoffs to Finance.',
  }),
]);

const metricsById = Object.freeze(new Map(GOAL_METRICS.map((metric) => [metric.id, metric])));

export const getMetric = (metricId) => metricsById.get(metricId) || null;

export const getAllMetrics = () => GOAL_METRICS;

export const getMetricsByDomain = (domain) => GOAL_METRICS.filter((metric) => metric.domain === domain);

export const validateMetric = (metricId) => {
  const metric = getMetric(metricId);
  if (!metric) {
    const error = new Error(`Unknown operational goal metric: ${metricId}`);
    error.code = 'UNKNOWN_GOAL_METRIC';
    error.status = 400;
    throw error;
  }
  return metric;
};

