/**
 * onyx-cli — command registry.
 *
 * The registry is a small in-memory map of command-group names to
 * handler modules. Each module exports:
 *
 *   {
 *     name:        string,               // group name (e.g. "db")
 *     description: { he: string, en: string }, // bilingual one-liner
 *     subcommands: {                     // at least one sub-command
 *       [sub]: {
 *         description: { he, en },
 *         usage:       string,           // "db backup [--out <path>]"
 *         examples?:   string[],
 *         destructive?: boolean,         // triggers confirm prompt
 *         handler:     (ctx) => Promise<number> | number,
 *       }
 *     }
 *   }
 *
 * The design rule for the Mega-ERP is "לא מוחקים רק משדרגים ומגדלים" —
 * we NEVER delete existing registrations, we only extend this map.
 * New commands should be registered via `register(group)` so that future
 * modules can plug in without touching the central CLI entry point.
 */
'use strict';

const groups = Object.create(null);

/**
 * Register a command group. Throws on duplicate name to protect the
 * "never delete, only grow" invariant — callers must pick unique names
 * or extend an existing group.
 *
 * @param {object} group
 */
function register(group) {
  if (!group || typeof group !== 'object') {
    throw new TypeError('register: group must be an object');
  }
  if (typeof group.name !== 'string' || !group.name) {
    throw new TypeError('register: group.name is required');
  }
  if (!group.subcommands || typeof group.subcommands !== 'object') {
    throw new TypeError(`register(${group.name}): subcommands map required`);
  }
  if (groups[group.name]) {
    throw new Error(
      `register: group "${group.name}" already registered; ` +
        'extend in place instead of re-registering (never delete, only grow).'
    );
  }
  groups[group.name] = group;
  return group;
}

/** Return the registered group or undefined. */
function get(name) {
  return groups[name];
}

/** Return a stable, sorted list of registered group names. */
function list() {
  return Object.keys(groups).sort();
}

/** Return the raw map (read-only usage). */
function all() {
  return groups;
}

/**
 * Extend an existing group with additional sub-commands without
 * overwriting anything that already exists.
 */
function extend(name, subcommands) {
  const group = groups[name];
  if (!group) {
    throw new Error(`extend: group "${name}" is not registered`);
  }
  for (const [key, sub] of Object.entries(subcommands || {})) {
    if (group.subcommands[key]) {
      throw new Error(
        `extend(${name}): sub-command "${key}" already exists (never delete, only grow).`
      );
    }
    group.subcommands[key] = sub;
  }
  return group;
}

module.exports = { register, get, list, all, extend };
