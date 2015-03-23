;
(function ($) {
  var socket;

  /**
   * Центрирование модального окна
   */
  function centerModal() {
    var $modal = $(this);
    var $dialog = $modal.find('.modal-dialog');

    $modal.css('display', 'block');
    $dialog.css("margin-top", Math.max(0, ($(window).height() -
      $dialog.height()) / 2));
  }

  /**
   * Показ оверлея с сообщением о загрузке
   */
  function displayLoading(message) {
    $('#loading-window.message').text(message);
    $('#loading-window').modal('show'); 
  }

  /**
   * Подключение к сокету и отправка сообщения
   */
  function emit(eventName) {
    socket = io.connect();
    socket.once('roomIDReturned', function onRoomFound(roomID) {
      window.location.replace('/id/' + roomID);
    });
    socket.emit(eventName);
  }

  /**
   * Инициализация
   */
  function init() {
    // Инициализация модального окна загрузки
    $('#loading-window').on('show.bs.modal', centerModal);
    $(window).on('resize', function() {
      $('#loading-window:visible').each(centerModal);
    });

    // Запрет на закрытие модального окна
    $('#loading-window').modal({
      backdrop: 'static',
      keyboard: false,
      show: false
    });

    // Установка обработчиков событий кнопок
    $('#find-game').click(function () {
      displayLoading("Идет поиск игры.");
      emit('findRoom');
    });
    $('#new-game').click(function () {
      displayLoading("Идет создание комнаты.");
      emit('newRoom');
    });
  }

  $(init);
})(jQuery);