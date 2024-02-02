--[[

	Part of AREDN -- Used for creating Amateur Radio Emergency Data Networks
	Copyright (C) 2022 Tim Wilkinson
	Base on code (C) Trevor Paskett (see https://github.com/tpaskett)
	See Contributors file for additional contributors

	This program is free software: you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation version 3 of the License.

	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.

	You should have received a copy of the GNU General Public License
	along with this program.  If not, see <http://www.gnu.org/licenses/>.

	Additional Terms:

	Additional use restrictions exist on the AREDN(TM) trademark and logo.
		See AREDNLicense.txt for more info.

	Attributions to the AREDN Project must be retained in the source code.
	If importing this code into a new or existing project attribution
	to the AREDN project must be added to the source code.

	You must not misrepresent the origin of the material contained within.

	Modified versions must be modified to attribute to the original source
	and be marked in reasonable ways as differentiate it from the original
	version

--]]

require("nixio")
require("uci")

function die(msg)
    os.exit(-1)
end

function capture(cmd)
    local f = io.popen(cmd)
    if not f then
        return ""
    end
    local output = f:read("*a")
    f:close()
    return output
end

function node_name()
    return uci.cursor("/etc/local/uci"):get("hsmmmesh", "settings", "node") or ""
end

function zone_name()
    local dmz_mode = uci.cursor("/etc/config.mesh"):get("aredn", "@dmz[0]", "mode")
    local servfile = "/etc/config.mesh/_setup.services.nat"
    if dmz_mode ~= "0" then
        servfile = "/etc/config.mesh/_setup.services.dmz"
    end
    if nixio.fs.access(servfile) then
        for line in io.lines(servfile)
        do
            local zone = line:match("^(.*)|.*|.*|.*|.*|meshchat$")
            if zone then
                return zone
            end
        end
    end
    return "MeshChat"
end

messages_db_file = messages_db_file_orig .. "." .. zone_name()

local lock_fd
function get_lock()
    if not lock_fd then
        lock_fd = nixio.open(lock_file, "w", "666")
    end
    lock_fd:lock("lock")
end

function release_lock()
    lock_fd:lock("ulock")
end

function file_md5(file)
    if not nixio.fs.stat(file) then
        return ""
    end
    local output = capture("md5sum " .. file:gsub(" ", "\\ ")):match("^(%S+)%s")
    return output and output or ""
end

function get_messages_db_version()
    for line in io.lines(messages_version_file)
    do
        line = line:gsub("\n$", "")
        return line
    end
end

function save_messages_db_version()
    local f = io.open(messages_version_file, "w")
    f:write(get_messages_version_file() .. "\n")
    f:close()
    nixio.fs.chmod(messages_version_file, "666")
end

function get_messages_version_file()
    local sum = 0
    for line in io.lines(messages_db_file)
    do
        local key = line:match("^([0-9a-f]+)")
        if key then
            sum = sum + tonumber(key, 16)
        end
    end
    return sum
end

function hash()
    return capture("echo " ..  os.time() .. math.random(99999) .. " | md5sum"):sub(1, 8)
end

function sort_and_trim_db()
    local valid_time = os.time() + valid_future_message_time
    local unused_count = max_messages_db_size
    local messages = {}
    for line in io.lines(messages_db_file)
    do
        local id, epoch = line:match("^(%x+)\t(%S+)\t")
	-- ignore messages that are too far in the future (assume they're errors)
        epoch = tonumber(epoch)
	if epoch and epoch < valid_time then
            messages[#messages + 1] = {
                epoch = epoch,
                id = tonumber(id, 16),
                line = line
            }
        end
        unused_count = unused_count - 1
    end

    table.sort(messages, function(a, b)
        if a.epoch == b.epoch then
            return a.id < b.id
        else
            return a.epoch < b.epoch
        end
    end)

    local f = io.open(messages_db_file, "w")
    for _, line in ipairs(messages)
    do
        unused_count = unused_count + 1
        if unused_count > 0 then
            f:write(line.line .. "\n")
        end
    end
    f:close()
end

function file_storage_stats()
    local lines = capture("df -k " .. local_files_dir)
    local blocks, used, available, perc = lines:match("(%d+)%s+(%d+)%s+(%d+)%s+(%d+)%%")
    used = tonumber(used) * 1024
    available = tonumber(available) * 1024
    local total = used + available

    local local_files_bytes = 0
    for file in nixio.fs.dir(local_files_dir)
    do
        local_files_bytes = local_files_bytes + nixio.fs.stat(local_files_dir .. "/" .. file).size
    end

    if max_file_storage - local_files_bytes < 0 then
        local_files_bytes = max_file_storage
    end

    return {
        total = total,
        used = used,
        files = local_files_bytes,
        files_free = max_file_storage - local_files_bytes,
        allowed = max_file_storage
    }
end

function gethostbyname(hostname)
    return capture("nslookup " .. hostname):match("Address 1:%s*([%d%.]+)")
end

function node_list()
    if not nixio.fs.stat("/var/run/services_olsr") then
        return {}
    end
    local local_node = node_name():lower()
    local zone = zone_name()

    local nodes = {}
    local pattern = "http://(%S+):(%d+)/meshchat|tcp|" .. str_escape(zone) .. "%s"
    for line in io.lines("/var/run/services_olsr")
    do
        local node, port = line:match(pattern)
        if node and port then
            node = node:lower()
            if node ~= local_node then
                nodes[#nodes + 1] = {
                    platform = (port == "8080" and "node" or "pi"),
                    node = node,
                    port = port
                }
            end
        end
    end

    for _, extra in ipairs(extra_nodes)
    do
        nodes[#node + 1] = extra
    end

    return nodes
end

function str_escape(str)
	return str:gsub("%(", "%%("):gsub("%)", "%%)"):gsub("%%", "%%%%"):gsub("%.", "%%."):gsub("%+", "%%+"):gsub("-", "%%-"):gsub("%*", "%%*"):gsub("%[", "%%["):gsub("%?", "%%?"):gsub("%^", "%%^"):gsub("%$", "%%$")         
end
