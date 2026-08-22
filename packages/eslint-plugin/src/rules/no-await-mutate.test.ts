import path from 'node:path';

import * as parser from '@typescript-eslint/parser';
import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from 'vitest';

import { noAwaitMutate } from './no-await-mutate';

RuleTester.afterAll = afterAll;
RuleTester.it = it;
RuleTester.itOnly = it.only;
RuleTester.describe = describe;

const fixtureRoot = path.join(__dirname, '..', '..', 'tests', 'fixtures');

const ruleTester = new RuleTester({
  languageOptions: {
    parser,
    parserOptions: {
      project: './tsconfig.json',
      tsconfigRootDir: fixtureRoot,
    },
  },
});

// Общий пролог: воспроизводит оба контракта из react-api-client.
// `apiMutation().mutate` -> Promise, `useMutation().mutate` -> void.
const PROLOGUE = `
type ApiMutationReturn = {
  mutate: (params?: { id: number }) => Promise<{ ok: boolean }>;
};
type UseMutationResult = {
  mutate: (vars: { id: number }) => void;
  mutateAsync: (vars: { id: number }) => Promise<{ ok: boolean }>;
};
declare function apiMutation(): ApiMutationReturn;
declare function someApi(_id: number): ApiMutationReturn;
declare function orderApi(): { useMutation: () => UseMutationResult };
async function main() {
`;
const EPILOGUE = `
}
`;

// filename относителен tsconfigRootDir (требование rule-tester v8).
const wrap = (body: string) => ({
  code: `${PROLOGUE}${body}${EPILOGUE}`,
  filename: 'file.ts',
});

ruleTester.run('no-await-mutate', noAwaitMutate, {
  valid: [
    // apiMutation().mutate возвращает Promise — await корректен.
    wrap(`await apiMutation().mutate({ id: 1 });`),
    wrap(`await someApi(1).mutate({ id: 1 });`),
    // await mutateAsync — тоже Promise.
    wrap(`await orderApi().useMutation().mutateAsync({ id: 1 });`),
    // mutate без await не трогаем.
    wrap(`orderApi().useMutation().mutate({ id: 1 });`),
    // Деструктурированный apiMutation().mutate возвращает Promise — await ок.
    wrap(`const { mutate } = apiMutation();\nawait mutate({ id: 1 });`),
    // any-тип: неизвестно, не шумим (fail-open).
    wrap(`const anyApi: any = orderApi();\nawait anyApi.mutate({ id: 1 });`),
  ],
  invalid: [
    // useMutation().mutate возвращает void — await бессмыслен.
    {
      ...wrap(`await orderApi().useMutation().mutate({ id: 1 });`),
      errors: [{ messageId: 'avoid' }],
    },
    {
      ...wrap(
        `const { mutate } = orderApi().useMutation();\nawait mutate({ id: 1 });`,
      ),
      errors: [{ messageId: 'avoid' }],
    },
  ],
});

