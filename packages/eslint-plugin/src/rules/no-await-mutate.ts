import { ESLintUtils, TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  name =>
    `https://github.com/krymskyimaksym/react-api-client/tree/main/packages/eslint-plugin/docs/${name}.md`,
);

/**
 * Запрещает `await x.mutate(...)` — `mutate` возвращает `void`, а не
 * `Promise`. Для последовательной логики или try/catch используй
 * `mutateAsync`.
 *
 * Эвристика: `await <expr>.mutate(...)`.
 */
export const noAwaitMutate = createRule({
  name: 'no-await-mutate',
  meta: {
    type: 'problem',
    docs: {
      description:
        'mutate() returns void; await it has no effect. Use mutateAsync for awaitable mutations.',
      recommended: 'recommended',
    },
    fixable: 'code',
    schema: [],
    messages: {
      avoid:
        '`mutate` возвращает void — await не сработает. Используй `mutateAsync` для await/try-catch.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      AwaitExpression(node: TSESTree.AwaitExpression) {
        const arg = node.argument;
        if (arg.type !== 'CallExpression') return;
        const callee = arg.callee;
        if (callee.type !== 'MemberExpression') return;
        const prop = callee.property;
        if (prop.type !== 'Identifier' || prop.name !== 'mutate') return;

        context.report({
          node,
          messageId: 'avoid',
          fix(fixer) {
            return fixer.replaceText(prop, 'mutateAsync');
          },
        });
      },
    };
  },
});
