export type FieldConfig = { text: string; dynamic: boolean };
export type DemoConfig = Record<string, FieldConfig>;
export type TextContract = { key: string; sample: string; min: number; max: number };

export function createConfig(fields: readonly TextContract[]): DemoConfig {
  return Object.fromEntries(fields.map(field => [field.key, { text: field.sample, dynamic: true }]));
}

/** Match the template's visible Unicode count; whitespace is normalized, controls rejected. */
export function validateText(text: string, min: number, max: number) {
  let count = 0;
  let visible = false;
  let pendingSpace = false;
  let invisible = false;
  for (const character of text) {
    if (/\p{Cf}/u.test(character)) { invisible = true; continue; }
    if (/\s/u.test(character)) {
      if (![' ', '\n', '\t'].includes(character)) invisible = true;
      if (visible) pendingSpace = true;
      continue;
    }
    if (/\p{Cc}/u.test(character)) { invisible = true; continue; }
    if (pendingSpace) { count += 1; pendingSpace = false; }
    count += 1;
    visible = true;
  }
  return { count, valid: !invisible && count >= min && count <= max, invisible };
}

export function invalidFields(fields: readonly TextContract[], config: DemoConfig) {
  return fields.filter(field => !validateText(config[field.key].text, field.min, field.max).valid).map(field => field.key);
}
