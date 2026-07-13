const MAX_FIELD_LENGTH = 2000;

export function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_[\]#<])/g, "\\$1");
}

export function collapseToSingleLine(value: string): string {
  return value.replace(/\r?\n/g, " ");
}

export function truncate(value: string, max: number = MAX_FIELD_LENGTH): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}
