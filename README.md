# villa-walk

Совместная 3D-бродилка по вилле: Fastify + ws + SQLite (better-sqlite3), клиент на three.js r128 (лежит локально в `public/vendor/`).

- Просмотр: `https://villa.sunsetsamui.com/`
- Редактор: та же ссылка с `?k=<EDIT_KEY>` (ключ в `.env`, готовая ссылка — `/srv/villa-walk/EDIT_LINK.txt`)

## Запуск
    cp .env.example .env   # задать EDIT_KEY (32 случайных символа)
    docker compose up -d --build
Данные хранятся на хосте в `/srv/villa-walk/data` (`villa.db`, `uploads/`, `models/`).

## Модель виллы
Положите новый файл в `/srv/villa-walk/data/models/villa.glb`. Перезапуск не нужен: файл отдаётся с `no-cache`, участникам достаточно обновить страницу.
Имена мешей и материалов — ключи сохранённых раскрасок, при переименовании старые цвета перестанут применяться.

## Прокси и сертификат
`deploy/nginx-villa-walk.conf` (WebSocket, `client_max_body_size 32m`), сертификат Let's Encrypt (webroot), продление — системный certbot.timer.

## Резервные копии
`deploy/backup.sh` по cron (`/etc/cron.d/villa-walk-backup`, 03:17) → `/srv/villa-walk/backups/`, хранится 14 дней.

## Протокол
`GET /api/state`; `POST /api/models` (multipart, заголовок `x-edit-key`); `DELETE /api/models/:id`; WebSocket `/ws`:
`hello`, `presence`, `paint.set|reset`, `part.set|reset`, `item.set|delete`, `swatches.set` → сервер рассылает всем, включая отправителя; `model.added|deleted` рассылаются после загрузки/удаления по HTTP.
