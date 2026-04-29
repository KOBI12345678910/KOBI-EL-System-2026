"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiCoordinator = void 0;
const connection_1 = require("../db/connection");
// AI שמתאם מדידות והתקנות אוטומטית
exports.aiCoordinator = {
    async scheduleMeasurement(project) {
        // מצא מודד פנוי
        const { rows: surveyors } = await (0, connection_1.query)(`
      SELECT e.id, e.name,
        COUNT(t.id) FILTER (WHERE t.scheduled_date = CURRENT_DATE + 1 AND t.status != 'done') as tomorrow_tasks
      FROM employees e
      LEFT JOIN tasks t ON e.id = t.employee_id
      WHERE e.role LIKE '%מודד%' AND e.is_active = true
      GROUP BY e.id, e.name
      ORDER BY tomorrow_tasks ASC
      LIMIT 1
    `);
        const surveyor = surveyors[0] || { id: null, name: 'מודד ראשי' };
        // תאריך: מחר בבוקר
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        // צור task למודד
        if (surveyor.id) {
            await (0, connection_1.query)(`
        INSERT INTO tasks (order_id, employee_id, type, title, address, scheduled_date, scheduled_time)
        VALUES ($1, $2, 'measurement', $3, $4, $5, '09:00')
      `, [project.order_id, surveyor.id,
                `מדידה — ${project.title}`, project.address,
                tomorrow.toISOString().slice(0, 10)]);
        }
        return {
            datetime: tomorrow.toISOString(),
            surveyorId: surveyor.id,
            surveyorName: surveyor.name
        };
    },
    async scheduleInstallation(project) {
        // מצא מתקין פנוי
        const { rows: installers } = await (0, connection_1.query)(`
      SELECT e.id, e.name,
        COUNT(t.id) FILTER (WHERE t.scheduled_date >= CURRENT_DATE AND t.status != 'done') as upcoming_tasks
      FROM employees e
      LEFT JOIN tasks t ON e.id = t.employee_id
      WHERE e.department = 'installation' AND e.is_active = true
      GROUP BY e.id, e.name
      ORDER BY upcoming_tasks ASC
      LIMIT 1
    `);
        const installer = installers[0] || { id: null, name: 'מתקין' };
        // תאריך: עוד 3 ימים
        const installDate = new Date();
        installDate.setDate(installDate.getDate() + 3);
        // דלג על שישי שבת
        if (installDate.getDay() === 5)
            installDate.setDate(installDate.getDate() + 2);
        if (installDate.getDay() === 6)
            installDate.setDate(installDate.getDate() + 1);
        const dateStr = installDate.toISOString().slice(0, 10);
        if (installer.id) {
            await (0, connection_1.query)(`
        INSERT INTO tasks (order_id, employee_id, type, title, address, lat, lng, scheduled_date, scheduled_time)
        VALUES ($1, $2, 'installation', $3, $4, $5, $6, $7, '08:00')
      `, [project.order_id, installer.id,
                `התקנה — ${project.title}`, project.address,
                project.lat, project.lng, dateStr]);
        }
        return {
            date: dateStr,
            time: '08:00',
            installerId: installer.id,
            installerName: installer.name
        };
    }
};
