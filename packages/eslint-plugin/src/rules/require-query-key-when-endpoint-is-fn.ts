import { ESLintUtils, TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  name =>
    `https://github.com/krymskyimaksym/react-api-client/tree/main/packages/eslint-plugin/docs/${name}.md`,
);

/**
 * Если `apiClient(fn, ...)` создан с endpoint-функцией, и где-то
 * вызывается `<api>.useFetch(params)` без `queryKey` в options —
 * предупредить. По умолчанию ключ генерится из endpoint+params, но при
 * endpoint-функции стабильность ключа зависит от того, что функция
 * возвращает одну и ту же строку для одних и тех же params. Явный
 * `queryKey` снимает риск.
 *
 * Эвристика статическая: ищем `const xxxApi = apiClient(SomethingFn, ...)`,
 * запоминаем имя, потом ругаемся на `xxxApi.useFetch(...)` без queryKey
 * в options-объекте.
 */
export const requireQueryKeyWhenEndpointIsFn = createRule({
  name: 'require-query-key-when-endpoint-is-fn',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'When apiClient is created from an endpoint function, useFetch should specify explicit queryKey.',
      recommended: 'recommended',
    },
    schema: [],
    messages: {
      missing:
        'apiClient с endpoint-функцией: укажи `queryKey` явно, чтобы ключ кэша был стабильным.',
    },
  },
  defaultOptions: [],
  create(context) {
    const apisWithFnEndpoint = new Set<string>();

    return {
      // const xApi = apiClient(fn, ...)
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        if (node.id.type !== 'Identifier') return;
        if (!node.init || node.init.type !== 'CallExpression') return;
        const call = node.init;
        if (
          call.callee.type !== 'Identifier' ||
          (call.callee.name !== 'apiClient' && call.callee.name !== 'apiPaginate')
        )
          return;
        const firstArg = call.arguments[0];
        if (!firstArg) return;
        if (
          firstArg.type === 'ArrowFunctionExpression' ||
          firstArg.type === 'FunctionExpression'
        ) {
          apisWithFnEndpoint.add(node.id.name);
        }
      },

      // xApi.useFetch(params, options?)
      CallExpression(node: TSESTree.CallExpression) {
        if (node.callee.type !== 'MemberExpression') return;
        const obj = node.callee.object;
        const prop = node.callee.property;
        if (obj.type !== 'Identifier') return;
        if (!apisWithFnEndpoint.has(obj.name)) return;
        if (prop.type !== 'Identifier') return;
        if (prop.name !== 'useFetch' && prop.name !== 'usePaginate') return;

        const optionsArg = node.arguments[1];
        if (!optionsArg) {
          context.report({ node, messageId: 'missing' });
          return;
        }
        if (optionsArg.type !== 'ObjectExpression') return; // не статически анализируем
        const hasQueryKey = optionsArg.properties.some(
          p =>
            p.type === 'Property' &&
            p.key.type === 'Identifier' &&
            p.key.name === 'queryKey',
        );
        if (!hasQueryKey) {
          context.report({ node, messageId: 'missing' });
        }
      },
    };
  },
});
