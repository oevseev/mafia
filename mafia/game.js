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
    move: 0 // Текущий ход
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
    for (var id in this.room.clients) {
      var player = this.room.clients[id];

      if (player.disconnected) {
        // Добавляем вышедших игроков к списку выбывших
        this.roles[player] = null;
        this.elimPlayers.push(player);
      } else {
        this.roles[player] = 'civilian';
        civilians.push(player);
      }
    }

    // Назначаем членов мафии согласно mafiaCoeff (каждый N-ный — мафиози)
    var maxMafia = Math.floor(this.room.getPlayerCount() /
      this.room.options.mafiaCoeff);

    for (var i = 0; i < maxMafia; i++) {
      // Выбираем случайного игрока и делаем его мафиози
      var player = civilians[Math.floor(civilians.length * Math.random())];
      this.roles[player] = 'mafia';

      // Добавляем игрока к особой подкомнате Socket.IO
      player.socket.join(this.room.id + '_m');

      // Удаляем игрока из списка мирных жителей
      civilians.splice(civilians.indexOf(player), 1);
    }

    // Назначение комиссара
    if (this.room.options.optionalRoles.detective && civilians) {
      var player = civilians[Math.floor(civilians.length * Math.random())];
      this.roles[player] = 'detective';
    }
  };

  // Получение списка игроков, чья роль известна (в формате индекс-роль)
  this.getExposedPlayers = function (player) {
    var exposedList = {};

    // Добавляем членов мафии
    if (this.roles[player] == 'mafia') {
      var mafiaMembers = this.getMafia();

      for (var i = 0; i < mafiaMembers.length; i++) {
        exposedList[mafiaMembers[i]] = {
          role: 'mafia',
          eliminated: false
        };
      }
    }

    // Добавляем игроков, известных детективу
    if (this.roles[player] == 'detective') {
      for (var i = 0; i < this.detExpPlayers.length; i++) {
        exposedList[this.room.getPlayerIndex(this.detExpPlayers[i])] = {
          role: this.roles[this.detExpPlayers[i]],
          eliminated: false
        }
      }
    }

    // Добавляем выбывших игроков. Выбывшие игроки добавляются в последнюю
    // очередь, так как они являются подмножеством известных игроков.
    for (var i = 0; i < this.elimPlayers.length; i++) {
      exposedList[this.room.getPlayerIndex(this.elimPlayers[i])] = {
        role: this.roles[this.elimPlayers[i]],
        eliminated: true
      };
    }

    return exposedList;
  };

  // Получение индексов игроков-мафиози
  this.getMafia = function () {
    var mafiaList = [];
    for (var player in this.roles) {
      if (this.roles[player] == 'mafia') {
        mafiaList.push(this.room.getPlayerIndex(player));
      }
    }
    return mafiaList;
  };

  // Получение количества секунд до следующего таймаута
  this.getSecondsTillTimeout = function () {
    return undefined;
  };

  // Получение победителя
  this.getWinner = function () {
    // Подсчет числа активных игроков по ролям
    var civilian_count = 0, mafia_count = 0;

    for (var player in this.roles) {
      if (!(this.elimPlayers.indexOf(player) > -1)) {
        if (this.roles[player] == 'mafia') {
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
        this.elimPlayers.push(this.room.getPlayerByIndex(
          outvotedPlayer.playerIndex));
      }
    } else {
      // Голосование не проводится в двух случаях:
      // - если текущая фаза — ночь знакомства мафии;
      // - если текущая фаза — первый день.

      var isMafiaMeeting = (this.state.move === 0);
      var isFirstDay = (this.state.move == 1 && this.state.isDay);

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
      this.state.move++;
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
        this.room.id, this.state.move, phaseName);
    } else {
      info.winner = winner;
      this.room.game = null; // Удаление игры

      // Отсоединяем мафиози от соответствующей комнаты
      for (var player in this.room.clients) {
        if (this.roles[player] == 'mafia') {
          player.socket.leave(this.room.id + '_m');
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
  this.processVote = function (player, vote) {
    // Голосовали ли за игрока
    var wasVoted = (player in this.votes);
    // Выбыл ли игрок
    var isEliminated = (this.elimPlayers.indexOf(player) != -1);

    if (!wasVoted && !isEliminated) {
      var votedPlayer = this.room.getPlayerByIndex(vote);

      // Если игрок, за которого проголосовали, существует
      if (typeof votedPlayer != 'undefined') {
        this.votes[player] = votedPlayer;

        console.log("[GAME] [%s] Игрок %s голосует против игрока %s.",
          this.room.id, player.playerName, votedPlayer.playerName);
      }
    }
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
    for (var player in this.votes) {
      if (this.votes[player] in voteCount) {
        voteCount[this.votes[player]]++;
      } else {
        voteCount[this.votes[player]] = 1;
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
    for (var player in voteCount) {
      if (voteCount[player] == maxVotes) {
        candidates.push(player);
      }
    }

    // Обнуление результатов голосования
    this.votes = {};

    // Выбор случайного кандидата на вылет
    var candidate = candidates[Math.floor(Math.random() * candidates.length)];

    console.log("[GAME] [%s] Игрок %s (%s) выбывает из игры.",
      this.room.id, candidate.playerName, this.roles[candidate]);

    // Объявление кандидата на вылет
    return {
      playerIndex: this.room.getPlayerIndex(candidate),
      role: this.roles[candidate]
    };
  };

  /**
   * Начало игры
   */
  this.start = function () {
    // Назначаем роли
    this.assignRoles();

    // Сообщаем роли игрокам
    for (var id in this.room.clients) {
      var player = this.room.clients[id];

      // Инициализируем объект с информацией об игре. Если игрок — мирный
      // житель, то единственное, что ему будет известно — его роль.
      var info = {
        role: this.roles[player]
      };

      // Если игрок — мафиози, сообщаем ему о его сотоварищах
      if (this.roles[player] == 'mafia') {
        info.mafiaMembers = this.getMafia();
      }

      // Отправляем информацию каждому из игроков по отдельности
      player.socket.emit('gameStarted', info);
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