import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();
const IdParam = z.object({ id: z.coerce.number().int().positive() });
function safeRows(r: any) { return r?.rows || []; }
function num(v: any) { return v === "" || v == null ? undefined : Number(v); }

// =================== PACKING LISTS V2 ===================

router.get("/packing-lists-v2", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM packing_lists_v2 ORDER BY created_at DESC");
    res.json(safeRows(r));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/packing-lists-v2/stats", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='draft') as draft,
        COUNT(*) FILTER (WHERE status='confirmed') as confirmed,
        COUNT(*) FILTER (WHERE status='shipped') as shipped,
        COALESCE(AVG(utilization_pct::numeric), 0) as avg_utilization,
        COALESCE(SUM(total_weight::numeric), 0) as total_weight
      FROM packing_lists_v2
    `);
    res.json(r.rows[0] || {});
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/packing-lists-v2/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("SELECT * FROM packing_lists_v2 WHERE id=$1", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.post("/packing-lists-v2", async (req, res) => {
  try {
    const b = req.body;
    const year = new Date().getFullYear();
    const cntR = await pool.query("SELECT COUNT(*) FROM packing_lists_v2");
    const cnt = parseInt(cntR.rows[0].count) + 1;
    const packingNumber = b.packingNumber || `PL-${year}-${String(cnt).padStart(4, "0")}`;

    const items = b.items || [];
    let totalWeight = 0;
    let totalVolume = 0;
    for (const item of items) {
      totalWeight += (num(item.weight) || 0) * (num(item.qty) || 1);
      const l = num(item.length) || 0;
      const w = num(item.width) || 0;
      const h = num(item.height) || 0;
      totalVolume += (l * w * h / 1000000) * (num(item.qty) || 1);
    }

    const containerVol = (num(b.containerDimensionsL) || 590) * (num(b.containerDimensionsW) || 235) * (num(b.containerDimensionsH) || 239) / 1000000;
    const utilizationPct = containerVol > 0 ? Math.min(100, (totalVolume / containerVol) * 100) : 0;

    const r = await pool.query(`
      INSERT INTO packing_lists_v2 (packing_number, delivery_id, order_id,
        customer_name, delivery_address, container_type,
        container_dimensions_l, container_dimensions_w, container_dimensions_h,
        items, total_weight, total_volume, utilization_pct, status, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *`,
      [packingNumber, b.deliveryId, b.orderId,
       b.customerName, b.deliveryAddress, b.containerType || "20GP",
       num(b.containerDimensionsL) || 590, num(b.containerDimensionsW) || 235, num(b.containerDimensionsH) || 239,
       JSON.stringify(items),
       totalWeight.toFixed(2), totalVolume.toFixed(4), utilizationPct.toFixed(2),
       b.status || "draft", b.notes, b.createdBy]);
    res.status(201).json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.put("/packing-lists-v2/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const b = req.body;

    const items = b.items || [];
    let totalWeight = 0;
    let totalVolume = 0;
    for (const item of items) {
      totalWeight += (num(item.weight) || 0) * (num(item.qty) || 1);
      const l = num(item.length) || 0;
      const w = num(item.width) || 0;
      const h = num(item.height) || 0;
      totalVolume += (l * w * h / 1000000) * (num(item.qty) || 1);
    }
    const containerVol = (num(b.containerDimensionsL) || 590) * (num(b.containerDimensionsW) || 235) * (num(b.containerDimensionsH) || 239) / 1000000;
    const utilizationPct = containerVol > 0 ? Math.min(100, (totalVolume / containerVol) * 100) : 0;

    const r = await pool.query(`
      UPDATE packing_lists_v2 SET
        customer_name=COALESCE($1,customer_name),
        delivery_address=COALESCE($2,delivery_address),
        container_type=COALESCE($3,container_type),
        items=$4,
        total_weight=$5, total_volume=$6, utilization_pct=$7,
        status=COALESCE($8,status), notes=COALESCE($9,notes),
        updated_at=NOW()
      WHERE id=$10 RETURNING *`,
      [b.customerName, b.deliveryAddress, b.containerType,
       JSON.stringify(items),
       totalWeight.toFixed(2), totalVolume.toFixed(4), utilizationPct.toFixed(2),
       b.status, b.notes, id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/packing-lists-v2/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("DELETE FROM packing_lists_v2 WHERE id=$1 RETURNING *", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// 3D bin packing — first-fit decreasing
router.post("/packing-lists-v2/:id/optimize", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("SELECT * FROM packing_lists_v2 WHERE id=$1", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    const pl = r.rows[0];
    const items: any[] = Array.isArray(pl.items) ? pl.items : JSON.parse(pl.items || "[]");
    const cL = parseFloat(pl.container_dimensions_l) || 590;
    const cW = parseFloat(pl.container_dimensions_w) || 235;
    const cH = parseFloat(pl.container_dimensions_h) || 239;

    const boxesToPlace: any[] = [];
    for (const item of items) {
      const qty = parseInt(item.qty) || 1;
      for (let i = 0; i < qty; i++) {
        boxesToPlace.push({
          id: item.id || item.name,
          name: item.name,
          l: parseFloat(item.length) || 50,
          w: parseFloat(item.width) || 50,
          h: parseFloat(item.height) || 50,
          weight: parseFloat(item.weight) || 10,
        });
      }
    }

    boxesToPlace.sort((a, b) => (b.l * b.w * b.h) - (a.l * a.w * a.h));

    const placements: any[] = [];
    let curX = 0, curY = 0, curZ = 0;
    let rowMaxH = 0, layerMaxH = 0;

    for (const box of boxesToPlace) {
      if (curX + box.l > cL) {
        curX = 0;
        curZ += rowMaxH;
        rowMaxH = 0;
      }
      if (curZ + box.h > cW) {
        curZ = 0;
        curY += layerMaxH;
        layerMaxH = 0;
        curX = 0;
        rowMaxH = 0;
      }
      if (curY + box.w > cH) break;

      placements.push({ ...box, x: curX, y: curY, z: curZ });
      curX += box.l;
      rowMaxH = Math.max(rowMaxH, box.h);
      layerMaxH = Math.max(layerMaxH, box.w);
    }

    const usedVol = placements.reduce((acc, b) => acc + b.l * b.w * b.h, 0);
    const containerVol = cL * cW * cH;
    const utilizationPct = containerVol > 0 ? Math.min(100, (usedVol / containerVol) * 100) : 0;

    await pool.query(`
      INSERT INTO container_load_plans (packing_list_id, placement_map, container_type, utilization_pct, total_items)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT DO NOTHING`,
      [id, JSON.stringify(placements), pl.container_type, utilizationPct.toFixed(2), placements.length]);

    await pool.query("UPDATE packing_lists_v2 SET utilization_pct=$1, updated_at=NOW() WHERE id=$2",
      [utilizationPct.toFixed(2), id]);

    res.json({ placements, utilizationPct: utilizationPct.toFixed(2), totalItems: placements.length, containerType: pl.container_type });
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// Generate shipping label
router.post("/packing-lists-v2/:id/label", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("SELECT * FROM packing_lists_v2 WHERE id=$1", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    const pl = r.rows[0];
    const b = req.body;
    const barcode = `${pl.packing_number}-${Date.now()}`;
    const labelData = {
      packingNumber: pl.packing_number,
      customerName: pl.customer_name,
      deliveryAddress: pl.delivery_address,
      totalWeight: pl.total_weight,
      carrier: b.carrier || "FedEx",
      serviceType: b.serviceType || "Standard",
      generatedAt: new Date().toISOString(),
    };
    const ins = await pool.query(`
      INSERT INTO shipping_labels (packing_list_id, carrier, barcode, tracking_number, label_data,
        shipper, consignee, ship_to_address, weight, service_type)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [id, b.carrier || "FedEx", barcode, barcode,
       JSON.stringify(labelData),
       b.shipper || "Technokol Ltd.", pl.customer_name, pl.delivery_address,
       pl.total_weight, b.serviceType || "Standard"]);
    res.status(201).json(ins.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// =================== CARRIERS ===================

router.get("/carriers", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM carriers ORDER BY carrier_name");
    res.json(safeRows(r));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/carriers", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      INSERT INTO carriers (carrier_code, carrier_name, carrier_type, country,
        contact_name, contact_email, contact_phone, is_active, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [b.carrierCode, b.carrierName, b.carrierType || "sea", b.country,
       b.contactName, b.contactEmail, b.contactPhone,
       b.isActive !== false, b.notes]);
    res.status(201).json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.put("/carriers/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const b = req.body;
    const r = await pool.query(`
      UPDATE carriers SET
        carrier_name=COALESCE($1,carrier_name),
        carrier_type=COALESCE($2,carrier_type),
        country=COALESCE($3,country),
        contact_name=COALESCE($4,contact_name),
        contact_email=COALESCE($5,contact_email),
        contact_phone=COALESCE($6,contact_phone),
        is_active=COALESCE($7,is_active),
        notes=COALESCE($8,notes)
      WHERE id=$9 RETURNING *`,
      [b.carrierName, b.carrierType, b.country,
       b.contactName, b.contactEmail, b.contactPhone,
       b.isActive, b.notes, id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/carriers/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("DELETE FROM carriers WHERE id=$1 RETURNING *", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// =================== CARRIER RATES ===================

router.get("/carrier-rates", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT cr.*, c.carrier_name, c.carrier_type
      FROM carrier_rates cr
      LEFT JOIN carriers c ON c.id = cr.carrier_id
      ORDER BY cr.created_at DESC`);
    res.json(safeRows(r));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/carrier-rates", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      INSERT INTO carrier_rates (carrier_id, rate_type, origin_zone, destination_zone,
        weight_brackets, volume_brackets, distance_zones,
        base_rate, currency, fuel_surcharge, handling_fee, minimum_charge,
        effective_date, expiry_date, is_active, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [b.carrierId, b.rateType || "weight", b.originZone, b.destinationZone,
       JSON.stringify(b.weightBrackets || []), JSON.stringify(b.volumeBrackets || []),
       JSON.stringify(b.distanceZones || []),
       num(b.baseRate) || 0, b.currency || "USD",
       num(b.fuelSurcharge) || 0, num(b.handlingFee) || 0, num(b.minimumCharge) || 0,
       b.effectiveDate, b.expiryDate, b.isActive !== false, b.notes]);
    res.status(201).json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.put("/carrier-rates/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const b = req.body;
    const r = await pool.query(`
      UPDATE carrier_rates SET
        base_rate=COALESCE($1,base_rate),
        fuel_surcharge=COALESCE($2,fuel_surcharge),
        handling_fee=COALESCE($3,handling_fee),
        effective_date=COALESCE($4,effective_date),
        expiry_date=COALESCE($5,expiry_date),
        is_active=COALESCE($6,is_active),
        notes=COALESCE($7,notes),
        updated_at=NOW()
      WHERE id=$8 RETURNING *`,
      [num(b.baseRate), num(b.fuelSurcharge), num(b.handlingFee),
       b.effectiveDate, b.expiryDate, b.isActive, b.notes, id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// =================== CARRIER SCORECARDS ===================

router.get("/carrier-scorecards", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT cs.*, c.carrier_name, c.carrier_type
      FROM carrier_scorecards cs
      LEFT JOIN carriers c ON c.id = cs.carrier_id
      ORDER BY cs.period_year DESC, cs.period_quarter DESC`);
    res.json(safeRows(r));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/carrier-scorecards", async (req, res) => {
  try {
    const b = req.body;
    const onTime = num(b.onTimePct) || 0;
    const damage = num(b.damageRate) || 0;
    const cost = num(b.avgCostPerKg) || 0;
    const overallScore = Math.max(0, Math.min(100,
      (onTime * 0.4) + ((100 - damage * 10) * 0.3) + (Math.max(0, 100 - cost * 10) * 0.3)
    ));
    const r = await pool.query(`
      INSERT INTO carrier_scorecards (carrier_id, period_year, period_quarter,
        on_time_pct, damage_rate, avg_cost_per_kg, claims_count,
        shipments_count, avg_transit_days, overall_score, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [b.carrierId, b.periodYear, b.periodQuarter,
       onTime, damage, cost,
       parseInt(b.claimsCount) || 0, parseInt(b.shipmentsCount) || 0,
       num(b.avgTransitDays) || 0, overallScore.toFixed(2), b.notes]);
    res.status(201).json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// Aggregated scorecard summary per carrier
router.get("/carrier-scorecards/summary", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        c.id as carrier_id, c.carrier_name, c.carrier_type,
        AVG(cs.on_time_pct) as avg_on_time_pct,
        AVG(cs.damage_rate) as avg_damage_rate,
        AVG(cs.avg_cost_per_kg) as avg_cost_per_kg,
        SUM(cs.shipments_count) as total_shipments,
        AVG(cs.overall_score) as avg_overall_score,
        MAX(cs.period_year || '-' || cs.period_quarter) as latest_period
      FROM carriers c
      LEFT JOIN carrier_scorecards cs ON cs.carrier_id = c.id
      GROUP BY c.id, c.carrier_name, c.carrier_type
      ORDER BY avg_overall_score DESC NULLS LAST
    `);
    res.json(safeRows(r));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// =================== FREIGHT CALCULATIONS / COMPARISON ===================

router.post("/freight-calculations/compare", async (req, res) => {
  try {
    const b = req.body;
    const weightKg = num(b.weightKg) || 0;
    const volumeCbm = num(b.volumeCbm) || 0;
    const distanceKm = num(b.distanceKm) || 0;

    const ratesR = await pool.query(`
      SELECT cr.*, c.carrier_name, c.carrier_type
      FROM carrier_rates cr
      JOIN carriers c ON c.id = cr.carrier_id
      WHERE cr.is_active = true
        AND (cr.expiry_date IS NULL OR cr.expiry_date >= CURRENT_DATE)
    `);

    const groupId = `CMP-${Date.now()}`;
    const results: any[] = [];

    for (const rate of ratesR.rows) {
      const baseRate = parseFloat(rate.base_rate) || 0;
      const fuel = parseFloat(rate.fuel_surcharge) || 0;
      const handling = parseFloat(rate.handling_fee) || 0;
      const minCharge = parseFloat(rate.minimum_charge) || 0;

      let chargeableWeight = weightKg;
      if (rate.rate_type === "volume") chargeableWeight = volumeCbm * 1000;
      if (rate.rate_type === "greater") chargeableWeight = Math.max(weightKg, volumeCbm * 1000);

      const freightCost = chargeableWeight * baseRate;
      const fuelCost = freightCost * (fuel / 100);
      const totalCost = Math.max(minCharge, freightCost + fuelCost + handling);

      const ins = await pool.query(`
        INSERT INTO freight_calculations (shipment_ref, carrier_id, carrier_name,
          weight_kg, volume_cbm, distance_km, base_rate, fuel_surcharge, handling_fee,
          calculated_cost, currency, comparison_group_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [b.shipmentRef, rate.carrier_id, rate.carrier_name,
         weightKg, volumeCbm, distanceKm, baseRate, fuelCost, handling,
         totalCost.toFixed(2), rate.currency, groupId]);
      results.push(ins.rows[0]);
    }

    results.sort((a, b) => parseFloat(a.calculated_cost) - parseFloat(b.calculated_cost));
    res.json({ groupId, comparisons: results });
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.get("/freight-calculations", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM freight_calculations ORDER BY created_at DESC LIMIT 200");
    res.json(safeRows(r));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.put("/freight-calculations/:id/select", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const rec = await pool.query("SELECT comparison_group_id FROM freight_calculations WHERE id=$1", [id]);
    if (!rec.rows[0]) return res.status(404).json({ message: "Not found" });
    await pool.query("UPDATE freight_calculations SET is_selected=false WHERE comparison_group_id=$1", [rec.rows[0].comparison_group_id]);
    const r = await pool.query("UPDATE freight_calculations SET is_selected=true WHERE id=$1 RETURNING *", [id]);
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// =================== CUSTOMS DOCUMENTS ===================

router.get("/customs-documents", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM customs_documents ORDER BY created_at DESC");
    res.json(safeRows(r));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/customs-documents/stats", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE doc_type='commercial_invoice') as invoices,
        COUNT(*) FILTER (WHERE doc_type='packing_list') as packing_lists,
        COUNT(*) FILTER (WHERE doc_type='certificate_of_origin') as coo,
        COUNT(*) FILTER (WHERE status='draft') as drafts,
        COUNT(*) FILTER (WHERE status='approved') as approved
      FROM customs_documents
    `);
    res.json(r.rows[0] || {});
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/customs-documents/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("SELECT * FROM customs_documents WHERE id=$1", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.post("/customs-documents", async (req, res) => {
  try {
    const b = req.body;
    const year = new Date().getFullYear();
    const cntR = await pool.query("SELECT COUNT(*) FROM customs_documents");
    const cnt = parseInt(cntR.rows[0].count) + 1;
    const docNumber = b.docNumber || `CD-${year}-${String(cnt).padStart(4, "0")}`;

    const r = await pool.query(`
      INSERT INTO customs_documents (doc_number, shipment_id, shipment_ref, doc_type,
        exporter_name, exporter_address, exporter_tax_id,
        importer_name, importer_address,
        country_of_origin, country_of_destination, incoterms,
        port_of_loading, port_of_discharge,
        commercial_invoice_data, packing_list_data, certificate_of_origin_data,
        hs_codes, customs_value, currency, total_weight, total_packages,
        declaration_text, status, issued_date, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
      RETURNING *`,
      [docNumber, b.shipmentId, b.shipmentRef, b.docType || "commercial_invoice",
       b.exporterName, b.exporterAddress, b.exporterTaxId,
       b.importerName, b.importerAddress,
       b.countryOfOrigin || "Israel", b.countryOfDestination,
       b.incoterms || "FOB",
       b.portOfLoading, b.portOfDischarge,
       JSON.stringify(b.commercialInvoiceData || {}),
       JSON.stringify(b.packingListData || {}),
       JSON.stringify(b.certificateOfOriginData || {}),
       JSON.stringify(b.hsCodes || []),
       num(b.customsValue) || 0, b.currency || "USD",
       num(b.totalWeight) || 0, parseInt(b.totalPackages) || 0,
       b.declarationText, b.status || "draft",
       b.issuedDate, b.notes, b.createdBy]);
    res.status(201).json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.put("/customs-documents/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const b = req.body;
    const r = await pool.query(`
      UPDATE customs_documents SET
        exporter_name=COALESCE($1,exporter_name),
        importer_name=COALESCE($2,importer_name),
        country_of_destination=COALESCE($3,country_of_destination),
        incoterms=COALESCE($4,incoterms),
        hs_codes=COALESCE($5::jsonb, hs_codes),
        customs_value=COALESCE($6,customs_value),
        commercial_invoice_data=COALESCE($7::jsonb, commercial_invoice_data),
        packing_list_data=COALESCE($8::jsonb, packing_list_data),
        certificate_of_origin_data=COALESCE($9::jsonb, certificate_of_origin_data),
        status=COALESCE($10,status),
        issued_date=COALESCE($11,issued_date),
        notes=COALESCE($12,notes),
        updated_at=NOW()
      WHERE id=$13 RETURNING *`,
      [b.exporterName, b.importerName, b.countryOfDestination, b.incoterms,
       b.hsCodes ? JSON.stringify(b.hsCodes) : null,
       num(b.customsValue),
       b.commercialInvoiceData ? JSON.stringify(b.commercialInvoiceData) : null,
       b.packingListData ? JSON.stringify(b.packingListData) : null,
       b.certificateOfOriginData ? JSON.stringify(b.certificateOfOriginData) : null,
       b.status, b.issuedDate, b.notes, id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/customs-documents/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("DELETE FROM customs_documents WHERE id=$1 RETURNING *", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// Generate complete customs document set from shipment
router.post("/customs-documents/generate", async (req, res) => {
  try {
    const b = req.body;
    const items = b.items || [];

    const commercialInvoiceData = {
      invoiceNumber: `INV-${Date.now()}`,
      date: new Date().toISOString().split("T")[0],
      seller: { name: b.exporterName, address: b.exporterAddress, taxId: b.exporterTaxId },
      buyer: { name: b.importerName, address: b.importerAddress },
      items: items.map((item: any) => ({
        description: item.description || item.name,
        quantity: item.qty,
        unitPrice: item.unitPrice,
        totalPrice: (parseFloat(item.qty) * parseFloat(item.unitPrice)).toFixed(2),
        hsCode: item.hsCode,
        countryOfOrigin: item.countryOfOrigin || "Israel",
      })),
      totalAmount: items.reduce((acc: number, item: any) =>
        acc + parseFloat(item.qty || 0) * parseFloat(item.unitPrice || 0), 0).toFixed(2),
      currency: b.currency || "USD",
      incoterms: b.incoterms || "FOB",
      paymentTerms: b.paymentTerms || "T/T",
    };

    const packingListData = {
      date: new Date().toISOString().split("T")[0],
      boxes: items.map((item: any, idx: number) => ({
        boxNumber: idx + 1,
        contents: item.description || item.name,
        quantity: item.qty,
        weight: item.weight,
        dimensions: `${item.length}x${item.width}x${item.height}cm`,
        hsCode: item.hsCode,
      })),
      totalBoxes: items.length,
      totalWeight: items.reduce((acc: number, item: any) =>
        acc + parseFloat(item.weight || 0) * parseFloat(item.qty || 1), 0).toFixed(2),
    };

    const certificateOfOriginData = {
      certificateNumber: `COO-${Date.now()}`,
      date: new Date().toISOString().split("T")[0],
      exporter: { name: b.exporterName, address: b.exporterAddress },
      consignee: { name: b.importerName, address: b.importerAddress },
      goods: items.map((item: any) => ({
        description: item.description || item.name,
        quantity: item.qty,
        weight: item.weight,
        hsCode: item.hsCode,
        countryOfOrigin: "Israel",
        originCriteria: "WO",
      })),
      declarationText: "We hereby certify that the goods described above were produced/manufactured in Israel",
      chamber: "Israel Chamber of Commerce",
    };

    res.json({ commercialInvoiceData, packingListData, certificateOfOriginData });
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// =================== FREIGHT AUDIT ===================

router.get("/freight-audit", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT fa.*, c.carrier_name as carrier_display_name
      FROM freight_audit fa
      LEFT JOIN carriers c ON c.id = fa.carrier_id
      ORDER BY fa.created_at DESC`);
    res.json(safeRows(r));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/freight-audit/stats", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_flagged = true) as flagged,
        COUNT(*) FILTER (WHERE dispute_status = 'open') as open_disputes,
        COUNT(*) FILTER (WHERE dispute_status = 'resolved') as resolved_disputes,
        COALESCE(SUM(discrepancy_amount::numeric), 0) as total_discrepancies,
        COALESCE(SUM(savings_realized::numeric), 0) as total_savings
      FROM freight_audit
    `);
    res.json(r.rows[0] || {});
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/freight-audit/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("SELECT * FROM freight_audit WHERE id=$1", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.post("/freight-audit", async (req, res) => {
  try {
    const b = req.body;
    const year = new Date().getFullYear();
    const cntR = await pool.query("SELECT COUNT(*) FROM freight_audit");
    const cnt = parseInt(cntR.rows[0].count) + 1;
    const auditNumber = b.auditNumber || `FA-${year}-${String(cnt).padStart(4, "0")}`;

    const invoiceAmount = num(b.invoiceAmount) || 0;
    const expectedAmount = num(b.expectedAmount) || 0;
    const discrepancyAmount = invoiceAmount - expectedAmount;
    const discrepancyPct = expectedAmount > 0 ? (discrepancyAmount / expectedAmount) * 100 : 0;
    const threshold = num(b.discrepancyThreshold) || 5;
    const isFlagged = Math.abs(discrepancyPct) > threshold;

    const r = await pool.query(`
      INSERT INTO freight_audit (audit_number, carrier_invoice_id, carrier_id, carrier_name,
        shipment_ref, shipment_id, invoice_date,
        invoice_amount, expected_amount, discrepancy_amount, discrepancy_pct,
        currency, discrepancy_threshold, is_flagged, dispute_status,
        resolution_notes, savings_realized, rate_details, invoice_details, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING *`,
      [auditNumber, b.carrierInvoiceId, b.carrierId, b.carrierName,
       b.shipmentRef, b.shipmentId, b.invoiceDate,
       invoiceAmount.toFixed(2), expectedAmount.toFixed(2),
       discrepancyAmount.toFixed(2), discrepancyPct.toFixed(2),
       b.currency || "USD", threshold, isFlagged, "none",
       b.resolutionNotes, 0,
       JSON.stringify(b.rateDetails || {}),
       JSON.stringify(b.invoiceDetails || {}),
       b.createdBy]);
    res.status(201).json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.put("/freight-audit/:id/dispute", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const { status, notes } = req.body;
    const validStatuses = ["none", "open", "investigating", "resolved", "closed"];
    if (!validStatuses.includes(status)) return res.status(400).json({ message: "Invalid status" });

    let extraFields = "";
    const params: any[] = [status, notes, id];

    if (status === "open") {
      extraFields = ", dispute_opened_at=NOW()";
    } else if (status === "resolved" || status === "closed") {
      extraFields = ", dispute_resolved_at=NOW()";
    }

    const r = await pool.query(`
      UPDATE freight_audit SET
        dispute_status=$1, resolution_notes=COALESCE($2,resolution_notes)${extraFields},
        updated_at=NOW()
      WHERE id=$3 RETURNING *`, params);
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.put("/freight-audit/:id/savings", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const savings = num(req.body.savingsRealized) || 0;
    const r = await pool.query(`
      UPDATE freight_audit SET savings_realized=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [savings, id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/freight-audit/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("DELETE FROM freight_audit WHERE id=$1 RETURNING *", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// =================== SHIPPING FREIGHT DASHBOARD KPIs ===================

router.get("/shipping-freight/dashboard", async (_req, res) => {
  try {
    const [packing, freight, customs, audit] = await Promise.all([
      pool.query(`SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='confirmed') as confirmed,
        COALESCE(AVG(utilization_pct::numeric),0) as avg_utilization
        FROM packing_lists_v2`),
      pool.query(`SELECT COUNT(*) as total,
        COALESCE(SUM(calculated_cost::numeric),0) as total_cost,
        COUNT(DISTINCT carrier_id) as carriers
        FROM freight_calculations WHERE is_selected=true`),
      pool.query(`SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='approved') as approved,
        COUNT(*) FILTER (WHERE status='draft') as drafts
        FROM customs_documents`),
      pool.query(`SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_flagged=true) as flagged,
        COALESCE(SUM(savings_realized::numeric),0) as total_savings
        FROM freight_audit`),
    ]);
    res.json({
      packing: packing.rows[0],
      freight: freight.rows[0],
      customs: customs.rows[0],
      audit: audit.rows[0],
    });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

export default router;
