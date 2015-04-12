/**
 * Прототип класса игры
 */
function Game(room, callback) {
  // Комната, которой принадлежит игра
  this.room = room;

  // Коллбэк игры
  this.callback = callback;

  // Таймаут и следующая смена фазы
  this.timeout = null;
  this.nextPhaseChange = null;

  /**
   * Внутриигровая информация
   */

  // Состояние игры
  this.state = {
    isDay: false, // Является ли текущая фаза днем
    isVoting: false, // Идет ли голосование
    turn: 0 // Текущий ход
  };

  // Роли игроков
  this.roles = {};
  // Выбывшие игроки
  this.elimPlayers = [];
  // Раскрытые детективом игроки
  this.detExpPlayers = [];

  // Результаты голосования
  this.votes = {};

  /**
   * Назначение ролей.
   *
   * Роли назначаются по следующему принципу:
   * - сначала всем игрокам присваивается роль мирного жителя;
   * - затем каждый N-ный игрок становится мафиози;
   * - остальные роли распределяются случайно среди оставшихся мирных жителей.
   *
   * Роли не раздаются вышедшим из игры игрокам. Последние автоматически
   * становятся убитыми игроками.
   */
  this.assignRoles = function () {
    var civilians = [];

    // Изначально все — честные граждане
    for (var i = 0; i < this.room.IDs.length; i++) {
      if (this.room.getPlayerByIndex(i).disconnected) {
        // Добавляем вышедших игроков к списку выбывших
        this.roles[i] = null;
        this.elimPlayers.push(i);
      } else {
        this.roles[i] = 'civilian';
        civilians.push(i);
      }
    }

    // Назначаем членов мафии согласно mafiaCoeff (каждый N-ный — мафиози)
    var maxMafia = Math.floor(this.room.getPlayerCount() /
      this.room.options.mafiaCoeff);

    for (var i = 0; i < maxMafia; i++) {
      // Выбираем случайного игрока и делаем его мафиози
      var playerIndex = civilians[Math.floor(civilians.length * Math.random())];
      this.roles[playerIndex] = 'mafia';

      // Добавляем игрока к особой подкомнате Socket.IO
      this.room.getPlayerByIndex(playerIndex).socket.join(this.room.id + '_m');

      // Удаляем игрока из списка мирных жителей
      civilians.splice(civilians.indexOf(playerIndex), 1);
    }

    // Назначение комиссара
    if (this.room.options.optionalRoles.detective && civilians.length) {
      var playerIndex = civilians[Math.floor(civilians.length * Math.random())];
      this.roles[playerIndex] = 'detective';
    }
  };

  /**
   * Получение списка игроков, чья роль известна (в формате индекс-роль)
   */
  this.getExposedPlayers = function (player) {
    var exposedList = {};

    // Добавляем членов мафии
    if (this.roles[this.room.getPlayerIndex(player)] == 'mafia') {
      var mafiaMembers = this.getMafia();

      for (var i = 0; i < mafiaMembers.length; i++) {
        exposedList[mafiaMembers[i]] = {
          role: 'mafia',
          eliminated: false
        };
      }
    }

    // Добавляем игроков, известных комиссару
    if (this.roles[this.room.getPlayerIndex(player)] == 'detective') {
      for (var i = 0; i < this.detExpPlayers.length; i++) {
        exposedList[this.detExpPlayers[i]] = {
          role: this.roles[this.detExpPlayers[i]],
          eliminated: false
        }
      }
    }

    // Добавляем выбывших игроков. Выбывшие игроки добавляются в последнюю
    // очередь, так как они являются подмножеством известных игроков.
    for (var i = 0; i < this.elimPlayers.length; i++) {
      exposedList[this.elimPlayers[i]] = {
        role: this.roles[this.elimPlayers[i]],
        eliminated: true
      };
    }

    return exposedList;
  };

  /**
   * Получение индексов игроков-мафиози
   */
  this.getMafia = function () {
    var mafiaList = [];
    for (var playerIndex in this.roles) {
      if (this.roles[playerIndex] == 'mafia') {
        mafiaList.push(parseInt(playerIndex));
      }
    }
    return mafiaList;
  };

  /**
   * Получение количества секунд до следующего таймаута
   */
  this.getSecondsTillTimeout = function () {
    return undefined;
  };

  /**
   * Получение победителя
   */
  this.getWinner = function () {
    // Подсчет числа активных игроков по ролям
    var civilian_count = 0, mafia_count = 0;

    for (var playerIndex in this.roles) {
      if (!(this.elimPlayers.indexOf(playerIndex) != -1)) {
        if (this.roles[playerIndex] == 'mafia') {
          mafia_count++;
        } else {
          civilian_count++;
        }
      }
    }

    if (mafia_count == 0) {
      // Мирные горожане побеждают, если пойманы все мафиози.
      return 'civilian';
    } else if (civilian_count <= mafia_count) {
      // Мафия побеждает, если число ее членов сравнялось с числом живых
      // мирных горожан.
      return 'mafia';
    } else {
      // В противном случае, очевидно, не побеждает никто.
      return null;
    }
  };

  /**
   * Выбыл ли игрок
   */
  this.isEliminated = function (playerIndex) {
    return this.elimPlayers.indexOf(playerIndex) != -1;
  };

  /**
   * Смена фазы
   */
  this.nextPhase = function () {
    if (this.state.isVoting) {
      // Отключаем голосование
      this.state.isVoting = false;
      // Меняем день на ночь и наоборот
      this.state.isDay = !this.state.isDay;

      // Если фаза голосования прошла, то вычисляем результат голосования
      var outvotedPlayer = this.processVoteResult();
      if (outvotedPlayer) {
        this.elimPlayers.push(outvotedPlayer.playerIndex);
      }
    } else {
      // Голосование не проводится в двух случаях:
      // - если текущая фаза — ночь знакомства мафии;
      // - если текущая фаза — первый день.

      var isMafiaMeeting = (this.state.turn === 0);
      var isFirstDay = (this.state.turn == 1 && this.state.isDay);

      if (isMafiaMeeting || isFirstDay) {
        // Не включаем голосование в вышеприведенных случаях
        this.state.isDay = !this.state.isDay;
      } else {
        // В любом другом случае включаем голосование
        this.state.isVoting = true;
      }
    }

    // В случае, если начался новый день, увеличиваем счетчик ходов
    if (this.state.isDay && !this.state.isVoting) {
      this.state.turn++;
    }

    // Выбираем подходящий таймаут (и строку в лог)
    var timeout, phaseName;

    if (this.state.isVoting) {
      timeout = this.room.options.voteTimeout;
      phaseName = (this.state.isDay ? "дневное" : "ночное") + " голосование";
    } else {
      timeout = this.room.options[
        this.state.isDay ? 'dayTimeout' : 'nightTimeout'];
      phaseName = this.state.isDay ? "день" : "ночь";
    }

    // Проверяем, закончилась ли игра, и если да, то узнаем сторону-победителя
    var winner = this.getWinner();

    // Составляем объект с информацией, отправляемой пользователю
    var info = {
      state: this.state,
      outvotedPlayer: outvotedPlayer
    };

    if (winner === null) {
      // Переход к следующему ходу
      this.nextPhaseTimeout(timeout);

      console.log("[GAME] [%s] Ход #%d, наступает %s.",
        this.room.id, this.state.turn, phaseName);
    } else {
      info.winner = winner;
      this.room.game = null; // Удаление игры

      // Отсоединяем мафиози от соответствующей комнаты
      for (var player in this.room.clients) {
        if (this.roles[this.room.getPlayerIndex(player)] == 'mafia') {
          player.socket.leave(this.room.id + '_m');
        }
        if (this.isEliminated(this.room.getPlayerIndex(player))) {
          player.socket.leave(this.room.id + '_e');
        }
      }

      console.log("[GAME] [%s] Победа %s.",
        this.room.id, (winner == 'mafia' ? "мафии" : "мирных жителей"));
    }

    // Оповещаем игроков об обновлении состояния игры
    this.callback('update', info);
  };

  /**
   * Установка таймаута следующей фазы
   */
  this.nextPhaseTimeout = function (timeout) {
    this.timeout = setTimeout(this.nextPhase.bind(this), timeout * 1000);

    this.nextPhaseChange = new Date();
    this.nextPhaseChange.setSeconds(this.nextPhaseChange.getSeconds() +
      timeout);
  };

  /**
   * Обработка голосования
   */
  this.handleVote = function (player, data, callbacks) {
    var playerIndex = this.room.getPlayerIndex(player);

    if (this.elimPlayers.indexOf(playerIndex) != -1 || !(this.state.isVoting &&
      (this.state.isDay || this.roles[playerIndex] == 'mafia'))) {
      callbacks.rejected({
        // choiceID: data.choiceID
      });
      return;
    }

    // Если игрок еще не голосовал
    if (!(playerIndex in this.votes)) {
      // Если игрок, за которого проголосовали, существует
      if (typeof this.room.getPlayerByIndex(data.vote) != 'undefined') {
        this.votes[playerIndex] = data.vote;

        callbacks.confirmed({
          roomID: this.getChatRoomID(player),
          voteData: {
            playerIndex: playerIndex,
            vote: data.vote
          }
        });

        console.log("[GAME] [%s] Игрок %s голосует против игрока %s.",
          this.room.id, player.playerName, this.room.getPlayerByIndex(
            data.vote).playerName);

        return;
      }
    }

    callbacks.rejected({
      // choiceID: data.choiceID
    });
  };

  /**
   * Обработка результата голосования
   */
  this.processVoteResult = function () {
    // Голосование не учитывается, если не было проголосовавших
    if (Object.keys(this.votes).length == 0) {
      return null;
    }

    // Подсчет числа голосов против каждого из игроков
    var voteCount = {};
    for (var playerIndex in this.votes) {
      if (this.votes[playerIndex] in voteCount) {
        voteCount[this.votes[playerIndex]]++;
      } else {
        voteCount[this.votes[playerIndex]] = 1;
      }
    }

    // Поиск максимального числа голосов
    var maxVotes = Math.max.apply(null, Object.keys(voteCount).map(
      function (x) {
        return voteCount[x];
      }
    ));

    // Составление списка кандидатов. В простейшем случае здесь будет один
    // игрок, получивший наибольшее число голосов против. В противном —
    // несколько игроков, из которых выбывший будет выбран случайно.
    var candidates = [];
    for (var playerIndex in voteCount) {
      if (voteCount[playerIndex] == maxVotes) {
        candidates.push(parseInt(playerIndex));
      }
    }

    // Обнуление результатов голосования
    this.votes = {};

    // Выбор случайного кандидата на вылет
    var candidate = candidates[Math.floor(Math.random() * candidates.length)];
    this.room.getPlayerByIndex(candidate).socket.join(this.room.id + '_e');

    console.log("[GAME] [%s] Игрок %s (%s) выбывает из игры.", this.room.id,
      this.room.getPlayerByIndex(candidate).playerName, this.roles[candidate]);

    // Объявление кандидата на вылет
    return {
      playerIndex: candidate,
      role: this.roles[candidate]
    };
  };

  /**
   * Обработка пользовательского выбора
   */
  this.handleChoice = function (player, data, callbacks) {
    var playerIndex = this.room.getPlayerIndex(player);

    // Нельзя выбирать игроков, если игрок выбыл из игры.
    // Выбирать игроков можно только ночью в фазу голосования.
    if (this.elimPlayers.indexOf(playerIndex) != -1 ||
      (this.state.isDay || !this.state.isVoting)) {
      callbacks.rejected({
        // choiceID: data.choiceID
      });
      return;
    }

    // Обработка роли комиссара
    if (this.roles[playerIndex] == 'detective') {

      // Может ли игрок быть выбран
      var canBeChosen =
        (data.choice != playerIndex) && // Нельзя за себя
        (this.elimPlayers.indexOf(data.choice) == -1) && // Нельзя за убитого
        (this.detExpPlayers.indexOf(data.choice) == -1); // Нельзя за вскрытого

      // Если да, то отправляем комиссару его роль
      if (canBeChosen) {
        this.detExpPlayers.push(data.choice);
        player.socket.emit('detectiveResponse', {
          playerIndex: data.choice,
          role: this.roles[data.choice]
        });
        callbacks.confirmed({
          // choiceID: data.choiceID
        });

        console.log("[GAME] [%s] Игрок %s выбирает игрока %s.",
          this.room.id, player.playerName, this.room.getPlayerByIndex(
            data.choice).playerName);

        return;
      }
    }

    // Если ни одно из условий не подошло, сообщаем о неудачном выборе
    callbacks.rejected({
      // choiceID: data.choiceID
    });
  };

  /**
   * Получение ID комнаты, в которую может отправлять сообщения игрок
   */
  this.getChatRoomID = function (player) {
    if (this.isEliminated(this.room.getPlayerIndex(player))) {
      return (this.room.id + '_e');
    } else if (!this.state.isDay &&
      (this.roles[this.room.getPlayerIndex(player)] =='mafia')) {
      return (this.room.id + '_m'); // Чат мафии
    } else if (this.state.isDay) {
      return this.room.id; // Общий чат
    }
  };

  /**
   * Обработка вышедшего игрока
   */
  this.playerLeft = function (player) {
    this.elimPlayers.push(this.room.getPlayerIndex(player));
  };

  /**
   * Начало игры
   */
  this.start = function () {
    // Назначаем роли
    this.assignRoles();

    // Сообщаем роли игрокам
    for (var playerIndex in this.roles) {
      // Инициализируем объект с информацией об игре. Если игрок — мирный
      // житель, то единственное, что ему будет известно — его роль.
      var info = {
        role: this.roles[playerIndex]
      };

      // Если игрок — мафиози, сообщаем ему о его сотоварищах
      if (this.roles[playerIndex] == 'mafia') {
        info.mafiaMembers = this.getMafia();
      }

      // Отправляем информацию каждому из игроков по отдельности
      this.room.getPlayerByIndex(playerIndex).socket.emit('gameStarted', info);
    }

    // Запускаем цепную реакцию!
    this.nextPhaseTimeout(this.room.options.nightTimeout);

    console.log("[GAME] [%s] Игра началась.", this.room.id);
  };
}

/**
 * Создание игры
 */
exports.newGame = function (room, callback) {
  if (!room.game) {
    room.game = new Game(room, callback);
    room.game.start();
  }
};