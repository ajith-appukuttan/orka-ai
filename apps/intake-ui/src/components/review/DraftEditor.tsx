import { TextInput, Textarea, TagsInput, Stack, Button, Group, Text } from '@mantine/core';
import { useState } from 'react';
import type { IntakeDraft } from '@orka/draft-schema';

interface DraftEditorProps {
  draft: IntakeDraft;
  onSave: (patch: Partial<IntakeDraft>) => void;
  isSaving: boolean;
}

export function DraftEditor({ draft, onSave, isSaving }: DraftEditorProps) {
  const [edited, setEdited] = useState<Record<string, unknown>>({});

  const updateField = (path: string, value: unknown) => {
    setEdited((prev) => ({ ...prev, [path]: value }));
  };

  const handleSave = () => {
    // Reconstruct nested objects from flat edits
    const patch: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(edited)) {
      if (key.startsWith('problemStatement.')) {
        const subKey = key.replace('problemStatement.', '');
        if (!patch.problemStatement) {
          patch.problemStatement = { ...draft.problemStatement };
        }
        (patch.problemStatement as Record<string, unknown>)[subKey] = value;
      } else if (key.startsWith('currentState.')) {
        const subKey = key.replace('currentState.', '');
        if (!patch.currentState) {
          patch.currentState = { ...draft.currentState };
        }
        (patch.currentState as Record<string, unknown>)[subKey] = value;
      } else {
        patch[key] = value;
      }
    }

    onSave(patch as Partial<IntakeDraft>);
    setEdited({});
  };

  const hasChanges = Object.keys(edited).length > 0;

  const getVal = (path: string, fallback: string) => (edited[path] as string) ?? fallback;

  const getArr = (path: string, fallback: string[]) => (edited[path] as string[]) ?? fallback;

  return (
    <Stack gap="md">
      <TextInput
        label="Title"
        value={getVal('title', draft.title)}
        onChange={(e) => updateField('title', e.currentTarget.value)}
      />

      <Text fw={600} size="sm" mt="md">
        Problem Statement
      </Text>
      <TextInput
        label="Who is affected"
        value={getVal('problemStatement.who', draft.problemStatement.who)}
        onChange={(e) => updateField('problemStatement.who', e.currentTarget.value)}
      />
      <Textarea
        label="What problem"
        autosize
        minRows={2}
        value={getVal('problemStatement.what', draft.problemStatement.what)}
        onChange={(e) => updateField('problemStatement.what', e.currentTarget.value)}
      />
      <Textarea
        label="Context"
        autosize
        minRows={2}
        value={getVal('problemStatement.context', draft.problemStatement.context)}
        onChange={(e) => updateField('problemStatement.context', e.currentTarget.value)}
      />
      <Textarea
        label="Cost of inaction"
        autosize
        minRows={2}
        value={getVal('problemStatement.costOfInaction', draft.problemStatement.costOfInaction)}
        onChange={(e) => updateField('problemStatement.costOfInaction', e.currentTarget.value)}
      />

      <TextInput
        label="Trigger (why now)"
        value={getVal('trigger', draft.trigger)}
        onChange={(e) => updateField('trigger', e.currentTarget.value)}
      />

      <TagsInput
        label="Goals (success criteria)"
        value={getArr('goals', draft.goals)}
        onChange={(value) => updateField('goals', value)}
      />
      <TagsInput
        label="Non-Goals"
        value={getArr('nonGoals', draft.nonGoals)}
        onChange={(value) => updateField('nonGoals', value)}
      />
      <TagsInput
        label="Constraints"
        value={getArr('constraints', draft.constraints)}
        onChange={(value) => updateField('constraints', value)}
      />
      <TagsInput
        label="Open Questions"
        value={getArr('openQuestions', draft.openQuestions)}
        onChange={(value) => updateField('openQuestions', value)}
      />
      <TagsInput
        label="Assumptions"
        value={getArr('assumptions', draft.assumptions)}
        onChange={(value) => updateField('assumptions', value)}
      />

      <Textarea
        label="Current State"
        autosize
        minRows={2}
        value={getVal('currentState.description', draft.currentState.description)}
        onChange={(e) => updateField('currentState.description', e.currentTarget.value)}
      />

      <Group justify="flex-end">
        <Button onClick={handleSave} loading={isSaving} disabled={!hasChanges}>
          Save Changes
        </Button>
      </Group>
    </Stack>
  );
}
