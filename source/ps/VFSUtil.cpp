#include "precompiled.h"

#include "VFSUtil.h"
#include "lib/res/vfs.h"
#include "lib/res/vfs_path.h"

#include "CLogger.h"
#define LOG_CATEGORY "vfs"

#include <deque>

using namespace VFSUtil;

// Because I'm lazy, and it saves a few lines of code in other places:
bool VFSUtil::FindFiles (const CStr& dirname, const char* filter, FileList& files)
{
	files.clear();

	Handle dir = vfs_open_dir(dirname);
	if (dir <= 0)
	{
		LOG(ERROR, LOG_CATEGORY, "Error opening directory '%s' (%lld)", dirname.c_str(), dir);
		return false;
	}

	int err;
	vfsDirEnt entry;
	while ((err = vfs_next_dirent(dir, &entry, filter)) == 0)
	{
		files.push_back(dirname+"/"+entry.name);
	}

	if (err != ERR_DIR_END)
	{
		LOG(ERROR, LOG_CATEGORY, "Error reading files from directory '%s' (%d)", dirname.c_str(), err);
		return false;
	}

	vfs_close_dir(dir);

	return true;

}


// call <cb> for each entry matching <user_filter> (see vfs_next_dirent) in
// directory <start_path>; if <recursive>, entries in subdirectories are
// also returned.
//
// note: EnumDirEntsCB path and ent are only valid during the callback.
int VFSUtil::EnumDirEnts(const CStr start_path, const char* user_filter,
	bool recursive, EnumDirEntsCB cb, void* context)
{
	// note: currently no need to return subdirectories,
	// but enabling it isn't hard (we have to check for / anyway).

	char filter_buf[VFS_MAX_PATH];
	const char* filter = user_filter;
	bool want_dir = true;
	if(user_filter)
	{
		if(user_filter[0] != '/')
			want_dir = false;

		// we need subdirectories and the caller hasn't already requested them
		if(recursive && !want_dir)
		{
			snprintf(filter_buf, sizeof(filter_buf), "/|%s", user_filter);
			filter = filter_buf;
		}
	}


	// note: FIFO queue instead of recursion is much more efficient
	// (less stack usage; avoids seeks by reading all entries in a
	// directory consecutively)

	std::deque<CStr> dir_queue;
	dir_queue.push_back(start_path);

	// for each directory:
	do
	{
		// get current directory path from queue
		// note: can't refer to the queue contents - those are invalidated
		// as soon as a directory is pushed onto it.
		char path[VFS_MAX_PATH];
		path_append(path, dir_queue.front().c_str(), "");
			// vfs_open_dir checks this, so ignore failure
		const size_t path_len = strlen(path);
		dir_queue.pop_front();

		Handle hdir = vfs_open_dir(path);
		if(hdir <= 0)
		{
			debug_warn("EnumFiles: vfs_open_dir failed");
			continue;
		}

		// for each entry (file, subdir) in directory:
		vfsDirEnt ent;
		while(vfs_next_dirent(hdir, &ent, filter) == 0)
		{
			// build complete path (vfsDirEnt only stores entry name)
			strcpy_s(path+path_len, VFS_MAX_PATH-path_len, ent.name);

			if(VFS_ENT_IS_DIR(ent))
			{
				if(recursive)
					dir_queue.push_back(path);

				if(want_dir)
					cb(path, &ent, context);
			}
			else
				cb(path, &ent, context);
		}

		vfs_close_dir(hdir);
	}
	while(!dir_queue.empty());

	return 0;
}
