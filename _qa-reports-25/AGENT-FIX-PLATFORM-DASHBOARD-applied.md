# AGENT-FIX-PLATFORM-DASHBOARD — Applied

**File:** `erp-app/src/pages/platform/PlatformDashboard.tsx`
**Date:** 2026-04-29

## Result

| Metric | Before | After |
|---|---:|---:|
| File size (bytes, on-disk wc -c, CRLF) | 24,746 | 24,199 |
| File size (bytes, content UTF-8 LF) | 24,425 | 23,879 |
| TS errors in this file | 118 | **0** |
| Bytes removed | — | 547 |

`npx tsc --noEmit -p erp-app/tsconfig.json` confirmed: 118 -> 0 errors in `PlatformDashboard.tsx`. Other files (e.g. `PayrollRun360.tsx`) still error — out of scope per task spec.

## Root cause

Not HTML entities. The file had been mangled by a faulty regex/replace pass that **doubled every JSX closing-tag identifier**:

```
</p>p>            → </p>
</div>div>        → </div>
</span>span>      → </span>
</Card>Card>      → </Card>
</CardContent>CardContent>     → </CardContent>
</CardHeader>CardHeader>       → </CardHeader>
</CardTitle>CardTitle>         → </CardTitle>
</Badge>Badge>                 → </Badge>
</Button>Button>               → </Button>
</h1>h1>                       → </h1>
</AreaChart>AreaChart>         → </AreaChart>
</PieChart>PieChart>           → </PieChart>
</Pie>Pie>                     → </Pie>
</ResponsiveContainer>ResponsiveContainer> → </ResponsiveContainer>
</linearGradient>linearGradient>           → </linearGradient>
</defs>defs>                   → </defs>
```

A trailing stray `}</Card>` after the final `}` of `export default function` was also removed by the same single regex pass.

## Fix

One Python `re.sub` pass over the file:

```python
re.sub(r'</([A-Za-z_][A-Za-z0-9_]*)>\1>', r'</\1>', src)
```

This matches `</TagName>TagName>` where the second token is the same identifier, and collapses it to `</TagName>`. Safe because legal JSX never has a tag identifier appearing as bare text immediately after a closing tag.

## Preserved

- All UI structure: header, KPI cards (4), Revenue area chart, Plan Distribution pie chart, Modules grid, Subscription Plans list, Registered Businesses list, empty-state CTA.
- All component imports (Card, Badge, Button, recharts, lucide icons, supabase).
- All Hebrew/English copy (this dashboard is `dir="ltr"` English only — no Hebrew strings present).
- All inline styles, Tailwind classes, and `bg`/`color` props.
- All Supabase queries, state hooks, and effect logic.
- No new dependencies; no scaffold replacement was needed (file was repairable).

## Verification command

```
npx tsc --noEmit -p erp-app/tsconfig.json
```
