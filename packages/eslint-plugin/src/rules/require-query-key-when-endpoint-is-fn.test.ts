import * as parser from '@typescript-eslint/parser';
import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from 'vitest';

import { requireQueryKeyWhenEndpointIsFn } from './require-query-key-when-endpoint-is-fn';

RuleTester.afterAll = afterAll;
RuleTester.it = it;
RuleTester.itOnly = it.only;
RuleTester.describe = describe;

const ruleTester = new RuleTester({
  languageOptions: { parser },
});

ruleTester.run(
  'require-query-key-when-endpoint-is-fn',
  requireQueryKeyWhenEndpointIsFn,
  {
    valid: [
      // endpoint — строка → ОК
      {
        code: `
          const api = apiClient('/x');
          api.useFetch();
        `,
      },
      // endpoint — функция, queryKey задан явно → ОК
      {
        code: `
          const api = apiClient((p) => '/x/' + p.id);
          api.useFetch({ id: 1 }, { queryKey: ['x', 1] });
        `,
      },
    ],
    invalid: [
      {
        code: `
          const api = apiClient((p) => '/x/' + p.id);
          api.useFetch({ id: 1 });
        `,
        errors: [{ messageId: 'missing' }],
      },
      {
        code: `
          const api = apiClient((p) => '/x/' + p.id);
          api.useFetch({ id: 1 }, { staleTime: 1000 });
        `,
        errors: [{ messageId: 'missing' }],
      },
      {
        code: `
          const api = apiPaginate((p) => '/list/' + p.cat);
          api.usePaginate({ cat: 'a' });
        `,
        errors: [{ messageId: 'missing' }],
      },
    ],
  },
);
