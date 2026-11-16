import type { CaseTypeDefinition, FieldDef, StageDef } from './types.js';

export function stageOfDefinition(
  definition: CaseTypeDefinition,
  stageKey: string,
): StageDef | undefined {
  return definition.stages.find((stage) => stage.key === stageKey);
}

export function fieldsForStage(
  definition: CaseTypeDefinition,
  stageKey: string,
): FieldDef[] {
  const stage = stageOfDefinition(definition, stageKey);
  if (!stage?.fields?.length) return definition.fields;
  const merged = new Map<string, FieldDef>();
  for (const field of definition.fields) merged.set(field.key, field);
  for (const field of stage.fields) merged.set(field.key, field);
  return [...merged.values()];
}

export function allDefinitionFields(definition: CaseTypeDefinition): FieldDef[] {
  const merged = new Map<string, FieldDef>();
  for (const field of definition.fields) merged.set(field.key, field);
  for (const stage of definition.stages) {
    for (const field of stage.fields ?? []) merged.set(field.key, field);
  }
  return [...merged.values()];
}

export function definitionFieldKeys(definition: CaseTypeDefinition): string[] {
  return allDefinitionFields(definition).map((field) => field.key);
}
