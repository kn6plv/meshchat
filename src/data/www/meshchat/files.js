var last_update = epoch();
var free_space = 0;

function monitor_last_update() {
    var secs = epoch() - last_update;
    var timeStr = secs + 's';
    if (secs >= 3600) {
        timeStr = Math.floor(secs / 3600) + 'h';
    } else if (secs >= 60) {
        timeStr = Math.floor(secs / 60) + 'm';
    }
    $('#last-update').html('<strong>Updated:</strong> ' + timeStr + ' ago');
}

$(function () {
    load_files();
    setInterval(function () {
        load_files()
    }, 30000);
    setInterval(function () { monitor_last_update() }, 2500);
    var file = null;

    // Drag and Drop Logic
    var dropZone = $('#drop-zone');
    var fileInput = $('#upload-file');

    dropZone.on('click', function () {
        fileInput.click();
    });

    dropZone.on('dragover', function (e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).addClass('dragover');
    });

    dropZone.on('dragleave', function (e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).removeClass('dragover');
    });

    dropZone.on('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).removeClass('dragover');

        var files = e.originalEvent.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect(files[0]);
        }
    });

    fileInput.on("change", function (event) {
        if (event.target.files.length > 0) {
            handleFileSelect(event.target.files[0]);
        }
    });

    function handleFileSelect(selectedFile) {
        if (selectedFile.size > free_space) {
            Swal.fire({
                icon: 'warning',
                title: 'No Space',
                text: 'Not enough free space for your file, delete some files first and try again'
            });
            fileInput.val('');
            file = null;
            return;
        }

        file = selectedFile;
        $('#selected-file-name').text('Selected: ' + file.name).addClass('active');
        dropZone.addClass('file-selected');

        console.log("File selected:", file.name, file.size);
    }
    $('#download-messages').on('click', function (e) {
        e.preventDefault();
        location.href = '/cgi-bin/meshchat?action=messages_download';
    });
    $("#upload-button").on("click", function (event) {
        event.preventDefault();
        //$('#upload-form').submit();
        var file_data = new FormData();
        if (file == null) return;
        file_data.append('uploadfile', file);
        $.ajax({
            url: '/cgi-bin/meshchat?action=upload_file',
            type: "POST",
            data: file_data,
            dataType: "json",
            context: this,
            cache: false,
            processData: false,
            contentType: false,
            beforeSend: function () {
                $('progress').removeClass('hidden');
            },
            xhr: function () {
                var myXhr = $.ajaxSettings.xhr();
                if (myXhr.upload) {
                    myXhr.upload.addEventListener('progress', upload_progress, false);
                }
                return myXhr;
            },
            success: function (data) {
                if (data.status == 200) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Uploaded',
                        text: 'File uploaded',
                        timer: 2000,
                        showConfirmButton: false,
                        toast: true,
                        position: 'top-end'
                    });
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Upload Failed',
                        text: data.response
                    });
                }
                $('#upload-file').val('');
                $('#selected-file-name').text('Maximum size: 10MB').removeClass('active');
                $('#drop-zone').removeClass('file-selected');
                file = null;
                load_files();
            },
            error: function (data, textStatus, errorThrown) {
                Swal.fire({ icon: 'error', title: 'Error', text: 'File upload error' });
            },
            complete: function (jqXHR, textStatus) {
                $('progress').addClass('hidden');
            }
        });
    });
});

function upload_progress(event) {
    if (event.lengthComputable) {
        $('progress').attr({
            value: event.loaded,
            max: event.total
        });
    }
}

function fileNameCompare(a, b) {
    if (a.file < b.file)
        return -1;
    if (a.file > b.file)
        return 1;
    return 0;
}

function load_files() {
    $.getJSON('/cgi-bin/meshchat?action=files', function (data) {
        var html = '';

        data.files.sort(fileNameCompare);

        for (var i = 0; i < data.files.length; i++) {
            var date = new Date(0);
            date.setUTCSeconds(data.files[i].epoch);
            html += '<tr>';
            var port = '';

            //console.log(data);

            if (data.files[i].node.match(':')) {
                var parts = data.files[i].node.split(':');
                data.files[i].node = parts[0];
                port = ':' + parts[1];
            } else {
                if (data.files[i].platform == 'node') {
                    port = ':8080'
                }
            }
            html += '<td><a href="http://' + aredn_domain(data.files[i].node) + port + '/cgi-bin/meshchat?action=file_download&file=' + encodeURIComponent(data.files[i].file) + '">' + data.files[i].file + '</a></td>';
            html += '<td>' + numeral(data.files[i].size).format('0.0 b') + '</td>';
            html += '<td class="col_node">' + data.files[i].node + '</td>';
            html += '<td class="col_time">' + format_date(date) + '</td>';
            if (data.files[i].local == 1) {
                html += '<td class="col_delete"><button class="delete-button button-primary" file-name="' + data.files[i].file + '">Delete</button></td>';
            } else {
                html += '<td class="col_delete"></td>';
            }
            html += '</tr>';
        }
        $('#files-table').html(html);
        $('#files-count').html(data.files.length + ' Files');
        $('#total-bytes').html('Total Storage: ' + numeral(data.stats.allowed).format('0.0 b'));
        $('#free-bytes').html('Free Storage: ' + numeral(data.stats.files_free).format('0.0 b'));
        free_space = data.stats.files_free;
        $(".delete-button").on("click", function (event) {
            event.preventDefault();
            $.ajax({
                url: '/cgi-bin/meshchat?action=delete_file&file=' + encodeURIComponent($(this).attr('file-name')),
                type: "GET",
                success: function (data) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Deleted',
                        text: 'File deleted',
                        timer: 2000,
                        showConfirmButton: false,
                        toast: true,
                        position: 'top-end'
                    });
                    load_files();
                },
                error: function (data, textStatus, errorThrown) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Delete Error',
                        text: 'File delete error: ' + data
                    });
                }
            });
        });

        last_update = epoch();
    });
}
