/**
 * Breadcrumb — Hebrew RTL navigation trail for 360 pages.
 *
 * Features:
 *  - Hebrew RTL native (dir="rtl"), separator points to the left ("‹") for RTL flow.
 *  - WCAG / ARIA: <nav aria-label="פירורי לחם">, aria-current="page" on last crumb.
 *  - schema.org BreadcrumbList microdata (itemscope/itemtype/itemprop) so search
 *    engines + crawlers can read the trail. Each crumb is a ListItem with
 *    position, item, and name.
 *  - Plays nicely with react-router-dom <Link> (Page360's environment).
 *  - Renders nothing if items is empty / single (last crumb is the page itself
 *    so we always need at least 2 to display).
 *
 * Usage:
 *   <Breadcrumb items={[
 *     { label: "בית", to: "/" },
 *     { label: "לקוחות", to: "/customers" },
 *     { label: customer.name },         // current page (no `to` => aria-current)
 *   ]} />
 */
import React from "react";
import { Link } from "react-router-dom";

export type BreadcrumbItem = {
  /** Visible label (Hebrew). */
  label: string;
  /** Target route. Omit on the last item — that crumb represents the current page. */
  to?: string;
};

type BreadcrumbProps = {
  items: BreadcrumbItem[];
  /** Visible separator. Defaults to "‹" which is the visually-correct chevron in RTL. */
  separator?: React.ReactNode;
  /** Optional className override for the outer <nav>. */
  className?: string;
};

const DEFAULT_SEPARATOR = "‹"; // ‹  (single left-pointing angle quotation)

export default function Breadcrumb({
  items,
  separator = DEFAULT_SEPARATOR,
  className,
}: BreadcrumbProps) {
  if (!items || items.length < 2) return null;

  return (
    <nav
      aria-label="פירורי לחם"
      dir="rtl"
      className={className ?? "text-xs text-gray-400"}
    >
      <ol
        className="flex flex-wrap items-center gap-1.5"
        itemScope
        itemType="https://schema.org/BreadcrumbList"
      >
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          const position = idx + 1;
          return (
            <li
              key={`${position}-${item.label}`}
              className="flex items-center gap-1.5"
              itemProp="itemListElement"
              itemScope
              itemType="https://schema.org/ListItem"
            >
              {item.to && !isLast ? (
                <Link
                  to={item.to}
                  itemProp="item"
                  className="hover:text-gray-200 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-0.5 transition-colors"
                >
                  <span itemProp="name">{item.label}</span>
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  itemProp="item"
                  className={isLast ? "text-gray-200 font-medium" : ""}
                >
                  <span itemProp="name">{item.label}</span>
                </span>
              )}
              <meta itemProp="position" content={String(position)} />
              {!isLast && (
                <span aria-hidden="true" className="text-gray-600 select-none">
                  {separator}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
