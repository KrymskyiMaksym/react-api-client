import { noAwaitMutate } from './rules/no-await-mutate';
import { requireQueryKeyWhenEndpointIsFn } from './rules/require-query-key-when-endpoint-is-fn';

export const rules = {
  'no-await-mutate': noAwaitMutate,
  'require-query-key-when-endpoint-is-fn': requireQueryKeyWhenEndpointIsFn,
};

export const configs = {
  recommended: {
    plugins: ['@krymskyimaksym/react-api-client'],
    rules: {
      '@krymskyimaksym/react-api-client/no-await-mutate': 'error',
      '@krymskyimaksym/react-api-client/require-query-key-when-endpoint-is-fn':
        'warn',
    },
  },
};

export default { rules, configs };
