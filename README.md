# villa-walk

Совместная 3D-бродилка по вилле: Fastify + ws + SQLite (better-sqlite3), клиент на three.js r128 (лежит локально в `public/vendor/`).

- Просмотр: `https://villa.sunsetsamui.com/`
- Редактор: та же ссылка с `?k=<EDIT_KEY>` (ключ в `.env`, готовая ссылка — `/srv/villa-walk/EDIT_LINK.txt`)

## Запуск
    cp .env.example .env   # задать EDIT_KEY (32 случайных символа)
    docker compose up -d --build
Данные хранятся на хосте в `/srv/villa-walk/data` (`villa.db`, `uploads/`, `models/`).

## Как обновить модель дома
Модель лежит в томе данных: `/srv/villa-walk/data/models/villa.glb` (в контейнере `/data/models/villa.glb`). При первом старте её копирует туда `seed/villa.glb`, если файла ещё нет. Пересборка образа и перезагрузка страницы у участников не нужны: все открытые вкладки получают сообщение `house.updated`, в фоне грузят новую модель и подменяют старую. Мебель, участники, инструмент и позиция в прогулке сохраняются, перекраски применяются заново. Показывается «Модель дома обновлена».

Перекраски, для которых в новой модели нет материала или детали с таким именем, из базы не удаляются и не применяются; список выводится в консоль браузера (`Перекраски без материала…`). Имена мешей и материалов — ключи раскрасок, поэтому при экспорте из Blender их лучше не менять.

### Через сайт (редактор)
1. Откройте ссылку редактора (`?k=<EDIT_KEY>`, готовая — в `/srv/villa-walk/EDIT_LINK.txt`).
2. В верхней панели нажмите **«Обновить модель дома»**, выберите `.glb` (до 30 МБ), подтвердите. Полоса показывает загрузку; при ошибке появится понятное сообщение.
3. Сервер проверяет заголовок (`glTF`, версия 2), пишет файл во временный файл рядом и атомарно подменяет `villa.glb`. Прежняя версия уходит в историю.

### Через SSH
    scp villa.glb root@<сервер>:/srv/villa-walk/data/models/villa-new.glb
    ssh root@<сервер> 'cd /root/villa-walk && docker compose exec villa-walk node scripts/house-reload.js villa-new.glb'
Скрипт проверяет файл, переносит текущий `villa.glb` в историю, ставит новый, увеличивает версию и рассылает `house.updated`. Файл `villa-new.glb` после этого удаляется.

Если файл уже положили сразу поверх `villa.glb` (`scp … /srv/villa-walk/data/models/villa.glb`), запустите без аргумента: `docker compose exec villa-walk node scripts/house-reload.js` — он проверит файл, увеличит версию и разошлёт обновление (старая версия в этом случае в историю не попадёт, она уже перезаписана).

### Как откатить
- На сайте: **«История версий»** → у нужной даты **«Вернуть»**. Текущая версия при этом сама уходит в историю, версия увеличивается, всем уходит `house.updated`.
- Вручную: файлы лежат в `/srv/villa-walk/data/models/history/villa-<YYYYMMDD-HHMMSS>.glb` (время UTC). Скопируйте нужный в `models/villa-new.glb` и выполните команду из раздела «Через SSH».
- Хранятся последние 10 версий истории, более старые удаляются (только файлы истории).

### Технические детали
- Версия (число и дата) — в SQLite, `docs(coll='house', id='meta')`; отдаётся в `GET /api/state` и `GET /api/house` (список истории — только с ключом редактора). Клиент грузит `/models/villa.glb?v=<версия>`; файл отдаётся с `Cache-Control: no-cache` и `ETag`.
- Тест: `npm i && node tests/house.e2e.js` (Playwright, свой сервер во временной папке).

## Прокси и сертификат
`deploy/nginx-villa-walk.conf` (WebSocket, `client_max_body_size 32m`), сертификат Let's Encrypt (webroot), продление — системный certbot.timer.

## Резервные копии
`deploy/backup.sh` по cron (`/etc/cron.d/villa-walk-backup`, 03:17) → `/srv/villa-walk/backups/`, хранится 14 дней.

## Протокол
`GET /api/state`; `GET /api/house`; `POST /api/house`, `POST /api/house/restore {name}`, `POST /api/house/reload` (multipart / JSON, заголовок `x-edit-key`); `POST /api/models` (multipart, заголовок `x-edit-key`); `DELETE /api/models/:id`; WebSocket `/ws`:
`hello`, `presence`, `paint.set|reset`, `part.set|reset`, `item.set|delete`, `swatches.set` → сервер рассылает всем, включая отправителя; `model.added|deleted` и `house.updated {v, at}` рассылаются после загрузки/удаления/замены по HTTP.
