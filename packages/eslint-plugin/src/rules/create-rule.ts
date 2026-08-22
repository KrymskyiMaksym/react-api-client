import { ESLintUtils } from '@typescript-eslint/utils';

/**
 * Кастомные поля `docs`, используемые правилами плагина. В
 * typescript-eslint v8 они не входят в `RuleMetaDataDocs` и задаются через
 * generic-параметр `RuleCreator<PluginDocs>`.
 */
export interface PluginDocs {
  recommended?: boolean;
  requiresTypeChecking?: boolean;
}

export const createRule = ESLintUtils.RuleCreator<PluginDocs>(
  name =>
    `https://github.com/krymskyimaksym/react-api-client/tree/main/packages/eslint-plugin/docs/${name}.md`,
);
