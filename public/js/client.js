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
    disconnectedPlayers: [], // Вышедшие из комнаты игроки
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
      UI.initRoomData(data);

      if (data.isFirstConnection) {
        UI.logMessage("Добро пожаловать в игру!");
        if (data.canStartGame) {
          UI.shareLink();
        }
      } else {
        console.log(roomData);
        if (roomData.role) {
          UI.logMessage("Вы — %s.", getRoleName(roomData.role));
        } else {
          UI.logMessage("Игра еще не началась.");
        }
      }
    });

    // Сообщение о том, что комнаты не существует
    socket.on('roomDoesNotExist', function onRoomDoesNotExist() {
      // Так как шаблонизатор при подключении к несуществующей комнате выдает
      // ошибку 404, то это — исключительный случай и мы просто перенаправляем
      // игрока на главную.
      window.location.replace('/');
    });

    // Сообщение о том, что комната запечатана
    socket.on('roomIsSealed', function onRoomIsSealed() {
      UI.roomIsSealed();
    });

    // Начало игры
    socket.on('gameStarted', function onGameStarted(data) {
      roomData.role = data.role;
      UI.setPlayerInfo(roomData.playerIndex, {
        role: data.role
      });

      if (data.mafiaMembers) {
        for (var playerIndex in data.mafiaMembers) {
          roomData.exposedPlayers[playerIndex] = {
            role: 'mafia',
            eliminated: false
          };
          UI.setPlayerInfo(playerIndex, {
            role: 'mafia'
          });
        }
      }

      UI.logMessage("Игра началась. Вы — %s.", getRoleName(data.role));
    });

    // Обновление состояния комнаты
    socket.on('update', function onUpdate(data) {
      roomData.state = data.state;

      if (data.outvotedPlayer) {
        var status = {
          role: data.outvotedPlayer.role,
          eliminated: true
        };

        roomData.exposedPlayers[data.outvotedPlayer.playerIndex] = status;
        UI.setPlayerInfo(data.outvotedPlayer.playerIndex, status)
      }

      if (data.winner) {
        roomData.role = null;
        roomData.state = null;
        roomData.exposedPlayers = {};

        // Очищаем роли игроков
        for (var i = 0; i < roomData.playerList.length; i++) {
          UI.setPlayerInfo(i, {
            role: null,
            eliminated: false
          });
        }

        if (data.winner == 'mafia') {
          UI.logMessage("Победила мафия!");
        } else {
          UI.logMessage("Победили мирные жители!");
        }
      }
    });

    /**
     * События, связанные с игроками
     */

    // Присоединение игрока
    socket.on('playerJoined', function onPlayerJoined(data) {
      if (data.playerIndex >= roomData.playerList.length) {
        roomData.playerList.push(data.playerName);
      }

      UI.appendPlayer(data.playerIndex, data.playerName, true);
      UI.setPlayerInfo(data.playerIndex, {
        disconnected: false
      });

      UI.logMessage("Игрок #%d# *%s* присоединяется к игре.",
        data.playerIndex, data.playerName);
    });

    // Уход игрока
    socket.on('playerLeft', function onPlayerLeft(data) {
      var status = {};

      if (data.role) {
        // Раскрываем роль игрока и делаем его убитым
        status = {
          role: data.role,
          eliminated: true
        };
        roomData.exposedPlayers[data.playerIndex] = status;
      }

      // Вдобавок к информации, записываемой в exposedPlayers, мы сообщаем
      // о том, что игрок покинул комнату.
      status.disconnected = true;
      UI.setPlayerInfo(data.playerIndex, status);

      UI.logMessage("Игрок #%d# *%s* выходит из игры.",
        data.playerIndex, roomData.playerList[data.playerIndex]);
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
    },

    /**
     * Сообщение о запечатанной комнате
     */
    roomIsSealed: function () {
      bootbox.alert({
        title: "Упс!",
        message: "К сожалению, данная комната запечатана, и к ней больше " +
          "нельзя присоединиться. Попробуйте найти другую комнату.",
        callback: function () {
          window.location.replace('/');
        }
      });
    },

    /**
     * Окно со ссылкой
     */
    shareLink: function () {
      var $textField = $('<input class="form-control" id="share-link">')
        .attr('type', 'text')
        .attr('value', window.location.href)
        .attr('readonly', true);

      var content = "Отправьте эту ссылку тем друзьям, которых вы хотите " +
        "пригласить в игру.\n" + $textField.prop('outerHTML');

      bootbox.dialog({
        title: "Пригласить друзей",
        message: content,
        buttons: {
          confirm: {
            label: "ОК",
            className: 'btn-primary'
          }
        }
      });

      $('#share-link').click(function () {
        $(this).select();
      });
    },

    /**
     * Добавление игрока к списку игроков.
     *
     * Игрок добавляется в список в соответствии с индексом. Если игрок уже
     * присутствует в комнате, он не добавляется в список.
     */
    appendPlayer: function (playerIndex, playerName, animate) {
      // Так как внутреннее представление индексов игроков отсчитывается
      // от нуля, добавляем корректирующую единицу.
      var index = playerIndex + 1;

      // Не добавляем игрока, если он уже присутствует в комнате.
      if ($('#player-' + index).length) {
        return;
      }

      // Конструируем элемент списка
      var $playerEntry = $('<li class="player">')
        .attr('id', 'player-' + index)
        .append($('<div class="player-index">')
          .addClass('p' + index) // Данный класс задает цвет фона
          .text(index))
        .append($('<span class="player-name">')
          .text(playerName))
        .append($('<span class="player-aux">'))
        .append($('<div class="player-role-icon">'));

      if (animate) {
        $('#player-list').append($playerEntry.hide().fadeIn());
      } else {
        $('#player-list').append($playerEntry);
      }
    },

    /**
     * Установка информации об игроке.
     *
     * Индекс задается от нуля. Вторым аргументом передается объект, поля
     * которого задают информацию, которую необходимо отобразить.
     */
    setPlayerInfo: function (playerIndex, data) {
      var $playerEntry = $('#player-' + (playerIndex + 1));

      // Флаги состояний
      var $playerName = $playerEntry.find('.player-name');
      if ('me' in data) {
        $playerName.toggleClass('me', data.me);
      }
      if ('disconnected' in data) {
        $playerName.toggleClass('disconnected', data.disconnected);
      }
      if ('eliminated' in data) {
        $playerName.toggleClass('eliminated', data.eliminated);
      }

      // Вспомогательный текст
      if ('disconnected' in data) {
        var isOwner = (playerIndex === 0);
        $playerEntry.find('.player-aux')
          .text(data.disconnected ? "вышел" : (isOwner ? "владелец" : ""));
      }

      // Иконка роли
      if ('role' in data) {
        var $roleIcon = $playerEntry.find('.player-role-icon');

        $roleIcon.removeClass().addClass('player-role-icon');
        if (data.role !== null) {
          $roleIcon.addClass(data.role);
        }
      }
    },

    /**
     * Инициализация UI информацией о комнате
     */
    initRoomData: function (data) {
      for (var i = 0; i < data.playerList.length; i++) {
        UI.appendPlayer(i, data.playerList[i]);

        // Иницализируем структуру, которую будем заполнять для каждого игрока
        // той информацией, которая о нем известна.
        var playerInfo = {
          // Игрок — текущий игрок
          me: (i == roomData.playerIndex),
          // Игрок вышел из комнаты
          disconnected: (roomData.disconnectedPlayers.indexOf(i) != -1),
        };

        if (playerInfo.me && roomData.role) {
          playerInfo.role = roomData.role;
        }

        // Если известен статус игрока, указываем его
        if (i in roomData.exposedPlayers) {
          playerInfo.role = roomData.exposedPlayers[i].role;
          playerInfo.eliminated = roomData.exposedPlayers[i].eliminated;
        }

        UI.setPlayerInfo(i, playerInfo);
      }
    },

    /**
     * Добавление сообщения в чат
     */
    addMessage: function (playerIndex, playerName, message) {
      // Конструируем DOM-объект сообщения
      var $message = $('<li class="chat-message">')
        .append($('<div class="player-index">')
          .addClass('p' + (playerIndex + 1))
          .text(playerIndex + 1))
        .append($('<span class="player-name">')
          .text(playerName + ':'))
        .append($('<span class="message">')
          .text(message));

      // Добавляем его в чат
      $('#chat-list').append($message);
    },

    /**
     * Добавление информационного сообщения в чат
     */
    logMessage: function(message) {
      // Заполнение массива аргументов аргументами из объекта arguments
      var args = [];
      for (var i = 1; i < arguments.length; i++) {
        args.push(arguments[i]);
      }

      // Форматирование
      var msgText = message
        .replace(/#(\d+?)#/g, '<span class="player-index">$1</span>')
        .replace(/\*(.*)\*/, '<strong>$1</strong>');
      msgText = vsprintf(msgText, args);

      var $message = $('<li class="log-message">').html(msgText);

      // Окрашивание индексов игроков в соответствующие цвета
      $message.find('.player-index').each(function () {
        $(this).addClass('p' + $(this).text());
      });

      // Добавление информационного сообщения в чат
      $('#chat-list').append($message);
    }
  };

  // Инициализируем пользовательский интерфейс
  $(UI.init);
})(jQuery);