import { noAwaitMutate } from './rules/no-await-mutate';
import { noNonSerializableParams } from './rules/no-non-serializable-params';
import { requireQueryKeyWhenEndpointIsFn } from './rules/require-query-key-when-endpoint-is-fn';

export const rules = {
  'no-await-mutate': noAwaitMutate,
  'no-non-serializable-params': noNonSerializableParams,
  'require-query-key-when-endpoint-is-fn': requireQueryKeyWhenEndpointIsFn,
};

export const configs = {
  recommended: {
    plugins: ['@krymskyimaksym/react-api-client'],
    rules: {
      '@krymskyimaksym/react-api-client/no-await-mutate': 'error',
      '@krymskyimaksym/react-api-client/no-non-serializable-params': 'error',
      '@krymskyimaksym/react-api-client/require-query-key-when-endpoint-is-fn':
        'warn',
    },
  },
};

export default { rules, configs };
