var meshchat_id;
var last_messages_update = epoch();
var call_sign = 'NOCALL';
var enable_video = 0;

var messages = new Messages();
var alert_sound = new Audio('alert.mp3');

var context = {
    config_loaded: false,
    debug: true,
};

$(function () {
    meshchat_init();
    init_dark_mode();
});

function init_dark_mode() {
    var saved = Cookies.get('meshchat_dark_mode');
    if (saved === '1') {
        $('body').addClass('dark-mode');
        $('#dark-mode-icon').attr('src', 'assets/moon.svg');
    } else {
        $('#dark-mode-icon').attr('src', 'assets/sun.svg');
    }

    $('#dark-mode-toggle').on('click', function () {
        var isDark = $('body').hasClass('dark-mode');
        if (isDark) {
            $('body').removeClass('dark-mode');
            $('#dark-mode-icon').attr('src', 'assets/sun.svg');
            Cookies.set('meshchat_dark_mode', '0', { expires: 365 });
        } else {
            $('body').addClass('dark-mode');
            $('#dark-mode-icon').attr('src', 'assets/moon.svg');
            Cookies.set('meshchat_dark_mode', '1', { expires: 365 });
        }
    });
}


function monitor_last_update() {
    var secs = epoch() - last_messages_update;
    var label;
    if (secs < 60) {
        label = secs + 's ago';
    } else if (secs < 3600) {
        label = Math.floor(secs / 60) + 'm ago';
    } else {
        label = Math.floor(secs / 3600) + 'h ago';
    }
    $('#last-update').html('(' + label + ')');
}

function scrollToBottom() {
    var scrollArea = $('#messages-scroll-area');
    if (scrollArea.length > 0) {
        scrollArea.scrollTop(scrollArea[0].scrollHeight);
    }
}

function update_messages(reason) {
    if (reason && reason != Messages.MSG_UPDATE) return;

    var html = messages.render($('#channels').val(), $('#search').val());
    if (html) {
        $('#message-table').html(html);
        scrollToBottom();
    }
    last_messages_update = epoch();
}

function new_messages(reason) {
    if (reason != Messages.NEW_MSG) return;
    alert_sound.play();
}

function update_channels(reason) {
    if (reason != Messages.CHAN_UPDATE) return;

    var msg_refresh = false;
    var channels = messages.channels().sort();
    var channel_filter = $('#channels').val();
    var cur_send_channel = $('#send-channel').val();

    if (cur_send_channel == null) {
        channel_filter = messages.current_channel();
        cur_send_channel = messages.current_channel();
        msg_refresh = true;
    }

    $('#send-channel').find('option').remove().end();
    $('#channels').find('option').remove().end();

    function add_option(select, title, value) {
        select.append("<option value='" + value + "'>" + title + "</option>");
    }

    add_option($('#send-channel'), "Everything", "");
    add_option($('#send-channel'), "Add New Channel", "Add New Channel");
    add_option($('#channels'), "Everything", "");

    for (var i = 0; i < channels.length; i++) {
        var chan = channels[i];
        if (chan != "") {
            add_option($('#send-channel'), chan, chan);
            add_option($('#channels'), chan, chan);
        }
    }

    $("#channels").val(channel_filter);
    $("#send-channel").val(cur_send_channel);
    if (msg_refresh) update_messages();
}

function start_chat() {
    $.getJSON('/cgi-bin/meshchat?action=config', function (data) {
        config = data;
        document.title = 'Mesh Chat v' + data.version;
        $('#node').html('<strong>Node:</strong> ' + data.node);
        $('#zone').html('<strong>Zone:</strong> ' + data.zone);
        document.title = 'Mesh Chat v' + data.version; // copyright HTML'de statik olarak korunur

        if ("default_channel" in data) {
            messages.set_channel(data.default_channel);
            update_messages();
        }
        context.config_loaded = true;
    });

    messages.subscribe(update_messages);
    messages.subscribe(new_messages);
    messages.subscribe(update_channels);
    messages.check();
    load_users();

    setInterval(function () { messages.check() }, 15000);
    setInterval(function () { load_users() }, 15000);
    setInterval(function () { monitor_last_update() }, 2500);
}

function meshchat_init() {
    $('#message').val('');
    meshchat_id = Cookies.get('meshchat_id');
    if (meshchat_id == undefined) {
        Cookies.set('meshchat_id', make_id());
        meshchat_id = Cookies.get('meshchat_id');
    }

    $('#submit-message').on('click', function (e) {
        e.preventDefault();
        var btn = $(this);
        var msgInput = $('#message');
        if (msgInput.val().length == 0) return;

        btn.prop("disabled", true);
        msgInput.prop("disabled", true);
        var originalHtml = btn.html();
        btn.html('...');

        var channel = $('#send-channel').val();
        if ($('#new-channel').val() != '') {
            channel = $('#new-channel').val();
        }

        messages.send(msgInput.val(), channel, call_sign).done(function () {
            msgInput.val('');
            Swal.fire({
                icon: 'success', title: 'Sent', text: 'Message sent',
                timer: 2000, showConfirmButton: false, toast: true, position: 'top-end'
            });
            update_messages(Messages.NEW_MSG);
            $('#new-channel').val('');
            $('#new-channel-pill').hide();
            $('#send-channel').show();
        }).fail(function (err) {
            Swal.fire({ icon: 'error', title: 'Error', text: err });
        }).always(function () {
            btn.prop("disabled", false);
            msgInput.prop("disabled", false);
            btn.html(originalHtml);
        });
    });

    $('#submit-call-sign').on('click', function (e) {
        e.preventDefault();
        var val = $('#call-sign').val();
        if (val.length == 0) return;
        call_sign = val.toUpperCase();
        Cookies.set('meshchat_call_sign', call_sign);
        $('#call-sign-container').addClass('hidden');
        $('#chat-container').removeClass('hidden');
        start_chat();
    });

    $('#channels').on('change', function () {
        messages.set_channel(this.value);
        update_messages();
    });

    $('#message').keydown(function (e) {
        if ((e.keyCode == 10 || e.keyCode == 13) && !e.shiftKey) {
            e.preventDefault();
            $("#submit-message").trigger("click");
        }
    });

    var cookie_call_sign = Cookies.get('meshchat_call_sign');
    if (cookie_call_sign == undefined) {
        $('#call-sign-container').removeClass('hidden');
    } else {
        $('#call-sign-container').addClass('hidden');
        $('#chat-container').removeClass('hidden');
        call_sign = cookie_call_sign;
        start_chat();
    }
}

var users_updating = false;
function load_users() {
    if (users_updating) return;
    users_updating = true;

    $.getJSON('/cgi-bin/meshchat?action=users&call_sign=' + call_sign + '&id=' + meshchat_id, function (data) {
        if (!data) return;
        var html = '';
        var count = 0;
        var now = epoch();

        for (var i = 0; i < data.length; i++) {
            var entry = data[i];
            if ((now - entry.epoch) > 240) continue;

            var date = new Date(0);
            date.setUTCSeconds(entry.epoch);
            var timeStr = date.getHours() + ':' + (date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes());
            var itemClass = (now - entry.epoch) > 120 ? 'user-item inactive' : 'user-item';

            html += '<div class="' + itemClass + '">';
            html += '  <div class="user-main">';
            html += '    <span class="user-callsign">' + entry.call_sign + '</span>';
            var nodeUrl = (entry.platform == 'node') ? 'http://' + aredn_domain(entry.node) + ':8080' : 'http://' + aredn_domain(entry.node);
            html += '    <span class="user-node">(<a href="' + nodeUrl + '" target="_blank" class="user-node-link">' + entry.node + '</a>)</span>';
            html += '  </div>';
            html += '  <div class="user-activity">Last seen: ' + timeStr + '</div>';
            html += '</div>';
            count++;
        }
        $('#users-table').html(html);
        $('#users-count').html(count);
    }).always(function () {
        users_updating = false;
    });
}