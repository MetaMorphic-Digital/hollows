import { localizeZone } from "../canvas/zone.js";

/** Registers the system's Handlebars helpers. */
export function registerHollowsHandlebarsHelpers() {
  Handlebars.registerHelper("zoneLabel", (zoneId) => localizeZone(zoneId));
  Handlebars.registerHelper("eq", (a, b) => a === b);
  Handlebars.registerHelper("gt", (a, b) => Number(a) > Number(b));
  Handlebars.registerHelper("or", (a, b) => a || b);
  Handlebars.registerHelper("and", (a, b) => a && b);
  Handlebars.registerHelper("includes", (arr, value) => {
    if (!Array.isArray(arr)) return false;
    return arr.includes(value);
  });
}
