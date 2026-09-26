# Adventurer HUD

[English version](README.md)

[![Foundry VTT 14](https://img.shields.io/badge/Foundry_VTT-14-2f855a?style=flat-square)](https://foundryvtt.com/)
[![D&D 5e 5.3+](https://img.shields.io/badge/D%26D_5e-5.3%2B-2f855a?style=flat-square)](https://github.com/foundryvtt/dnd5e)

Adventurer HUD — компактная панель для [D&D 5e](https://github.com/foundryvtt/dnd5e). Игрокам доступны действия персонажа в исследовании и бою, мастеру — отдельная панель существ и управления боем.

- [Руководство игрока](docs/README.player.ru.md) — действия персонажа, заклинания, избранное и сочетания клавиш.
- [Руководство мастера](docs/README.gm.ru.md) — подготовка боя, действия существ и управление ходами.

![Демонстрация Adventurer HUD](docs/media/demo.gif)

## Как установить

В Foundry VTT откройте «Установить модуль», найдите **Adventurer HUD** в официальном каталоге и нажмите «Установить». Также можно открыть [страницу модуля в каталоге Foundry](https://foundryvtt.com/packages/adventurer-hud).

Другой способ — вставить в окно «Установить модуль» ссылку на манифест:

```text
https://github.com/wondersalmon/adventurer-hud/releases/latest/download/module.json
```

## Поддерживаемые системы

Для Foundry VTT версии 14:

- D&D 5e версии 5.3+

## Как пользоваться

Нажмите `Shift+R`, чтобы открыть или закрыть HUD. Игрок выбирает токен своего персонажа; у мастера по умолчанию открывается GM-панель. Сочетание можно изменить в настройках клавиш Foundry.

Включите **Открывать при входе** для открытия HUD при входе в мир. В настройках также можно включить кнопку на панели управления токенами: игрок получит кнопку своего HUD, мастер — отдельную кнопку GM-панели. Подробнее — в руководствах [игрока](docs/README.player.ru.md) и [мастера](docs/README.gm.ru.md).

## Использование ИИ

Инструменты ИИ использовались при разработке и проверке.
