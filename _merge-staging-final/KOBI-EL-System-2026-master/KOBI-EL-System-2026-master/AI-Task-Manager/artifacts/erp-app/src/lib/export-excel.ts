// Legacy export function - redirects to new export-utils
import { exportToExcel as exportXLSX } from "./export-utils";

export function exportToExcel(data: Record<string, any>[], headers: Record<string, string>, filename: string) {
  return exportXLSX(data, headers, filename);
}
