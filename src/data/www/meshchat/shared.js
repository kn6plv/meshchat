var config;

$(function() {
    $('#logout').on('click', function(e){
        e.preventDefault();
        Cookies.remove('meshchat_call_sign');
        window.location = '/meshchat';
    });
});

function node_name() {
    return config.node;
}

function platform() {
    return config.platform || 'node'; // TODO temp patch until config API is updated
}

function epoch() {
    return Math.floor(new Date() / 1000);
}

function format_date(date) {
    var day = date.getDate();
    var month = date.getMonth() + 1;
    var year = date.getFullYear();
    
    var hours = date.getHours();
    var minutes = date.getMinutes();
    minutes = minutes < 10 ? '0' + minutes : minutes;
    hours = hours < 10 ? '0' + hours : hours;

    return day + '.' + month + '.' + year + '<br/>' + hours + ':' + minutes;
}

function make_id()
{
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for( var i=0; i < 5; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}

function aredn_domain(host) {
    if (host.indexOf(".") !== -1) {
        return host;
    }
    host = host.split(":")
    return host[0] + ".local.mesh" + (host[1] ? ":" + host[1] : "");
}

function debug(msg) {
    context.debug && console.debug(msg);
}

function error(msg) {
    console.error(msg);
}
