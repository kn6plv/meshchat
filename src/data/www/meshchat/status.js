var last_update = epoch();

$(function () {
	load_status();
	setInterval(function () { load_status() }, 5000);
	setInterval(function () { monitor_last_update() }, 2500);
});

function monitor_last_update() {
	var secs = epoch() - last_update;
	var timeStr = secs + 's';
	if (secs >= 3600) {
		timeStr = Math.floor(secs / 3600) + 'h';
	} else if (secs >= 60) {
		timeStr = Math.floor(secs / 60) + 'm';
	}
	$('#last-update .time-value').text(timeStr + ' ago');
}

function load_status() {
	$.getJSON('/cgi-bin/meshchat?action=sync_status', function (data) {
		var html = '';
		var count = 0;

		for (var i = 0; i < data.length; i++) {
			var date = new Date(0);
			date.setUTCSeconds(data[i].epoch);

			//if ((epoch() - data[i].epoch) > 60 * 60) continue;		

			html += '<tr>';
			html += '<td>' + data[i].node + '</td>';
			html += '<td>' + format_date(date) + '</td>';
			html += '</tr>';

			count++;
		}

		$('#sync-table').html(html);
		$('#sync-count').html(count);

		last_update = epoch();
	});

	$.getJSON('/cgi-bin/meshchat?action=action_log', function (data) {
		var html = '';

		for (var i = 0; i < data.length; i++) {
			var date = new Date(0);
			date.setUTCSeconds(data[i].action_epoch);

			html += '<tr>';
			html += '<td>' + format_date(date) + '</td>';
			html += '<td>' + data[i].script + '</td>';
			html += '<td>' + data[i].result + '</td>';
			html += '<td>' + data[i].message + '</td>';
			html += '</tr>';
		}

		$('#log-table').html(html);

		last_update = epoch();
	});
}
