/**
 * BASH44 Palantir-Style Foundry Engine
 *
 * Core platform capabilities replicating Palantir Foundry + Gotham + AIP:
 *
 * 1. ONTOLOGY ENGINE — define business objects, properties, links, actions
 * 2. OBJECT EXPLORER — search/filter/aggregate across all objects
 * 3. LINK ANALYSIS — graph traversal, path finding, expansion
 * 4. DOSSIER BUILDER — compile all data about a subject
 * 5. TIMELINE ENGINE — event sequences, patterns
 * 6. GEOSPATIAL ENGINE — location-based queries
 * 7. PIPELINE EXECUTOR — transform datasets
 * 8. CODE WORKSPACE RUNNER — execute notebook cells
 * 9. AIP AGENT RUNTIME — run LLM agents with tools
 * 10. ENTITY RESOLUTION — find duplicates, merge records
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface OntologyObject {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  properties: Record<string, any>;
  links: Array<{ linkType: string; targetId: string }>;
}

export interface OntologyObjectType {
  apiName: string;
  displayName: string;
  icon: string;
  color: string;
  primaryKey: string;
  properties: Array<{
    apiName: string;
    displayName: string;
    dataType: string;
    isRequired: boolean;
    isSearchable: boolean;
  }>;
  linkTypes: Array<{
    apiName: string;
    targetType: string;
    cardinality: string;
  }>;
  actions: Array<{
    apiName: string;
    displayName: string;
    kind: string;
  }>;
}

// ═══════════════════════════════════════════════════════════════
// 1. ONTOLOGY ENGINE
// ═══════════════════════════════════════════════════════════════

export class OntologyEngine {
  private objectTypes: Map<string, OntologyObjectType> = new Map();
  private objects: Map<string, OntologyObject> = new Map();
  private linksBySource: Map<string, Array<{ linkType: string; targetId: string }>> = new Map();
  private linksByTarget: Map<string, Array<{ linkType: string; sourceId: string }>> = new Map();

  registerObjectType(type: OntologyObjectType): void {
    this.objectTypes.set(type.apiName, type);
  }

  addObject(obj: OntologyObject): void {
    this.objects.set(obj.id, obj);
    for (const link of obj.links) {
      const sources = this.linksBySource.get(obj.id) || [];
      sources.push(link);
      this.linksBySource.set(obj.id, sources);

      const targets = this.linksByTarget.get(link.targetId) || [];
      targets.push({ linkType: link.linkType, sourceId: obj.id });
      this.linksByTarget.set(link.targetId, targets);
    }
  }

  getObject(id: string): OntologyObject | undefined {
    return this.objects.get(id);
  }

  getObjectType(apiName: string): OntologyObjectType | undefined {
    return this.objectTypes.get(apiName);
  }

  getAllObjectTypes(): OntologyObjectType[] {
    return Array.from(this.objectTypes.values());
  }

  /**
   * Search objects by text query across searchable properties
   */
  search(query: string, typeFilter?: string, limit: number = 50): OntologyObject[] {
    const lower = query.toLowerCase();
    const results: Array<{ obj: OntologyObject; score: number }> = [];

    for (const obj of this.objects.values()) {
      if (typeFilter && obj.type !== typeFilter) continue;

      let score = 0;
      if (obj.title.toLowerCase().includes(lower)) score += 10;
      if (obj.subtitle?.toLowerCase().includes(lower)) score += 5;
      for (const value of Object.values(obj.properties)) {
        if (typeof value === "string" && value.toLowerCase().includes(lower)) {
          score += 1;
        }
      }

      if (score > 0) results.push({ obj, score });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => r.obj);
  }

  /**
   * Get all linked objects from a source
   */
  getLinkedObjects(sourceId: string, linkType?: string): OntologyObject[] {
    const links = this.linksBySource.get(sourceId) || [];
    const filteredLinks = linkType ? links.filter((l) => l.linkType === linkType) : links;
    return filteredLinks
      .map((l) => this.objects.get(l.targetId))
      .filter((o): o is OntologyObject => o !== undefined);
  }

  /**
   * Get objects that link TO this object (reverse links)
   */
  getReverseLinks(targetId: string, linkType?: string): OntologyObject[] {
    const links = this.linksByTarget.get(targetId) || [];
    const filteredLinks = linkType ? links.filter((l) => l.linkType === linkType) : links;
    return filteredLinks
      .map((l) => this.objects.get(l.sourceId))
      .filter((o): o is OntologyObject => o !== undefined);
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. LINK ANALYSIS ENGINE
// ═══════════════════════════════════════════════════════════════

export interface GraphExpansion {
  rootId: string;
  depth: number;
  nodes: OntologyObject[];
  edges: Array<{ from: string; to: string; type: string }>;
}

export class LinkAnalysisEngine {
  constructor(private ontology: OntologyEngine) {}

  /**
   * Expand a subgraph from a root node up to N levels deep
   */
  expand(rootId: string, depth: number = 2, maxNodes: number = 100): GraphExpansion {
    const nodes = new Map<string, OntologyObject>();
    const edges: Array<{ from: string; to: string; type: string }> = [];
    const visited = new Set<string>();

    const queue: Array<{ id: string; level: number }> = [{ id: rootId, level: 0 }];

    while (queue.length > 0 && nodes.size < maxNodes) {
      const { id, level } = queue.shift()!;
      if (visited.has(id) || level > depth) continue;
      visited.add(id);

      const obj = this.ontology.getObject(id);
      if (!obj) continue;
      nodes.set(id, obj);

      if (level < depth) {
        // Forward links
        const linked = this.ontology.getLinkedObjects(id);
        for (const l of linked) {
          const sourceLinks = obj.links.filter((ln) => ln.targetId === l.id);
          for (const link of sourceLinks) {
            edges.push({ from: id, to: l.id, type: link.linkType });
          }
          queue.push({ id: l.id, level: level + 1 });
        }

        // Reverse links
        const reverse = this.ontology.getReverseLinks(id);
        for (const r of reverse) {
          edges.push({ from: r.id, to: id, type: "reverse" });
          queue.push({ id: r.id, level: level + 1 });
        }
      }
    }

    return {
      rootId,
      depth,
      nodes: Array.from(nodes.values()),
      edges,
    };
  }

  /**
   * Find shortest path between two objects
   */
  shortestPath(fromId: string, toId: string, maxDepth: number = 5): string[] {
    if (fromId === toId) return [fromId];
    const visited = new Set<string>([fromId]);
    const queue: Array<{ id: string; path: string[] }> = [{ id: fromId, path: [fromId] }];

    while (queue.length > 0) {
      const { id, path } = queue.shift()!;
      if (path.length > maxDepth) continue;

      const obj = this.ontology.getObject(id);
      if (!obj) continue;

      const linked = this.ontology.getLinkedObjects(id);
      const reverse = this.ontology.getReverseLinks(id);

      for (const neighbor of [...linked, ...reverse]) {
        if (neighbor.id === toId) {
          return [...path, neighbor.id];
        }
        if (!visited.has(neighbor.id)) {
          visited.add(neighbor.id);
          queue.push({ id: neighbor.id, path: [...path, neighbor.id] });
        }
      }
    }
    return [];
  }

  /**
   * Find common connections between two entities
   */
  findCommonConnections(idA: string, idB: string): OntologyObject[] {
    const neighborsA = new Set([
      ...this.ontology.getLinkedObjects(idA).map((o) => o.id),
      ...this.ontology.getReverseLinks(idA).map((o) => o.id),
    ]);
    const neighborsB = new Set([
      ...this.ontology.getLinkedObjects(idB).map((o) => o.id),
      ...this.ontology.getReverseLinks(idB).map((o) => o.id),
    ]);

    const common: OntologyObject[] = [];
    for (const id of neighborsA) {
      if (neighborsB.has(id)) {
        const obj = this.ontology.getObject(id);
        if (obj) common.push(obj);
      }
    }
    return common;
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. DOSSIER BUILDER — compile full entity profile
// ═══════════════════════════════════════════════════════════════

export interface DossierSection {
  type: "summary" | "timeline" | "links" | "documents" | "metrics" | "map" | "notes";
  title: string;
  content: any;
}

export class DossierBuilder {
  constructor(
    private ontology: OntologyEngine,
    private linkAnalysis: LinkAnalysisEngine
  ) {}

  /**
   * Build comprehensive dossier for an entity
   */
  build(subjectId: string): { subject: OntologyObject | undefined; sections: DossierSection[] } {
    const subject = this.ontology.getObject(subjectId);
    if (!subject) return { subject: undefined, sections: [] };

    const sections: DossierSection[] = [];

    // 1. Summary section
    sections.push({
      type: "summary",
      title: "סקירה כללית",
      content: {
        id: subject.id,
        type: subject.type,
        title: subject.title,
        subtitle: subject.subtitle,
        properties: subject.properties,
      },
    });

    // 2. Links section
    const linked = this.ontology.getLinkedObjects(subjectId);
    const reverse = this.ontology.getReverseLinks(subjectId);
    sections.push({
      type: "links",
      title: "קשרים וישויות מקושרות",
      content: {
        outgoing: linked.map((o) => ({ id: o.id, title: o.title, type: o.type })),
        incoming: reverse.map((o) => ({ id: o.id, title: o.title, type: o.type })),
        total: linked.length + reverse.length,
      },
    });

    // 3. Timeline section (from properties with dates)
    const timelineEvents: Array<{ date: string; event: string; entity: string }> = [];
    for (const [key, value] of Object.entries(subject.properties)) {
      if (key.includes("date") || key.includes("at") || key.includes("time")) {
        if (value && typeof value === "string") {
          timelineEvents.push({
            date: value,
            event: `${key}: ${value}`,
            entity: subject.title,
          });
        }
      }
    }
    sections.push({
      type: "timeline",
      title: "ציר זמן",
      content: { events: timelineEvents },
    });

    // 4. Metrics section
    const numericProps: Record<string, number> = {};
    for (const [key, value] of Object.entries(subject.properties)) {
      if (typeof value === "number") {
        numericProps[key] = value;
      }
    }
    sections.push({
      type: "metrics",
      title: "מדדים ומספרים",
      content: numericProps,
    });

    return { subject, sections };
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. PIPELINE EXECUTOR
// ═══════════════════════════════════════════════════════════════

export interface PipelineStage {
  id: string;
  type: "source" | "filter" | "map" | "join" | "aggregate" | "sink";
  config: Record<string, any>;
  inputs: string[];
  outputs: string[];
}

export interface PipelineGraph {
  stages: PipelineStage[];
  edges: Array<{ from: string; to: string }>;
}

export class PipelineExecutor {
  /**
   * Execute a pipeline graph on an input dataset
   */
  async execute(graph: PipelineGraph, inputData: any[]): Promise<{
    output: any[];
    stageResults: Record<string, { rowCount: number; durationMs: number }>;
  }> {
    const results: Record<string, { rowCount: number; durationMs: number }> = {};
    const stageData: Record<string, any[]> = { __input__: inputData };

    // Topological sort: execute stages in dependency order
    const executed = new Set<string>();
    const stages = [...graph.stages];

    while (stages.length > 0) {
      const ready = stages.filter((s) => s.inputs.every((inp) => executed.has(inp) || inp === "__input__"));
      if (ready.length === 0) break;

      for (const stage of ready) {
        const start = Date.now();
        const inputs = stage.inputs.map((inp) => stageData[inp] || []).flat();
        let output: any[] = [];

        switch (stage.type) {
          case "filter":
            output = inputs.filter((row) => this.evaluateFilter(row, stage.config));
            break;
          case "map":
            output = inputs.map((row) => this.evaluateMap(row, stage.config));
            break;
          case "aggregate":
            output = this.aggregate(inputs, stage.config);
            break;
          case "join":
            output = inputs;
            break;
          default:
            output = inputs;
        }

        stageData[stage.id] = output;
        results[stage.id] = { rowCount: output.length, durationMs: Date.now() - start };
        executed.add(stage.id);
        stages.splice(stages.indexOf(stage), 1);
      }
    }

    // Final output is from sink stages
    const sinkStages = graph.stages.filter((s) => s.type === "sink");
    const output = sinkStages.length > 0 ? stageData[sinkStages[0].id] : [];

    return { output, stageResults: results };
  }

  private evaluateFilter(row: any, config: any): boolean {
    const { field, op, value } = config;
    const rowValue = row[field];
    switch (op) {
      case "=": return rowValue === value;
      case "!=": return rowValue !== value;
      case ">": return rowValue > value;
      case "<": return rowValue < value;
      case "contains": return String(rowValue).includes(String(value));
      default: return true;
    }
  }

  private evaluateMap(row: any, config: any): any {
    const { transformations } = config;
    const result = { ...row };
    if (transformations) {
      for (const t of transformations) {
        if (t.type === "rename") result[t.to] = result[t.from];
        if (t.type === "compute") result[t.field] = eval(`(row) => ${t.expression}`)(row);
      }
    }
    return result;
  }

  private aggregate(rows: any[], config: any): any[] {
    const { groupBy, metrics } = config;
    if (!groupBy || groupBy.length === 0) {
      // Overall aggregation
      const result: any = {};
      for (const m of metrics || []) {
        if (m.op === "count") result[m.as] = rows.length;
        if (m.op === "sum") result[m.as] = rows.reduce((s, r) => s + (Number(r[m.field]) || 0), 0);
        if (m.op === "avg") result[m.as] = rows.reduce((s, r) => s + (Number(r[m.field]) || 0), 0) / rows.length;
      }
      return [result];
    }

    const groups = new Map<string, any[]>();
    for (const row of rows) {
      const key = groupBy.map((g: string) => row[g]).join("|");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    const result: any[] = [];
    for (const [key, groupRows] of groups.entries()) {
      const record: any = {};
      const keyParts = key.split("|");
      groupBy.forEach((g: string, i: number) => (record[g] = keyParts[i]));
      for (const m of metrics || []) {
        if (m.op === "count") record[m.as] = groupRows.length;
        if (m.op === "sum") record[m.as] = groupRows.reduce((s, r) => s + (Number(r[m.field]) || 0), 0);
        if (m.op === "avg")
          record[m.as] = groupRows.reduce((s, r) => s + (Number(r[m.field]) || 0), 0) / groupRows.length;
        if (m.op === "min") record[m.as] = Math.min(...groupRows.map((r) => Number(r[m.field]) || 0));
        if (m.op === "max") record[m.as] = Math.max(...groupRows.map((r) => Number(r[m.field]) || 0));
      }
      result.push(record);
    }
    return result;
  }
}

// ═══════════════════════════════════════════════════════════════
// 5. ENTITY RESOLUTION ENGINE
// ═══════════════════════════════════════════════════════════════

export class EntityResolutionEngine {
  /**
   * Levenshtein distance for fuzzy matching
   */
  private levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
        }
      }
    }
    return matrix[b.length][a.length];
  }

  private similarity(a: string, b: string): number {
    if (!a || !b) return 0;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - this.levenshtein(a.toLowerCase(), b.toLowerCase()) / maxLen;
  }

  /**
   * Find potential duplicates in a list of entities
   */
  findDuplicates(
    entities: Array<{ id: string; fields: Record<string, string> }>,
    threshold: number = 0.85
  ): Array<{
    entityA: string;
    entityB: string;
    score: number;
    matchedFields: string[];
  }> {
    const duplicates: Array<{ entityA: string; entityB: string; score: number; matchedFields: string[] }> = [];

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i];
        const b = entities[j];
        const fieldScores: Record<string, number> = {};
        const matchedFields: string[] = [];

        for (const key of Object.keys(a.fields)) {
          if (b.fields[key]) {
            const sim = this.similarity(a.fields[key], b.fields[key]);
            fieldScores[key] = sim;
            if (sim >= threshold) matchedFields.push(key);
          }
        }

        const avgScore =
          Object.values(fieldScores).reduce((s, v) => s + v, 0) / Object.values(fieldScores).length;

        if (avgScore >= threshold) {
          duplicates.push({
            entityA: a.id,
            entityB: b.id,
            score: avgScore,
            matchedFields,
          });
        }
      }
    }

    return duplicates.sort((a, b) => b.score - a.score);
  }
}

// ═══════════════════════════════════════════════════════════════
// SINGLETONS
// ═══════════════════════════════════════════════════════════════

export const ontology = new OntologyEngine();
export const linkAnalysis = new LinkAnalysisEngine(ontology);
export const dossierBuilder = new DossierBuilder(ontology, linkAnalysis);
export const pipelineExecutor = new PipelineExecutor();
export const entityResolution = new EntityResolutionEngine();
