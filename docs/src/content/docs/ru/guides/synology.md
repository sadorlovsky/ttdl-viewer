---
title: Запуск на Synology NAS
description: Container Manager на DSM 7, compose-файл, который тянет опубликованный образ, и права на монтирование, которые обычно и кусают.
---

DSM 7 с установленным **Container Manager**. Архивы уже лежат на NAS — обычно в общей папке вроде
`/volume1/media/tiktok`.

## Через опубликованный образ

Образ собирается под `linux/amd64` и `linux/arm64`, а это покрывает и модели x86-64, и ARM, так что
NAS его тянет, и ничего туда не клонируется и не собирается. Напишите один файл,
`/volume1/docker/ttdl-viewer/docker-compose.yml`:

```yaml
services:
  ttdl-viewer:
    image: ghcr.io/sadorlovsky/ttdl-viewer:0.1.0
    container_name: ttdl-viewer
    restart: unless-stopped
    volumes:
      # Слева ваша общая папка с архивами. Справа должно остаться /archives.
      - /volume1/media/tiktok:/archives:ro
    ports:
      # Доступен только самому NAS. Возьмите "4174:4174", чтобы выставить его
      # в локальную сеть, где его никто не аутентифицирует.
      - "127.0.0.1:4174:4174"
```

Дальше Container Manager → **Проект** → **Создать**, укажите путь к этой папке; он подхватит файл.
По SSH это:

```bash
cd /volume1/docker/ttdl-viewer
sudo docker compose up -d
```

Более свежая версия — это правка тега и `pull`:

```bash
sudo docker compose pull && sudo docker compose up -d
```

По SSH `sudo docker pull ghcr.io/sadorlovsky/ttdl-viewer:0.1.0` кладёт его в список **Образы** в
Container Manager, откуда интерфейс запускает его как любой другой.

:::note
Вкладка **Реестр** в Container Manager этот образ забрать не может и сообщает `Registry returned bad
result`. Она показывает реестр через поиск по нему, а GHCR отвечает на `/v2/` запросом
аутентификации и поиска не предлагает вовсе, так что перечислять DSM нечего. И проект, и `docker
pull` обращаются к образу по полному имени, и добавленный реестр им не нужен.
:::

Что значат `latest` и `edge`, говорит [таблица тегов](/ru/guides/docker/#опубликованный-образ). На
NAS, который не должен меняться сам по себе, закрепляйте точную версию.

## Или сборка на самом NAS

Сборка нужна, чтобы запустить изменённую версию. Скопируйте этот репозиторий в
`/volume1/docker/ttdl-viewer` (File Station или `git clone` по SSH), оставьте строку `build: .` в
`docker-compose.yml`, который идёт с ним, поправьте строки тома и порта как выше, и:

```bash
cd /volume1/docker/ttdl-viewer
sudo docker compose up -d --build
```

Модели с малой памятью могут не вытянуть шаг сборки Vite. Если его убивают, соберите на ноутбуке под
платформу NAS и загрузите результат:

```bash
docker buildx build --platform linux/arm64 -t ttdl-viewer . --load
docker save ttdl-viewer | ssh nas 'sudo docker load'
```

## Если запустился, но архивов ноль

Почти наверняка монтирование нечитаемо для непривилегированного пользователя `bun` внутри
контейнера. Общие папки Synology часто принадлежат конкретной учётной записи DSM, а не читаемы всем.
Посмотрите числового владельца и скажите compose совпасть с ним:

```bash
ls -ln /volume1/media/tiktok      # например  drwx------ 1026 100
```

```yaml
user: "1026:100"
```

## За обратным прокси DSM

Панель управления → Портал входа → Дополнительно → Обратный прокси работает и даёт HTTPS, но своей
аутентификации не добавляет. Сочетайте его с брандмауэром DSM, VPN или аутентифицирующим прокси,
если NAS достижим снаружи дома.

:::caution
Эти инструкции не запускались — они написаны по документированному поведению DSM. См.
[Известные ограничения](/ru/explanation/known-limits/).
:::
