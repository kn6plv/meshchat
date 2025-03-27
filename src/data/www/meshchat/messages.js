

// Messages is a singleton that keeps a copy of all messages
class Messages {

    static NEW_MSG     = 1;
    static CHAN_UPDATE = 2;
    static MSG_UPDATE  = 3;

    constructor() {
        if (! this.__instance) {
            this.messages          = new Map();
            this.message_order     = new Array();
            this.delete_list       = new Array();  // future enhancement
            this.db_version        = 0;
            this.last_update_time  = 0;
            this._updating         = false;
            this._message_checksum = null;       // only messages in channel

            this.__current_channel = "";
            this.__channels        = new Array();
            this.__observers       = new Array();

            this.__instance = this;
        }
        return this.__instance;
    }

    // return reference to singleton, creating if necessary
    getInstance() {
        if (! this.__instance) {
            this.__instance = new Messages();
        }
        return this.__instance;
    }

    /* check() retrieves the current message database version from the
       MeshChat server and compares it with the last known version.
       If the database version is different (i.e. database has new messages),
       then an update cycle is kicked off by calling fetch() */
    check() {
        console.debug("Messages.check()");

        var pending_db_version = 0;

        // currently updating, ignore this check
        if (this._updating == true) {
            console.debug("Message.check() skipped due to messages being updated.");
            return;
        }

        // lock out all other updates
        this._updating = true;

        $.getJSON('/cgi-bin/meshchat?action=messages_version_ui&call_sign=' + call_sign + '&id=' + meshchat_id + '&epoch=' + epoch(),
            (data) => {
                if (data == null || data == 0) {
                    this._updating = false;
                } else if ('messages_version' in data && this.db_version != data.messages_version) {
                    this.fetch(data.messages_version);
                 } else {
                    this._updating = false;
                }
            }).fail((error) => {
                // TODO error message on UI describing failure
                this._updating = false;
            });
    }

    /* fetch() is used to retrieve the messages from the message database.
       It is told the new database version with the pending_version param.
       All messages are then stored in the local message db (this.messages)
       and update() is called to update all the internal counters */
    fetch(pending_version) {
        console.debug("Messages.fetch(pending_version = " + pending_version + ")");

        $.getJSON('/cgi-bin/meshchat?action=messages&call_sign=' + call_sign + '&id=' + meshchat_id + '&epoch=' + epoch(),
            (data) => {
                if (data == null || data == 0) empty();

                // integrate new messages into the message DB
                data.forEach((entry) => { this.messages.set(entry.id, entry) });

                this.update();
                this.last_update_time = epoch();
                this.db_version = pending_version;
                this._updating = false;
                this.notify(Messages.MSG_UPDATE);
                this.notify(Messages.CHAN_UPDATE);
            }).fail((error) => {
                // TODO error message on UI describing failure
                this._updating = false;
            });
    }

    /* update the message DB with counts, channels, etc.
       If msg_ids is not specified, then process all messages in the
       DB */
    update(msg_ids=null) {
        console.debug("Messages.update(msg_ids=" + JSON.stringify(msg_ids) + " )");

        if (msg_ids === null) {
            msg_ids = Array.from(this.messages.keys());
        }

        for (var id of msg_ids.values()) {
            var message = this.messages.get(id);

            // if there is not a message don't try to process it.
            if (message === undefined) {
                // throw error message
                continue;
            }

            // null channel names is the Everything channel (empty string)
            if (message.channel === null) {
                message.channel = "";
            }

            // update list of available channels
            if (! this.__channels.includes(message.channel)) {
                this.__channels.push(message.channel);
            }

            // TODO not sure this is actually needed, get should be returning a reference
            this.messages.set(id, message);
        }

        // sort the messages by time (descending)
        this.message_order = Array.from(this.messages.keys()).sort(
            (a,b) => {
                let a_msg = this.messages.get(a);
                let b_msg = this.messages.get(b);
                return a_msg.epoch > b_msg.epoch ? -1 : 1;
            });
    }

    set_channel(chan) {
        console.debug("Messages.set_channel(chan=" + chan + ")");
        this.__current_channel = chan;
        this._message_checksum = null;
    }

    current_channel() {
        return this.__current_channel;
    }

    // return a list of channels available across all messages
    channels() {
        return Array.from(this.__channels.values());
    }

    send(message, channel, call_sign) {
        console.debug("Messages.send(message='" + message +"', channel=" + channel + ", call_sign=" + call_sign + ")");
        let params = {
            action: 'send_message',
            message: message,
            call_sign: call_sign,
            epoch: epoch(),
            id: this._create_id(),
            channel: channel
        };

        // { timeout: 5000, retryLimit: 3, dataType: "json", data: params}
        return new Promise((sent, error) => {
            $.post('/cgi-bin/meshchat', params,
            (data) => {
                if (data.status == 500) {
                    error('Error sending message: ' + data.response);
                } else {
                    // add the message to the in memory message DB
                    this.messages.set(params['id'], {
                        id: params['id'],
                        message: message,
                        call_sign: call_sign,
                        epoch: params['epoch'],
                        channel: channel,
                        node: node_name(),
                        platform: platform(),
                    });

                    // Add the channel to the list
                    if (! channel in this.channels()) {
                        this.__channels.push(channel);
                        this.set_channel(channel);
                        this.notify(Messages.CHAN_UPDATE);
                    }

                    // update internal message checksum with locally
                    // created message ID so not to trigger alert sound
                    this._message_checksum += parseInt(params['id'], 16);
                    this.update();
                    this.notify(Messages.MSG_UPDATE);
                    sent();
                }
            }).fail((error) => {
                if (error == 'timeout') {
                    this.tryCount++;
                    if (this.tryCount <= this.retryLimit) {
                        //try again
                        $.ajax(this);
                        return;
                    }
                    error(error);
                }
            });
        })

    }

    // return a rendered version of a block of messages
    render(channel, search_filter) {
        console.debug("Messages.render(channel=" + channel + ", search_filter=" + search_filter + ")");
        let html = '';
        let search = search_filter.toLowerCase();
        let message_checksum = 0;

        for (var id of this.message_order) {
            var message = this.messages.get(id);

            // calculate the date for the current message
            let date = new Date(0);
            date.setUTCSeconds(message.epoch);
            message.date = date;

            if (search != '') {
                //console.log(search);
                //console.log(message.toLowerCase());
                if (message.message.toLowerCase().search(search) == -1 &&
                    message.call_sign.toLowerCase().search(search) == -1 &&
                    message.node.toLowerCase().search(search) == -1 &&
                    format_date(date).toLowerCase().search(search) == -1) {
                    continue;
                }
            }

            if (channel == message.channel || this.__current_channel == '') {
                html += this.render_row(message);

                // add this message to the checksum
                message_checksum += parseInt(message.id, 16);
            }
        }

        // provide a message if no messages were found
        if (html == "") {
            html = "<tr><td>No messages found</td></tr>";
        }

        // this._message_checksum == null is the first rendering of the
        // message table. No need to sound an alert.
        if (this._message_checksum != null && message_checksum != this._message_checksum) {
            this.notify(Messages.NEW_MSG);
        }
        this._message_checksum = message_checksum;

        return html;
    }

    render_row(msg_data) {
        let message = msg_data.message.replace(/(\r\n|\n|\r)/g, "<br/>");

        let row = '<tr>';
        if (false) {
            row += '<td>' + msg_data.id + '</td>';
        }
        row += '<td>' + format_date(msg_data.date) + '</td>';
        row += '<td>' + message + '</td>';
        row += '<td>' + msg_data.call_sign + '</td>';
        row += '<td class="col_channel">' + msg_data.channel + '</td>';
        if (msg_data.platform == 'node') {
            row += '<td class="col_node"><a href="http://' + aredn_domain(msg_data.node) + ':8080" target="_blank">' + msg_data.node + '</a></td>';
        } else {
            row += '<td class="col_node"><a href="http://' + aredn_domain(msg_data.node) + '" target="_blank">' + msg_data.node + '</a></td>';
        }
        row += '</tr>';

        return row;
    }

    // generate unique message IDs
    _create_id() {
        let seed = epoch().toString() + Math.floor(Math.random() * 99999);
        let hash = md5(seed);
        return hash.substring(0,8);
    }

    // Observer functions
    subscribe(func) {
        console.debug("Messages.subscribe(func=" + func.name + ")");
        this.__observers.push(func);
    }

    unsubscribe(func) {
        console.debug("Messages.unsubscribe(func=" + func + ")");
        this.__observers = this.__observers.filter((observer) => observer !== func);
    }

    notify(reason) {
        console.debug("Messages.notify(reason=" + reason + ")");
        this.__observers.forEach((observer) => observer(reason));
    }
}
