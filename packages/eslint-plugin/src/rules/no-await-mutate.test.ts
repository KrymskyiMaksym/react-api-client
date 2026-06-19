import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from 'vitest';

import { noAwaitMutate } from './no-await-mutate';

RuleTester.afterAll = afterAll;
RuleTester.it = it;
RuleTester.itOnly = it.only;
RuleTester.describe = describe;

const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('no-await-mutate', noAwaitMutate, {
  valid: [
    { code: 'await api.mutateAsync({ id: 1 });' },
    { code: 'api.mutate({ id: 1 });' },
    { code: 'const x = await fn();' },
  ],
  invalid: [
    {
      code: 'await api.mutate({ id: 1 });',
      errors: [{ messageId: 'avoid' }],
      output: 'await api.mutateAsync({ id: 1 });',
    },
    {
      code: 'await orderApi.useMutation().mutate({ id: 1 });',
      errors: [{ messageId: 'avoid' }],
      output: 'await orderApi.useMutation().mutateAsync({ id: 1 });',
    },
  ],
});
