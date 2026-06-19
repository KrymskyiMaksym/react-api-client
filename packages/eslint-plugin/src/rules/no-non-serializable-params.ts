import { ESLintUtils, TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  name =>
    `https://github.com/krymskyimaksym/react-api-client/tree/main/packages/eslint-plugin/docs/${name}.md`,
);

/**
 * Запрещает несериализуемые значения в `params` для `useFetch` /
 * `usePaginate` / `useQuery`. Функции и Symbol сломают `hashQueryKey`
 * (он `throw`-ает на них), а это приведёт к рантайм-ошибке при mount'е.
 *
 * Ловим статически:
 * - стрелочные/функциональные выражения как значения свойств;
 * - вызовы `Symbol(...)` как значения свойств.
 *
 * Эвристика — без типов; ловит самые частые случаи.
 */
export const noNonSerializableParams = createRule({
  name: 'no-non-serializable-params',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Params for useFetch/usePaginate/useQuery must be serializable. Functions and Symbol break hashQueryKey at runtime.',
      recommended: 'recommended',
    },
    schema: [],
    messages: {
      noFunction:
        'Несериализуемое значение в params (функция): сломает hashQueryKey в рантайме. Вынеси callback наружу хука.',
      noSymbol:
        'Несериализуемое значение в params (Symbol): сломает hashQueryKey в рантайме.',
    },
  },
  defaultOptions: [],
  create(context) {
    const HOOK_NAMES = new Set(['useFetch', 'usePaginate', 'useQuery']);

    function checkObjectExpression(obj: TSESTree.ObjectExpression) {
      for (const prop of obj.properties) {
        if (prop.type !== 'Property') continue;
        const v = prop.value;
        if (
          v.type === 'ArrowFunctionExpression' ||
          v.type === 'FunctionExpression'
        ) {
          context.report({ node: v, messageId: 'noFunction' });
          continue;
        }
        if (
          v.type === 'CallExpression' &&
          v.callee.type === 'Identifier' &&
          v.callee.name === 'Symbol'
        ) {
          context.report({ node: v, messageId: 'noSymbol' });
        }
      }
    }

    return {
      CallExpression(node: TSESTree.CallExpression) {
        if (node.callee.type !== 'MemberExpression') {
          // useQuery(key, fn, opts) — первый аргумент это key,
          // не params; пропускаем.
          if (
            node.callee.type === 'Identifier' &&
            node.callee.name === 'useQuery'
          ) {
            return;
          }
          return;
        }
        const prop = node.callee.property;
        if (prop.type !== 'Identifier' || !HOOK_NAMES.has(prop.name)) return;
        const paramsArg = node.arguments[0];
        if (!paramsArg) return;
        if (paramsArg.type !== 'ObjectExpression') return;
        checkObjectExpression(paramsArg);
      },
    };
  },
});
