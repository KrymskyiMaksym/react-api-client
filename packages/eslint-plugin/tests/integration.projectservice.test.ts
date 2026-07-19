import path from 'node:path';

import * as parser from '@typescript-eslint/parser';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { rules } from '../src/index';

/**
 * Интеграция под typescript-eslint v8 + flat config + `projectService`.
 * Приёмка задачи (v8): правило `no-await-mutate` должно
 * - грузиться без ошибки «requires parserServices»,
 * - НЕ репортить `apiMutation().mutate` (Promise),
 * - репортить `useMutation().mutate` (void).
 */
const fixtureRoot = path.join(__dirname, 'fixtures');

const PROLOGUE = `
type ApiMutationReturn = {
  mutate: (params?: { id: number }) => Promise<{ ok: boolean }>;
};
type UseMutationResult = {
  mutate: (vars: { id: number }) => void;
  mutateAsync: (vars: { id: number }) => Promise<{ ok: boolean }>;
};
declare function apiMutation(): ApiMutationReturn;
declare function orderApi(): { useMutation: () => UseMutationResult };
async function main() {
`;
const EPILOGUE = `
}
`;

function lint(body: string) {
  const linter = new Linter({ configType: 'flat' });
  return linter.verify(
    `${PROLOGUE}${body}${EPILOGUE}`,
    {
      files: ['**/*.ts'],
      languageOptions: {
        parser: parser as unknown as Linter.Parser,
        parserOptions: {
          projectService: {
            allowDefaultProject: ['default.ts'],
          },
          tsconfigRootDir: fixtureRoot,
        },
      },
      plugins: {
        rac: { rules: rules as unknown as Record<string, never> },
      },
      rules: {
        'rac/no-await-mutate': 'error',
      },
    },
    { filename: path.join(fixtureRoot, 'default.ts') },
  );
}

describe('no-await-mutate under projectService (v8)', () => {
  it('не падает на загрузке и не репортит apiMutation().mutate (Promise)', () => {
    const messages = lint(`await apiMutation().mutate({ id: 1 });`);
    expect(messages).toEqual([]);
  });

  it('репортит useMutation().mutate (void)', () => {
    const messages = lint(`await orderApi().useMutation().mutate({ id: 1 });`);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe('rac/no-await-mutate');
  });
});
