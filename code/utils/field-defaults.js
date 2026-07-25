export function fieldDefaults(field) {
  const fields = foundry.data.fields;
  if (field instanceof fields.SchemaField) {
    const out = {};
    for (const [key, sub] of Object.entries(field.fields)) out[key] = fieldDefaults(sub);
    return out;
  }
  if (field instanceof fields.ArrayField) {
    const init = field.initial;
    return typeof init === "function" ? init() : foundry.utils.deepClone(init ?? []);
  }
  const init = field.initial;
  return typeof init === "function" ? init() : foundry.utils.deepClone(init);
}
