# 📂 All Source Code — Consolidated Bundle

**Total: 6,482 files concatenated into 10 text parts**
**Size: ~98 MB**

Each part contains ~649 files, with clear headers:
```
================================================================================
FILE: path/to/file.ts
SIZE: 1234 bytes
================================================================================
<file contents>
```

## Parts
1. `all_source_part_01_of_10.txt` — 12 MB
2. `all_source_part_02_of_10.txt` — 10.28 MB
3. `all_source_part_03_of_10.txt` — 4.65 MB
4. `all_source_part_04_of_10.txt` — 13.50 MB
5. `all_source_part_05_of_10.txt` — 15.34 MB
6. `all_source_part_06_of_10.txt` — 3.46 MB
7. `all_source_part_07_of_10.txt` — 2.45 MB
8. `all_source_part_08_of_10.txt` — 14.29 MB
9. `all_source_part_09_of_10.txt` — 14.40 MB
10. `all_source_part_10_of_10.txt` — 7.22 MB

## Included file types
`.ts`, `.tsx`, `.js`, `.jsx`, `.sql`, `.md`, `.json`, `.yaml`, `.yml`, `.py`, `.sh`

## Excluded
- `node_modules/`, `dist/`, `build/`, `.git/`, `.cache/`
- `_merge-staging*/`, `_external-backups/`, `_github-backups/`
- `AI-Task-Manager/` (sub-monorepo duplicate)
- Files over 500 KB (min.js, bundles, etc.)
- Lock files (`pnpm-lock.yaml`, `package-lock.json`)

## How to use

Each file is a standalone text file. Open in any text editor:
```bash
less all_source_part_01_of_10.txt
# or
grep -n "FILE:" all_source_part_01_of_10.txt  # list files in that part
```

To reconstruct the original structure, use the 10 ZIPs in `../zips/` instead.
