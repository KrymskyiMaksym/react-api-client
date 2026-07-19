import * as parser from '@typescript-eslint/parser';
import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from 'vitest';

import { noNonSerializableParams } from './no-non-serializable-params';

RuleTester.afterAll = afterAll;
RuleTester.it = it;
RuleTester.itOnly = it.only;
RuleTester.describe = describe;

const ruleTester = new RuleTester({
  languageOptions: { parser },
});

ruleTester.run('no-non-serializable-params', noNonSerializableParams, {
  valid: [
    { code: `api.useFetch({ id: 1, sort: 'asc' });` },
    { code: `api.useFetch();` },
    { code: `api.usePaginate({ search: 'x' });` },
  ],
  invalid: [
    {
      code: `api.useFetch({ id: 1, cb: () => 1 });`,
      errors: [{ messageId: 'noFunction' }],
    },
    {
      code: `api.usePaginate({ filter: function () { return 1; } });`,
      errors: [{ messageId: 'noFunction' }],
    },
    {
      code: `api.useFetch({ tag: Symbol('x') });`,
      errors: [{ messageId: 'noSymbol' }],
    },
  ],
});
