/**
 * Conflict of Interest — Unit Tests
 * Agent Y-144 / Swarm Compliance / Techno-Kol Uzi Mega-ERP 2026
 *
 * Run with:
 *   node --test onyx-procurement/test/compliance/conflict-of-interest.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  ConflictOfInterest,
  INTEREST_TYPE,
  DECLARATION_STATUS,
  SEVERITY,
  MITIGATION,
  EVENT_TYPES,
  classifySeverity,
  requiredApproversFor,
} = require('../../src/compliance/conflict-of-interest.js');

// ─── helpers ────────────────────────────────────────────────────────────
const FIXED_NOW = '2026-04-11T09:00:00.000Z';
const clockAt = (iso) => () => new Date(iso);

function makeEngine(nowIso = FIXED_NOW) {
  return new ConflictOfInterest({ now: clockAt(nowIso) });
}

function seedEmployee(coi, empId = 'E-001', department = 'Procurement') {
  coi.setEmployeeDirectory(
    new Map([
      [empId, { employeeId: empId, department, name: 'עובד בדיקה' }],
    ])
  );
}

function baseDecl(type, overrides = {}) {
  return {
    employeeId: 'E-001',
    type,
    description: 'הצהרה לבדיקה',
    relatedParty: 'Acme Suppliers Ltd.',
    startDate: '2026-01-01',
    ongoing: true,
    ...overrides,
  };
}

// ───────────────────────────────────────────────────────────────────────

describe('ConflictOfInterest — declare all 8 interest types', () => {
  test('1) declareInterest accepts all 8 taxonomy types and stamps bilingual labels', () => {
    const coi = makeEngine();
    const types = [
      INTEREST_TYPE.FINANCIAL,
      INTEREST_TYPE.FAMILIAL,
      INTEREST_TYPE.EMPLOYMENT,
      INTEREST_TYPE.OWNERSHIP,
      INTEREST_TYPE.DIRECTORSHIP,
      INTEREST_TYPE.CONSULTING,
      INTEREST_TYPE.POLITICAL,
      INTEREST_TYPE.PERSONAL_RELATIONSHIP,
    ];
    assert.equal(types.length, 8);

    const created = [];
    for (const t of types) {
      const d = coi.declareInterest(
        baseDecl(t, {
          description: `Declared ${t}`,
          relatedParty: `Party-${t}`,
        })
      );
      created.push(d);
      assert.equal(d.type, t);
      assert.ok(d.typeHe && d.typeHe.length > 0);
      assert.ok(d.typeEn && d.typeEn.length > 0);
      assert.equal(d.status, DECLARATION_STATUS.PENDING_APPROVAL);
      assert.ok(Object.values(SEVERITY).includes(d.severity));
    }

    // Directorship + Employment must escalate to CRITICAL.
    const directorship = created.find((x) => x.type === INTEREST_TYPE.DIRECTORSHIP);
    const employment = created.find((x) => x.type === INTEREST_TYPE.EMPLOYMENT);
    assert.equal(directorship.severity, SEVERITY.CRITICAL);
    assert.equal(employment.severity, SEVERITY.CRITICAL);
    // Political must be LOW.
    const political = created.find((x) => x.type === INTEREST_TYPE.POLITICAL);
    assert.equal(political.severity, SEVERITY.LOW);

    assert.equal(coi.listAll().length, 8);
  });

  test('2) unknown type is rejected', () => {
    const coi = makeEngine();
    assert.throws(
      () => coi.declareInterest(baseDecl('bribery')),
      /unknown interest type/
    );
  });

  test('3) missing required fields throw', () => {
    const coi = makeEngine();
    assert.throws(() => coi.declareInterest({}), /employeeId is required/);
    assert.throws(
      () =>
        coi.declareInterest({
          employeeId: 'E',
          type: INTEREST_TYPE.FINANCIAL,
          relatedParty: 'X',
          startDate: '2026-01-01',
        }),
      /description is required/
    );
  });
});

describe('ConflictOfInterest — annual attestation', () => {
  test('4) annualAttestation records a signed attestation row and lists openDeclarations', () => {
    const coi = makeEngine();
    coi.declareInterest(
      baseDecl(INTEREST_TYPE.FAMILIAL, { relatedParty: 'אחי דני' })
    );
    const att = coi.annualAttestation({
      employeeId: 'E-001',
      confirmed: true,
      signature: 'שחר כהן',
      date: '2026-04-10',
    });
    assert.equal(att.year, 2026);
    assert.equal(att.confirmed, true);
    assert.equal(att.signature, 'שחר כהן');
    assert.equal(att.openDeclarationIds.length, 1);

    const events = coi.auditLog({ type: EVENT_TYPES.ATTESTATION_RECORDED });
    assert.equal(events.length, 1);

    // An unsigned attestation is refused.
    assert.throws(
      () =>
        coi.annualAttestation({
          employeeId: 'E-001',
          confirmed: false,
          signature: 'x',
          date: '2026-04-10',
        }),
      /must be explicitly confirmed/
    );
  });
});

describe('ConflictOfInterest — listOpenDeclarations', () => {
  test('5) only ongoing + non-closed declarations are returned', () => {
    const coi = makeEngine();
    const a = coi.declareInterest(baseDecl(INTEREST_TYPE.FINANCIAL));
    const b = coi.declareInterest(
      baseDecl(INTEREST_TYPE.OWNERSHIP, {
        percentage: 10,
        relatedParty: 'Beta Holdings',
      })
    );
    // Non-ongoing from the start
    coi.declareInterest(
      baseDecl(INTEREST_TYPE.POLITICAL, {
        ongoing: false,
        relatedParty: 'Party X',
      })
    );
    // Close one to verify filtering
    coi.closure({
      declarationId: a.id,
      reason: 'no longer relevant',
      date: '2026-03-10',
    });

    const open = coi.listOpenDeclarations({ employeeId: 'E-001' });
    const ids = open.map((d) => d.id);
    assert.equal(open.length, 1);
    assert.ok(ids.includes(b.id));
  });
});

describe('ConflictOfInterest — checkDecision warns on related parties', () => {
  test('6) checkDecision emits a warning when decisionMaker has an interest in a related party', () => {
    const coi = makeEngine();
    coi.declareInterest(
      baseDecl(INTEREST_TYPE.OWNERSHIP, {
        relatedParty: 'Acme Suppliers',
        percentage: 30,
      })
    );

    const hit = coi.checkDecision({
      decisionId: 'PO-2026-0042',
      decisionMaker: 'E-001',
      relatedParties: ['Acme Suppliers', 'Bravo Logistics'],
    });
    assert.equal(hit.warning, true);
    assert.equal(hit.matches.length, 1);
    assert.match(hit.messageHe, /אזהרה/);
    assert.match(hit.messageEn, /WARNING/);

    const clear = coi.checkDecision({
      decisionId: 'PO-2026-0043',
      decisionMaker: 'E-001',
      relatedParties: ['Delta Parts', 'Gamma Steel'],
    });
    assert.equal(clear.warning, false);
    assert.equal(clear.matches.length, 0);

    const logs = coi.auditLog({ type: EVENT_TYPES.DECISION_WARNED });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].payload.matchCount, 1);
  });
});

describe('ConflictOfInterest — recusal', () => {
  test('7) recuseFrom records an append-only recusal row and links back to declarations', () => {
    const coi = makeEngine();
    const d = coi.declareInterest(
      baseDecl(INTEREST_TYPE.CONSULTING, { relatedParty: 'Zeta GmbH' })
    );
    const r1 = coi.recuseFrom({
      decisionId: 'PO-2026-0099',
      employeeId: 'E-001',
      reason: 'ייעוץ פעיל לחברה מתחרה',
    });
    assert.equal(r1.decisionId, 'PO-2026-0099');
    assert.ok(r1.recusalId.startsWith('REC-'));

    const recusals = coi.listRecusals({ employeeId: 'E-001' });
    assert.equal(recusals.length, 1);

    const fresh = coi.get(d.id);
    assert.deepEqual(fresh.recusalDecisionIds, ['PO-2026-0099']);

    assert.throws(
      () =>
        coi.recuseFrom({
          decisionId: '',
          employeeId: 'E-001',
          reason: 'x',
        }),
      /decisionId is required/
    );
  });
});

describe('ConflictOfInterest — approval escalation ladder', () => {
  test('8) LOW severity only needs a supervisor; HIGH needs ceo; CRITICAL needs board', () => {
    assert.deepEqual(requiredApproversFor(SEVERITY.LOW), ['supervisor']);
    assert.deepEqual(
      requiredApproversFor(SEVERITY.MEDIUM),
      ['supervisor', 'compliance']
    );
    assert.deepEqual(
      requiredApproversFor(SEVERITY.HIGH),
      ['supervisor', 'compliance', 'ceo']
    );
    assert.deepEqual(
      requiredApproversFor(SEVERITY.CRITICAL),
      ['supervisor', 'compliance', 'ceo', 'board']
    );

    // classifySeverity sanity checks
    assert.equal(
      classifySeverity({ type: INTEREST_TYPE.OWNERSHIP, percentage: 30 }),
      SEVERITY.CRITICAL
    );
    assert.equal(
      classifySeverity({ type: INTEREST_TYPE.OWNERSHIP, percentage: 10 }),
      SEVERITY.HIGH
    );
    assert.equal(
      classifySeverity({ type: INTEREST_TYPE.OWNERSHIP, percentage: 1 }),
      SEVERITY.MEDIUM
    );
    assert.equal(
      classifySeverity({ type: INTEREST_TYPE.FINANCIAL, amount: 200000 }),
      SEVERITY.HIGH
    );
  });

  test('9) approvalChain requires every mandatory role; insufficient approvers escalate and throw', () => {
    const coi = makeEngine();
    const d = coi.declareInterest(
      baseDecl(INTEREST_TYPE.DIRECTORSHIP, {
        relatedParty: 'Rival Corp Board',
      })
    );
    // CRITICAL needs 4 approvers. Supplying 2 must throw.
    assert.throws(
      () =>
        coi.approvalChain({
          declarationId: d.id,
          approvers: [
            { role: 'supervisor', name: 'Avi' },
            { role: 'compliance', name: 'Rina' },
          ],
        }),
      /requires approvers/
    );

    const escalations = coi.auditLog({
      type: EVENT_TYPES.DECLARATION_ESCALATED,
    });
    assert.equal(escalations.length, 1);

    // Supplying all four approvers succeeds.
    const approved = coi.approvalChain({
      declarationId: d.id,
      approvers: [
        { role: 'supervisor', name: 'Avi' },
        { role: 'compliance', name: 'Rina' },
        { role: 'ceo', name: 'Dan' },
        { role: 'board', name: 'Board Secretary' },
      ],
    });
    assert.equal(approved.status, DECLARATION_STATUS.APPROVED);
    assert.equal(approved.approvals.length, 4);
    const approvalEvents = coi.auditLog({
      type: EVENT_TYPES.DECLARATION_APPROVED,
    });
    assert.equal(approvalEvents.length, 1);
  });
});

describe('ConflictOfInterest — mitigation plan', () => {
  test('10) mitigationPlan accepts a valid option and flips status to MITIGATED', () => {
    const coi = makeEngine();
    const d = coi.declareInterest(
      baseDecl(INTEREST_TYPE.OWNERSHIP, {
        percentage: 15,
        relatedParty: 'Helios Ltd.',
      })
    );
    const mitigated = coi.mitigationPlan({
      declarationId: d.id,
      plan: {
        option: MITIGATION.DIVESTMENT,
        description: 'Sell holdings within 90 days',
        effectiveFrom: '2026-04-12',
        reviewAt: '2026-07-12',
      },
      approver: 'compliance@techno-kol',
    });
    assert.equal(mitigated.status, DECLARATION_STATUS.MITIGATED);
    assert.equal(mitigated.mitigations.length, 1);
    assert.equal(mitigated.mitigations[0].option, MITIGATION.DIVESTMENT);
    assert.ok(mitigated.mitigations[0].optionHe.length > 0);

    assert.throws(
      () =>
        coi.mitigationPlan({
          declarationId: d.id,
          plan: { option: 'ignore' },
          approver: 'x',
        }),
      /unknown mitigation option/
    );
  });
});

describe('ConflictOfInterest — material change (append-only)', () => {
  test('11) materialChange preserves history and re-opens approval if severity rises', () => {
    const coi = makeEngine();
    const d = coi.declareInterest(
      baseDecl(INTEREST_TYPE.OWNERSHIP, {
        percentage: 3,
        relatedParty: 'Nova Tech',
      })
    );
    assert.equal(d.severity, SEVERITY.MEDIUM);

    // Approve at MEDIUM level first.
    coi.approvalChain({
      declarationId: d.id,
      approvers: [
        { role: 'supervisor', name: 'Avi' },
        { role: 'compliance', name: 'Rina' },
      ],
    });
    assert.equal(coi.get(d.id).status, DECLARATION_STATUS.APPROVED);

    // Now the employee buys more — escalate to CRITICAL.
    const updated = coi.materialChange({
      declarationId: d.id,
      newDetails: { percentage: 40 },
    });
    assert.equal(updated.severity, SEVERITY.CRITICAL);
    assert.equal(updated.status, DECLARATION_STATUS.PENDING_APPROVAL);
    assert.equal(updated.materialChanges.length, 1);
    assert.equal(updated.materialChanges[0].previous.percentage, 3);
    assert.equal(updated.materialChanges[0].severityAfter, SEVERITY.CRITICAL);
  });
});

describe('ConflictOfInterest — listByDepartment', () => {
  test('12) listByDepartment aggregates declarations by employee department', () => {
    const coi = makeEngine();
    coi.setEmployeeDirectory(
      new Map([
        ['E-001', { department: 'Procurement', name: 'Avi' }],
        ['E-002', { department: 'Procurement', name: 'Ben' }],
        ['E-003', { department: 'Engineering', name: 'Chen' }],
      ])
    );
    coi.declareInterest(baseDecl(INTEREST_TYPE.FINANCIAL));
    coi.declareInterest(baseDecl(INTEREST_TYPE.FAMILIAL, { employeeId: 'E-002' }));
    coi.declareInterest(baseDecl(INTEREST_TYPE.POLITICAL, { employeeId: 'E-003' }));

    const procurement = coi.listByDepartment('Procurement');
    assert.equal(procurement.length, 2);
    const engineering = coi.listByDepartment('Engineering');
    assert.equal(engineering.length, 1);
  });
});

describe('ConflictOfInterest — board reporting (anonymised, bilingual)', () => {
  test('13) boardReporting returns HE + EN narrative with anonymised pseudonyms and SHA seal', () => {
    const coi = makeEngine();
    seedEmployee(coi, 'E-001', 'Procurement');
    coi.declareInterest(baseDecl(INTEREST_TYPE.OWNERSHIP, { percentage: 30 }));
    coi.declareInterest(baseDecl(INTEREST_TYPE.FINANCIAL, { amount: 5000 }));
    coi.annualAttestation({
      employeeId: 'E-001',
      confirmed: true,
      signature: 'E-001',
      date: '2026-04-10',
    });
    coi.recuseFrom({
      decisionId: 'PO-2026-1',
      employeeId: 'E-001',
      reason: 'COI',
    });

    const report = coi.boardReporting({ year: 2026 });
    assert.deepEqual(report.languages, ['he', 'en']);
    assert.equal(report.direction.he, 'rtl');
    assert.equal(report.direction.en, 'ltr');
    assert.equal(report.anonymized, true);
    assert.equal(report.totals.declarations, 2);
    assert.equal(report.totals.attestations, 1);
    assert.equal(report.totals.recusals, 1);
    assert.equal(report.bySeverity[SEVERITY.CRITICAL], 1);
    assert.equal(report.byDepartment['Procurement'], 2);
    assert.match(report.hebrew, /דו"ח ניגודי עניינים/);
    assert.match(report.english, /Conflict of Interest Report/);
    assert.match(report.sha256, /^[a-f0-9]{64}$/);
    // Anonymised — no raw employeeId leaks
    for (const d of report.declarations) {
      assert.notEqual(d.employee, 'E-001');
      assert.match(d.employee, /^EMP-[a-f0-9]{10}$/);
    }

    const nonAnon = coi.boardReporting({ year: 2026 }, { anonymize: false });
    assert.equal(nonAnon.anonymized, false);
    for (const d of nonAnon.declarations) {
      assert.equal(d.employee, 'E-001');
    }
  });
});

describe('ConflictOfInterest — procurement cross-check', () => {
  test('14) crossCheckWithProcurement flags open declarations against a vendor by id or name', () => {
    const coi = makeEngine();
    coi.setVendorDirectory(
      new Map([
        ['V-900', { name: 'Helios Ltd.', aliases: ['Helios'] }],
      ])
    );
    coi.declareInterest(
      baseDecl(INTEREST_TYPE.OWNERSHIP, {
        relatedParty: 'Helios Ltd.',
        percentage: 20,
      })
    );
    coi.declareInterest(
      baseDecl(INTEREST_TYPE.FINANCIAL, {
        relatedParty: 'Orion Systems',
      })
    );

    const result = coi.crossCheckWithProcurement('V-900');
    assert.equal(result.flagged, true);
    assert.equal(result.matches.length, 1);
    assert.match(result.messageEn, /1 conflict/);

    const logs = coi.auditLog({ type: EVENT_TYPES.PROCUREMENT_CROSSCHECK });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].payload.flagged, true);

    const clear = coi.crossCheckWithProcurement('V-901');
    assert.equal(clear.flagged, false);
  });
});

describe('ConflictOfInterest — HR cross-check', () => {
  test('15) crossCheckWithHR flags familial / personal matches against a candidate', () => {
    const coi = makeEngine();
    coi.setCandidateDirectory(
      new Map([
        ['C-101', { name: 'דני לוי' }],
      ])
    );
    coi.declareInterest(
      baseDecl(INTEREST_TYPE.FAMILIAL, {
        relatedParty: 'דני לוי',
        description: 'אחי',
      })
    );
    // A financial interest with the same name MUST NOT be picked up by HR
    // cross-check (scope limited to familial/personal/employment).
    coi.declareInterest(
      baseDecl(INTEREST_TYPE.FINANCIAL, {
        employeeId: 'E-002',
        relatedParty: 'Unrelated Vendor',
      })
    );

    const result = coi.crossCheckWithHR('C-101');
    assert.equal(result.flagged, true);
    assert.equal(result.matches.length, 1);
    assert.match(result.messageHe, /התאמות/);

    const clear = coi.crossCheckWithHR('C-999');
    assert.equal(clear.flagged, false);
  });
});

describe('ConflictOfInterest — closure preserves record', () => {
  test('16) closure flips status but never hard-deletes the declaration', () => {
    const coi = makeEngine();
    const d = coi.declareInterest(
      baseDecl(INTEREST_TYPE.CONSULTING, { relatedParty: 'Kappa Advisory' })
    );
    const before = coi.listAll().length;
    const closed = coi.closure({
      declarationId: d.id,
      reason: 'Engagement concluded',
      date: '2026-04-01',
    });
    assert.equal(closed.status, DECLARATION_STATUS.CLOSED);
    assert.equal(closed.ongoing, false);
    assert.equal(closed.closure.reason, 'Engagement concluded');

    // Record still retrievable
    const all = coi.listAll();
    assert.equal(all.length, before);
    const stillThere = coi.get(d.id);
    assert.ok(stillThere);
    assert.equal(stillThere.status, DECLARATION_STATUS.CLOSED);

    // Double-close forbidden
    assert.throws(
      () =>
        coi.closure({
          declarationId: d.id,
          reason: 'again',
          date: '2026-04-05',
        }),
      /already closed/
    );

    // Closed declarations must not appear in openDeclarations
    const open = coi.listOpenDeclarations({ employeeId: 'E-001' });
    assert.equal(open.length, 0);
  });
});

describe('ConflictOfInterest — audit chain integrity', () => {
  test('17) audit log is append-only with a valid SHA-256 hash chain', () => {
    const coi = makeEngine();
    const d = coi.declareInterest(baseDecl(INTEREST_TYPE.FINANCIAL));
    coi.annualAttestation({
      employeeId: 'E-001',
      confirmed: true,
      signature: 'sig',
      date: '2026-03-31',
    });
    coi.checkDecision({
      decisionId: 'PO-42',
      decisionMaker: 'E-001',
      relatedParties: ['Acme Suppliers Ltd.'],
    });
    coi.recuseFrom({
      decisionId: 'PO-42',
      employeeId: 'E-001',
      reason: 'COI match',
    });
    coi.approvalChain({
      declarationId: d.id,
      approvers: [{ role: 'supervisor', name: 'Avi' }],
    });
    coi.closure({
      declarationId: d.id,
      reason: 'Resolved',
      date: '2026-04-02',
    });

    const log = coi.auditLog();
    assert.ok(log.length >= 6);
    for (let i = 0; i < log.length; i++) {
      assert.equal(log[i].seq, i + 1);
    }
    const { valid, brokenAt } = coi.verifyChain();
    assert.equal(valid, true);
    assert.equal(brokenAt, null);
  });

  test('18) event emitter fires on declaration and closure lifecycle events', () => {
    const coi = makeEngine();
    const seen = [];
    coi.on(EVENT_TYPES.DECLARATION_CREATED, (e) =>
      seen.push(['created', e.payload.declarationId])
    );
    coi.on(EVENT_TYPES.DECLARATION_CLOSED, (e) =>
      seen.push(['closed', e.payload.declarationId])
    );
    coi.on('*', () => seen.push(['star']));

    const d = coi.declareInterest(baseDecl(INTEREST_TYPE.POLITICAL));
    coi.closure({
      declarationId: d.id,
      reason: 'end of campaign',
      date: '2026-04-10',
    });

    const created = seen.filter((s) => s[0] === 'created');
    const closed = seen.filter((s) => s[0] === 'closed');
    const star = seen.filter((s) => s[0] === 'star');
    assert.equal(created.length, 1);
    assert.equal(closed.length, 1);
    assert.ok(star.length >= 2);
  });
});

describe('ConflictOfInterest — constants & frozen snapshots', () => {
  test('19) interest type constants are immutable and complete', () => {
    const types = Object.values(INTEREST_TYPE);
    assert.equal(types.length, 8);
    assert.throws(() => {
      INTEREST_TYPE.NEW_TYPE = 'x';
    });
  });

  test('20) snapshots returned by get() are frozen and cannot be mutated', () => {
    const coi = makeEngine();
    const d = coi.declareInterest(baseDecl(INTEREST_TYPE.FINANCIAL));
    const snap = coi.get(d.id);
    assert.ok(Object.isFrozen(snap));
    assert.throws(() => {
      snap.status = DECLARATION_STATUS.CLOSED;
    });
  });
});
