;
(function ($) {
  'use strict';

  /**
   * Комплексные объекты
   */
  var socket; // Сокет, с которым связывется клиент
  var UI; // Пользовательский интерфейс

  /**
   * Данные комнаты.
   *
   * Данная структура по умолчанию инициализируется нулевыми значениями.
   * Ее заполнение происходит по получении сообщения "roomData", при этом
   * заполняются те поля, которые имеют сходные наименования.
   */
  var roomData = {
    playerIndex: null, // Индекс игрока (начиная с 0!)
    playerList: [], // Список имен игроков в комнате
    role: null, // Роль игрока
    state: null, // Состояние игры
    exposedPlayers: {} // Список игроков, чья роль известна
  };

  /**
   * Настройка сокета.
   *
   * Клиент подключается к сокету, устанавливает ответы на события игры и
   * отправляет подтверждающее сообщение серверу.
   *
   * Стоит отметить, что изменение roomData происходит непосредственно
   * в обработчике событий, в то время как задача обновления UI возлагается
   * на функции соответствующего пространства имен.
   */
  function initSocket() {
    socket = io.connect();

    /**
     * События, касающиеся информации о комнате
     */

    // Получение информации о комнате
    socket.on('roomData', function onRoomData(data) {
      for (var field in roomData) {
        if (field in data) {
          roomData[field] = data[field];
        }
      }
    });

    // Сообщение о том, что комнаты не существует
    socket.on('roomDoesNotExist', function onRoomDoesNotExist() {});

    // Сообщение о том, что комната запечатана
    socket.on('roomIsSealed', function onRoomIsSealed() {});

    // Обновление состояния комнаты
    socket.on('update', function onUpdate(data) {
      roomData.state = data.state;
      if (data.outvotedPlayer) {
        roomData.exposedPlayers[data.outvotedPlayer.playerIndex] = {
          role: data.outvotedPlayer.role,
          eliminated: true
        };
      }
    });

    /**
     * События начала/конца игры
     */

    // Начало игры
    socket.on('gameStarted', function onGameStarted(data) {
      roomData.role = data.role;
      if ('mafiaMembers' in data) {
        for (var index in data.mafiaMembers) {
          roomData.exposedPlayers[index] = {
            role: 'mafia',
            eliminated: false
          };
        }
      }
    });

    // Конец игры
    socket.on('gameEnded', function onGameEnded(data) {});

    /**
     * События, связанные с игроками
     */

    // Присоединение игрока
    socket.on('playerJoined', function onPlayerJoined(data) {
      // Добавляем игрока в список лишь в том случае, если он не подключался
      // комнате ранее. В противном случае только оповещаем чат.
      if (!data.wasInRoomBefore) {
        roomData.playerList.push(data.playerName);
      }
    });

    // Уход игрока
    socket.on('playerLeft', function onPlayerLeft(data) {
      // Если игрок вышел до начала игры, его роль не вскрывается.
      if (data.role) {
        roomData.exposedPlayers[data.playerIndex] = {
          role: data.role,
          eliminated: true
        }
      }
    });

    /**
     * События игры
     */

    // Получение сообщения
    socket.on('chatMessage', function onChatMessage(data) {});

    // Оповещение о голосовании
    socket.on('playerVote', function onPlayerVote(data) {});

    /**
     * Отправка подтверждения на сервер
     */

    // Перед отправкой подтверждения в глобальной области видимости должна
    // находиться заполненная структура userData.
    //
    // После отправки подтверждения клиент может получить три возможных
    // сообщения: комната существует (roomData), комнаты не существует
    // (roomDoesNotExist) и комната запечатана (roomIsSealed).

    socket.emit('ackRoom', userData);
  }

  /**
   * Получение названия роли на русском языке
   */
  function getRoleName(role) {
    return ({
      'civilian': "мирный житель",
      'mafia': "мафиози",
      'detective': "комиссар"
    })[role];
  }

  /**
   * Пространство имен UI.
   *
   * Сюда относятся все функции и объекты, так или иначе манипулирующие
   * состоянием пользовательского интерфейса.
   */
  UI = {
    /**
     * Инициализация UI
     */
    init: function () {
      UI.setActions();

      // Прежде, чем инициализировать подключение, необходимо удостовериться
      // в том, что у игрока задано имя.
      UI.assertPlayerName(function () {
        initSocket();
      });
    },

    /**
     * Установка обработчиков событий
     */
    setActions: function () {
      // Действия панели навигации
      $('#nav-change-name').click(UI.changePlayerName);
      $('#nav-leave-game').click(UI.leaveGame);
    },

    /**
     * Установка имени пользователя
     */
    setPlayerName: function (callback) {
      bootbox.prompt({
        title: "Введите имя:",
        buttons: {
          cancel: {
            label: "Отмена",
            className: 'btn-default',
          },
          confirm: {
            label: "Задать",
            className: 'btn-primary',
          }
        },
        callback: function(result) {
          if (result) {
            userData.playerName = result;
            Cookies.set('playerName', result);
          }
          if (callback) {
            callback(result);
          }
        }
      });
    },

    /**
     * Проверка на установленное имя игрока
     */
    assertPlayerName: function (callback) {
      if (userData.playerName) {
        callback();
      } else {
        // Если имя игрока задано, то просим его установить его
        UI.setPlayerName(callback);
      }
    },

    /**
     * Изменение имени игрока
     */
    changePlayerName: function () {
      UI.setPlayerName(function (playerName) {
        if (playerName) {
          bootbox.alert({
            title: "Готово!",
            message: "Изменения вступят в силу при подключении к следующей игре."
          });
        }
      });
    },

    /**
     * Выход из игры
     */
    leaveGame: function () {
      bootbox.dialog({
        title: "Выйти из игры?",
        message: "Ваша текущая роль будет раскрыта другим игрокам. " +
          "Вы больше не сможете подключиться к данной комнате.",
        buttons: {
          cancel: {
            label: "Отмена",
            className: 'btn-default'
          },
          confirm: {
            label: "Выйти",
            className: 'btn-danger',
            callback: function () {
              socket.emit('leaveGame');
              window.location.replace('/'); // Перенаправление на главную
            }
          }
        },
      });
    }
  };

  // Инициализируем пользовательский интерфейс
  $(UI.init);
})(jQuery);