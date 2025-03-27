var meshchat_id;
var last_messages_update = epoch();
var call_sign            = 'NOCALL';
var enable_video         = 0;

var messages         = new Messages();
let alert            = new Audio('alert.mp3');

let context = {
    config_loaded: false,
    debug: true,            // let startup funcs show debug
}

$(function() {
    meshchat_init();
});

function monitor_last_update() {
    var secs = epoch() - last_messages_update;
    $('#last-update').html('<strong>Updated:</strong> ' + secs + ' seconds ago');
}

function update_messages(reason=Messages.MSG_UPDATE) {
    if (reason != Messages.MSG_UPDATE) return;
    try {
        var caller = (new Error()).stack.split("\n")[3].split("/")[0];
    }
    catch (TypeError) {
        var caller = "unknown_caller";
    }
    console.debug(caller + "->update_messages(reason=MSG_UPDATE)");

    // update the message table
    let html = messages.render($('#channels').val(), $('#search').val());
    if (html) $('#message-table').html(html);
    last_messages_update = epoch();
}

function new_messages(reason) {
    if (reason != Messages.NEW_MSG) return;
    try {
        var caller = (new Error()).stack.split("\n")[3].split("/")[0];
    }
    catch (TypeError) {
        var caller = "unknown_caller";
    }
    console.debug(caller + "->new_messages(reason=NEW_MSG)");
    alert.play();
}

function update_channels(reason) {
    if (reason != Messages.CHAN_UPDATE) return;
    try {
        var caller = (new Error()).stack.split("\n")[3].split("/")[0];
    }
    catch (TypeError) {
        var caller = "unknown_caller";
    }
    console.debug(caller + "->update_channels(reason=CHAN_UPDATE)");

    let msg_refresh      = false;
    let channels         = messages.channels().sort();
    let channel_filter   = $('#channels').val();
    let cur_send_channel = $('#send-channel').val();
    // null signals a new channel was just created
    if (cur_send_channel == null) {
        channel_filter = messages.current_channel();
        cur_send_channel = messages.current_channel();
        msg_refresh = true;
    }

    // clear channel selection boxes
    $('#send-channel').find('option').remove().end();
    $('#channels').find('option').remove().end();

    function add_option(select, title, value) {
        select.append("<option value='"+value+"'>"+title+"</option>");
    }

    // Add static channels to channel selection boxes
    add_option($('#send-channel'), "Everything", "");
    add_option($('#send-channel'), "Add New Channel", "Add New Channel");
    add_option($('#channels'), "Everything", "");

    for (var chan of channels) {
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
    debug("start_chat()");

    // wait until the configuration is fully loaded
    $.getJSON('/cgi-bin/meshchat?action=config',
        (data) => {
            config = data;
            document.title = 'Mesh Chat v' + data.version;
            $('#version').html('<strong>Mesh Chat v' + data.version + '</strong>');
            $('#node').html('<strong>Node:</strong> ' + data.node);
            $('#zone').html('<strong>Zone:</strong> ' + data.zone);
            $('#callsign').html('<strong>Call Sign:</strong> ' + Cookies.get('meshchat_call_sign'));
            $('#copyright').html('Mesh Chat v' + data.version + ' Copyright &copy; ' + new Date().getFullYear() + ' <a href="http://www.trevorsbench.com">Trevor Paskett - K7FPV</a> <small>(Lua by KN6PLV)</small>');

            if ("default_channel" in data) {
                default_channel = data.default_channel;
                $('#send-channel').val(data.default_channel);
                $('#channels').val(data.default_channel);
                messages.set_channel(data.default_channel);
                update_messages();
            }

            if ("debug" in data) {
                context.debug = data.debug == 1 ? true : false;
            }

            // signal that the config has finished loading
            context.config_loaded = true;
        }
    ).fail(
        (error) => {
            // TODO error message on UI describing failure
            error("Failed to load configuration from config API: " + error);
        }
    );

    //$('#logout').html('Logout ' + call_sign);
    messages.subscribe(update_messages);
    messages.subscribe(new_messages);
    messages.subscribe(update_channels);
    messages.check();
    load_users();
    monitor_last_update();

    // start event loops to update MeshChat client
    setInterval(() => { messages.check() }, 15000);
    setInterval(() => { load_users() }, 15000);
    setInterval(() => { monitor_last_update() }, 2500);
}

function meshchat_init() {
    debug("meshchat_init()");

    $('#message').val('');
    meshchat_id = Cookies.get('meshchat_id');
    if (meshchat_id == undefined) {
        // TODO set default expiration of cookie
        Cookies.set('meshchat_id', make_id());
        meshchat_id = Cookies.get('meshchat_id');
    }

    $('#submit-message').on('click', function(e) {
        e.preventDefault();
        if ($('#message').val().length == 0) return;

        ohSnapX();

        // disable message sending box
        $(this).prop("disabled", true);
        $('#message').prop("disabled", true);
        $(this).html('<div class="loading"></div>');

        let channel = $('#send-channel').val();

        if ($('#new-channel').val() != '') {
            channel = $('#new-channel').val();
            $('#send-channel').val('Everything');
        }

        messages.send($('#message').val(), channel, call_sign).then(
            // sent
            (sent) => {
                $('#message').val('');
                ohSnap('Message sent', 'green');
                update_messages(Messages.NEW_MSG);

                // clear out new channel box in case it was used and
                // reset to normal selection box
                $('#new-channel').val('');
                $('#new-channel').hide();
                $('#send-channel').show();
            },
            // error
            (err_msg) => {
                ohSnap(err_msg, 'red', {time: '30000'});
            }
        ).finally(() => {
            // change the channel selector to the channel the message was
            // just sent to
            $('#channels').val(channel);
            messages.set_channel(channel);
            update_messages();

            // re-enable message sending box
            $(this).prop("disabled", false);
            $('#message').prop("disabled", false);
            $(this).html('Send');
        });
    });

    $('#submit-call-sign').on('click', function(e) {
        e.preventDefault();
        if ($('#call-sign').val().length == 0) return;
        call_sign = $('#call-sign').val().toUpperCase();
        // TODO set default expiration of cookie
        Cookies.set('meshchat_call_sign', call_sign);
        $('#call-sign-container').addClass('hidden');
        $('#chat-container').removeClass('hidden');
        $('#callsign').html('<strong>Call Sign:</strong> ' + call_sign);
        start_chat();
    });

    $('#channels').on('change', function() {
        $('#send-channel').val(this.value);
        messages.set_channel(this.value);
        update_messages();
    });

    $('#search').keyup(function() {
        //console.log(this.value);
        update_messages();
    });

    $('#message-expand').on('click', function(e) {
        $('#message-panel').toggleClass('message-panel-collapse');
        $('#message-panel-body').toggleClass('message-panel-body-collapse');
        $('#users-panel').toggleClass('users-panel-collapse');
        $('#users-panel-body').toggleClass('users-panel-body-collapse');
    });

    // allow user to enter new channel
    $('#send-channel').on('change', function() {
        if (this.value == "Add New Channel") {
            $('#new-channel').show().focus();
            $(this).hide();
        }
    });

    // process a CTRL <ENTER> to send a message
    $('#message').keydown(function (e) {
        if ((e.keyCode == 10 || e.keyCode == 13) && e.ctrlKey) {
            $("#submit-message").trigger( "click" );
        }
    });

    // login with a cookie
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

let users_updating = false;
function load_users() {
    debug("load_users()");

    if (users_updating == true) return;
    console.debug("load_users()");

    // lock to prevent simultaneous updates
    users_updating = true;

    $.getJSON('/cgi-bin/meshchat?action=users&call_sign=' + call_sign + '&id=' + meshchat_id,
        (data) => {
            if (data == null || data == 0) return;

            let html = '';
            let count = 0;

            for (var entry of data) {
                var date = new Date(0);
                date.setUTCSeconds(entry.epoch);

                // user heartbeat timeout > 4 mins
                if ((epoch() - entry.epoch) > 240) continue;

                // user heartbeat > 2 mins, expiring
                if ((epoch() - entry.epoch) > 120) {
                    html += '<tr class="grey-background">';
                } else {
                    html += '<tr>';
                }

                if (enable_video == 0) {
                    html += '<td>' + entry.call_sign + '</td>';
                } else {
                    html += '<td><a href="' + entry.id + '" onclick="start_video(\'' + entry.id + '\');return false;">' + entry.call_sign + '</td>';
                }

                if (entry.platform == 'node') {
                    html += '<td><a href="http://' + aredn_domain(entry.node) + ':8080" target="_blank">' + entry.node + '</a></td>';
                } else {
                    html += '<td><a href="http://' + aredn_domain(entry.node) + '" target="_blank">' + entry.node + '</a></td>';
                }

                html += '<td>' + format_date(date) + '</td>';
                html += '</tr>';

                count++;
            }
            $('#users-table').html(html);
            $('#users-count').html(count);
        }).always(() => {
            // allow updates again
            users_updating = false;
        });
}
