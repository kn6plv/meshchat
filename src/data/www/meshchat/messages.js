// Messages is a singleton that keeps a copy of all messages
function Messages() {
    if (Messages.prototype.__instance) {
        return Messages.prototype.__instance;
    }
    this.messages = new Map();
    this.message_order = new Array();
    this.delete_list = new Array();
    this.db_version = 0;
    this.last_update_time = 0;
    this._updating = false;
    this._message_checksum = null;

    this.__current_channel = "";
    this.__channels = new Array();
    this.__observers = new Array();

    Messages.prototype.__instance = this;
}

Messages.NEW_MSG = 1;
Messages.CHAN_UPDATE = 2;
Messages.MSG_UPDATE = 3;

Messages.prototype.check = function() {
    var self = this;
    if (this._updating == true) return;
    this._updating = true;

    $.getJSON(
        "/cgi-bin/meshchat?action=messages_version_ui&call_sign=" +
        call_sign + "&id=" + meshchat_id + "&epoch=" + epoch()
    ).done(function(data) {
        if (data == null || data == 0) {
            self._updating = false;
        } else if ("messages_version" in data && self.db_version != data.messages_version) {
            self.fetch(data.messages_version);
        } else {
            self._updating = false;
        }
    }).fail(function() {
        self._updating = false;
    });
};

Messages.prototype.fetch = function(pending_version) {
    var self = this;
    $.getJSON(
        "/cgi-bin/meshchat?action=messages&call_sign=" +
        call_sign + "&id=" + meshchat_id + "&epoch=" + epoch()
    ).done(function(data) {
        if (data == null || data == 0) return;
        data.forEach(function(entry) {
            self.messages.set(entry.id, entry);
        });
        self.update();
        self.last_update_time = epoch();
        self.db_version = pending_version;
        self._updating = false;
        self.notify(Messages.MSG_UPDATE);
        self.notify(Messages.CHAN_UPDATE);
    }).fail(function() {
        self._updating = false;
    });
};

Messages.prototype.update = function(msg_ids) {
    var self = this;
    if (msg_ids === undefined || msg_ids === null) {
        msg_ids = Array.from(this.messages.keys());
    }

    msg_ids.forEach(function(id) {
        var message = self.messages.get(id);
        if (message === undefined) return;
        if (message.channel === null) message.channel = "";
        if (!self.__channels.indexOf(message.channel) === -1) {
            self.__channels.push(message.channel);
        }
    });

    this.message_order = Array.from(this.messages.keys()).sort(function(a, b) {
        var a_msg = self.messages.get(a);
        var b_msg = self.messages.get(b);
        return a_msg.epoch < b_msg.epoch ? -1 : 1;
    });
};

Messages.prototype.set_channel = function(chan) {
    this.__current_channel = chan;
    this._message_checksum = null;
};

Messages.prototype.current_channel = function() {
    return this.__current_channel;
};

Messages.prototype.channels = function() {
    return this.__channels;
};

Messages.prototype.send = function(message, channel, call_sign) {
    var self = this;
    var params = {
        action: "send_message",
        message: message,
        call_sign: call_sign,
        epoch: epoch(),
        id: this._create_id(),
        channel: channel
    };

    return $.post("/cgi-bin/meshchat", params).then(function(data) {
        if (data.status == 500) {
            return $.Deferred().reject("Error sending message: " + data.response);
        } else {
            self.messages.set(params.id, {
                id: params.id,
                message: message,
                call_sign: call_sign,
                epoch: params.epoch,
                channel: channel,
                node: config ? config.node : '',
                platform: config ? config.platform : 'node'
            });
            self._message_checksum += parseInt(params.id, 16);
            self.update();
            self.notify(Messages.MSG_UPDATE);
        }
    });
};

Messages.prototype.render = function(channel, search_filter) {
    var self = this;
    var html = "";
    var search = search_filter ? search_filter.toLowerCase() : "";
    var message_checksum = 0;

    this.message_order.forEach(function(id) {
        var message = self.messages.get(id);
        var date = new Date(0);
        date.setUTCSeconds(message.epoch);
        message.date = date;

        if (search != "") {
            if (message.message.toLowerCase().indexOf(search) == -1 &&
                message.call_sign.toLowerCase().indexOf(search) == -1 &&
                message.node.toLowerCase().indexOf(search) == -1) {
                return;
            }
        }

        if (channel == message.channel || self.__current_channel == "") {
            html += self.render_row(message);
            message_checksum += parseInt(message.id, 16);
        }
    });

    if (html == "") {
        html = '<div class="no-messages">No messages found</div>';
    }

    if (this._message_checksum != null && message_checksum != this._message_checksum) {
        this.notify(Messages.NEW_MSG);
    }
    this._message_checksum = message_checksum;
    return html;
};

Messages.prototype._format_smart_date = function(date) {
    var now = new Date();
    var isToday = (date.getDate() == now.getDate() && 
                   date.getMonth() == now.getMonth() && 
                   date.getFullYear() == now.getFullYear());
    
    var hours = date.getHours();
    var minutes = date.getMinutes();
    minutes = minutes < 10 ? '0' + minutes : minutes;
    hours = hours < 10 ? '0' + hours : hours;
    
    var timeStr = hours + ':' + minutes;
    if (isToday) return timeStr;
    return date.getDate() + '.' + (date.getMonth() + 1) + '.' + date.getFullYear() + ' ' + timeStr;
};

Messages.prototype.render_row = function(msg_data) {
    var message = msg_data.message.replace(/(\r\n|\n|\r)/g, "<br/>");
    var currentUser = Cookies.get("meshchat_call_sign");
    var isSent = msg_data.call_sign.toUpperCase() === (currentUser ? currentUser.toUpperCase() : "");
    var alignmentClass = isSent ? "bubble-sent" : "bubble-received";
    var smartTime = this._format_smart_date(msg_data.date);
    
    var html = '<div class="bubble-wrapper ' + alignmentClass + '">';
    html += '  <div class="message-bubble">';
    html += '    <div class="bubble-info">';
    html += '      <span class="bubble-callsign">' + msg_data.call_sign + '</span>';
    html += '      <span class="bubble-meta">(' + msg_data.node + ' - ' + msg_data.channel + ')</span>';
    html += '    </div>';
    html += '    <div class="bubble-content">' + message + '</div>';
    html += '    <div class="bubble-timestamp">' + smartTime + '</div>';
    html += '  </div>';
    html += '</div>';
    return html;
};

Messages.prototype._create_id = function() {
    var seed = epoch().toString() + Math.floor(Math.random() * 99999);
    return md5(seed).substring(0, 8);
};

Messages.prototype.subscribe = function(func) {
    this.__observers.push(func);
};

Messages.prototype.notify = function(reason) {
    this.__observers.forEach(function(observer) { observer(reason); });
};