--[[
	STOP STOP STOP DO NOT EDIT THIS FILE

	This file is used to set default values for MeshChat and should NOT
	be edited. Edits made to this file WILL BE LOST when upgrading or
	downgrading MeshChat. All the values below can be overridden by
	adding them to the meshchat_local.lua file located in the same
	directory as this file.

	EDIT THIS FILE AT YOUR PERIL. YOU HAVE BEEN WARNED.


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

---
-- @module meshchatconfig
-- @section MeshChat Configuration

--- Base directory to store all MeshChat generated files
-- @type string
meshchat_path              = "/tmp/meshchat"
--- Maximum number of messages in the database
-- @type int
max_messages_db_size       = 500
--- Maximum amount of filesystem space for storing files
-- @type int
max_file_storage           = 512 * 1024
lock_file                  = meshchat_path .. "/lock"
messages_db_file           = meshchat_path .. "/messages"
messages_db_file_orig      = meshchat_path .. "/messages"
sync_status_file           = meshchat_path .. "/sync_status"
local_users_status_file    = meshchat_path .. "/users_local"
remote_users_status_file   = meshchat_path .. "/users_remote"
remote_files_file          = meshchat_path .. "/files_remote"
messages_version_file      = meshchat_path .. "/messages_version"
local_files_dir            = meshchat_path .. "/files"
tmp_upload_dir             = "/tmp/web/upload"
--- How often to check for new messages
-- @type int
poll_interval              = 10
non_meshchat_poll_interval = 600
valid_future_message_time  = 30 * 24 * 60 * 60
connect_timeout            = 5
speed_time                 = 10
speed_limit                = 1000
--- Type of node that MeshChat is installed on ("node" or "pi")
-- @type string
platform                   = "node"
--- Turn debug message on
-- @type bool
debug                      = 0
extra_nodes                = {}
--- MeshChat protocol version
-- @type string
protocol_version           = "1.02"
app_version                = "2.15"
default_channel            = ""

require("meshchat_local")
