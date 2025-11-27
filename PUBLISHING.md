# Publishing Guide

## Подготовка к публикации

### 1. Обновите информацию в package.json

Перед публикацией обязательно обновите:

```json
{
  "name": "@krymskyimaksym/react-api-client",  // Замените на ваше npm org/username
  "version": "1.0.0",                     // Версия пакета
  "author": "Your Name <your.email@example.com>",
  "repository": {
    "type": "git",
    "url": "https://github.com/krymskyimaksym/react-api-client.git"  // Ваш GitHub репозиторий
  }
}
```

### 2. Создайте репозиторий на GitHub

1. Перейдите на https://github.com/new
2. Создайте новый репозиторий с именем `react-api-client`
3. Не инициализируйте с README, .gitignore или LICENSE (они уже есть)

### 3. Загрузите код на GitHub

```bash
cd /Users/admin/Projects/react-native/react-api-client

# Добавьте remote origin
git remote add origin https://github.com/krymskyimaksym/react-api-client.git

# Добавьте все файлы
git add .

# Создайте первый commit
git commit -m "Initial commit: React API Client v1.0.0"

# Создайте main ветку и push
git branch -M main
git push -u origin main
```

### 4. Настройте NPM

#### Создайте аккаунт на NPM (если нет)
1. Перейдите на https://www.npmjs.com/signup
2. Зарегистрируйтесь

#### Войдите в NPM через CLI
```bash
npm login
```

#### Создайте NPM организацию (опционально)
Если используете scoped package (@krymskyimaksym/package):
1. Перейдите на https://www.npmjs.com/org/create
2. Создайте организацию с вашим username

### 5. Установите зависимости и соберите пакет

```bash
cd /Users/admin/Projects/react-native/react-api-client

# Установите зависимости
npm install

# Проверьте код
npm run lint
npm run typecheck

# Соберите пакет
npm run build

# Проверьте, что dist/ создана корректно
ls -la dist/
```

### 6. Тестовая публикация (dry-run)

Проверьте, что будет опубликовано:

```bash
npm pack --dry-run
```

Это покажет список файлов, которые будут включены в пакет.

### 7. Публикация на NPM

```bash
# Публикация (для scoped package используйте --access public)
npm publish --access public

# Для unscoped package
npm publish
```

## Публикация новой версии

### 1. Обновите версию

```bash
# Patch (1.0.0 -> 1.0.1) - для багфиксов
npm version patch

# Minor (1.0.0 -> 1.1.0) - для новых фич (обратно совместимых)
npm version minor

# Major (1.0.0 -> 2.0.0) - для breaking changes
npm version major
```

### 2. Push изменений

```bash
git push
git push --tags
```

### 3. Создайте GitHub Release

1. Перейдите на https://github.com/krymskyimaksym/react-api-client/releases/new
2. Выберите тег версии (например, v1.0.1)
3. Заполните описание изменений
4. Нажмите "Publish release"

При создании release автоматически запустится GitHub Action, который опубликует пакет на NPM.

**Важно:** Для автоматической публикации нужно добавить NPM_TOKEN в секреты GitHub:

1. Создайте NPM Access Token:
   - Перейдите на https://www.npmjs.com/settings/krymskyimaksym/tokens
   - Нажмите "Generate New Token" -> "Automation"
   - Скопируйте токен

2. Добавьте токен в GitHub Secrets:
   - Перейдите в Settings -> Secrets and variables -> Actions
   - Нажмите "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: ваш NPM токен

## Использование опубликованного пакета

После публикации пакет можно установить:

```bash
npm install @krymskyimaksym/react-api-client
```

## Проверка пакета

```bash
# Посмотрите информацию о пакете
npm info @krymskyimaksym/react-api-client

# Посмотрите все версии
npm view @krymskyimaksym/react-api-client versions
```

## Troubleshooting

### Ошибка "You do not have permission to publish"
- Убедитесь, что вы вошли в NPM: `npm whoami`
- Для scoped packages используйте `--access public`
- Проверьте, что organization существует

### Ошибка "Version already exists"
- Обновите версию в package.json
- Или используйте `npm version patch/minor/major`

### Пакет не найден после публикации
- Подождите несколько минут (кеширование)
- Проверьте правильность имени пакета
- Убедитесь, что пакет публичный (--access public)