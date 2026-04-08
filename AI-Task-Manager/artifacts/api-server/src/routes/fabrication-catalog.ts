import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();
const IdParam = z.object({ id: z.coerce.number().int().positive() });

function safeRows(result: any) { return result?.rows || []; }

// ========== PROFILES ==========
router.get("/fabrication-profiles", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM fabrication_profiles ORDER BY series, profile_number");
    res.json(safeRows(result));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/fabrication-profiles/stats", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('פעיל','active')) as active,
        COUNT(DISTINCT series) as series_count,
        COUNT(DISTINCT material) as material_count,
        COALESCE(SUM(current_stock_meters), 0) as total_stock_meters
      FROM fabrication_profiles
    `);
    res.json(r.rows[0] || {});
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/fabrication-profiles/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("SELECT * FROM fabrication_profiles WHERE id = $1", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Profile not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.post("/fabrication-profiles", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      INSERT INTO fabrication_profiles (profile_number, profile_name, series, system_type, profile_type,
        material, alloy, temper, weight_per_meter, length_mm, width_mm, height_mm,
        wall_thickness_mm, thermal_break, thermal_break_width_mm, gasket_slots, glazing_pocket_mm,
        surface_treatment, default_finish, default_color, compatible_systems,
        supplier_id, supplier_part_number, cost_per_meter,
        current_stock_meters, minimum_stock_meters, reorder_point_meters, warehouse_location,
        si_standard, iso_standard, status, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
      RETURNING *`,
      [b.profileNumber, b.profileName, b.series, b.systemType, b.profileType,
       b.material, b.alloy, b.temper, b.weightPerMeter, b.lengthMm, b.widthMm, b.heightMm,
       b.wallThicknessMm, b.thermalBreak, b.thermalBreakWidthMm, b.gasketSlots, b.glazingPocketMm,
       b.surfaceTreatment, b.defaultFinish, b.defaultColor, b.compatibleSystems,
       b.supplierId, b.supplierPartNumber, b.costPerMeter,
       b.currentStockMeters, b.minimumStockMeters, b.reorderPointMeters, b.warehouseLocation,
       b.siStandard, b.isoStandard, b.status || 'active', b.notes]);
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ message: "מספר פרופיל כבר קיים" });
    res.status(400).json({ message: e.message });
  }
});

router.put("/fabrication-profiles/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const b = req.body;
    const r = await pool.query(`
      UPDATE fabrication_profiles SET
        profile_name=COALESCE($1,profile_name), series=COALESCE($2,series),
        system_type=COALESCE($3,system_type), profile_type=COALESCE($4,profile_type),
        material=COALESCE($5,material), alloy=COALESCE($6,alloy),
        weight_per_meter=COALESCE($7,weight_per_meter), cost_per_meter=COALESCE($8,cost_per_meter),
        current_stock_meters=COALESCE($9,current_stock_meters), status=COALESCE($10,status),
        notes=COALESCE($11,notes), thermal_break=COALESCE($12,thermal_break),
        wall_thickness_mm=COALESCE($13,wall_thickness_mm), updated_at=NOW()
      WHERE id=$14 RETURNING *`,
      [b.profileName, b.series, b.systemType, b.profileType, b.material, b.alloy,
       b.weightPerMeter, b.costPerMeter, b.currentStockMeters, b.status, b.notes,
       b.thermalBreak, b.wallThicknessMm, id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Profile not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/fabrication-profiles/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("DELETE FROM fabrication_profiles WHERE id=$1 RETURNING *", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Profile not found" });
    res.json({ message: "Profile deleted" });
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// ========== SYSTEMS ==========
router.get("/fabrication-systems", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM fabrication_systems ORDER BY system_type, system_name");
    res.json(safeRows(result));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/fabrication-systems/stats", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('פעיל','active')) as active,
        COUNT(DISTINCT system_type) as type_count,
        COUNT(DISTINCT manufacturer) as manufacturer_count
      FROM fabrication_systems
    `);
    res.json(r.rows[0] || {});
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/fabrication-systems/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("SELECT * FROM fabrication_systems WHERE id = $1", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "System not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.post("/fabrication-systems", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      INSERT INTO fabrication_systems (system_number, system_name, system_type, manufacturer, series,
        material, description, max_width_mm, max_height_mm, max_weight_kg,
        min_glass_thickness_mm, max_glass_thickness_mm, thermal_break,
        u_value_frame, u_value_system, acoustic_rating, fire_rating,
        wind_resistance_class, water_tightness_class, opening_types, profile_ids,
        default_hardware_set, installation_method, certifications,
        cost_per_sqm, labor_hours_per_sqm, status, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
      RETURNING *`,
      [b.systemNumber, b.systemName, b.systemType, b.manufacturer, b.series,
       b.material, b.description, b.maxWidthMm, b.maxHeightMm, b.maxWeightKg,
       b.minGlassThicknessMm, b.maxGlassThicknessMm, b.thermalBreak,
       b.uValueFrame, b.uValueSystem, b.acousticRating, b.fireRating,
       b.windResistanceClass, b.waterTightnessClass, b.openingTypes, b.profileIds,
       b.defaultHardwareSet, b.installationMethod, b.certifications,
       b.costPerSqm, b.laborHoursPerSqm, b.status || 'active', b.notes]);
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ message: "מספר מערכת כבר קיים" });
    res.status(400).json({ message: e.message });
  }
});

router.put("/fabrication-systems/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const b = req.body;
    const r = await pool.query(`
      UPDATE fabrication_systems SET
        system_name=COALESCE($1,system_name), system_type=COALESCE($2,system_type),
        manufacturer=COALESCE($3,manufacturer), description=COALESCE($4,description),
        max_width_mm=COALESCE($5,max_width_mm), max_height_mm=COALESCE($6,max_height_mm),
        thermal_break=COALESCE($7,thermal_break), cost_per_sqm=COALESCE($8,cost_per_sqm),
        status=COALESCE($9,status), notes=COALESCE($10,notes), updated_at=NOW()
      WHERE id=$11 RETURNING *`,
      [b.systemName, b.systemType, b.manufacturer, b.description,
       b.maxWidthMm, b.maxHeightMm, b.thermalBreak, b.costPerSqm, b.status, b.notes, id]);
    if (!r.rows[0]) return res.status(404).json({ message: "System not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/fabrication-systems/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("DELETE FROM fabrication_systems WHERE id=$1 RETURNING *", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "System not found" });
    res.json({ message: "System deleted" });
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// ========== GLASS CATALOG ==========
router.get("/glass-catalog", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM glass_catalog ORDER BY glass_type, thickness_mm");
    res.json(safeRows(result));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/glass-catalog/stats", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('פעיל','active')) as active,
        COUNT(DISTINCT glass_type) as type_count,
        COALESCE(SUM(current_stock_sqm), 0) as total_stock_sqm
      FROM glass_catalog
    `);
    res.json(r.rows[0] || {});
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/glass-catalog", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      INSERT INTO glass_catalog (glass_code, glass_name, glass_type, thickness_mm,
        is_laminated, laminated_layers, is_insulated, insulated_config,
        spacer_width_mm, gas_fill, is_tempered, is_heat_strengthened,
        coating, tint_color, u_value, shgc, light_transmission, sound_reduction,
        max_width_mm, max_height_mm, weight_per_sqm, safety_class,
        supplier_id, price_per_sqm, lead_time_days,
        current_stock_sqm, minimum_stock_sqm, warehouse_location, status, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
      RETURNING *`,
      [b.glassCode, b.glassName, b.glassType, b.thicknessMm,
       b.isLaminated, b.laminatedLayers, b.isInsulated, b.insulatedConfig,
       b.spacerWidthMm, b.gasFill, b.isTempered, b.isHeatStrengthened,
       b.coating, b.tintColor, b.uValue, b.shgc, b.lightTransmission, b.soundReduction,
       b.maxWidthMm, b.maxHeightMm, b.weightPerSqm, b.safetyClass,
       b.supplierId, b.pricePerSqm, b.leadTimeDays,
       b.currentStockSqm, b.minimumStockSqm, b.warehouseLocation, b.status || 'active', b.notes]);
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ message: "קוד זכוכית כבר קיים" });
    res.status(400).json({ message: e.message });
  }
});

router.put("/glass-catalog/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const b = req.body;
    const r = await pool.query(`
      UPDATE glass_catalog SET
        glass_name=COALESCE($1,glass_name), glass_type=COALESCE($2,glass_type),
        thickness_mm=COALESCE($3,thickness_mm), u_value=COALESCE($4,u_value),
        price_per_sqm=COALESCE($5,price_per_sqm), current_stock_sqm=COALESCE($6,current_stock_sqm),
        status=COALESCE($7,status), notes=COALESCE($8,notes), updated_at=NOW()
      WHERE id=$9 RETURNING *`,
      [b.glassName, b.glassType, b.thicknessMm, b.uValue, b.pricePerSqm,
       b.currentStockSqm, b.status, b.notes, id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Glass not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/glass-catalog/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("DELETE FROM glass_catalog WHERE id=$1 RETURNING *", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Glass not found" });
    res.json({ message: "Glass deleted" });
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// ========== FINISHES ==========
router.get("/finishes", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM finishes ORDER BY finish_type, finish_name");
    res.json(safeRows(result));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/finishes", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      INSERT INTO finishes (finish_code, finish_name, finish_type, applicable_materials,
        thickness_microns, min_coats, cure_temperature_c, cure_time_minutes,
        durability_class, weather_resistance, corrosion_resistance, warranty_years,
        qualicoat_class, qualideco_certified, supplier_id, cost_per_sqm, lead_time_days, status, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING *`,
      [b.finishCode, b.finishName, b.finishType, b.applicableMaterials,
       b.thicknessMicrons, b.minCoats, b.cureTemperatureC, b.cureTimeMinutes,
       b.durabilityClass, b.weatherResistance, b.corrosionResistance, b.warrantyYears,
       b.qualicoatClass, b.qualideckoCertified, b.supplierId, b.costPerSqm, b.leadTimeDays,
       b.status || 'active', b.notes]);
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ message: "קוד גימור כבר קיים" });
    res.status(400).json({ message: e.message });
  }
});

router.put("/finishes/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const b = req.body;
    const r = await pool.query(`
      UPDATE finishes SET finish_name=COALESCE($1,finish_name), finish_type=COALESCE($2,finish_type),
        cost_per_sqm=COALESCE($3,cost_per_sqm), status=COALESCE($4,status), notes=COALESCE($5,notes), updated_at=NOW()
      WHERE id=$6 RETURNING *`,
      [b.finishName, b.finishType, b.costPerSqm, b.status, b.notes, id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Finish not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/finishes/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("DELETE FROM finishes WHERE id=$1 RETURNING *", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Finish not found" });
    res.json({ message: "Finish deleted" });
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// ========== COLORS ==========
router.get("/colors", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM colors ORDER BY color_system, color_code");
    res.json(safeRows(result));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/colors", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      INSERT INTO colors (color_code, color_name, color_name_he, color_system, ral_number,
        hex_value, color_family, is_metallic, is_wood_grain, texture_type,
        applicable_finishes, surcharge_percent, popularity_rank, image_url, status, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *`,
      [b.colorCode, b.colorName, b.colorNameHe, b.colorSystem, b.ralNumber,
       b.hexValue, b.colorFamily, b.isMetallic, b.isWoodGrain, b.textureType,
       b.applicableFinishes, b.surchargePercent, b.popularityRank, b.imageUrl,
       b.status || 'active', b.notes]);
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ message: "קוד צבע כבר קיים" });
    res.status(400).json({ message: e.message });
  }
});

router.put("/colors/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const b = req.body;
    const r = await pool.query(`
      UPDATE colors SET color_name=COALESCE($1,color_name), color_name_he=COALESCE($2,color_name_he),
        hex_value=COALESCE($3,hex_value), surcharge_percent=COALESCE($4,surcharge_percent),
        status=COALESCE($5,status), notes=COALESCE($6,notes), updated_at=NOW()
      WHERE id=$7 RETURNING *`,
      [b.colorName, b.colorNameHe, b.hexValue, b.surchargePercent, b.status, b.notes, id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Color not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/colors/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("DELETE FROM colors WHERE id=$1 RETURNING *", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Color not found" });
    res.json({ message: "Color deleted" });
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// ========== ACCESSORIES / HARDWARE ==========
router.get("/accessories-hardware", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM accessories_hardware ORDER BY category, part_name");
    res.json(safeRows(result));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/accessories-hardware/stats", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('פעיל','active')) as active,
        COUNT(DISTINCT category) as category_count,
        COUNT(DISTINCT brand) as brand_count,
        COUNT(*) FILTER (WHERE current_stock::numeric <= COALESCE(reorder_point::numeric, minimum_stock::numeric, 0) AND COALESCE(reorder_point::numeric, minimum_stock::numeric, 0) > 0) as low_stock
      FROM accessories_hardware
    `);
    res.json(r.rows[0] || {});
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/accessories-hardware", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(`
      INSERT INTO accessories_hardware (part_number, part_name, part_name_he, category, sub_category,
        material, finish, color, brand, model, compatible_systems, compatible_profiles,
        dimensions_mm, weight_grams, load_capacity_kg, operation_cycles, security_level,
        fire_rated, anti_corrosion, child_safe,
        supplier_id, cost_per_unit, selling_price, current_stock, minimum_stock, reorder_point,
        warehouse_location, image_url, status, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
      RETURNING *`,
      [b.partNumber, b.partName, b.partNameHe, b.category, b.subCategory,
       b.material, b.finish, b.color, b.brand, b.model, b.compatibleSystems, b.compatibleProfiles,
       b.dimensionsMm, b.weightGrams, b.loadCapacityKg, b.operationCycles, b.securityLevel,
       b.fireRated, b.antiCorrosion, b.childSafe,
       b.supplierId, b.costPerUnit, b.sellingPrice, b.currentStock, b.minimumStock, b.reorderPoint,
       b.warehouseLocation, b.imageUrl, b.status || 'active', b.notes]);
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ message: "מספר חלק כבר קיים" });
    res.status(400).json({ message: e.message });
  }
});

router.put("/accessories-hardware/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const b = req.body;
    const r = await pool.query(`
      UPDATE accessories_hardware SET
        part_name=COALESCE($1,part_name), category=COALESCE($2,category),
        cost_per_unit=COALESCE($3,cost_per_unit), current_stock=COALESCE($4,current_stock),
        status=COALESCE($5,status), notes=COALESCE($6,notes), updated_at=NOW()
      WHERE id=$7 RETURNING *`,
      [b.partName, b.category, b.costPerUnit, b.currentStock, b.status, b.notes, id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Part not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/accessories-hardware/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("DELETE FROM accessories_hardware WHERE id=$1 RETURNING *", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Part not found" });
    res.json({ message: "Part deleted" });
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// ========== UNIT CONVERSIONS ==========
router.get("/unit-conversions", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM unit_conversions ORDER BY from_unit, to_unit");
    res.json(safeRows(result));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/unit-conversions", async (req, res) => {
  try {
    const b = req.body;
    const r = await pool.query(
      `INSERT INTO unit_conversions (from_unit, to_unit, conversion_factor, material_category, description)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [b.fromUnit, b.toUnit, b.conversionFactor, b.materialCategory, b.description]);
    res.status(201).json(r.rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/unit-conversions/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse(req.params);
    const r = await pool.query("DELETE FROM unit_conversions WHERE id=$1 RETURNING *", [id]);
    if (!r.rows[0]) return res.status(404).json({ message: "Conversion not found" });
    res.json({ message: "Conversion deleted" });
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

export default router;
