import { ESLintUtils, TSESTree } from '@typescript-eslint/utils';
import * as tsutils from 'ts-api-utils';
import type { Type } from 'typescript';

const createRule = ESLintUtils.RuleCreator(
  name =>
    `https://github.com/krymskyimaksym/react-api-client/tree/main/packages/eslint-plugin/docs/${name}.md`,
);

/**
 * Запрещает `await <expr>.mutate(...)`, когда `.mutate` возвращает `void`
 * (это `useMutation().mutate` из react-api-client / @tanstack/react-query).
 * Await такого вызова бессмыслен — для await/try-catch есть `mutateAsync`.
 *
 * Правило type-aware: `apiMutation(...).mutate(...)` возвращает `Promise`,
 * его await корректен, и такой вызов НЕ репортится.
 *
 * Требует `parserOptions.project`. Если типовая информация недоступна,
 * правило молча ничего не репортит (fail-open), чтобы не плодить ложные
 * срабатывания в проектах без типизации.
 */
export const noAwaitMutate = createRule({
  name: 'no-await-mutate',
  meta: {
    type: 'problem',
    docs: {
      description:
        'await on a void-returning mutate() has no effect; use mutateAsync for awaitable mutations.',
      recommended: 'recommended',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      avoid:
        '`mutate` возвращает void — await не сработает. Используй `mutateAsync` для await/try-catch (или `apiMutation().mutate`, который возвращает Promise).',
    },
  },
  defaultOptions: [],
  create(context) {
    // fail-open: без типовой информации не репортим ничего.
    const services = ESLintUtils.getParserServices(context, true);
    if (!services.program) return {};

    // await над таким типом безопасен / неопределён — не репортим.
    const isAwaitable = (type: Type): boolean =>
      tsutils.unionTypeParts(type).some(
        part =>
          // Promise-подобный: есть `.then`.
          part.getProperties().some(symbol => symbol.getName() === 'then') ||
          // any/unknown/error — тип неизвестен, не шумим (fail-open).
          tsutils.isIntrinsicAnyType(part) ||
          tsutils.isIntrinsicUnknownType(part) ||
          tsutils.isIntrinsicErrorType(part),
      );

    return {
      AwaitExpression(node: TSESTree.AwaitExpression) {
        const arg = node.argument;
        if (arg.type !== 'CallExpression') return;
        const callee = arg.callee;

        // Матчим `await x.mutate(...)` и `await mutate(...)` (деструктуризация
        // `const { mutate } = useMutation()`).
        const isMutateCall =
          (callee.type === 'MemberExpression' &&
            callee.property.type === 'Identifier' &&
            callee.property.name === 'mutate') ||
          (callee.type === 'Identifier' && callee.name === 'mutate');
        if (!isMutateCall) return;

        const type = services.getTypeAtLocation(arg);

        // Promise-подобный результат (напр. apiMutation().mutate) — await ок.
        if (isAwaitable(type)) return;

        context.report({ node, messageId: 'avoid' });
      },
    };
  },
});