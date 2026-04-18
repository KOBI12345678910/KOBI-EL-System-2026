/**
 * Sales Territory Manager  |  מנהל טריטוריות מכירה
 * =============================================================
 *
 * Agent Y-028  |  Swarm Sales  |  Techno-Kol Uzi mega-ERP — Wave 2026
 *
 * Zero-dependency, in-memory sales territory manager. Defines sales
 * territories by rule sets (geo / industry / company-size / product),
 * auto-assigns customer accounts to matching territories, detects
 * coverage gaps & overlaps, suggests rebalance plans for even
 * distribution, reports KPI per territory, and tracks historical
 * handoffs between territories.
 *
 * Only Node built-ins — no npm deps. Deterministic ids. Bilingual
 * (Hebrew + English) labels on every rule type, region and signal.
 *
 * -------------------------------------------------------------
 * DOMAIN MODEL
 * -------------------------------------------------------------
 *
 *   Territory {
 *     id, name_he, name_en,
 *     rules:  [ Rule ],
 *     salespeople: [ { id, name_he?, name_en?, quota? } ],
 *     created_at, updated_at,
 *     rule_priority?, active
 *   }
 *
 *   Rule {
 *     type: 'geo' | 'industry' | 'size' | 'product',
 *     value: <depends on type>
 *     // geo     : { region: 'north'|'central'|'south'|'jerusalem'|
 *     //           'tel_aviv_metro'|'haifa_metro',
 *     //           cities?: [string], zip_ranges?: [[min,max]] }
 *     //           OR a plain string region code / city name
 *     // industry: string | [string]
 *     // size    : { min?: number, max?: number, metric:'employees'|'revenue' }
 *     // product : string | [string]
 *   }
 *
 *   Account {
 *     id, name_he?, name_en?,
 *     city?, zip?, region?,
 *     industry?, size_employees?, annual_revenue?,
 *     products?: [string],
 *     revenue?, pipeline?, active_deals?,
 *     assigned_territory?: id
 *   }
 *
 *   Handoff {
 *     id, from_territory, to_territory, effective_date,
 *     accounts:[ids], reason?, recorded_at
 *   }
 *
 * -------------------------------------------------------------
 * PUBLIC API  (class TerritoryManager)
 * -------------------------------------------------------------
 *   defineTerritory(spec)                       -> territoryId
 *   updateTerritory(id, patch)                  -> Territory
 *   listTerritories()                           -> [Territory]
 *   getTerritory(id)                            -> Territory
 *   assignAccount(account)                      -> { account_id, territory_id, matched_rules }
 *   reassignAll(accounts)                       -> [assignment]
 *   coverageCheck(accounts)                     -> { uncovered, overlaps, covered }
 *   rebalance({ metric, accounts })             -> { plan[], before, after }
 *   territoryPerformance(territoryId, period)   -> KPI
 *   handoff({from, to, effectiveDate, accounts, reason?}) -> handoffId
 *   listHandoffs(territoryId?)                  -> [Handoff]
 *   matchScore(territory, account)              -> number 0..1
 *   accountRegion(account)                      -> regionCode|null
 *
 * RULE — לא מוחקים רק משדרגים ומגדלים:
 *   Territories are deactivated via `active=false`, never removed.
 *   Handoffs are append-only; reassignments are recorded in history.
 *   Accounts keep `assigned_territory_history[]`.
 *
 * -------------------------------------------------------------
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// Bilingual label dictionary
// ─────────────────────────────────────────────────────────────

const RULE_TYPES = {
  geo:      { he: 'גאוגרפי',      en: 'Geographic' },
  industry: { he: 'ענף',           en: 'Industry' },
  size:     { he: 'גודל חברה',     en: 'Company Size' },
  product:  { he: 'מוצר / קו-מוצר', en: 'Product Line' },
};

const METRICS = {
  accounts: { he: 'מספר לקוחות',   en: 'Account Count' },
  revenue:  { he: 'הכנסות',         en: 'Revenue' },
  pipeline: { he: 'צנרת מכירות',    en: 'Pipeline Value' },
};

const LABELS = {
  notFound:         { he: 'לא נמצא',                  en: 'not found' },
  unknownType:      { he: 'סוג כלל לא מוכר',           en: 'unknown rule type' },
  unknownMetric:    { he: 'מדד לא מוכר',               en: 'unknown metric' },
  uncovered:        { he: 'לא מכוסה',                  en: 'uncovered' },
  overlap:          { he: 'חפיפה',                      en: 'overlap' },
  covered:          { he: 'מכוסה',                      en: 'covered' },
  rebalanceNeeded:  { he: 'נדרש איזון מחדש',           en: 'rebalance needed' },
  balanced:         { he: 'מאוזן',                      en: 'balanced' },
  handoffRecorded:  { he: 'העברה נרשמה',                en: 'handoff recorded' },
  activeSwitch:     { he: 'טריטוריה לא פעילה',         en: 'territory inactive' },
  invalidAccount:   { he: 'חשבון לא חוקי',              en: 'invalid account' },
  invalidRule:      { he: 'כלל לא חוקי',                en: 'invalid rule' },
};

// ─────────────────────────────────────────────────────────────
// Israeli geography: 6 regions + cities + zip ranges
// =============================================================
// Zip (mikud) ranges follow Israel Post's 7-digit postal layout:
// regions are grouped by first 2 digits (the "district code") and
// extended with known major-city ranges. These ranges are inclusive
// and serve as fallbacks when the account carries no explicit city.
// The canonical source is Israel Post's `ZipCodes` reference; the
// numbers below were picked as stable blocks that will not change
// when streets within a city are re-numbered.
// ─────────────────────────────────────────────────────────────

const REGIONS = {
  north: {
    he: 'צפון',
    en: 'Northern',
    // Safed (13xxx), Kiryat Shmona (11xxx), Acre (24xxx),
    // Nahariya (22xxx), Karmiel (20xxx), Tiberias (14xxx),
    // Afula (18xxx), Nazareth (16xxx), Migdal HaEmek (23xxx),
    // Beit Shean (10xxx)
    zip_ranges: [
      [1000000, 1299999],   // Galilee Panhandle / Kiryat Shmona / Hatzor
      [1300000, 1399999],   // Safed / Tzfat and upper-Galilee villages
      [1400000, 1599999],   // Tiberias & Kinneret basin
      [1600000, 1799999],   // Nazareth / Jezreel Valley
      [1800000, 1999999],   // Afula / Beit Shean
      [2000000, 2199999],   // Karmiel / central Galilee
      [2200000, 2399999],   // Nahariya / Western Galilee
      [2400000, 2499999],   // Acre / Akko corridor (shared north boundary)
    ],
    cities: [
      'safed', 'tzfat', 'צפת',
      'kiryat shmona', 'קרית שמונה',
      'acre', 'akko', 'עכו',
      'nahariya', 'נהריה',
      'karmiel', 'כרמיאל',
      'tiberias', 'טבריה',
      'afula', 'עפולה',
      'nazareth', 'נצרת',
      'migdal haemek', 'מגדל העמק',
      'beit shean', 'בית שאן',
      'maalot', 'מעלות תרשיחא',
      'shlomi', 'שלומי',
    ],
  },

  haifa_metro: {
    he: 'מטרופולין חיפה',
    en: 'Haifa Metro',
    // Haifa (3xxxx), Kiryat Ata, Kiryat Bialik, Kiryat Yam,
    // Kiryat Motzkin, Tirat Carmel, Nesher, Yokneam, Daliyat
    zip_ranges: [
      [2500000, 2999999],   // Krayot / Kiryat Bialik / Ata / Motzkin / Yam
      [3000000, 3599999],   // Haifa city core & Carmel
      [3600000, 3999999],   // Nesher / Tirat Carmel / Yokneam / Dalyat
    ],
    cities: [
      'haifa', 'חיפה',
      'kiryat ata', 'קרית אתא',
      'kiryat bialik', 'קרית ביאליק',
      'kiryat yam', 'קרית ים',
      'kiryat motzkin', 'קרית מוצקין',
      'tirat carmel', 'טירת כרמל',
      'nesher', 'נשר',
      'yokneam', 'יקנעם',
      'daliyat al-carmel', 'דלית אל כרמל',
    ],
  },

  central: {
    he: 'מרכז',
    en: 'Central',
    // Sharon + Shfela: Netanya (42xxx), Herzliya (46xxx-47xxx),
    // Ra'anana (43xxx), Kfar Saba (44xxx), Hod HaSharon (45xxx),
    // Petah Tikva (49xxx), Rosh Ha'ayin (48xxx), Rishon Lezion (75xxx),
    // Rehovot (76xxx), Ness Ziona (74xxx), Lod (71xxx), Ramla (72xxx),
    // Modi'in (71xxx/73xxx), Ashdod (77xxx — shared with south but central-south)
    zip_ranges: [
      [4000000, 4299999],   // Netanya / HaSharon
      [4300000, 4599999],   // Herzliya / Ra'anana / Kfar Saba / Hod HaSharon
      [4600000, 4799999],   // Herzliya Pituach / Ramat HaSharon (boundary w/ TLV)
      [4800000, 4999999],   // Rosh HaAyin / Petah Tikva east
      [7000000, 7199999],   // Lod / Ramla / Modi'in
      [7300000, 7499999],   // Modi'in Maccabim Reut / Shoham
      [7400000, 7699999],   // Rishon Lezion / Rehovot / Ness Ziona / Yavne
    ],
    cities: [
      'netanya', 'נתניה',
      'herzliya', 'הרצליה',
      'raanana', 'raʻanana', 'רעננה',
      'kfar saba', 'כפר סבא',
      'hod hasharon', 'הוד השרון',
      'petah tikva', 'פתח תקווה',
      'rosh haayin', 'ראש העין',
      'rishon lezion', 'ראשון לציון',
      'rehovot', 'רחובות',
      'ness ziona', 'נס ציונה',
      'yavne', 'יבנה',
      'lod', 'לוד',
      'ramla', 'רמלה',
      'modiin', 'מודיעין',
      'shoham', 'שוהם',
      'kiryat ono', 'קרית אונו',
      'ramat hasharon', 'רמת השרון',
    ],
  },

  tel_aviv_metro: {
    he: 'מטרופולין תל אביב',
    en: 'Tel Aviv Metro',
    // Tel Aviv core (6xxxx), Ramat Gan (52xxx), Givatayim (53xxx),
    // Bnei Brak (51xxx), Holon (58xxx), Bat Yam (59xxx), Or Yehuda (60xxx)
    zip_ranges: [
      [5100000, 5199999],   // Bnei Brak
      [5200000, 5299999],   // Ramat Gan
      [5300000, 5399999],   // Givatayim
      [5400000, 5499999],   // Kiryat Ono eastern boundary
      [5500000, 5899999],   // Holon / Azor / Or Yehuda
      [5900000, 5999999],   // Bat Yam
      [6000000, 6999999],   // Tel Aviv-Yafo core (all digit-6 prefixes)
    ],
    cities: [
      'tel aviv', 'tel aviv-yafo', 'tlv', 'תל אביב', 'תל אביב-יפו',
      'jaffa', 'yafo', 'יפו',
      'ramat gan', 'רמת גן',
      'givatayim', 'גבעתיים',
      'bnei brak', 'בני ברק',
      'holon', 'חולון',
      'bat yam', 'בת ים',
      'or yehuda', 'אור יהודה',
      'azor', 'אזור',
    ],
  },

  jerusalem: {
    he: 'ירושלים',
    en: 'Jerusalem',
    // Jerusalem core 9xxxx, Mevaseret Zion 90xxx, Beit Shemesh 99xxx,
    // Maale Adumim 98xxx
    zip_ranges: [
      [9000000, 9099999],   // Mevaseret / Jerusalem corridor west
      [9100000, 9699999],   // Jerusalem city core (all neighborhoods)
      [9700000, 9799999],   // Maale Adumim / Adumim bloc
      [9800000, 9899999],   // Beit Shemesh / Judean foothills
      [9900000, 9999999],   // Jerusalem peripheral settlements
    ],
    cities: [
      'jerusalem', 'yerushalayim', 'ירושלים',
      'mevaseret zion', 'מבשרת ציון',
      'beit shemesh', 'בית שמש',
      'maale adumim', 'מעלה אדומים',
      'givat zeev', 'גבעת זאב',
      'efrat', 'אפרת',
    ],
  },

  south: {
    he: 'דרום',
    en: 'Southern',
    // Beer Sheva (84xxx), Ashkelon (78xxx), Ashdod (77xxx),
    // Kiryat Gat (82xxx), Eilat (88xxx), Dimona (86xxx),
    // Arad (89xxx), Ofakim (87xxx), Sderot (87xxx), Netivot (87xxx)
    zip_ranges: [
      [7700000, 7899999],   // Ashdod / Ashkelon
      [8000000, 8299999],   // Kiryat Gat / Lachish region
      [8300000, 8599999],   // Beer Sheva / Bnei Shimon region
      [8600000, 8699999],   // Dimona / Yeroham
      [8700000, 8799999],   // Ofakim / Sderot / Netivot / Gaza envelope
      [8800000, 8899999],   // Eilat / Arava
      [8900000, 8999999],   // Arad / Dead Sea / Mitzpe Ramon
    ],
    cities: [
      'beer sheva', 'beersheba', 'באר שבע',
      'ashkelon', 'אשקלון',
      'ashdod', 'אשדוד',
      'kiryat gat', 'קרית גת',
      'eilat', 'אילת',
      'dimona', 'דימונה',
      'arad', 'ערד',
      'ofakim', 'אופקים',
      'sderot', 'שדרות',
      'netivot', 'נתיבות',
      'yeruham', 'ירוחם',
      'mitzpe ramon', 'מצפה רמון',
    ],
  },
};

const REGION_KEYS = Object.keys(REGIONS);

// ─────────────────────────────────────────────────────────────
// Zero-dep utilities
// ─────────────────────────────────────────────────────────────

function makeIdGen(prefix) {
  let n = 0;
  return function next() {
    n += 1;
    return prefix + '_' + n.toString(36).padStart(6, '0');
  };
}

function nowTs() { return Date.now(); }

function toNum(v) {
  if (v == null || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function normaliseCity(s) {
  if (s == null) return '';
  return String(s).trim().toLowerCase().replace(/[״"'`\-]+/g, ' ').replace(/\s+/g, ' ');
}

function parseZip(z) {
  if (z == null) return NaN;
  // Accept "1234567", "12345", "1234-567"
  const digits = String(z).replace(/[^0-9]/g, '');
  if (!digits) return NaN;
  // Normalise to 7 digits so all zips live in the same numeric space
  let s = digits;
  if (s.length === 5) s = s + '00';
  if (s.length === 6) s = s + '0';
  if (s.length > 7) s = s.slice(0, 7);
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : NaN;
}

function inZipRanges(zipNum, ranges) {
  if (!Number.isFinite(zipNum) || !Array.isArray(ranges)) return false;
  for (let i = 0; i < ranges.length; i += 1) {
    const r = ranges[i];
    if (zipNum >= r[0] && zipNum <= r[1]) return true;
  }
  return false;
}

function shallowClone(obj) {
  if (obj == null) return obj;
  const out = {};
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i];
    const v = obj[k];
    if (Array.isArray(v)) out[k] = v.slice();
    else if (v && typeof v === 'object') out[k] = shallowClone(v);
    else out[k] = v;
  }
  return out;
}

function toArray(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.slice();
  return [v];
}

// ─────────────────────────────────────────────────────────────
// Region resolution
// ─────────────────────────────────────────────────────────────

function resolveRegionFromCity(city) {
  const c = normaliseCity(city);
  if (!c) return null;
  for (let i = 0; i < REGION_KEYS.length; i += 1) {
    const key = REGION_KEYS[i];
    const list = REGIONS[key].cities;
    for (let j = 0; j < list.length; j += 1) {
      const name = normaliseCity(list[j]);
      if (name && (name === c || c.indexOf(name) !== -1 || name.indexOf(c) !== -1)) {
        return key;
      }
    }
  }
  return null;
}

function resolveRegionFromZip(zipNum) {
  if (!Number.isFinite(zipNum)) return null;
  for (let i = 0; i < REGION_KEYS.length; i += 1) {
    const key = REGION_KEYS[i];
    if (inZipRanges(zipNum, REGIONS[key].zip_ranges)) return key;
  }
  return null;
}

function resolveAccountRegion(account) {
  if (!account) return null;
  if (account.region) {
    const k = String(account.region).toLowerCase().replace(/\s+/g, '_');
    if (REGION_KEYS.indexOf(k) !== -1) return k;
  }
  const byCity = resolveRegionFromCity(account.city);
  if (byCity) return byCity;
  const zipNum = parseZip(account.zip);
  const byZip = resolveRegionFromZip(zipNum);
  if (byZip) return byZip;
  return null;
}

// ─────────────────────────────────────────────────────────────
// Rule evaluation
// ─────────────────────────────────────────────────────────────

function evalGeoRule(rule, account) {
  const v = rule.value || {};
  // normalised target region code
  let targetRegion = null;
  if (typeof v === 'string') {
    const k = v.toLowerCase().replace(/\s+/g, '_');
    if (REGION_KEYS.indexOf(k) !== -1) targetRegion = k;
  } else if (v && typeof v === 'object') {
    if (v.region) {
      const k = String(v.region).toLowerCase().replace(/\s+/g, '_');
      if (REGION_KEYS.indexOf(k) !== -1) targetRegion = k;
    }
    // explicit cities override
    if (Array.isArray(v.cities) && v.cities.length) {
      const c = normaliseCity(account.city);
      for (let i = 0; i < v.cities.length; i += 1) {
        const n = normaliseCity(v.cities[i]);
        if (n && (n === c || c.indexOf(n) !== -1)) return true;
      }
    }
    // explicit zip ranges override
    if (Array.isArray(v.zip_ranges) && v.zip_ranges.length) {
      if (inZipRanges(parseZip(account.zip), v.zip_ranges)) return true;
    }
  }
  if (!targetRegion) return false;
  const accRegion = resolveAccountRegion(account);
  return accRegion === targetRegion;
}

function evalIndustryRule(rule, account) {
  const targets = toArray(rule.value).map(function (x) { return String(x).toLowerCase(); });
  if (!targets.length) return false;
  const acc = String(account.industry || '').toLowerCase();
  if (!acc) return false;
  for (let i = 0; i < targets.length; i += 1) {
    if (acc === targets[i] || acc.indexOf(targets[i]) !== -1) return true;
  }
  return false;
}

function evalSizeRule(rule, account) {
  const v = rule.value || {};
  const metric = v.metric === 'revenue' ? 'revenue' : 'employees';
  const actual = metric === 'revenue'
    ? toNum(account.annual_revenue != null ? account.annual_revenue : account.revenue)
    : toNum(account.size_employees != null ? account.size_employees : account.employees);
  if (!Number.isFinite(actual)) return false;
  if (v.min != null && actual < toNum(v.min)) return false;
  if (v.max != null && actual > toNum(v.max)) return false;
  return true;
}

function evalProductRule(rule, account) {
  const targets = toArray(rule.value).map(function (x) { return String(x).toLowerCase(); });
  if (!targets.length) return false;
  const accProducts = toArray(account.products).map(function (x) { return String(x).toLowerCase(); });
  if (!accProducts.length) return false;
  for (let i = 0; i < targets.length; i += 1) {
    if (accProducts.indexOf(targets[i]) !== -1) return true;
  }
  return false;
}

function evalRule(rule, account) {
  if (!rule || typeof rule !== 'object') return false;
  switch (rule.type) {
    case 'geo':      return evalGeoRule(rule, account);
    case 'industry': return evalIndustryRule(rule, account);
    case 'size':     return evalSizeRule(rule, account);
    case 'product':  return evalProductRule(rule, account);
    default:         return false;
  }
}

// ─────────────────────────────────────────────────────────────
// TerritoryManager — main class
// ─────────────────────────────────────────────────────────────

class TerritoryManager {
  constructor(opts) {
    opts = opts || {};
    this._territories = new Map();    // id -> Territory
    this._handoffs = [];              // Handoff[]
    this._nextTerritoryId = makeIdGen('trt');
    this._nextHandoffId = makeIdGen('hof');
    this._clock = typeof opts.clock === 'function' ? opts.clock : nowTs;
  }

  // ----- helpers ----------------------------------------------------------
  _touch(t) {
    t.updated_at = this._clock();
    return t;
  }

  _validateRule(rule) {
    if (!rule || typeof rule !== 'object') return false;
    if (!RULE_TYPES[rule.type]) return false;
    if (rule.type === 'size') {
      const v = rule.value || {};
      if (v.min == null && v.max == null) return false;
      if (v.metric && v.metric !== 'employees' && v.metric !== 'revenue') return false;
    }
    if (rule.type === 'geo') {
      const v = rule.value;
      if (v == null) return false;
    }
    if ((rule.type === 'industry' || rule.type === 'product') && (rule.value == null || toArray(rule.value).length === 0)) {
      return false;
    }
    return true;
  }

  // ----- CRUD -------------------------------------------------------------

  /**
   * Define a new sales territory.
   * @param {Object} spec
   * @param {string} spec.id
   * @param {string} spec.name_he
   * @param {string} spec.name_en
   * @param {Array}  spec.rules
   * @param {Array}  spec.salespeople
   * @returns {string} territoryId
   */
  defineTerritory(spec) {
    if (!spec || typeof spec !== 'object') throw new Error(LABELS.invalidRule.en);
    const id = spec.id || this._nextTerritoryId();
    const rules = Array.isArray(spec.rules) ? spec.rules : [];
    for (let i = 0; i < rules.length; i += 1) {
      if (!this._validateRule(rules[i])) {
        throw new Error(LABELS.invalidRule.en + ': ' + (rules[i] && rules[i].type));
      }
    }
    const now = this._clock();
    const territory = {
      id: id,
      name_he: spec.name_he || id,
      name_en: spec.name_en || id,
      rules: rules.map(shallowClone),
      salespeople: Array.isArray(spec.salespeople) ? spec.salespeople.map(shallowClone) : [],
      rule_priority: Number.isFinite(spec.rule_priority) ? spec.rule_priority : 100,
      active: spec.active !== false,
      created_at: now,
      updated_at: now,
      account_ids: [],
    };
    this._territories.set(id, territory);
    return id;
  }

  /**
   * Upgrade an existing territory (never delete; `active=false` if retiring).
   */
  updateTerritory(id, patch) {
    const t = this._territories.get(id);
    if (!t) throw new Error(LABELS.notFound.en + ': ' + id);
    if (patch.rules) {
      for (let i = 0; i < patch.rules.length; i += 1) {
        if (!this._validateRule(patch.rules[i])) {
          throw new Error(LABELS.invalidRule.en);
        }
      }
      t.rules = patch.rules.map(shallowClone);
    }
    if (patch.name_he != null) t.name_he = patch.name_he;
    if (patch.name_en != null) t.name_en = patch.name_en;
    if (patch.salespeople) t.salespeople = patch.salespeople.map(shallowClone);
    if (patch.active != null) t.active = !!patch.active;
    if (patch.rule_priority != null) t.rule_priority = Number(patch.rule_priority);
    return this._touch(t);
  }

  listTerritories() {
    const out = [];
    this._territories.forEach(function (t) { out.push(shallowClone(t)); });
    return out;
  }

  getTerritory(id) {
    const t = this._territories.get(id);
    return t ? shallowClone(t) : null;
  }

  // ----- matching ---------------------------------------------------------

  /**
   * Returns a 0..1 score indicating how well an account matches a territory.
   * A higher score = more rules matched.  Accounts need AT LEAST one
   * matching rule to be considered "in territory".
   */
  matchScore(territory, account) {
    if (!territory || !territory.active) return 0;
    if (!account) return 0;
    const rules = territory.rules || [];
    if (!rules.length) return 0;
    let matched = 0;
    for (let i = 0; i < rules.length; i += 1) {
      if (evalRule(rules[i], account)) matched += 1;
    }
    return matched / rules.length;
  }

  /**
   * Auto-assign an account to the best-matching territory.
   * Picks the highest `matchScore`, with `rule_priority` as a tie-break
   * (lower number = higher priority, like Linux nice values), and
   * territory creation order as the final deterministic tie-break.
   *
   * @param {Object} account
   * @returns {Object} { account_id, territory_id, matched_rules, score }
   */
  assignAccount(account) {
    if (!account || typeof account !== 'object') {
      throw new Error(LABELS.invalidAccount.en);
    }
    let best = null;
    const candidates = [];
    const self = this;
    this._territories.forEach(function (t) {
      if (!t.active) return;
      const score = self.matchScore(t, account);
      if (score > 0) {
        candidates.push({ territory: t, score: score });
      }
    });

    // Sort: score desc, rule_priority asc, created_at asc
    candidates.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      const pa = a.territory.rule_priority;
      const pb = b.territory.rule_priority;
      if (pa !== pb) return pa - pb;
      return a.territory.created_at - b.territory.created_at;
    });

    if (candidates.length) best = candidates[0];

    const matchedRules = best
      ? best.territory.rules.filter(function (r) { return evalRule(r, account); })
      : [];

    const result = {
      account_id: account.id,
      territory_id: best ? best.territory.id : null,
      matched_rules: matchedRules,
      score: best ? best.score : 0,
      candidates: candidates.map(function (c) {
        return { territory_id: c.territory.id, score: c.score };
      }),
    };

    if (best) {
      // record on account & on territory
      if (account.id != null && best.territory.account_ids.indexOf(account.id) === -1) {
        best.territory.account_ids.push(account.id);
      }
      account.assigned_territory = best.territory.id;
      if (!Array.isArray(account.assigned_territory_history)) {
        account.assigned_territory_history = [];
      }
      account.assigned_territory_history.push({
        territory_id: best.territory.id,
        at: this._clock(),
      });
    }

    return result;
  }

  /**
   * Bulk re-assignment helper.
   */
  reassignAll(accounts) {
    if (!Array.isArray(accounts)) return [];
    const out = [];
    for (let i = 0; i < accounts.length; i += 1) {
      out.push(this.assignAccount(accounts[i]));
    }
    return out;
  }

  // ----- coverage ---------------------------------------------------------

  /**
   * Returns uncovered accounts, accounts in overlapping territories,
   * and fully covered accounts.
   *
   * @param {Array} accounts
   * @returns {{uncovered:[], overlaps:[], covered:[]}}
   */
  coverageCheck(accounts) {
    const result = { uncovered: [], overlaps: [], covered: [] };
    if (!Array.isArray(accounts)) return result;
    const self = this;

    for (let i = 0; i < accounts.length; i += 1) {
      const acc = accounts[i];
      const hits = [];
      this._territories.forEach(function (t) {
        if (!t.active) return;
        const score = self.matchScore(t, acc);
        if (score > 0) hits.push({ territory_id: t.id, score: score });
      });

      if (hits.length === 0) {
        result.uncovered.push({
          account_id: acc.id,
          reason: LABELS.uncovered,
          resolved_region: resolveAccountRegion(acc),
        });
      } else if (hits.length === 1) {
        result.covered.push({
          account_id: acc.id,
          territory_id: hits[0].territory_id,
          score: hits[0].score,
        });
      } else {
        result.overlaps.push({
          account_id: acc.id,
          territories: hits,
          severity: hits.length >= 3 ? 'high' : 'medium',
        });
      }
    }
    return result;
  }

  // ----- rebalance --------------------------------------------------------

  _metricFor(account, metric) {
    if (metric === 'revenue')  return toNum(account.revenue) || 0;
    if (metric === 'pipeline') return toNum(account.pipeline) || 0;
    return 1; // 'accounts'
  }

  /**
   * Suggest a rebalance plan that evens a given metric across all
   * ACTIVE territories. Uses a greedy longest-processing-time (LPT)
   * allocation: sort accounts by metric desc, then repeatedly assign
   * to the territory with the smallest current load — subject to the
   * constraint that the account still matches at least one rule of
   * the candidate territory (otherwise it is left with its current
   * territory and flagged as `unmovable`).
   *
   * @param {Object} opts
   * @param {'accounts'|'revenue'|'pipeline'} opts.metric
   * @param {Array} opts.accounts
   * @returns {{plan:Array, before:Object, after:Object, spread_before:number, spread_after:number}}
   */
  rebalance(opts) {
    opts = opts || {};
    const metric = opts.metric || 'accounts';
    if (!METRICS[metric]) throw new Error(LABELS.unknownMetric.en + ': ' + metric);
    const accounts = Array.isArray(opts.accounts) ? opts.accounts.slice() : [];
    const active = [];
    this._territories.forEach(function (t) { if (t.active) active.push(t); });
    if (active.length === 0) {
      return { plan: [], before: {}, after: {}, spread_before: 0, spread_after: 0, metric: metric };
    }

    // measure "before"
    const before = {};
    for (let i = 0; i < active.length; i += 1) before[active[i].id] = 0;
    for (let i = 0; i < accounts.length; i += 1) {
      const acc = accounts[i];
      if (acc.assigned_territory && before[acc.assigned_territory] != null) {
        before[acc.assigned_territory] += this._metricFor(acc, metric);
      }
    }

    // LPT greedy rebuild
    const sorted = accounts.slice().sort(function (a, b) {
      return (toNum(b.revenue) + toNum(b.pipeline) || 0)
        - (toNum(a.revenue) + toNum(a.pipeline) || 0);
    });

    const after = {};
    for (let i = 0; i < active.length; i += 1) after[active[i].id] = 0;

    const plan = [];
    const self = this;

    for (let i = 0; i < sorted.length; i += 1) {
      const acc = sorted[i];
      // candidate territories: those that match this account
      const cands = [];
      for (let j = 0; j < active.length; j += 1) {
        const t = active[j];
        if (self.matchScore(t, acc) > 0) cands.push(t);
      }
      if (cands.length === 0) {
        plan.push({
          account_id: acc.id,
          from: acc.assigned_territory || null,
          to: acc.assigned_territory || null,
          unmovable: true,
          reason: LABELS.uncovered,
        });
        if (acc.assigned_territory && after[acc.assigned_territory] != null) {
          after[acc.assigned_territory] += this._metricFor(acc, metric);
        }
        continue;
      }
      // pick candidate with smallest after[] load (LPT heuristic)
      cands.sort(function (a, b) {
        const la = after[a.id];
        const lb = after[b.id];
        if (la !== lb) return la - lb;
        // tie-break on rule_priority then created_at
        if (a.rule_priority !== b.rule_priority) return a.rule_priority - b.rule_priority;
        return a.created_at - b.created_at;
      });
      const chosen = cands[0];
      after[chosen.id] += this._metricFor(acc, metric);
      if (acc.assigned_territory !== chosen.id) {
        plan.push({
          account_id: acc.id,
          from: acc.assigned_territory || null,
          to: chosen.id,
          delta: this._metricFor(acc, metric),
          unmovable: false,
        });
      }
    }

    function spread(obj) {
      const vals = Object.values(obj);
      if (!vals.length) return 0;
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < vals.length; i += 1) {
        if (vals[i] < min) min = vals[i];
        if (vals[i] > max) max = vals[i];
      }
      return max - min;
    }

    return {
      metric: metric,
      before: before,
      after: after,
      spread_before: spread(before),
      spread_after: spread(after),
      plan: plan,
      improved: spread(after) <= spread(before),
    };
  }

  // ----- KPIs -------------------------------------------------------------

  /**
   * Territory performance for a period.
   * `period` is any object containing `from` and `to` timestamps, or a
   * plain string ("month"|"quarter"|"year") — historical aggregates are
   * computed from the accounts currently owned by the territory.
   */
  territoryPerformance(territoryId, period, accounts) {
    const t = this._territories.get(territoryId);
    if (!t) throw new Error(LABELS.notFound.en + ': ' + territoryId);
    const list = Array.isArray(accounts) ? accounts : [];
    const owned = list.filter(function (a) { return a.assigned_territory === territoryId; });

    let revenue = 0;
    let pipeline = 0;
    let activeDeals = 0;
    let winCount = 0;
    let lossCount = 0;

    for (let i = 0; i < owned.length; i += 1) {
      const a = owned[i];
      revenue    += toNum(a.revenue) || 0;
      pipeline   += toNum(a.pipeline) || 0;
      activeDeals += toNum(a.active_deals) || 0;
      if (a.last_result === 'won')  winCount += 1;
      if (a.last_result === 'lost') lossCount += 1;
    }

    const totalQuota = (t.salespeople || []).reduce(function (sum, s) {
      return sum + (toNum(s.quota) || 0);
    }, 0);

    const winRate = (winCount + lossCount) > 0
      ? winCount / (winCount + lossCount)
      : 0;

    const attainment = totalQuota > 0 ? revenue / totalQuota : 0;

    return {
      territory_id: territoryId,
      territory_name: { he: t.name_he, en: t.name_en },
      period: period || null,
      account_count: owned.length,
      revenue: revenue,
      pipeline: pipeline,
      active_deals: activeDeals,
      win_count: winCount,
      loss_count: lossCount,
      win_rate: winRate,
      quota: totalQuota,
      quota_attainment: attainment,
      salespeople_count: (t.salespeople || []).length,
    };
  }

  // ----- handoffs ---------------------------------------------------------

  /**
   * Track a territory-to-territory handoff of account(s).
   * Append-only — handoff records are never mutated or deleted.
   */
  handoff(opts) {
    opts = opts || {};
    const from = opts.fromTerritory || opts.from_territory || opts.from;
    const to = opts.toTerritory || opts.to_territory || opts.to;
    if (!from || !to) throw new Error(LABELS.notFound.en);
    const tFrom = this._territories.get(from);
    const tTo = this._territories.get(to);
    if (!tFrom) throw new Error(LABELS.notFound.en + ': ' + from);
    if (!tTo) throw new Error(LABELS.notFound.en + ': ' + to);
    if (!tTo.active) throw new Error(LABELS.activeSwitch.en + ': ' + to);

    const id = this._nextHandoffId();
    const handoff = {
      id: id,
      from_territory: from,
      to_territory: to,
      effective_date: opts.effectiveDate || opts.effective_date || this._clock(),
      accounts: Array.isArray(opts.accounts) ? opts.accounts.slice() : [],
      reason: opts.reason || null,
      recorded_at: this._clock(),
    };
    this._handoffs.push(handoff);

    // move account ids across territory rosters (keep history)
    for (let i = 0; i < handoff.accounts.length; i += 1) {
      const accId = handoff.accounts[i];
      const idx = tFrom.account_ids.indexOf(accId);
      if (idx !== -1) tFrom.account_ids.splice(idx, 1);
      if (tTo.account_ids.indexOf(accId) === -1) tTo.account_ids.push(accId);
    }
    this._touch(tFrom);
    this._touch(tTo);
    return id;
  }

  listHandoffs(territoryId) {
    if (!territoryId) return this._handoffs.slice();
    return this._handoffs.filter(function (h) {
      return h.from_territory === territoryId || h.to_territory === territoryId;
    });
  }

  // ----- introspection ----------------------------------------------------
  regions() {
    const out = {};
    for (let i = 0; i < REGION_KEYS.length; i += 1) {
      const k = REGION_KEYS[i];
      out[k] = {
        key: k,
        name_he: REGIONS[k].he,
        name_en: REGIONS[k].en,
        city_count: REGIONS[k].cities.length,
        zip_range_count: REGIONS[k].zip_ranges.length,
      };
    }
    return out;
  }

  ruleTypes() {
    return shallowClone(RULE_TYPES);
  }

  accountRegion(account) {
    return resolveAccountRegion(account);
  }
}

// ─────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────

module.exports = {
  TerritoryManager: TerritoryManager,
  REGIONS: REGIONS,
  RULE_TYPES: RULE_TYPES,
  METRICS: METRICS,
  LABELS: LABELS,
  // low-level helpers exposed for tests / introspection
  _internals: {
    resolveRegionFromCity: resolveRegionFromCity,
    resolveRegionFromZip: resolveRegionFromZip,
    resolveAccountRegion: resolveAccountRegion,
    parseZip: parseZip,
    inZipRanges: inZipRanges,
    evalRule: evalRule,
    evalGeoRule: evalGeoRule,
    evalIndustryRule: evalIndustryRule,
    evalSizeRule: evalSizeRule,
    evalProductRule: evalProductRule,
  },
};
