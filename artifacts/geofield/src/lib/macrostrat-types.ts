export interface MacrostratUnit {
  map_id?: number | string;
  source_id?: number | string;
  name?: string;
  strat_name?: string;
  strat_name_long?: string;
  map_unit_name?: string;
  age?: string;
  lith?: string;
  descrip?: string;
  comments?: string;
  t_int_name?: string;
  b_int_name?: string;
  color?: string;
  source?: string;
  ref?: string;
}

export interface MacrostratSelection {
  unit: MacrostratUnit;
  displayName: string;
  age?: string;
  lithology?: string;
  description?: string;
  source?: string;
  color?: string;
}

export interface MacrostratApiEnvelope {
  success?: { data?: unknown[]; refs?: Record<string, unknown> };
  data?: unknown[];
}
