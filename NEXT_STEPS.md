# Следующие шаги для публикации пакета

Пакет готов! Теперь выполните следующие шаги для публикации на GitHub и NPM.

## ✅ Что уже сделано

- ✅ Создана структура пакета
- ✅ Настроены TypeScript и сборка
- ✅ Добавлены хуки для React
- ✅ Создана документация (README.md)
- ✅ Настроены ESLint и Prettier
- ✅ Добавлены GitHub Actions для CI/CD
- ✅ Инициализирован Git репозиторий
- ✅ Создан первый commit

## 📝 Что нужно сделать

### 1. Обновите package.json (ОБЯЗАТЕЛЬНО!)

```bash
cd /Users/admin/Projects/react-native/react-api-client
```

Откройте `package.json` и замените:

```json
{
  "name": "@krymskyimaksym/react-api-client",  // ← ЗАМЕНИТЕ на ваш npm username/org
  "author": "Your Name <your.email@example.com>",  // ← ЗАМЕНИТЕ
  "repository": {
    "url": "https://github.com/krymskyimaksym/react-api-client.git"  // ← ЗАМЕНИТЕ
  },
  "bugs": {
    "url": "https://github.com/krymskyimaksym/react-api-client/issues"  // ← ЗАМЕНИТЕ
  },
  "homepage": "https://github.com/krymskyimaksym/react-api-client#readme"  // ← ЗАМЕНИТЕ
}
```

Сохраните изменения и закоммитьте:
```bash
git add package.json
git commit -m "Update package info"
```

### 2. Создайте GitHub репозиторий

1. Перейдите на https://github.com/new
2. Repository name: `react-api-client`
3. Description: "A lightweight, type-safe API client for React and React Native"
4. Public репозиторий
5. НЕ инициализируйте с README/LICENSE (они уже есть)
6. Создайте репозиторий

### 3. Загрузите код на GitHub

```bash
cd /Users/admin/Projects/react-native/react-api-client

# Добавьте remote (замените krymskyimaksym на ваш GitHub username)
git remote add origin https://github.com/krymskyimaksym/react-api-client.git

# Push код
git push -u origin main
```

### 4. Установите зависимости и проверьте код

```bash
cd /Users/admin/Projects/react-native/react-api-client

# Установите зависимости
npm install

# Проверьте код
npm run lint
npm run typecheck

# Соберите пакет
npm run build

# Проверьте содержимое dist/
ls -la dist/
```

### 5. Настройте NPM

#### Если у вас нет аккаунта NPM:
1. Зарегистрируйтесь на https://www.npmjs.com/signup

#### Войдите в NPM:
```bash
npm login
```

#### Если используете scoped package (@krymskyimaksym/...):
Создайте организацию на https://www.npmjs.com/org/create

### 6. Опубликуйте на NPM

```bash
cd /Users/admin/Projects/react-native/react-api-client

# Для scoped package (@krymskyimaksym/...)
npm publish --access public

# Для обычного package (react-api-client)
npm publish
```

### 7. Настройте автоматическую публикацию через GitHub

1. Создайте NPM Access Token:
   - https://www.npmjs.com/settings/YOUR_USERNAME/tokens
   - "Generate New Token" → "Automation"
   - Скопируйте токен

2. Добавьте токен в GitHub Secrets:
   - https://github.com/krymskyimaksym/react-api-client/settings/secrets/actions
   - "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: ваш токен

Теперь при создании GitHub Release пакет будет автоматически публиковаться!

### 8. Проверьте опубликованный пакет

```bash
# Посмотрите информацию
npm info @krymskyimaksym/react-api-client

# Установите в тестовом проекте
npm install @krymskyimaksym/react-api-client
```

## 🎉 Готово!

Ваш пакет опубликован! Теперь вы можете:

1. **Использовать в своих проектах:**
   ```bash
   npm install @krymskyimaksym/react-api-client
   ```

2. **Интегрировать в Totax Control:**
   См. инструкции в `INTEGRATION_EXAMPLE.md`

3. **Публиковать новые версии:**
   ```bash
   npm version patch   # 1.0.0 → 1.0.1
   npm version minor   # 1.0.0 → 1.1.0
   npm version major   # 1.0.0 → 2.0.0
   git push && git push --tags
   npm publish
   ```

## 📚 Полезные ссылки

- Документация по публикации: `PUBLISHING.md`
- Пример интеграции: `INTEGRATION_EXAMPLE.md`
- README с примерами: `README.md`

## ❓ Нужна помощь?

Если что-то не получается:
1. Проверьте `PUBLISHING.md` для troubleshooting
2. Проверьте логи GitHub Actions (если настроена CI/CD)
3. Проверьте статус на https://www.npmjs.com/package/@krymskyimaksym/react-api-client