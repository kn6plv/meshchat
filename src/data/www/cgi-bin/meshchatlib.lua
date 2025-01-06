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

--- @module meshchatlib

--- Exit the program with an error message.
--
-- @tparam string msg Message to display
--
function die(msg)
    os.exit(-1)
end

--- Execute a command and capture the output.
--
-- @tparam string cmd Command line to execute
-- @treturn string stdout of the command
--
function capture(cmd)
    local f = io.popen(cmd)
    if not f then
        return ""
    end
    local output = f:read("*a")
    f:close()
    return output
end

---
-- Retrieve the current node name.
--
-- This function will interogate the UCI settings to retrieve the current
-- node name stored in the `hsmmmesh` settings.
--
-- @treturn string Name of current node
--
function node_name()
    return uci.cursor("/etc/local/uci"):get("hsmmmesh", "settings", "node") or ""
end

---
-- Retrieve the current MeshChat zone name that the node is operating under.
--
-- @treturn string Name of MeshChat zone
--
function zone_name()
    local services = uci.cursor("/etc/config.mesh"):get("setup", "services", "service") or {}
    for _, service in ipairs(services)
    do
        local zone = service:match("^(.*)%s+%[.+%]|.*|.*|.*|.*|meshchat$") or service:match("^(.*)|.*|.*|.*|.*|meshchat$")
        if zone then
            return zone
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

--- Generate the MD5 sum of a file.
--
-- This under the covers relies on `md5sum` and executes `md5sum` against
-- the specified file.
--
-- @note
--   There is no checking to determine if `md5sum` is installed or
--   executable. In the future, this may change.
--
-- @tparam string file Path to file
-- @treturn string Result of `md5sum` of the file
--
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

--- Generate a unique hash.
--
-- Combine the current time (epoch time) and a randomly generated number
-- between 0 - 99999 and run through `md5sum` to generate a random hash.
--
-- @note
--   There is no checking to determine if `md5sum` is installed or
--   executable. In the future, this may change.
--
-- @treturn string Generated hash value
--
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

---
-- Escape percent signs.
--
-- @tparam string str String to encode
-- @treturn string Encoded string
--
function str_escape(str)
	return str:gsub("%(", "%%("):gsub("%)", "%%)"):gsub("%%", "%%%%"):gsub("%.", "%%."):gsub("%+", "%%+"):gsub("-", "%%-"):gsub("%*", "%%*"):gsub("%[", "%%["):gsub("%?", "%%?"):gsub("%^", "%%^"):gsub("%$", "%%$")
end
