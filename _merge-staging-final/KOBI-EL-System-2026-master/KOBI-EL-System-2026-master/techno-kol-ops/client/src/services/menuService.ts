import { supabase } from "../lib/supabase";

export interface MenuItem {
  id: number;
  label: string;
  route: string | null;
  icon: string | null;
  parent_id: number | null;
  order_index: number;
  required_permission: string | null;
  children: MenuItem[];
}

/**
 * Fetch the full menu tree from `app_menu`, ordered by `order_index`.
 * Returns a nested tree (parent → children).
 */
export const fetchMenu = async (): Promise<MenuItem[]> => {
  const { data, error } = await supabase
    .from("app_menu")
    .select("*")
    .order("order_index", { ascending: true });

  if (error) throw error;

  return buildTree(data ?? []);
};

/** Build a parent→children tree from the flat list. */
const buildTree = (items: any[]): MenuItem[] => {
  const map: Record<number, MenuItem> = {};
  const roots: MenuItem[] = [];

  items.forEach((i) => (map[i.id] = { ...i, children: [] }));

  items.forEach((i) => {
    if (i.parent_id && map[i.parent_id]) {
      map[i.parent_id].children.push(map[i.id]);
    } else {
      roots.push(map[i.id]);
    }
  });

  return roots;
};
