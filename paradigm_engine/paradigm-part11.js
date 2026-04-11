// ════════════════════════════════════════════════════════════════════════════════
// PARADIGM ENGINE v4.0 — PART 11
// PALANTIR-STYLE: ONTOLOGY ENGINE + FOUNDRY PIPELINE BUILDER + REALTIME BRIDGE
// ════════════════════════════════════════════════════════════════════════════════
//
// What Palantir built (and why):
//   1. ONTOLOGY ENGINE — every entity is an Object with properties + LINKS to other
//      Objects. Not tables. A graph of living entities. The Customer object knows
//      its Projects, Invoices, Calls, Reviews, all via typed links.
//   2. FOUNDRY PIPELINE BUILDER — connect any source → clean → unify → real-time
//      sync. Lineage tracked. Quality scored. Versioned.
//   3. REALTIME BRIDGE — WebSocket-style event stream for every change in the graph.
//
// What Techno-Kol Uzi actually needs:
//   PostgreSQL + WebSockets + React. Not Spark/Kafka — wrong scale for 30 employees.
//   So Part 11 implements the ONTOLOGY shape with in-memory graph + JSON persistence,
//   the PIPELINE shape with simple connectors and lineage, and the REALTIME shape
//   with a tiny event bus + Server-Sent-Events HTTP endpoint.
// ════════════════════════════════════════════════════════════════════════════════

const { CONFIG, uid, now, today, save, load, agorot, shekel, log } = require("./paradigm-part1");
const path = require("path");
const fs = require("fs");
const http = require("http");

["ontology", "pipeline", "events"].forEach(d => {
  const p = path.join(CONFIG.DIR, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// ═══════════════════════════════════════
// ONTOLOGY ENGINE — Graph of Living Entities
// ═══════════════════════════════════════
//
// Object types are first-class. Each type defines its properties and its links
// (typed edges) to other types. Objects can be created, linked, queried by
// property OR by graph traversal, and every change emits an event.

class OntologyEngine {
  constructor(memory, eventBus = null) {
    this.memory = memory;
    this.eventBus = eventBus;
    this.file = path.join(CONFIG.DIR, "ontology", "graph.json");
    this.data = load(this.file, {
      objectTypes: this._defaultTypes(),
      objects: {},        // typeId → { id → object }
      links: [],          // [{ from: {type, id}, to: {type, id}, linkType, properties, t }]
      indexes: {},        // typeId → { propName → Map(value → Set(id)) }
      stats: { totalObjects: 0, totalLinks: 0, byType: {} },
    });

    // Build/rebuild indexes from persisted state
    for (const typeId of Object.keys(this.data.objects)) {
      this.data.indexes[typeId] = this.data.indexes[typeId] || {};
    }
  }
  save() { save(this.file, this.data); }

  _defaultTypes() {
    return {
      Customer: {
        id: "Customer", icon: "👤", color: "#5b8def",
        properties: ["name", "phone", "email", "city", "address", "language", "preferredChannel", "ltv"],
        links: {
          owns_project: "Project",
          received_quote: "Quote",
          paid_invoice: "Invoice",
          had_call: "Call",
          left_review: "Review",
          referred_by: "Customer",
          lives_in: "Property",
        },
      },
      Project: {
        id: "Project", icon: "📦", color: "#22c55e",
        properties: ["name", "type", "status", "estimatedDays", "actualDays", "marginPercent"],
        links: {
          belongs_to_customer: "Customer",
          uses_bom: "BOM",
          generated_invoice: "Invoice",
          measured_by: "Employee",
          installed_by: "Employee",
          inspected_in: "Inspection",
          covered_by_warranty: "Warranty",
        },
      },
      Quote: {
        id: "Quote", icon: "💰", color: "#f59e0b",
        properties: ["number", "total", "marginPercent", "status", "validUntil"],
        links: { for_customer: "Customer", for_project: "Project", became_invoice: "Invoice" },
      },
      Invoice: {
        id: "Invoice", icon: "🧾", color: "#06b6d4",
        properties: ["number", "total", "vat", "status", "dueDate", "paid", "outstanding"],
        links: { billed_to: "Customer", for_project: "Project", paid_via: "PaymentMethod" },
      },
      Employee: {
        id: "Employee", icon: "👷", color: "#a855f7",
        properties: ["name", "role", "department", "monthlySalary", "wellnessScore"],
        links: {
          works_on_project: "Project",
          performed_inspection: "Inspection",
          drove_vehicle: "Vehicle",
          reported_to: "Employee",
        },
      },
      Supplier: {
        id: "Supplier", icon: "🏭", color: "#ef4444",
        properties: ["name", "category", "leadTimeDays", "rating", "tier"],
        links: { supplies_item: "InventoryItem", received_po: "PurchaseOrder" },
      },
      InventoryItem: {
        id: "InventoryItem", icon: "📦", color: "#84cc16",
        properties: ["sku", "name", "qty", "minQty", "costPerUnit", "unit"],
        links: { supplied_by: "Supplier", used_in_project: "Project", part_of_bom: "BOM" },
      },
      BOM: {
        id: "BOM", icon: "📋", color: "#0ea5e9",
        properties: ["templateName", "totalCost", "sellingPrice", "marginPercent"],
        links: { used_in_project: "Project", contains_item: "InventoryItem" },
      },
      PurchaseOrder: {
        id: "PurchaseOrder", icon: "📝", color: "#f97316",
        properties: ["number", "total", "status", "urgency"],
        links: { from_supplier: "Supplier", for_project: "Project" },
      },
      Vehicle: {
        id: "Vehicle", icon: "🚐", color: "#14b8a6",
        properties: ["plateNumber", "type", "status", "fuelLevel"],
        links: { driven_by: "Employee", currently_at: "Location" },
      },
      Inspection: {
        id: "Inspection", icon: "🔍", color: "#ec4899",
        properties: ["stage", "result", "score"],
        links: { for_project: "Project", inspected_by: "Employee", found_defect: "Defect" },
      },
      Defect: {
        id: "Defect", icon: "⚠️", color: "#dc2626",
        properties: ["type", "severity", "status", "description"],
        links: { found_in_inspection: "Inspection", related_to_project: "Project" },
      },
      Warranty: {
        id: "Warranty", icon: "🛡️", color: "#10b981",
        properties: ["productType", "startDate", "endDate", "durationYears"],
        links: { covers_project: "Project", belongs_to_customer: "Customer" },
      },
      Property: {
        id: "Property", icon: "🏠", color: "#8b5cf6",
        properties: ["location", "type", "rooms", "sqm", "price", "currency"],
        links: { listed_by: "Employee", interested_lead: "Lead" },
      },
      Lead: {
        id: "Lead", icon: "🎯", color: "#fbbf24",
        properties: ["name", "source", "score", "status", "estimatedValue"],
        links: { interested_in_property: "Property", became_customer: "Customer" },
      },
      Call: {
        id: "Call", icon: "📞", color: "#06b6d4",
        properties: ["direction", "duration", "result", "sentiment"],
        links: { with_customer: "Customer", handled_by: "Employee" },
      },
      Review: {
        id: "Review", icon: "⭐", color: "#facc15",
        properties: ["score", "platform", "comment", "verified"],
        links: { from_customer: "Customer", about_project: "Project" },
      },
      Competitor: {
        id: "Competitor", icon: "⚔️", color: "#7c3aed",
        properties: ["name", "tier", "marketShare", "priceIndex"],
        links: { competes_in_market: "Market" },
      },
      Market: {
        id: "Market", icon: "🌍", color: "#0891b2",
        properties: ["name", "size", "growth"],
        links: {},
      },
      Location: {
        id: "Location", icon: "📍", color: "#65a30d",
        properties: ["lat", "lng", "name", "type"],
        links: {},
      },
    };
  }

  // ── Object CRUD ──
  createObject(typeId, properties, id = null) {
    const type = this.data.objectTypes[typeId];
    if (!type) {
      log("ONTOLOGY", `❌ Unknown type: ${typeId}`, "ERROR");
      return null;
    }

    const objectId = id || `${typeId}-${uid()}`;
    if (!this.data.objects[typeId]) this.data.objects[typeId] = {};
    if (!this.data.indexes[typeId]) this.data.indexes[typeId] = {};

    const obj = {
      _type: typeId,
      _id: objectId,
      _createdAt: now(),
      _updatedAt: now(),
      _version: 1,
      ...properties,
    };

    this.data.objects[typeId][objectId] = obj;
    this.data.stats.totalObjects++;
    this.data.stats.byType[typeId] = (this.data.stats.byType[typeId] || 0) + 1;

    // Update indexes
    for (const [prop, value] of Object.entries(properties)) {
      this._addToIndex(typeId, prop, value, objectId);
    }

    this.save();
    this._emit("object.created", { type: typeId, id: objectId, properties });
    return obj;
  }

  getObject(typeId, id) {
    return this.data.objects[typeId]?.[id] || null;
  }

  updateObject(typeId, id, updates) {
    const obj = this.getObject(typeId, id);
    if (!obj) return null;

    // Remove old index entries
    for (const [prop, oldValue] of Object.entries(obj)) {
      if (prop.startsWith("_")) continue;
      if (updates[prop] !== undefined && updates[prop] !== oldValue) {
        this._removeFromIndex(typeId, prop, oldValue, id);
      }
    }

    Object.assign(obj, updates, { _updatedAt: now(), _version: obj._version + 1 });

    // Add new index entries
    for (const [prop, value] of Object.entries(updates)) {
      this._addToIndex(typeId, prop, value, id);
    }

    this.save();
    this._emit("object.updated", { type: typeId, id, updates });
    return obj;
  }

  deleteObject(typeId, id) {
    const obj = this.getObject(typeId, id);
    if (!obj) return false;

    // Remove from indexes
    for (const [prop, value] of Object.entries(obj)) {
      if (prop.startsWith("_")) continue;
      this._removeFromIndex(typeId, prop, value, id);
    }

    // Remove all links involving this object
    this.data.links = this.data.links.filter(l =>
      !(l.from.type === typeId && l.from.id === id) &&
      !(l.to.type === typeId && l.to.id === id)
    );

    delete this.data.objects[typeId][id];
    this.data.stats.totalObjects--;
    this.data.stats.byType[typeId] = Math.max(0, (this.data.stats.byType[typeId] || 0) - 1);

    this.save();
    this._emit("object.deleted", { type: typeId, id });
    return true;
  }

  // ── Link management ──
  link(fromType, fromId, linkType, toType, toId, linkProperties = {}) {
    const fromObj = this.getObject(fromType, fromId);
    const toObj = this.getObject(toType, toId);
    if (!fromObj || !toObj) return null;

    const link = {
      from: { type: fromType, id: fromId },
      to: { type: toType, id: toId },
      linkType,
      properties: linkProperties,
      t: now(),
    };
    this.data.links.push(link);
    this.data.stats.totalLinks++;
    this.save();
    this._emit("link.created", link);
    return link;
  }

  unlink(fromType, fromId, linkType, toType, toId) {
    const before = this.data.links.length;
    this.data.links = this.data.links.filter(l =>
      !(l.from.type === fromType && l.from.id === fromId && l.linkType === linkType && l.to.type === toType && l.to.id === toId)
    );
    const removed = before - this.data.links.length;
    if (removed > 0) {
      this.data.stats.totalLinks -= removed;
      this.save();
      this._emit("link.removed", { fromType, fromId, linkType, toType, toId });
    }
    return removed;
  }

  // ── Graph traversal ──
  getLinks(typeId, id, linkType = null, direction = "out") {
    return this.data.links.filter(l => {
      if (direction === "out") {
        if (l.from.type !== typeId || l.from.id !== id) return false;
      } else if (direction === "in") {
        if (l.to.type !== typeId || l.to.id !== id) return false;
      } else { // both
        const matchesOut = l.from.type === typeId && l.from.id === id;
        const matchesIn = l.to.type === typeId && l.to.id === id;
        if (!matchesOut && !matchesIn) return false;
      }
      if (linkType && l.linkType !== linkType) return false;
      return true;
    });
  }

  getLinkedObjects(typeId, id, linkType = null, direction = "out") {
    const links = this.getLinks(typeId, id, linkType, direction);
    return links.map(l => {
      const otherEnd = l.from.type === typeId && l.from.id === id ? l.to : l.from;
      return this.getObject(otherEnd.type, otherEnd.id);
    }).filter(Boolean);
  }

  // BFS traversal: find all objects within N hops from a starting object
  traverse(startType, startId, maxHops = 2) {
    const visited = new Set([`${startType}:${startId}`]);
    const result = [{ type: startType, id: startId, depth: 0, object: this.getObject(startType, startId) }];
    let frontier = [{ type: startType, id: startId, depth: 0 }];

    for (let hop = 0; hop < maxHops; hop++) {
      const next = [];
      for (const node of frontier) {
        const links = this.getLinks(node.type, node.id, null, "both");
        for (const link of links) {
          const otherEnd = link.from.type === node.type && link.from.id === node.id ? link.to : link.from;
          const key = `${otherEnd.type}:${otherEnd.id}`;
          if (visited.has(key)) continue;
          visited.add(key);
          const obj = this.getObject(otherEnd.type, otherEnd.id);
          if (obj) {
            next.push({ type: otherEnd.type, id: otherEnd.id, depth: hop + 1 });
            result.push({ type: otherEnd.type, id: otherEnd.id, depth: hop + 1, object: obj });
          }
        }
      }
      frontier = next;
      if (frontier.length === 0) break;
    }

    return result;
  }

  // Find objects by property value (uses index)
  findByProperty(typeId, property, value) {
    const idx = this.data.indexes[typeId]?.[property];
    if (!idx) {
      // Fallback to linear scan
      const objects = this.data.objects[typeId] || {};
      return Object.values(objects).filter(o => o[property] === value);
    }
    const ids = idx[String(value)];
    if (!ids) return [];
    return ids.map(id => this.getObject(typeId, id)).filter(Boolean);
  }

  query(typeId, predicate) {
    const objects = this.data.objects[typeId] || {};
    return Object.values(objects).filter(predicate);
  }

  // ── Indexing helpers ──
  _addToIndex(typeId, prop, value, id) {
    if (value === undefined || value === null || typeof value === "object") return;
    if (!this.data.indexes[typeId]) this.data.indexes[typeId] = {};
    if (!this.data.indexes[typeId][prop]) this.data.indexes[typeId][prop] = {};
    const key = String(value);
    if (!this.data.indexes[typeId][prop][key]) this.data.indexes[typeId][prop][key] = [];
    if (!this.data.indexes[typeId][prop][key].includes(id)) {
      this.data.indexes[typeId][prop][key].push(id);
    }
  }

  _removeFromIndex(typeId, prop, value, id) {
    if (value === undefined || value === null || typeof value === "object") return;
    const key = String(value);
    const arr = this.data.indexes[typeId]?.[prop]?.[key];
    if (!arr) return;
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
    if (arr.length === 0) delete this.data.indexes[typeId][prop][key];
  }

  _emit(eventType, payload) {
    if (this.eventBus) {
      this.eventBus.emit(eventType, payload);
    }
  }

  // ── Higher-level helpers / domain shortcuts ──
  getCustomerView(customerId) {
    const customer = this.getObject("Customer", customerId);
    if (!customer) return null;

    return {
      customer,
      projects: this.getLinkedObjects("Customer", customerId, "owns_project"),
      quotes: this.getLinkedObjects("Customer", customerId, "received_quote"),
      invoices: this.getLinkedObjects("Customer", customerId, "paid_invoice"),
      calls: this.getLinkedObjects("Customer", customerId, "had_call"),
      reviews: this.getLinkedObjects("Customer", customerId, "left_review"),
      neighborhood: this.traverse("Customer", customerId, 2).filter(n => n.depth === 2),
    };
  }

  getProjectView(projectId) {
    const project = this.getObject("Project", projectId);
    if (!project) return null;

    return {
      project,
      customer: this.getLinkedObjects("Project", projectId, "belongs_to_customer", "out")[0] || null,
      bom: this.getLinkedObjects("Project", projectId, "uses_bom", "out")[0] || null,
      invoice: this.getLinkedObjects("Project", projectId, "generated_invoice", "out")[0] || null,
      measuredBy: this.getLinkedObjects("Project", projectId, "measured_by", "out")[0] || null,
      installedBy: this.getLinkedObjects("Project", projectId, "installed_by", "out"),
      inspections: this.getLinkedObjects("Project", projectId, "inspected_in", "out"),
      warranty: this.getLinkedObjects("Project", projectId, "covered_by_warranty", "out")[0] || null,
    };
  }

  getStats() {
    return {
      types: Object.keys(this.data.objectTypes).length,
      totalObjects: this.data.stats.totalObjects,
      totalLinks: this.data.stats.totalLinks,
      byType: this.data.stats.byType,
    };
  }
}

// ═══════════════════════════════════════
// PIPELINE BUILDER (Foundry-style)
// Source → Clean → Transform → Load → Lineage
// ═══════════════════════════════════════

class PipelineBuilder {
  constructor(memory, ontology) {
    this.memory = memory;
    this.ontology = ontology;
    this.file = path.join(CONFIG.DIR, "pipeline", "state.json");
    this.data = load(this.file, {
      pipelines: [],
      datasets: {},          // datasetId → { columns, rows, lineage }
      sources: {},
      lineage: [],           // [{ from, to, transform, t }]
      runs: [],
      stats: { runs: 0, recordsProcessed: 0, errors: 0 },
    });
  }
  save() { save(this.file, this.data); }

  // ── Pipeline definition ──
  createPipeline(definition) {
    const pipeline = {
      id: `PIPE-${uid()}`,
      name: definition.name,
      description: definition.description || "",
      steps: definition.steps || [], // [{type: "extract"|"clean"|"transform"|"join"|"load", config}]
      schedule: definition.schedule || null, // cron-like or null for manual
      onContact: definition.onContact || null, // ontology type to materialize into
      status: "draft",
      lastRunAt: null,
      lastRunStatus: null,
      createdAt: now(),
    };
    this.data.pipelines.push(pipeline);
    this.save();
    log("PIPELINE", `🔧 ${pipeline.name} (${pipeline.steps.length} steps)`);
    return pipeline;
  }

  // ── Built-in cleaners ──
  static cleaners = {
    trim: (value) => typeof value === "string" ? value.trim() : value,
    lowercase: (value) => typeof value === "string" ? value.toLowerCase() : value,
    uppercase: (value) => typeof value === "string" ? value.toUpperCase() : value,
    normalizePhoneIL: (value) => {
      if (typeof value !== "string") return value;
      let n = value.replace(/[^\d]/g, "");
      if (n.startsWith("972")) n = "0" + n.substring(3);
      if (n.length === 9 && !n.startsWith("0")) n = "0" + n;
      if (n.length === 10) return `${n.substring(0, 3)}-${n.substring(3)}`;
      return value;
    },
    normalizeEmail: (value) => typeof value === "string" ? value.trim().toLowerCase() : value,
    parseInt: (value) => {
      const n = parseInt(value, 10);
      return Number.isNaN(n) ? 0 : n;
    },
    parseFloat: (value) => {
      const n = parseFloat(value);
      return Number.isNaN(n) ? 0 : n;
    },
    parseAgorot: (value) => {
      // "₪1,234.56" → 123456
      if (typeof value === "number") return Math.round(value * 100);
      const str = String(value).replace(/[^\d.]/g, "");
      const f = parseFloat(str);
      return Number.isNaN(f) ? 0 : Math.round(f * 100);
    },
    nullable: (value) => (value === "" || value === undefined ? null : value),
    requireNonEmpty: (value) => {
      if (value === null || value === undefined || value === "") {
        throw new Error("required field is empty");
      }
      return value;
    },
  };

  applyClean(record, cleanRules) {
    const cleaned = { ...record };
    const errors = [];
    for (const [field, rules] of Object.entries(cleanRules)) {
      const ruleList = Array.isArray(rules) ? rules : [rules];
      for (const ruleName of ruleList) {
        try {
          const cleaner = PipelineBuilder.cleaners[ruleName];
          if (cleaner) cleaned[field] = cleaner(cleaned[field]);
        } catch (e) {
          errors.push({ field, rule: ruleName, error: e.message });
        }
      }
    }
    return { cleaned, errors };
  }

  // ── Run a pipeline ──
  async runPipeline(pipelineId, sourceData = []) {
    const pipeline = this.data.pipelines.find(p => p.id === pipelineId);
    if (!pipeline) {
      log("PIPELINE", `❌ Pipeline ${pipelineId} not found`, "ERROR");
      return null;
    }

    const runId = `RUN-${uid()}`;
    const startTime = Date.now();
    let records = [...sourceData];
    let errors = [];

    log("PIPELINE", `▶️  Running ${pipeline.name} (${records.length} records)`);

    for (const step of pipeline.steps) {
      try {
        if (step.type === "clean" && step.config?.rules) {
          const cleanedRecords = [];
          for (const r of records) {
            const { cleaned, errors: errs } = this.applyClean(r, step.config.rules);
            if (errs.length === 0) {
              cleanedRecords.push(cleaned);
            } else {
              errors.push(...errs);
            }
          }
          records = cleanedRecords;
        } else if (step.type === "filter" && typeof step.config?.predicate === "function") {
          records = records.filter(step.config.predicate);
        } else if (step.type === "transform" && typeof step.config?.fn === "function") {
          records = records.map(step.config.fn);
        } else if (step.type === "load" && step.config?.intoOntologyType) {
          for (const r of records) {
            this.ontology.createObject(step.config.intoOntologyType, r);
          }
        } else if (step.type === "dedupe" && step.config?.key) {
          const seen = new Set();
          records = records.filter(r => {
            const k = r[step.config.key];
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
        }
      } catch (e) {
        errors.push({ step: step.type, error: e.message });
      }
    }

    const duration = Date.now() - startTime;
    const run = {
      id: runId,
      pipelineId,
      pipelineName: pipeline.name,
      inputCount: sourceData.length,
      outputCount: records.length,
      errors: errors.length,
      errorDetails: errors.slice(0, 20),
      durationMs: duration,
      status: errors.length === 0 ? "success" : (records.length > 0 ? "partial" : "failed"),
      startedAt: new Date(startTime).toISOString(),
      finishedAt: now(),
    };
    this.data.runs.push(run);
    this.data.runs = this.data.runs.slice(-200);
    this.data.stats.runs++;
    this.data.stats.recordsProcessed += records.length;
    this.data.stats.errors += errors.length;

    pipeline.lastRunAt = now();
    pipeline.lastRunStatus = run.status;
    pipeline.status = "active";

    // Track lineage
    for (const r of records.slice(0, 10)) {
      this.data.lineage.push({
        pipelineId,
        recordSnapshot: JSON.stringify(r).substring(0, 200),
        t: now(),
      });
    }
    this.data.lineage = this.data.lineage.slice(-500);

    this.save();
    log("PIPELINE", `${run.status === "success" ? "✅" : run.status === "partial" ? "⚠️" : "❌"} ${pipeline.name}: ${run.inputCount}→${run.outputCount} (${duration}ms, ${errors.length} errors)`,
      run.status === "success" ? "SUCCESS" : run.status === "partial" ? "WARN" : "ERROR");
    return { run, records };
  }

  // ── Convenience: end-to-end CSV-like ingest into ontology ──
  async ingestIntoOntology(sourceData, ontologyType, cleanRules = {}) {
    const pipeline = this.createPipeline({
      name: `Ingest → ${ontologyType}`,
      description: "Auto-generated ingestion pipeline",
      steps: [
        { type: "clean", config: { rules: cleanRules } },
        { type: "load", config: { intoOntologyType: ontologyType } },
      ],
    });
    return await this.runPipeline(pipeline.id, sourceData);
  }

  getStats() {
    return {
      pipelines: this.data.pipelines.length,
      activePipelines: this.data.pipelines.filter(p => p.status === "active").length,
      totalRuns: this.data.stats.runs,
      recordsProcessed: this.data.stats.recordsProcessed,
      errorsTotal: this.data.stats.errors,
    };
  }
}

// ═══════════════════════════════════════
// EVENT BUS — In-process pub/sub for ontology + pipeline events
// ═══════════════════════════════════════

class EventBus {
  constructor() {
    this.subscribers = {}; // eventType → [{id, callback}]
    this.history = [];
    this.maxHistory = 1000;
  }

  emit(eventType, payload) {
    const event = { type: eventType, payload, t: now() };
    this.history.push(event);
    if (this.history.length > this.maxHistory) this.history.shift();

    // Match exact and wildcard subscribers
    const subs = [
      ...(this.subscribers[eventType] || []),
      ...(this.subscribers["*"] || []),
    ];
    for (const sub of subs) {
      try { sub.callback(event); } catch (e) { /* swallow subscriber errors */ }
    }
    return event;
  }

  subscribe(eventType, callback) {
    if (!this.subscribers[eventType]) this.subscribers[eventType] = [];
    const id = uid();
    this.subscribers[eventType].push({ id, callback });
    return id;
  }

  unsubscribe(eventType, id) {
    if (!this.subscribers[eventType]) return false;
    const before = this.subscribers[eventType].length;
    this.subscribers[eventType] = this.subscribers[eventType].filter(s => s.id !== id);
    return this.subscribers[eventType].length < before;
  }

  getRecentEvents(limit = 50, type = null) {
    let events = type ? this.history.filter(e => e.type === type) : this.history;
    return events.slice(-limit);
  }

  getStats() {
    return {
      totalEvents: this.history.length,
      subscribers: Object.entries(this.subscribers).reduce((s, [_, arr]) => s + arr.length, 0),
      eventTypes: [...new Set(this.history.map(e => e.type))],
    };
  }
}

// ═══════════════════════════════════════
// REALTIME BRIDGE — Server-Sent Events HTTP endpoint
// React frontend connects to /events for live updates
// ═══════════════════════════════════════

class RealtimeBridge {
  constructor(eventBus, port = 7401) {
    this.eventBus = eventBus;
    this.port = port;
    this.server = null;
    this.running = false;
    this.connections = new Set();

    // Forward all events to all SSE connections
    this.eventBus.subscribe("*", (event) => {
      const data = `data: ${JSON.stringify(event)}\n\n`;
      for (const conn of this.connections) {
        try { conn.write(data); } catch { /* connection closed */ }
      }
    });
  }

  start() {
    if (this.running) return;
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    this.server.listen(this.port, () => {
      this.running = true;
      log("REALTIME", `📡 Event stream live at http://localhost:${this.port}/events`);
    });
  }

  stop() {
    for (const conn of this.connections) {
      try { conn.end(); } catch {}
    }
    this.connections.clear();
    if (this.server) {
      this.server.close();
      this.running = false;
    }
  }

  handleRequest(req, res) {
    const url = new URL(req.url, `http://localhost:${this.port}`);
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (url.pathname === "/events") {
      // Server-Sent Events stream
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });
      res.write(`data: ${JSON.stringify({ type: "connected", payload: { t: now() } })}\n\n`);
      this.connections.add(res);
      req.on("close", () => this.connections.delete(res));
    } else if (url.pathname === "/events/recent") {
      res.setHeader("Content-Type", "application/json");
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      const type = url.searchParams.get("type") || null;
      res.end(JSON.stringify(this.eventBus.getRecentEvents(limit, type)));
    } else if (url.pathname === "/events/stats") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        ...this.eventBus.getStats(),
        activeConnections: this.connections.size,
      }));
    } else {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "not_found" }));
    }
  }

  getStatus() {
    return {
      running: this.running,
      port: this.port,
      activeConnections: this.connections.size,
    };
  }
}

// ═══════════════════════════════════════
// EXPORT PART 11
// ═══════════════════════════════════════

module.exports = {
  OntologyEngine,
  PipelineBuilder,
  EventBus,
  RealtimeBridge,
};
